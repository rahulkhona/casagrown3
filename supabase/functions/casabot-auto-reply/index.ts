import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CASABOT_ID = 'a0000000-0000-0000-0000-00000ca5ab07'

/**
 * casabot-auto-reply
 * 
 * Cron-triggered function that finds unanswered gardening questions
 * posted 5+ minutes ago (no replies) and auto-responds via CasaBot.
 * 
 * Only responds to questions that are within CasaBot's purview
 * (gardening, produce, pests, soil, planting, etc.)
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Keywords that suggest a gardening-related question
const GARDENING_KEYWORDS = [
  'grow', 'plant', 'garden', 'soil', 'seed', 'harvest', 'water', 'weed',
  'pest', 'bug', 'insect', 'gopher', 'fertiliz', 'compost', 'mulch',
  'prune', 'trim', 'fruit', 'vegetable', 'herb', 'flower', 'tomato',
  'pepper', 'squash', 'lettuce', 'cucumber', 'strawberr', 'citrus',
  'lemon', 'orange', 'avocado', 'apple', 'fig', 'berry', 'melon',
  'corn', 'bean', 'pea', 'carrot', 'onion', 'garlic', 'potato',
  'organic', 'companion', 'pollinator', 'bee', 'butterfly',
  'drought', 'shade', 'sun', 'climate', 'zone', 'season',
  'indoor', 'outdoor', 'container', 'raised bed', 'trellis',
  'greenhouse', 'sprout', 'transplant', 'propagat',
]

function isGardeningQuestion(content: string): boolean {
  const lower = content.toLowerCase()
  // Must contain a question indicator
  const isQuestion = lower.includes('?') || 
    lower.startsWith('how') || lower.startsWith('what') ||
    lower.startsWith('when') || lower.startsWith('why') ||
    lower.startsWith('can i') || lower.startsWith('should') ||
    lower.includes('any tips') || lower.includes('advice') ||
    lower.includes('help') || lower.includes('recommend')
  
  if (!isQuestion) return false
  
  // Must contain gardening-related keywords
  return GARDENING_KEYWORDS.some(kw => lower.includes(kw))
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Step 1: Find recent top-level messages (not from CasaBot, not system, 5-30 min old)
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()

    const { data: candidates, error: fetchErr } = await supabase
      .from('community_chat_messages')
      .select('id, content, community_h3_index, author_id')
      .neq('author_id', CASABOT_ID)
      .eq('is_system', false)
      .is('parent_id', null)
      .lt('created_at', fiveMinAgo)
      .gt('created_at', thirtyMinAgo)
      .order('created_at', { ascending: true })
      .limit(10)

    if (fetchErr) {
      console.error('[CasaBot Auto] Fetch error:', fetchErr)
      return new Response(JSON.stringify({ error: fetchErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!candidates || candidates.length === 0) {
      console.log('[CasaBot Auto] No candidate messages found')
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Step 2: Filter out messages that already have replies
    const unanswered: typeof candidates = []
    for (const msg of candidates) {
      const { count } = await supabase
        .from('community_chat_messages')
        .select('id', { count: 'exact', head: true })
        .eq('parent_id', msg.id)
      
      if (count === 0) {
        unanswered.push(msg)
      }
    }

    if (unanswered.length === 0) {
      console.log(`[CasaBot Auto] ${candidates.length} candidates, all have replies`)
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Filter to gardening-related questions only
    const gardeningQuestions = unanswered.filter(msg => isGardeningQuestion(msg.content))
    
    if (gardeningQuestions.length === 0) {
      console.log(`[CasaBot Auto] ${unanswered.length} unanswered messages, none are gardening questions`)
      return new Response(JSON.stringify({ processed: 0, checked: unanswered.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`[CasaBot Auto] Found ${gardeningQuestions.length} gardening questions to answer`)

    // Call Gemini for each question
    const isLocal = (Deno.env.get('SUPABASE_URL') ?? '').includes('localhost') ||
      (Deno.env.get('SUPABASE_URL') ?? '').includes('127.0.0.1')

    if (isLocal) {
      console.log(`[LOCAL] Skipping Gemini auto-replies — ${gardeningQuestions.length} questions would be answered in production`)
      return new Response(JSON.stringify({ processed: 0, checked: gardeningQuestions.length, skipped_local: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const geminiKey = Deno.env.get('GEMINI_API_KEY')
    if (!geminiKey) {
      return new Response(JSON.stringify({ error: 'AI not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let answered = 0

    for (const msg of gardeningQuestions) {
      try {
        const systemPrompt = `You are CasaBot 🐝, a friendly gardening assistant and culinary recipe expert for the CasaGrown community.
You noticed a neighbor's gardening or recipe question went unanswered, so you're helpfully chiming in.
Provide a warm, helpful answer about gardening OR provide exactly 3 creative recipe ideas if they're asking what to do with produce.
Start with something like "Hey! I noticed your question — " or "Great question! 🐝" to feel natural.
You MUST format your responses using clean Markdown (bullet points, bold text).
If the question isn't truly about gardening or produce recipes, respond with just the text "SKIP" and nothing else.`

        const userPrompt = `A neighbor asked: "${msg.content}"`

        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                { role: 'user', parts: [{ text: systemPrompt + '\n\n' + userPrompt }] },
              ],
              generationConfig: {
                maxOutputTokens: 4096,
                temperature: 0.7,
              },
            }),
          }
        )

        if (!geminiRes.ok) {
          console.warn(`[CasaBot Auto] Gemini failed for ${msg.id}:`, geminiRes.status)
          continue
        }

        const geminiData = await geminiRes.json()
        const parts = geminiData?.candidates?.[0]?.content?.parts || []
        const reply = parts
          .filter((p: any) => p.text && !p.thought)
          .map((p: any) => p.text)
          .join('') || parts.map((p: any) => p.text || '').join('')

        // Skip if Gemini says it's not a gardening question
        if (!reply || reply.trim().toUpperCase() === 'SKIP') {
          console.log(`[CasaBot Auto] Skipped ${msg.id} — not a real gardening question`)
          continue
        }

        // Truncate to fit DB CHECK constraint (char_length <= 5000)
        const MAX_CONTENT_LENGTH = 4950
        let finalReply = reply
        if (finalReply.length > MAX_CONTENT_LENGTH) {
          const truncated = finalReply.substring(0, MAX_CONTENT_LENGTH)
          const lastSentenceEnd = Math.max(
            truncated.lastIndexOf('. '),
            truncated.lastIndexOf('! '),
            truncated.lastIndexOf('? '),
            truncated.lastIndexOf('\n')
          )
          finalReply = lastSentenceEnd > MAX_CONTENT_LENGTH * 0.5
            ? truncated.substring(0, lastSentenceEnd + 1) + '\n\n...'
            : truncated + '...'
        }

        // Insert reply as a threaded response
        const { error: insertErr } = await supabase
          .from('community_chat_messages')
          .insert({
            community_h3_index: msg.community_h3_index,
            author_id: CASABOT_ID,
            parent_id: msg.id,
            content: finalReply,
            is_system: true,
          })

        if (insertErr) {
          console.error(`[CasaBot Auto] Insert error for ${msg.id}:`, insertErr)
        } else {
          answered++
          console.log(`[CasaBot Auto] Answered ${msg.id}: ${reply.substring(0, 80)}...`)
        }

        // Brief pause between API calls
        await new Promise(r => setTimeout(r, 1000))

      } catch (err) {
        console.error(`[CasaBot Auto] Error processing ${msg.id}:`, err)
      }
    }

    return new Response(JSON.stringify({ processed: answered, checked: gardeningQuestions.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[CasaBot Auto] Error:', err)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
