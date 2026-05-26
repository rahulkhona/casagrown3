/**
 * auto-reply-seller-chat — AI-powered co-pilot for Pro sellers
 *
 * Triggered by database webhook on:
 *   - market_chat_messages (DMs)
 *   - order_chat_messages (order chats)
 *   - messenger_messages (Facebook Messenger)
 *
 * Modes:
 *   - copilot: Generate 2 suggestions, store as draft. Auto-send after delay
 *              if seller doesn't respond. Once auto-sent, enter conversation mode.
 *   - off: Do nothing.
 *
 * POST /functions/v1/auto-reply-seller-chat
 * Body: { type: 'dm' | 'order' | 'messenger', messageId, senderId, recipientId, conversationId?, orderId? }
 * Auth: Service role (database trigger)
 */
import { serveWithCors, jsonOk, jsonError } from '../_shared/serve-with-cors.ts'
import { loadBoothContext, buildSellerSystemPrompt, loadSellerBotRules, detectEscalation, cleanBotReply, SellerContext } from '../_shared/growbot-seller.ts'

export function buildOrderSupportSystemPrompt(
  ctx: SellerContext,
  order: { product_name: string; quantity: number; total_usd: number; status: string; fulfillment_type: string },
  hasOpenDispute: boolean,
  rules?: string[],
): string {
  const deliveryZipsStr = ctx.fulfillment.deliveryZipcodes && ctx.fulfillment.deliveryZipcodes.length > 0
    ? ctx.fulfillment.deliveryZipcodes.join(', ')
    : 'None specified'

  const fulfillmentInfo = [
    ctx.fulfillment.offersDelivery
      ? `Delivery: Offers Local Delivery
  - Delivery Radius: within ${ctx.fulfillment.deliveryRadius || '?'} miles
  - Delivery Base Address (Farm Address): ${ctx.fulfillment.pickupAddress || 'None specified'}
  - Delivery Zipcodes: ${deliveryZipsStr}`
      : null,
    ctx.fulfillment.offersPickup
      ? `Pickup: ${ctx.fulfillment.pickupAddress || 'Address on request'}`
      : null,
  ]
    .filter(Boolean)
    .join('\n')

  let prompt = `You are GrowBot 🤖, a helpful customer service assistant responding on behalf of ${ctx.sellerName} for their farm stand "${ctx.boothName}" on CasaGrown.
Always introduce yourself clearly as "GrowBot, responding on behalf of ${ctx.sellerName}" in your first message. Be warm, professional, and extremely supportive.

This is a POST-PURCHASE support chat on the order details page regarding an active or completed order. The buyer has already purchased this product. Your sole focus is resolving issues with this specific order (e.g. quality issues, delivery, pickup, logistics, or refunds). Do NOT pitch new products or ask them to buy more!

CURRENT ORDER CONTEXT:
- Product: ${order.product_name}
- Quantity: ${order.quantity}
- Total: $${order.total_usd}
- Status: ${order.status}
- Fulfillment: ${order.fulfillment_type}

FULFILLMENT TERMS:
${fulfillmentInfo || 'Contact seller for fulfillment details.'}

ORDER DISPUTE & REFUND RULES:
- Refund Gating Rule: A refund can ONLY be issued if the buyer has raised a formal dispute on their order details page. If there is no open dispute, it is technically impossible to refund them.
${hasOpenDispute ? `
- Dispute Status: An active dispute is currently OPEN for this order.
- Propose Solution: Warmly apologize for the issue (e.g. heirlooms are delicate if they report bruised tomatoes), and offer to resolve the issue by immediately issuing a partial refund or replacement through the open dispute.` : `
- Dispute Status: No active dispute is open for this order.
- Gated Refund Action: Do NOT offer an immediate refund, as the platform does not allow it without an active dispute.
- Propose Solution: Apologize warmly for the issue (e.g. explaining that heirloom varieties are delicate and thin-skinned if bruising is mentioned). Gently instruct the buyer that they can tap the "Dispute Delivery" or "Raise Dispute" button on their order details page, which will allow you to instantly issue them a partial/full refund. Alternatively, you can offer to arrange a free replacement or a discount/credit on their next purchase.`}

CO-PILOT / MANUAL SUGGESTION GUIDELINES:
- The seller (${ctx.sellerName}) is actively requesting this suggestion in their own order/chat console and will review it before sending.
- Do NOT use escalation phrases like "I will notify the seller", "I will connect you with the seller", "I'll have ${ctx.sellerName} look into this", or "let me connect you with the seller". The seller is already here!
- Write a direct, complete, and helpful response to resolve the buyer's query as if the seller is present.
- Every option MUST finish its final sentence completely. Never truncate, cut off, or end a suggestion in the middle of a sentence (e.g. do not end with trailing words like "while", "but", "and").
- YOU MUST PROVIDE TWO DISTINCT, DIFFERENT OPTIONS separated by the "---OPTION---" delimiter. Do not forget the "---OPTION---" separator!
  - Option 1 (Helpful & Complete): Warmly apologize, explain why it might have happened (e.g. explaining that heirlooms are delicate/thin-skinned), and provide the main solution (e.g., guide them to open dispute for refund, or offer immediate refund if dispute is open).
  - Option 2 (Alternative & Shorter): A concise apology directly offering the resolution path (e.g. replacement/discount, or direct refund if dispute is open).`

  if (rules && rules.length > 0) {
    prompt += '\n\nRULES (follow strictly):\n'
    rules.forEach(r => { prompt += `- ${r}\n` })
  }

  return prompt
}

serveWithCors(async (req, { supabase, corsHeaders }) => {
  const body = await req.json()
  const { type, messageId, senderId, recipientId, conversationId, orderId } = body

  if (!type || !messageId || !senderId || !recipientId) {
    return jsonOk({ skipped: true, reason: 'missing_fields' }, corsHeaders)
  }

  // Don't reply to bot messages (prevent infinite loops)
  if (body.isBot) {
    return jsonOk({ skipped: true, reason: 'bot_message' }, corsHeaders)
  }

  // 1. Check if the sender is a Pro seller (meaning the seller manually replied/took over).
  // If so, cancel any pending drafts for this conversation and exit.
  const { data: senderSub } = await supabase
    .from('seller_subscriptions')
    .select('plan, status')
    .eq('user_id', senderId)
    .single()

  if (senderSub && senderSub.plan === 'pro' && ['active', 'trialing'].includes(senderSub.status)) {
    const convRef = type === 'order' ? orderId : (type === 'messenger' ? `messenger_${conversationId}` : conversationId)
    if (convRef) {
      await supabase
        .from('bot_reply_drafts')
        .update({ status: 'seller_replied', resolved_at: new Date().toISOString() })
        .eq('conversation_ref', convRef)
        .eq('status', 'pending')
    }
    return jsonOk({ skipped: true, reason: 'seller_message_cancelled_draft' }, corsHeaders)
  }

  // 2. If this is a background auto-reply trigger (not manual click by seller),
  // check if the seller is currently active "in the chat" (heartbeat online).
  // If the seller is in the chat thread, the bot must not auto-respond automatically.
  if (body.isManual !== true) {
    let sellerInChat = false
    const convRef = type === 'order' ? orderId : (type === 'messenger' ? `messenger_${conversationId}` : conversationId)

    if (convRef) {
      if (type === 'dm') {
        const { data: conv } = await supabase
          .from('market_conversations')
          .select('seller_last_active_at')
          .eq('id', convRef)
          .single()
        if (conv?.seller_last_active_at) {
          const lastActive = new Date(conv.seller_last_active_at).getTime()
          if (Date.now() - lastActive < 12000) {
            sellerInChat = true
          }
        }
      } else if (type === 'messenger') {
        const { data: conv } = await supabase
          .from('messenger_conversations')
          .select('seller_last_active_at')
          .eq('id', convRef)
          .single()
        if (conv?.seller_last_active_at) {
          const lastActive = new Date(conv.seller_last_active_at).getTime()
          if (Date.now() - lastActive < 12000) {
            sellerInChat = true
          }
        }
      }
    }

    if (sellerInChat) {
      return jsonOk({ skipped: true, reason: 'seller_in_chat' }, corsHeaders)
    }
  }

  // The recipient (seller) must be a Pro user
  const { data: sub } = await supabase
    .from('seller_subscriptions')
    .select('plan, status')
    .eq('user_id', recipientId)
    .single()

  if (!sub || sub.plan !== 'pro' || !['active', 'trialing'].includes(sub.status)) {
    return jsonOk({ skipped: true, reason: 'not_pro' }, corsHeaders)
  }

  // Get the message content
  const table = type === 'order' ? 'order_chat_messages' : type === 'messenger' ? 'messenger_messages' : 'market_chat_messages'
  const { data: message } = await supabase
    .from(table)
    .select('content')
    .eq('id', messageId)
    .single()

  if (!message?.content) {
    return jsonOk({ skipped: true, reason: 'message_not_found' }, corsHeaders)
  }

  const userMessage = message.content

  // Find the seller's booth (order-specific or default)
  let boothId: string | null = null

  if (type === 'order' && orderId) {
    const { data: order } = await supabase
      .from('market_orders')
      .select('booth_id')
      .eq('id', orderId)
      .single()
    boothId = order?.booth_id
  } else if (type === 'messenger' && conversationId) {
    // For messenger, look up booth from messenger_conversations.matched_booth_id
    const { data: messengerConv } = await supabase
      .from('messenger_conversations')
      .select('matched_booth_id')
      .eq('id', conversationId)
      .single()
    boothId = messengerConv?.matched_booth_id
  }

  if (!boothId) {
    const { data: defaultBooth } = await supabase
      .from('market_booths')
      .select('id')
      .eq('owner_id', recipientId)
      .eq('is_default', true)
      .single()
    boothId = defaultBooth?.id
  }

  if (!boothId) {
    return jsonOk({ skipped: true, reason: 'no_booth' }, corsHeaders)
  }

  // Get booth settings — bot mode config
  const { data: boothSettings } = await supabase
    .from('market_booths')
    .select('bot_reply_mode, bot_reply_delay_minutes')
    .eq('id', boothId)
    .single()

  // bot_reply_mode: 'copilot' (default) | 'off'
  // bot_reply_delay_minutes: number (default 5)
  const botMode = boothSettings?.bot_reply_mode || 'copilot'
  const delayMinutes = boothSettings?.bot_reply_delay_minutes ?? 5

  // If bot is off, skip
  if (botMode === 'off') {
    return jsonOk({ skipped: true, reason: 'bot_mode_off' }, corsHeaders)
  }

  const channelKey = type === 'order' ? 'orders' : type as 'dm' | 'orders' | 'messenger'

  // Check if bot is already in conversation mode (last draft was auto-sent and
  // seller hasn't replied since). If so, reply instantly — no delay.
  const isManual = body.isManual === true
  let effectiveDelay = isManual ? (delayMinutes || 5) : delayMinutes

  // Smart Welcome Coexistence: If the seller has set 0-delay (instant) and this is Facebook Messenger,
  // we check if it is a brand-new conversation. If so, we temporarily enforce a 30-second (0.5 min)
  // delay so Facebook's native Instant Reply/Greeting has time to fire, trigger our Echo webhook,
  // and cancel our draft—preventing double replies.
  if (!isManual && type === 'messenger' && conversationId && effectiveDelay === 0) {
    const { count } = await supabase
      .from('messenger_messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)

    if (count !== null && count <= 1) {
      console.log(`[AUTO-REPLY] New Messenger conversation detected with 0 delay. Enforcing 30s buffer delay to check for native Facebook replies.`)
      effectiveDelay = 0.5
    }
  }

  const convRef = type === 'order' ? orderId : (type === 'messenger' ? `messenger_${conversationId}` : conversationId)
  if (!isManual && convRef && delayMinutes > 0) {
    const { data: lastDraft } = await supabase
      .from('bot_reply_drafts')
      .select('status, created_at')
      .eq('conversation_ref', convRef)
      .eq('channel', channelKey)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    // If last draft was 'sent' (bot replied, seller hasn't), bot is in conversation.
    // Reply instantly if the seller hasn't manually replied since.
    if (lastDraft?.status === 'sent') {
      let sellerReplied = false
      if (type === 'dm') {
        const { data: messages } = await supabase
          .from('market_chat_messages')
          .select('id')
          .eq('conversation_id', convRef)
          .eq('sender_id', recipientId)
          .eq('is_bot', false)
          .gt('created_at', lastDraft.created_at)
          .limit(1)
        if (messages && messages.length > 0) {
          sellerReplied = true
        } else {
          // Check if seller joined the chat (active presence) since the last bot reply
          const { data: conv } = await supabase
            .from('market_conversations')
            .select('seller_last_active_at')
            .eq('id', convRef)
            .single()
          if (conv?.seller_last_active_at) {
            const lastActiveTime = new Date(conv.seller_last_active_at).getTime()
            const lastDraftTime = new Date(lastDraft.created_at).getTime()
            if (lastActiveTime > lastDraftTime) {
              sellerReplied = true
            }
          }
        }
      } else if (type === 'order') {
        const { data: messages } = await supabase
          .from('order_chat_messages')
          .select('id')
          .eq('order_id', convRef)
          .eq('sender_id', recipientId)
          .eq('is_bot', false)
          .gt('created_at', lastDraft.created_at)
          .limit(1)
        if (messages && messages.length > 0) {
          sellerReplied = true
        }
      } else if (type === 'messenger') {
        const { data: messages } = await supabase
          .from('messenger_messages')
          .select('id')
          .eq('conversation_id', convRef)
          .eq('role', 'seller')
          .gt('created_at', lastDraft.created_at)
          .limit(1)
        if (messages && messages.length > 0) {
          sellerReplied = true
        } else {
          // Check if seller joined the chat (active presence) since the last bot reply
          const { data: conv } = await supabase
            .from('messenger_conversations')
            .select('seller_last_active_at')
            .eq('id', convRef)
            .single()
          if (conv?.seller_last_active_at) {
            const lastActiveTime = new Date(conv.seller_last_active_at).getTime()
            const lastDraftTime = new Date(lastDraft.created_at).getTime()
            if (lastActiveTime > lastDraftTime) {
              sellerReplied = true
            }
          }
        }
      }

      if (sellerReplied) {
        effectiveDelay = delayMinutes // Seller took over — reset to standard delay
      } else {
        effectiveDelay = 0  // Reply instantly — bot is already active
      }
    }
  }

  // Cancel any existing pending draft for this conversation (buyer sent multiple messages)
  if (convRef) {
    await supabase
      .from('bot_reply_drafts')
      .update({ status: 'cancelled', resolved_at: new Date().toISOString() })
      .eq('conversation_ref', convRef)
      .eq('status', 'pending')
  }

  // Load booth context
  const ctx = await loadBoothContext(supabase as any, boothId)
  if (!ctx) {
    return jsonOk({ skipped: true, reason: 'no_context' }, corsHeaders)
  }

  // Build system prompt
  const sellerRules = await loadSellerBotRules(supabase as any)
  let systemPrompt: string

  if (type === 'order' && orderId) {
    const { data: order } = await supabase
      .from('market_orders')
      .select('product_name, quantity, unit_price_usd, total_usd, status, fulfillment_type')
      .eq('id', orderId)
      .single()

    const { data: dispute } = await supabase
      .from('order_disputes')
      .select('id, status')
      .eq('order_id', orderId)
      .eq('status', 'open')
      .limit(1)
      .maybeSingle()

    const hasOpenDispute = !!dispute

    // Use specialized post-purchase customer support prompt
    systemPrompt = buildOrderSupportSystemPrompt(
      ctx,
      order || { product_name: 'Product', quantity: 1, total_usd: 0, status: 'unknown', fulfillment_type: 'pickup' },
      hasOpenDispute,
      sellerRules
    )
  } else {
    // Default pre-purchase sales prompt for DM and Messenger
    systemPrompt = buildSellerSystemPrompt(ctx, sellerRules)

    if (isManual) {
      systemPrompt += `\n\nCO-PILOT / MANUAL SUGGESTION GUIDELINES:
- The seller (${ctx.sellerName}) is actively requesting this suggestion in their own order/chat console and will review it before sending.
- Do NOT use escalation phrases like "I will notify the seller", "I will connect you with the seller", "I'll have ${ctx.sellerName} look into this", or "let me connect you with the seller". The seller is already here!
- Write a direct, complete, and helpful response to resolve the buyer's query as if the seller is present.
- Every option MUST finish its final sentence completely. Never truncate, cut off, or end a suggestion in the middle of a sentence (e.g. do not end with trailing words like "while", "but", "and").
- YOU MUST PROVIDE TWO DISTINCT, DIFFERENT OPTIONS separated by the "---OPTION---" delimiter. Do not forget the "---OPTION---" separator!`
    }
  }

  // Load conversation history
  const historyContents: Array<{ role: string; parts: Array<{ text: string }> }> = []

  if (type === 'order' && orderId) {
    const { data: history } = await supabase
      .from('order_chat_messages')
      .select('sender_id, content, is_bot')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(30)

    const sortedHistory = (history || []).reverse()
    for (const h of sortedHistory) {
      if (h.content === userMessage) continue
      const role = (h.sender_id === recipientId || h.is_bot) ? 'model' : 'user'
      const text = h.is_bot ? h.content.replace(/^🤖\s*/, '') : h.content
      historyContents.push({ role, parts: [{ text }] })
    }
  } else if (type === 'messenger' && conversationId) {
    // Load messenger conversation history
    const { data: history } = await supabase
      .from('messenger_messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(30)

    const sortedHistory = (history || []).reverse()
    for (const h of sortedHistory) {
      if (h.content === userMessage) continue
      const geminiRole = (h.role === 'seller' || h.role === 'bot') ? 'model' : 'user'
      const text = h.role === 'bot' ? h.content.replace(/^🤖\s*/, '') : h.content
      historyContents.push({ role: geminiRole, parts: [{ text }] })
    }
  } else if (conversationId) {
    const { data: history } = await supabase
      .from('market_chat_messages')
      .select('sender_id, content, is_bot')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(30)

    const sortedHistory = (history || []).reverse()
    for (const h of sortedHistory) {
      if (h.content === userMessage) continue
      const role = (h.sender_id === recipientId || h.is_bot) ? 'model' : 'user'
      const text = h.is_bot ? h.content.replace(/^🤖\s*/, '') : h.content
      historyContents.push({ role, parts: [{ text }] })
    }
  }

  // Build contents array
  const allContents: any[] = [...historyContents, { role: 'user', parts: [{ text: userMessage }] }]
  const cleanedContents: any[] = []
  for (const c of allContents) {
    if (cleanedContents.length > 0 && cleanedContents[cleanedContents.length - 1].role === c.role) {
      cleanedContents[cleanedContents.length - 1].parts[0].text += '\n' + c.parts[0].text
    } else {
      cleanedContents.push(c)
    }
  }
  while (cleanedContents.length > 0 && cleanedContents[0].role !== 'user') {
    cleanedContents.shift()
  }

  // Hoist realtime channel so we reuse the SAME instance for typing + bot_reply
  const realtimeChannelName = type === 'dm' ? `dm_${conversationId}` : type === 'order' ? `order_chat_${orderId}` : null
  let rtChannel: any = null
  if (realtimeChannelName && effectiveDelay === 0) {
    try {
      rtChannel = supabase.channel(realtimeChannelName)
      await rtChannel.subscribe()
      await rtChannel.send({
        type: 'broadcast',
        event: 'typing',
        payload: { user_id: recipientId, isTyping: true },
      })
    } catch (e) {
      console.warn('[AUTO-REPLY] Typing broadcast failed:', e)
    }
  }

  // Call Gemini
  const AI_KEY = Deno.env.get('GEMINI_API_KEY') || ''
  const AI_MOCK = Deno.env.get('AI_MOCK') === 'true'

  if (!AI_KEY && !AI_MOCK) {
    return jsonOk({ skipped: true, reason: 'no_ai_key' }, corsHeaders)
  }

  let rawReply: string

  if (AI_MOCK) {
    rawReply = `Hi! I'm GrowBot 🤖, responding on behalf of ${ctx.sellerName}.---OPTION---Thanks for reaching out! Visit ${ctx.siteUrl}/market/booth/${ctx.boothId} to browse and order.`
  } else {
    // Use the standard model cascade: primary → fallback
    const primaryModel = Deno.env.get('AI_MODEL') ?? 'gemma-4-31b-it'
    const models = [
      { name: primaryModel, version: 'v1beta' },
      { name: 'gemini-3-flash-preview', version: 'v1beta' },
    ]
    let geminiData: any = null

    for (const model of models) {
      try {
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/${model.version}/models/${model.name}:generateContent?key=${AI_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              system_instruction: { parts: [{ text: systemPrompt }] },
              contents: cleanedContents,
              generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
            }),
          },
        )

        if (geminiRes.ok) {
          geminiData = await geminiRes.json()
          console.log(`[AUTO-REPLY] ${model.name} succeeded`)
          break
        } else {
          console.warn(`[AUTO-REPLY] ${model.name} failed (${geminiRes.status}), trying next...`)
          await new Promise(r => setTimeout(r, 500))
        }
      } catch (fetchErr: any) {
        console.warn(`[AUTO-REPLY] ${model.name} fetch error: ${fetchErr.message}, trying next...`)
      }
    }

    if (geminiData) {
      rawReply = geminiData.candidates?.[0]?.content?.parts
        ?.filter((p: any) => p.text && p.thought !== true)
        ?.map((p: any) => p.text)
        ?.join('') || `Hi! I'm GrowBot 🤖, responding on behalf of ${ctx.sellerName}. Visit ${ctx.siteUrl}/market/booth/${ctx.boothId} for more info.---OPTION---Visit ${ctx.siteUrl}/market/booth/${ctx.boothId} to browse our products.`
    } else {
      console.error('[AUTO-REPLY] All models failed')
      rawReply = `Hi! I'm GrowBot 🤖, responding on behalf of ${ctx.sellerName}. Visit ${ctx.siteUrl}/market/booth/${ctx.boothId} to browse our products.---OPTION---Visit ${ctx.siteUrl}/market/booth/${ctx.boothId} for more info.`
    }
  }

  // Parse two suggestions from the response
  const parts = rawReply.split('---OPTION---').map(s => cleanBotReply(s.trim())).filter(Boolean)
  const suggestions = parts.length >= 2 ? [parts[0], parts[1]] : [parts[0] || rawReply, parts[0] || rawReply]

  // Check for escalation in the primary suggestion
  const escalation = detectEscalation(suggestions[0] || '')

  const isOrder = type === 'order'

  if (effectiveDelay === 0 && !isOrder) {
    // ── First responder mode: send immediately ──
    const replyText = suggestions[0]

    if (type === 'messenger' && conversationId) {
      // For messenger, call send-messenger-reply edge function
      try {
        await supabase.functions.invoke('send-messenger-reply', {
          body: {
            conversation_id: conversationId,
            message: `🤖 ${replyText}`,
            seller_id: recipientId,
          },
        })
      } catch (messengerErr: any) {
        console.error('[AUTO-REPLY] Messenger send error:', messengerErr.message)
        // Fall back to storing the message in messenger_messages directly
        await supabase.from('messenger_messages').insert({
          conversation_id: conversationId,
          role: 'bot',
          content: `🤖 ${replyText}`,
        })
      }
    } else if (type === 'order' && orderId) {
      await supabase.from('order_chat_messages').insert({
        order_id: orderId,
        sender_id: recipientId,
        content: `🤖 ${replyText}`,
        is_bot: true,
      })
    } else if (conversationId) {
      await supabase.from('market_chat_messages').insert({
        conversation_id: conversationId,
        sender_id: recipientId,
        content: `🤖 ${replyText}`,
        is_bot: true,
      })
    }

    // Store as sent draft (for tracking/analytics)
    if (convRef) {
      await supabase.from('bot_reply_drafts').insert({
        channel: type,
        conversation_ref: convRef,
        trigger_message_id: messageId,
        booth_id: boothId,
        seller_id: recipientId,
        suggestions: JSON.stringify(suggestions),
        auto_send_at: new Date().toISOString(),
        status: 'sent',
        selected_index: 0,
        buyer_message: userMessage,
        resolved_at: new Date().toISOString(),
      })
    }

    console.log(`[AUTO-REPLY] First responder: sent immediately for ${type} (seller: ${recipientId})`)

    // Clear typing indicator and notify client of new message
    if (realtimeChannelName) {
      try {
        // Reuse existing channel if we opened one for typing, otherwise create one
        if (!rtChannel) {
          rtChannel = supabase.channel(realtimeChannelName)
          await rtChannel.subscribe()
        }
        // Clear typing
        await rtChannel.send({
          type: 'broadcast',
          event: 'typing',
          payload: { user_id: recipientId, isTyping: false },
        })
        // Signal new message so client fetches immediately (faster than Postgres Realtime)
        await rtChannel.send({
          type: 'broadcast',
          event: 'bot_reply',
          payload: { sender_id: recipientId, is_bot: true },
        })
        supabase.removeChannel(rtChannel)
        rtChannel = null
      } catch (e) {
        console.warn('[AUTO-REPLY] Broadcast failed:', e)
      }
    }

  } else {
    // ── Co-pilot mode: store as draft with timer ──
    const autoSendAt = isOrder
      ? new Date('9999-12-31T23:59:59Z').toISOString()
      : new Date(Date.now() + effectiveDelay * 60 * 1000).toISOString()

    if (convRef) {
      await supabase.from('bot_reply_drafts').insert({
        channel: type,
        conversation_ref: convRef,
        trigger_message_id: messageId,
        booth_id: boothId,
        seller_id: recipientId,
        suggestions: JSON.stringify(suggestions),
        auto_send_at: autoSendAt,
        status: 'pending',
        buyer_message: userMessage,
      })
    }

    console.log(`[AUTO-REPLY] Draft created for ${type} (seller: ${recipientId}), auto-send at ${autoSendAt}`)
  }

  // Escalation: notify seller via SMS + email + push (even in copilot mode)
  if (escalation.escalate) {
    const { data: seller } = await supabase
      .from('profiles')
      .select('phone_number, phone_verified')
      .eq('id', recipientId)
      .single()

    const label = type === 'messenger' ? 'Messenger' : type === 'order' ? 'Order chat' : 'DM'
    const linkUrl = type === 'messenger' ? `/messages/messenger/${conversationId}` : type === 'order' ? `/orders/${orderId}` : '/messages'
    const msgPreview = userMessage.slice(0, 80)

    // SMS
    if (seller?.phone_verified && seller?.phone_number) {
      try {
        await supabase.functions.invoke('send-sms-notification', {
          body: {
            userId: recipientId,
            message: `🔔 ${label}: A customer needs help — "${msgPreview}"`,
            linkUrl,
          },
        })
        console.log(`[AUTO-REPLY] SMS escalation sent to ${recipientId}`)
      } catch (smsErr: any) {
        console.error('[AUTO-REPLY] SMS escalation failed:', smsErr.message)
      }
    }

    // Email
    try {
      const { data: senderProfile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', senderId)
        .single()

      await supabase.functions.invoke('send-notification-email', {
        body: {
          type: 'chat_initiated',
          userId: recipientId,
          data: {
            buyerName: senderProfile?.full_name || 'A customer',
            productName: label,
            message: msgPreview,
            actionUrl: linkUrl,
          },
        },
      })
      console.log(`[AUTO-REPLY] Email escalation sent to ${recipientId}`)
    } catch (emailErr: any) {
      console.error('[AUTO-REPLY] Email escalation failed:', emailErr.message)
    }

    // Push notification
    try {
      await supabase.functions.invoke('send-push-notification', {
        body: {
          userId: recipientId,
          title: `🔔 ${label}: Customer needs help`,
          body: `"${msgPreview}"`,
          data: { url: linkUrl },
        },
      })
      console.log(`[AUTO-REPLY] Push escalation sent to ${recipientId}`)
    } catch (pushErr: any) {
      console.error('[AUTO-REPLY] Push escalation failed:', pushErr.message)
    }
  }

  return jsonOk({
    success: true,
    type,
    channel: channelKey,
    delayMinutes: effectiveDelay,
    escalated: escalation.escalate,
  }, corsHeaders)
})
