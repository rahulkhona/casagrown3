import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CASABOT_ID = 'a0000000-0000-0000-0000-00000ca5ab07'

/**
 * casabot-starter-post
 * 
 * Cron-triggered function that generates a single, high-quality
 * gardening-focused conversation starter and posts it to the global
 * community chat feed as CasaBot.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    const supaUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const isLocal = supaUrl.includes('localhost') ||
      supaUrl.includes('127.0.0.1') ||
      supaUrl.includes('kong:') ||
      supaUrl.includes('host.docker.internal')

    if (isLocal) {
      console.log(`[LOCAL] Skipping CasaBot Gemini Starter — local environment detected.`)
      // Still insert a generic fallback for testing locally
      await supabase.from('community_chat_messages').insert({
        community_h3_index: 'global',
        author_id: CASABOT_ID,
        content: "What's the most vibrant thing growing in your neighborhood today? 🥑 (Local Test Fallback)",
        is_system: true,
      })
      return new Response(JSON.stringify({ processed: 1, skipped_local: true }), {
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

    const systemPrompt = `You are CasaBot 🐝, a friendly, enthusiastic agricultural companion for the CasaGrown neighborhood community.
Your job is to generate EXACTLY ONE highly engaging conversation starter for the community feed.
Keep it casual, short (1-3 sentences max), and ask an open-ended question about gardening, produce sharing, seasonal harvests, soil tips, recipes with fresh vegetables, or dealing with pests.
You can occasionally use an emoji, but keep it natural. 
Do not use a greeting or intro like "Hey neighbors!" -- just jump straight into the interesting question or prompt.`

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            { role: 'user', parts: [{ text: systemPrompt }] },
          ],
          generationConfig: {
            maxOutputTokens: 250,
            temperature: 0.9,
          },
        }),
      }
    )

    if (!geminiRes.ok) {
      console.warn(`[CasaBot Starter] Gemini API failed:`, geminiRes.status)
      return new Response(JSON.stringify({ error: 'Gemini API failed' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const geminiData = await geminiRes.json()
    const parts = geminiData?.candidates?.[0]?.content?.parts || []
    const reply = parts
      .filter((p: any) => p.text && !p.thought)
      .map((p: any) => p.text)
      .join('') || parts.map((p: any) => p.text || '').join('')

    if (!reply || reply.trim() === '') {
      console.log(`[CasaBot Starter] Skipped — empty generation`)
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { error: insertErr } = await supabase
      .from('community_chat_messages')
      .insert({
        community_h3_index: 'global', // Pushed directly into the global layer
        author_id: CASABOT_ID,
        content: reply.trim(),
        is_system: true,
      })

    if (insertErr) {
      console.error(`[CasaBot Starter] Database Insert Error:`, insertErr)
      return new Response(JSON.stringify({ error: 'Database insert failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`[CasaBot Starter] Successfully posted: ${reply.substring(0, 80)}...`)
    
    return new Response(JSON.stringify({ processed: 1 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[CasaBot Starter] Critical Error:', err)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
