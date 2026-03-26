import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CASABOT_ID = 'a0000000-0000-0000-0000-00000ca5ab07'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { message_id, content, community_h3_index, author_name } = await req.json()

    if (!message_id || !content || !community_h3_index) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Build the prompt for gardening advice
    const systemPrompt = `You are CasaBot 🌱, a friendly and knowledgeable gardening assistant for the CasaGrown community marketplace. 
You help neighbors with gardening tips, planting schedules, pest control, soil advice, and produce growing techniques.
Provide helpful, complete answers in 3-5 sentences with actionable advice. Be warm and practical. Use relevant emojis sparingly.
If the question isn't about gardening, food growing, or produce, politely redirect: "I'm best with gardening questions! 🌱 Try asking about planting, pests, soil, or harvest tips."
Always be encouraging and community-minded.`

    const userPrompt = `${author_name || 'A neighbor'} asks: "${content}"`

    // Fetch the message and its parent (if any) to get the media array
    const supabaseService = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: msgData, error: msgErr } = await supabaseService
      .from('community_chat_messages')
      .select('media, parent_id')
      .eq('id', message_id)
      .single()

    let attachedMedia: any[] = []
    if (!msgErr && msgData?.media?.length) {
      attachedMedia = msgData.media
    } else if (!msgErr && msgData?.parent_id) {
      // If it's a reply and the reply itself has no media, check the parent message!
      const { data: parentData } = await supabaseService
        .from('community_chat_messages')
        .select('media')
        .eq('id', msgData.parent_id)
        .single()
      if (parentData?.media?.length) {
        attachedMedia = parentData.media
      }
    }

    // Prepare Gemini parts array
    // We will inject the text prompt, and then any images we find
    const geminiParts: any[] = [
      { text: systemPrompt + '\n\n' + userPrompt }
    ]

    if (attachedMedia.length > 0) {
      // Grab the first image (Gemini handles multiple, but to be safe and fast we can just process up to 3)
      for (const mediaItem of attachedMedia.slice(0, 3)) {
        if (!mediaItem.url && !mediaItem.storage_path) continue
        
        let arrayBuffer: ArrayBuffer | null = null
        let mimeType = mediaItem.media_type || 'image/jpeg'

        if (mediaItem.storage_path) {
          console.log('[CasaBot] Downloading image from storage:', mediaItem.storage_path)
          const { data: fileBlob, error: downloadErr } = await supabaseService.storage
            .from('community-chat-media')
            .download(mediaItem.storage_path)

          if (!downloadErr && fileBlob) {
            arrayBuffer = await fileBlob.arrayBuffer()
            mimeType = fileBlob.type || mimeType
          } else {
            console.error('[CasaBot] Storage download error:', downloadErr)
          }
        }

        if (arrayBuffer) {
          try {
            // Deno runtime supports Base64 encoding via btoa
            const base64Data = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
            
            geminiParts.push({
              inlineData: {
                mimeType,
                data: base64Data
              }
            })
            console.log('[CasaBot] Successfully attached image to Gemini prompt')
          } catch (e) {
            console.error('[CasaBot] Exception processing image:', e)
          }
        }
      }
    }

    // Call Gemini API
    const isLocal = (Deno.env.get('SUPABASE_URL') ?? '').includes('localhost') ||
      (Deno.env.get('SUPABASE_URL') ?? '').includes('127.0.0.1')

    if (isLocal) {
      // Skip Gemini in local development to preserve free tier quota
      console.log('[LOCAL] Skipping Gemini — returning canned CasaBot reply')
      const reply = "🌱 [Local dev] CasaBot AI is skipped locally to preserve API quota. In production, I'd give you great gardening advice!"
      const supabaseService2 = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
      await supabaseService2.from('community_chat_messages').insert({
        community_h3_index,
        author_id: CASABOT_ID,
        parent_id: message_id,
        content: reply,
        is_system: true,
      })
      return new Response(JSON.stringify({ success: true, reply }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const geminiKey = Deno.env.get('GEMINI_API_KEY')
    if (!geminiKey) {
      console.error('GEMINI_API_KEY not set')
      return new Response(JSON.stringify({ error: 'AI not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const models = [
      { name: 'gemini-3-flash-preview', version: 'v1beta' },
      { name: 'gemini-2.5-flash-lite', version: 'v1beta' },
      { name: 'gemini-2.5-flash', version: 'v1beta' },
    ]
    let geminiData: any = null
    let lastError = ''

    for (const model of models) {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/${model.version}/models/${model.name}:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              { role: 'user', parts: geminiParts },
            ],
            generationConfig: {
              maxOutputTokens: 1000,
              temperature: 0.7,
            },
          }),
        }
      )

      if (geminiRes.ok) {
        geminiData = await geminiRes.json()
        console.log(`CasaBot: ${model.name} succeeded`)
        break
      } else {
        lastError = await geminiRes.text()
        console.warn(`CasaBot: ${model.name} failed (${geminiRes.status}), trying next...`)
        await new Promise(r => setTimeout(r, 500))
      }
    }

    if (!geminiData) {
      console.error('All Gemini models failed:', lastError)
      return new Response(JSON.stringify({ error: 'AI generation failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const reply = (() => {
      const parts = geminiData?.candidates?.[0]?.content?.parts || []
      console.log('[CasaBot] Response parts:', JSON.stringify(parts.map((p: any) => ({ 
        hasText: !!p.text, 
        textLen: p.text?.length,
        thought: p.thought,
      }))))
      // Concatenate all non-thought text parts
      const textParts = parts
        .filter((p: any) => p.text && !p.thought)
        .map((p: any) => p.text)
      return textParts.join('') || 
        parts.filter((p: any) => p.text).map((p: any) => p.text).join('') ||
        "🌱 I couldn't generate a response right now. Try asking again!"
    })()

    // Insert the reply as a threaded response from CasaBot
    // supabaseService is already initialized above!
    const { error: insertErr } = await supabaseService
      .from('community_chat_messages')
      .insert({
        community_h3_index,
        author_id: CASABOT_ID,
        parent_id: message_id, // Reply in thread
        content: reply,
        is_system: true,
      })

    if (insertErr) {
      console.error('Insert error:', insertErr)
      return new Response(JSON.stringify({ error: 'Failed to post reply' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true, reply }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('CasaBot error:', err)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
