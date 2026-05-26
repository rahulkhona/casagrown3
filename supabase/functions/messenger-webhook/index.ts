/**
 * messenger-webhook — Facebook Messenger webhook for auto-reply
 *
 * GET:  Webhook verification (hub.verify_token check)
 * POST: Handle incoming messages → AI-powered reply with multi-booth routing
 */
import { serveWithCors, jsonOk, jsonError } from '../_shared/serve-with-cors.ts'
import { sendMessengerMessage } from '../_shared/facebook.ts'
import {
  loadBoothContext, buildSellerSystemPrompt, loadSellerBotRules,
  loadAllSellerBooths, detectEscalation, cleanBotReply,
  type BoothSummary,
} from '../_shared/growbot-seller.ts'

serveWithCors(async (req, { supabase, env, corsHeaders }) => {
  // ── GET: Webhook Verification ──
  if (req.method === 'GET') {
    const url = new URL(req.url)
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')

    const VERIFY_TOKEN = env('FACEBOOK_VERIFY_TOKEN') || 'casagrown_verify'

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('[MESSENGER] Webhook verified')
      return new Response(challenge, { status: 200, headers: corsHeaders })
    }

    return new Response('Forbidden', { status: 403, headers: corsHeaders })
  }

  // ── POST: Handle Incoming Messages ──
  const body = await req.json()

  // Always respond 200 to Facebook (even on errors)
  try {
    const entries = body.entry || []

    for (const entry of entries) {
      const messaging = entry.messaging || []

      for (const event of messaging) {
        // Detect seller echo — seller replied from Facebook Page inbox
        // In this case, event.message.is_echo === true
        if (event.message?.is_echo) {
          const pageId = entry.id
          // Find conversation and pause bot (seller is active)
          const { data: conn } = await supabase
            .from('seller_fb_connections')
            .select('user_id')
            .eq('fb_page_id', pageId)
            .single()

          if (conn) {
            // Set bot_conversation_mode_until to null (seller took over) and update active presence
            const { data: convs } = await supabase
              .from('messenger_conversations')
              .select('id')
              .eq('seller_id', conn.user_id)
              .eq('fb_sender_id', event.recipient?.id)

            for (const c of (convs || [])) {
              await supabase
                .from('messenger_conversations')
                .update({ 
                  bot_conversation_mode_until: null,
                  seller_last_active_at: new Date().toISOString(),
                })
                .eq('id', c.id)

              // Insert the seller's echo reply into local message history so it appears in the chat dashboard
              if (event.message?.text) {
                await supabase.from('messenger_messages').insert({
                  conversation_id: c.id,
                  role: 'seller',
                  content: event.message.text,
                })
              }

              // Cancel any pending drafts for this conversation
              await supabase
                .from('bot_reply_drafts')
                .update({ status: 'seller_replied', resolved_at: new Date().toISOString() })
                .eq('conversation_ref', `messenger_${c.id}`)
                .eq('status', 'pending')
            }

            console.log(`[MESSENGER] Seller echo detected — bot paused, active presence set, pending drafts cancelled`)
          }
          continue
        }

        // Skip non-message events (reads, deliveries, etc.) unless they are image attachments
        let userMessage = event.message?.text
        if (!userMessage && event.message?.attachments && event.message.attachments.length > 0) {
          const firstAttachment = event.message.attachments[0]
          if (firstAttachment.type === 'image') {
            userMessage = firstAttachment.payload?.url
          }
        }

        if (!userMessage) continue

        const senderPsid = event.sender?.id
        const pageId = entry.id

        if (!senderPsid || !pageId) continue

        console.log(`[MESSENGER] Message from ${senderPsid} on page ${pageId}: "${userMessage.slice(0, 100)}"`)

        // Find seller connection for this page
        const { data: conn } = await supabase
          .from('seller_fb_connections')
          .select('user_id, fb_page_access_token, fb_page_id')
          .eq('fb_page_id', pageId)
          .eq('status', 'connected')
          .single()

        if (!conn || !conn.fb_page_access_token) {
          console.warn(`[MESSENGER] No connection for page ${pageId}`)
          continue
        }

        // Verify seller has active Pro subscription
        const { data: sub } = await supabase
          .from('seller_subscriptions')
          .select('plan, status')
          .eq('user_id', conn.user_id)
          .single()

        if (!sub || sub.plan !== 'pro' || !['active', 'trialing'].includes(sub.status)) {
          console.warn(`[MESSENGER] Seller ${conn.user_id} not Pro, skipping`)
          continue
        }

        // Check if Messenger auto-reply is enabled in bot_channels
        const { data: defaultBooth } = await supabase
          .from('market_booths')
          .select('bot_channels')
          .eq('owner_id', conn.user_id)
          .eq('is_default', true)
          .single()

        const messengerConfig = (defaultBooth?.bot_channels as Record<string, any>)?.messenger
        if (messengerConfig?.enabled === false) {
          console.log(`[MESSENGER] Messenger auto-reply disabled for seller ${conn.user_id}`)
          continue
        }

        // Get/create conversation record with buyer preferences
        const { data: conversation } = await supabase
          .from('messenger_conversations')
          .upsert({
            fb_sender_id: senderPsid,
            seller_id: conn.user_id,
            last_message_at: new Date().toISOString(),
            message_count: 1,
          }, {
            onConflict: 'fb_sender_id,seller_id',
          })
          .select('*, buyer_zip, buyer_fulfillment_pref, matched_booth_id')
          .single()

        // Increment message count
        if (conversation) {
          await supabase
            .from('messenger_conversations')
            .update({
              message_count: (conversation.message_count || 0) + 1,
              last_message_at: new Date().toISOString(),
            })
            .eq('id', conversation.id)

          // Check if seller has taken over (echo detected → bot paused)
          // bot_conversation_mode_until === null means seller is active
          // Unless it's a brand new conversation (no bot_conversation_mode_until set yet)
          if (conversation.bot_conversation_mode_until === null && conversation.message_count > 1) {
            // Store message for history
            await supabase.from('messenger_messages').insert({
              conversation_id: conversation.id, role: 'user', content: userMessage,
            })

            // Use configured delay for re-entry
            const reentryDelay = messengerConfig?.delayMinutes ?? 0

            // Cancel any existing pending drafts for this conversation
            await supabase
              .from('bot_reply_drafts')
              .update({ status: 'cancelled', resolved_at: new Date().toISOString() })
              .eq('conversation_ref', `messenger_${conversation.id}`)
              .eq('status', 'pending')

            // Find the seller's booth for context
            let sellerBoothId: string | null = conversation.matched_booth_id
            if (!sellerBoothId) {
              const { data: fb } = await supabase
                .from('market_booths')
                .select('id')
                .eq('owner_id', conn.user_id)
                .eq('is_default', true)
                .single()
              sellerBoothId = fb?.id || null
            }

            if (sellerBoothId) {
              await supabase.from('bot_reply_drafts').insert({
                channel: 'messenger',
                conversation_ref: `messenger_${conversation.id}`,
                trigger_message_id: event.message?.mid || 'unknown',
                booth_id: sellerBoothId,
                seller_id: conn.user_id,
                suggestions: JSON.stringify([]),  // Will be generated by process-bot-replies
                auto_send_at: new Date(Date.now() + reentryDelay * 60 * 1000).toISOString(),
                status: 'pending',
                buyer_message: userMessage,
              })
              console.log(`[MESSENGER] Seller active — draft created, bot resumes in ${reentryDelay}min if seller doesn't reply`)
            }
            continue
          }
        }

        // ── Multi-booth routing ──
        const allBooths = await loadAllSellerBooths(supabase, conn.user_id)

        if (allBooths.length === 0) {
          await sendMessengerMessage(conn.fb_page_access_token, senderPsid, {
            text: "Thanks for reaching out! I'm still setting up my booth. Please check back soon!",
          })
          continue
        }

        // Check for cross-seller memory: does this PSID have a linked CasaGrown profile?
        let knownBuyerZip: string | null = conversation?.buyer_zip || null
        if (!knownBuyerZip) {
          const { data: linked } = await supabase.rpc('find_profile_by_psid', { p_psid: senderPsid })
          if (linked && linked.length > 0 && linked[0].zip_code) {
            knownBuyerZip = linked[0].zip_code
            console.log(`[MESSENGER] Cross-seller memory: found zip ${knownBuyerZip} for PSID ${senderPsid}`)
          }
        }

        const siteUrl = Deno.env.get('SITE_URL') || 'https://casagrown.com'
        let boothId: string | null = conversation?.matched_booth_id || null

        // If only 1 booth, skip routing entirely
        if (allBooths.length === 1) {
          boothId = allBooths[0].id
        }
        // If we have a previously matched booth AND it's a return visit, confirm
        else if (boothId && knownBuyerZip) {
          // Return visit — build routing context into system prompt
          // The bot will naturally confirm "Same location as last time?"
        }
        // If buyer provided a zip in THIS message, try to route
        else if (!boothId) {
          const zipMatch = userMessage.match(/\b(\d{5})\b/)
          if (zipMatch) {
            const buyerZip = zipMatch[1]
            knownBuyerZip = buyerZip

            // Match by delivery zipcodes first
            const deliveryMatch = allBooths.find(b =>
              b.offersDelivery && b.deliveryZipcodes?.includes(buyerZip)
            )
            if (deliveryMatch) {
              boothId = deliveryMatch.id
            } else {
              // Fallback: use first booth with pickup (closest concept)
              const pickupMatch = allBooths.find(b => b.offersPickup)
              if (pickupMatch) boothId = pickupMatch.id
            }

            // Save preference
            if (boothId && conversation) {
              await supabase
                .from('messenger_conversations')
                .update({ buyer_zip: buyerZip, matched_booth_id: boothId })
                .eq('id', conversation.id)
            }
          }
        }

        // If still no booth matched AND multiple booths exist → routing conversation
        if (!boothId && allBooths.length > 1) {
          let routingMessage: string

          if (allBooths.length <= 3) {
            // List all booths with fulfillment details
            const boothLines = allBooths.map((b, i) => {
              const fulfillment = [
                b.offersPickup ? `📍 Pickup${b.pickupDisplayAddress ? ` (${b.pickupDisplayAddress})` : ''}` : null,
                b.offersDelivery ? `🚗 Delivery${b.deliveryRadius ? ` (${b.deliveryRadius} mi)` : ''}` : null,
              ].filter(Boolean).join(' • ')
              const products = b.productNames.length > 0
                ? b.productNames.slice(0, 3).join(', ')
                : 'See menu'
              return `${i + 1}. **${b.name}**\n   ${fulfillment}\n   🥬 ${products}\n   → ${siteUrl}/market/booth/${b.id}`
            }).join('\n\n')

            routingMessage = `Hi! I'm GrowBot 🤖 — thanks for your interest!\n\nWe're available at:\n\n${boothLines}\n\nWhich works best for you? Or share your zip code and I'll find the closest one!`
          } else {
            // Too many booths — ask for zip
            routingMessage = `Hi! I'm GrowBot 🤖 — thanks for your interest!\n\nWe're available at ${allBooths.length} locations! To find the best option for you, could you share your zip code or nearest area?`
          }

          await sendMessengerMessage(conn.fb_page_access_token, senderPsid, {
            text: routingMessage,
          })
          console.log(`[MESSENGER] Routing prompt sent to ${senderPsid} (${allBooths.length} booths)`)
          continue
        }

        // Fallback: if still no booth (shouldn't happen), use default
        if (!boothId) {
          boothId = allBooths[0].id
        }

        // Load booth context
        const ctx = await loadBoothContext(supabase, boothId)
        if (!ctx) {
          await sendMessengerMessage(conn.fb_page_access_token, senderPsid, {
            text: "Thanks for your interest! Please visit our CasaGrown page for the latest products.",
          })
          continue
        }

        // Build system prompt with routing context
        const sellerRules = await loadSellerBotRules(supabase)
        let systemPrompt = buildSellerSystemPrompt(ctx, sellerRules)

        // Add return-visit context if we have saved preferences
        if (knownBuyerZip && allBooths.length > 1) {
          const matchedBooth = allBooths.find(b => b.id === boothId)
          systemPrompt += `\n\nBUYER CONTEXT:\n- Buyer's zip code: ${knownBuyerZip}`
          if (conversation?.buyer_fulfillment_pref) {
            systemPrompt += `\n- Preferred fulfillment: ${conversation.buyer_fulfillment_pref}`
          }
          if (matchedBooth) {
            systemPrompt += `\n- Matched to booth: "${matchedBooth.name}"`
          }
          systemPrompt += `\n- This is a return visitor. If they seem to be looking for a different location, offer to help find another booth.`
        }

        // Instruct bot to append PSID tracking to all links (for cross-seller memory)
        systemPrompt += `\n\nURL TRACKING: When sharing any CasaGrown link, append ?fb_psid=${senderPsid}&fb_page=${pageId} to the URL. This helps us provide a seamless experience for the buyer.`

        // Load conversation history for multi-turn context
        const historyContents: Array<{ role: string; parts: Array<{ text: string }> }> = []
        if (conversation) {
          const { data: history } = await supabase
            .from('messenger_messages')
            .select('role, content')
            .eq('conversation_id', conversation.id)
            .order('created_at', { ascending: false })
            .limit(30)

          const sortedHistory = (history || []).reverse()
          for (const h of sortedHistory) {
            const geminiRole = h.role === 'bot' ? 'model' : 'user'
            historyContents.push({ role: geminiRole, parts: [{ text: h.content }] })
          }
        }

        // Build final contents array: history + current message
        const allContents = [...historyContents, { role: 'user', parts: [{ text: userMessage }] }]
        // Deduplicate consecutive same-role turns
        const cleanedContents: typeof allContents = []
        for (const c of allContents) {
          if (cleanedContents.length > 0 && cleanedContents[cleanedContents.length - 1].role === c.role) {
            cleanedContents[cleanedContents.length - 1].parts[0].text += '\n' + c.parts[0].text
          } else {
            cleanedContents.push(c)
          }
        }
        // Ensure first turn is 'user'
        while (cleanedContents.length > 0 && cleanedContents[0].role !== 'user') {
          cleanedContents.shift()
        }

        // Call Gemini API (non-streaming for Messenger)
        const AI_KEY = Deno.env.get('GEMINI_API_KEY') || ''
        const model = Deno.env.get('AI_MODEL') || 'gemini-2.5-flash'

        if (!AI_KEY) {
          await sendMessengerMessage(conn.fb_page_access_token, senderPsid, {
            text: `Thanks for your interest in ${ctx.boothName}! Visit ${ctx.siteUrl}/market/booth/${ctx.boothId} to browse and order.`,
          })
          continue
        }

        try {
          const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${AI_KEY}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                system_instruction: { parts: [{ text: systemPrompt }] },
                contents: cleanedContents,
                generationConfig: { temperature: 0.3, maxOutputTokens: 512 },
              }),
            },
          )

          if (!geminiRes.ok) {
            throw new Error(`Gemini API error: ${geminiRes.status}`)
          }

          const geminiData = await geminiRes.json()
          const rawReply = geminiData.candidates?.[0]?.content?.parts
            ?.filter((p: any) => p.text && p.thought !== true)
            ?.map((p: any) => p.text)
            ?.join('') || `Thanks for your interest! Visit ${ctx.siteUrl}/market/booth/${ctx.boothId} to see our products.`

          // Check for escalation signals
          const escalation = detectEscalation(rawReply)
          const replyText = cleanBotReply(rawReply)

          let messengerDelay = messengerConfig?.delayMinutes ?? 0

          // If bot is already in conversation (bot_conversation_mode_until is set and not expired),
          // reply instantly — no delay. Delay only applies for first entry / re-entry.
          if (conversation?.bot_conversation_mode_until) {
            const modeUntil = new Date(conversation.bot_conversation_mode_until)
            if (modeUntil > new Date()) {
              messengerDelay = 0  // Bot is active, reply instantly
            }
          }

          if (messengerDelay > 0 && conversation) {
            // Delay mode: create a draft, let process-bot-replies send it later
            // Store buyer message in history
            await supabase.from('messenger_messages').insert({
              conversation_id: conversation.id, role: 'user', content: userMessage,
            })

            // Cancel any existing pending drafts for this conversation
            await supabase
              .from('bot_reply_drafts')
              .update({ status: 'cancelled', resolved_at: new Date().toISOString() })
              .eq('conversation_ref', `messenger_${conversation.id}`)
              .eq('status', 'pending')

            await supabase.from('bot_reply_drafts').insert({
              channel: 'messenger',
              conversation_ref: `messenger_${conversation.id}`,
              trigger_message_id: event.message?.mid || 'unknown',
              booth_id: boothId,
              seller_id: conn.user_id,
              suggestions: JSON.stringify([replyText]),
              auto_send_at: new Date(Date.now() + messengerDelay * 60 * 1000).toISOString(),
              status: 'pending',
              buyer_message: userMessage,
            })

            console.log(`[MESSENGER] Draft created for ${senderPsid}, auto-send in ${messengerDelay}min`)

          } else {
            // Instant mode (delay = 0): send immediately
            await sendMessengerMessage(conn.fb_page_access_token, senderPsid, {
              text: replyText,
            })

            // Store both messages in history
            if (conversation) {
              await supabase.from('messenger_messages').insert([
                { conversation_id: conversation.id, role: 'user', content: userMessage },
                { conversation_id: conversation.id, role: 'bot', content: replyText },
              ])
            }

            console.log(`[MESSENGER] Replied instantly to ${senderPsid}: "${replyText.slice(0, 100)}"`)
          }
          // Extract and save zip if buyer mentioned one in this message
          const zipInMsg = userMessage.match(/\b(\d{5})\b/)
          if (zipInMsg && conversation) {
            const updates: any = { buyer_zip: zipInMsg[1] }

            // Check for fulfillment preference
            const prefDelivery = /\b(deliver|delivery|ship)\b/i.test(userMessage)
            const prefPickup = /\b(pick\s*up|pickup)\b/i.test(userMessage)
            if (prefDelivery) updates.buyer_fulfillment_pref = 'delivery'
            else if (prefPickup) updates.buyer_fulfillment_pref = 'pickup'

            await supabase
              .from('messenger_conversations')
              .update(updates)
              .eq('id', conversation.id)
          }

          // Save matched booth
          if (boothId && conversation && !conversation.matched_booth_id) {
            await supabase
              .from('messenger_conversations')
              .update({ matched_booth_id: boothId })
              .eq('id', conversation.id)
          }

          // Escalation — notify seller via SMS + email + push if bot can't handle
          if (escalation.escalate) {
            // Pause instant conversation mode immediately so the bot doesn't spam instant replies
            if (conversation) {
              await supabase
                .from('messenger_conversations')
                .update({ bot_conversation_mode_until: null })
                .eq('id', conversation.id)
            }

            const { data: seller } = await supabase
              .from('profiles')
              .select('phone_number, phone_verified')
              .eq('id', conn.user_id)
              .single()

            const msgPreview = userMessage.slice(0, 80)

            // SMS
            if (seller?.phone_verified && seller?.phone_number) {
              try {
                await supabase.functions.invoke('send-sms-notification', {
                  body: {
                    userId: conn.user_id,
                    message: `🔔 Messenger: A customer needs help — "${msgPreview}"`,
                    linkUrl: '/messages',
                  },
                })
                console.log(`[MESSENGER] SMS escalation sent to ${conn.user_id} (reason: ${escalation.reason})`)
              } catch (smsErr: any) {
                console.error('[MESSENGER] SMS escalation failed:', smsErr.message)
              }
            }

            // Email
            try {
              await supabase.functions.invoke('send-notification-email', {
                body: {
                  type: 'chat_initiated',
                  userId: conn.user_id,
                  data: {
                    buyerName: 'A Facebook Messenger customer',
                    productName: 'Messenger',
                    message: msgPreview,
                    actionUrl: '/messages',
                  },
                },
              })
              console.log(`[MESSENGER] Email escalation sent to ${conn.user_id}`)
            } catch (emailErr: any) {
              console.error('[MESSENGER] Email escalation failed:', emailErr.message)
            }

            // Push notification
            try {
              await supabase.functions.invoke('send-push-notification', {
                body: {
                  userId: conn.user_id,
                  title: '🔔 Messenger: Customer needs help',
                  body: `"${msgPreview}"`,
                  data: { url: '/messages' },
                },
              })
              console.log(`[MESSENGER] Push escalation sent to ${conn.user_id}`)
            } catch (pushErr: any) {
              console.error('[MESSENGER] Push escalation failed:', pushErr.message)
            }
          }
        } catch (aiErr: any) {
          console.error('[MESSENGER] AI error:', aiErr.message)
          await sendMessengerMessage(conn.fb_page_access_token, senderPsid, {
            text: `Thanks for reaching out! Visit ${ctx.siteUrl}/market/booth/${boothId} to browse our products and place an order.`,
          })
        }
      }
    }
  } catch (err: any) {
    console.error('[MESSENGER] Webhook processing error:', err)
  }

  // Always return 200 OK to Facebook
  return jsonOk({ received: true }, corsHeaders)
})
