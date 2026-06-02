/**
 * widget-chat — Public API for embeddable website chat widget
 *
 * POST /functions/v1/widget-chat
 * Auth: None required (public API, rate-limited by session)
 * Body: { booth_id: string, session_token?: string, message: string }
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { loadBoothContext, buildSellerSystemPrompt, loadSellerBotRules } from '../_shared/growbot-seller.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { booth_id, session_token, message } = await req.json()

    if (!booth_id || !message) {
      return jsonRes({ error: 'Missing booth_id or message' }, 400)
    }

    if (message.length > 500) {
      return jsonRes({ error: 'Message too long (max 500 chars)' }, 400)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    // 1. Verify booth exists
    const { data: booth } = await supabase
      .from('market_booths')
      .select('id, owner_id, name')
      .eq('id', booth_id)
      .single()

    if (!booth) {
      return jsonRes({ error: 'Booth not found' }, 404)
    }

    // 2. Verify booth owner has active subscription
    const { data: sub } = await supabase
      .from('seller_subscriptions')
      .select('plan, status')
      .eq('user_id', booth.owner_id)
      .single()

    if (!sub || !['active', 'trialing'].includes(sub.status)) {
      return jsonRes({ error: 'Widget not available for this booth' }, 403)
    }

    // Load subscription tier's features dynamically
    const { data: tier } = await supabase
      .from('subscription_tiers')
      .select('features')
      .eq('tier_name', sub.plan)
      .single()

    if (!tier?.features?.growbot_copilot) {
      return jsonRes({ error: 'Widget not available for this booth' }, 403)
    }

    // 3. Get or create session
    let session: any = null
    if (session_token) {
      const { data: existing } = await supabase
        .from('widget_chat_sessions')
        .select('*')
        .eq('session_token', session_token)
        .eq('booth_id', booth_id)
        .single()
      session = existing
    }

    if (!session) {
      // Create new session
      const clientIp = (
        req.headers.get('x-real-ip') ||
        req.headers.get('cf-connecting-ip') ||
        req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        'unknown'
      )

      const { data: newSession, error: createErr } = await supabase
        .from('widget_chat_sessions')
        .insert({
          booth_id,
          visitor_ip: clientIp,
          visitor_user_agent: req.headers.get('user-agent')?.slice(0, 200),
        })
        .select()
        .single()

      if (createErr || !newSession) {
        return jsonRes({ error: 'Failed to create session' }, 500)
      }
      session = newSession
    }

    // 4. Rate limit: max 20 messages per session per hour
    const messages = session.messages || []
    const oneHourAgo = Date.now() - 3600000
    const recentMessages = messages.filter(
      (m: any) => new Date(m.timestamp).getTime() > oneHourAgo,
    )

    if (recentMessages.length >= 20) {
      return jsonRes({
        error: 'Rate limit reached. Please try again later.',
        session_token: session.session_token,
        booth_name: booth.name,
      }, 429)
    }

    // 5. Load booth context
    const ctx = await loadBoothContext(supabase, booth_id)
    if (!ctx) {
      return jsonRes({ error: 'Booth context not available' }, 500)
    }

    // 6. Build conversation from last 10 messages
    const recentHistory = messages.slice(-10)
    const contents = recentHistory.map((m: any) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.text }],
    }))
    contents.push({ role: 'user', parts: [{ text: message }] })

    // 7. Call Gemini API
    const AI_KEY = Deno.env.get('GEMINI_API_KEY') || ''
    const model = Deno.env.get('AI_MODEL') || 'gemini-2.5-flash'
    let responseText = `Thanks for your interest! Visit ${ctx.siteUrl}/market/booth/${ctx.boothId} to browse and order.`

    if (AI_KEY) {
      const sellerRules = await loadSellerBotRules(supabase)
      const systemPrompt = buildSellerSystemPrompt(ctx, sellerRules)

      try {
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${AI_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              system_instruction: { parts: [{ text: systemPrompt }] },
              contents,
              generationConfig: { temperature: 0.3, maxOutputTokens: 512 },
            }),
          },
        )

        if (geminiRes.ok) {
          const data = await geminiRes.json()
          const aiText = data.candidates?.[0]?.content?.parts
            ?.filter((p: any) => p.text && p.thought !== true)
            ?.map((p: any) => p.text)
            ?.join('')

          if (aiText) responseText = aiText
        }
      } catch (aiErr: any) {
        console.error('[WIDGET] AI error:', aiErr.message)
      }
    }

    // 8. Append messages to session
    const updatedMessages = [
      ...messages,
      { role: 'user', text: message, timestamp: new Date().toISOString() },
      { role: 'bot', text: responseText, timestamp: new Date().toISOString() },
    ]

    // Keep last 50 messages to prevent unbounded growth
    const trimmedMessages = updatedMessages.slice(-50)

    await supabase
      .from('widget_chat_sessions')
      .update({
        messages: trimmedMessages,
        message_count: trimmedMessages.length,
        last_message_at: new Date().toISOString(),
      })
      .eq('id', session.id)

    return jsonRes({
      response: responseText,
      session_token: session.session_token,
      booth_name: ctx.boothName,
    })
  } catch (err: any) {
    console.error('[WIDGET] Error:', err)
    return jsonRes({ error: err.message || 'Internal error' }, 500)
  }
})

function jsonRes(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
