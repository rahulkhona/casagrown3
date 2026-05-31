/**
 * whatsapp-webhook — WhatsApp Business webhook for auto-reply
 *
 * GET:  Webhook verification (hub.verify_token check)
 * POST: Handle incoming messages → AI-powered reply via WhatsApp Cloud API
 */
import { serveWithCors, jsonOk, jsonError } from '../_shared/serve-with-cors.ts'
import { sendWhatsAppMessage } from '../_shared/facebook.ts'
import {
  loadBoothContext, buildSellerSystemPrompt, loadSellerBotRules,
  loadAllSellerBooths, detectEscalation, cleanBotReply,
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
      console.log('[WHATSAPP] Webhook verified')
      return new Response(challenge, { status: 200, headers: corsHeaders })
    }

    return new Response('Forbidden', { status: 403, headers: corsHeaders })
  }

  // ── POST: Handle Incoming Messages ──
  const body = await req.json()

  // Always respond 200 to WhatsApp Cloud API (even on errors)
  try {
    const entries = body.entry || []

    for (const entry of entries) {
      const changes = entry.changes || []

      for (const change of changes) {
        const val = change.value || {}
        const metadata = val.metadata || {}
        const messages = val.messages || []
        const contacts = val.contacts || []

        const phoneNumberId = metadata.phone_number_id
        if (!phoneNumberId || messages.length === 0) continue

        // Find seller connection for this WhatsApp Phone Number ID
        const { data: conn } = await supabase
          .from('seller_fb_connections')
          .select('user_id, fb_page_access_token, wa_phone_number_id')
          .eq('wa_phone_number_id', phoneNumberId)
          .eq('status', 'connected')
          .single()

        if (!conn || !conn.fb_page_access_token) {
          console.warn(`[WHATSAPP] No connection for WhatsApp Phone ID ${phoneNumberId}`)
          continue
        }

        // Verify seller has active Elite subscription
        const { data: sub } = await supabase
          .from('seller_subscriptions')
          .select('plan, status')
          .eq('user_id', conn.user_id)
          .single()

        if (!sub || sub.plan !== 'elite' || !['active', 'trialing'].includes(sub.status)) {
          console.warn(`[WHATSAPP] Seller ${conn.user_id} not Elite, skipping`)
          continue
        }

        // Check if WhatsApp auto-reply is enabled in bot_channels (stored on Profiles)
        const { data: sellerProfile } = await supabase
          .from('profiles')
          .select('bot_channels')
          .eq('id', conn.user_id)
          .single()

        const whatsappConfig = (sellerProfile?.bot_channels as Record<string, any>)?.whatsapp
        if (whatsappConfig?.enabled === false) {
          console.log(`[WHATSAPP] WhatsApp auto-reply disabled for seller ${conn.user_id}`)
          continue
        }

        for (const message of messages) {
          const userPhone = message.from // Clean recipient phone (e.g. "16505551234")
          if (!userPhone) continue

          let userMessage = message.text?.body
          // Support postback/button clicks if any, otherwise fallback to message type
          if (!userMessage && message.button) {
            userMessage = message.button.text
          }

          if (!userMessage) continue

          console.log(`[WHATSAPP] Message from ${userPhone} on Phone ID ${phoneNumberId}: "${userMessage.slice(0, 100)}"`)

          // Retrieve buyer profile name if provided by Meta
          const buyerContact = contacts.find((c: any) => c.wa_id === userPhone)
          const buyerFirstName = buyerContact?.profile?.name?.split(' ')[0] || 'Neighbor'

          // Get/create conversation record
          const { data: conversation } = await supabase
            .from('wa_conversations')
            .upsert({
              wa_sender_phone: userPhone,
              seller_id: conn.user_id,
              last_message_at: new Date().toISOString(),
              message_count: 1,
            }, {
              onConflict: 'wa_sender_phone,seller_id',
            })
            .select('*, buyer_zip, buyer_fulfillment_pref, matched_booth_id')
            .single()

          if (conversation) {
            await supabase
              .from('wa_conversations')
              .update({
                message_count: (conversation.message_count || 0) + 1,
                last_message_at: new Date().toISOString(),
              })
              .eq('id', conversation.id)

            // Echo detection: for WhatsApp Cloud API, seller messages don't usually arrive on this webhook
            // unless they are using unified Meta suite. If they have custom pause, it checks the mode_until.
          }

          // Check if seller has taken over (manual reply via CasaGrown → bot paused)
          if (conversation.bot_conversation_mode_until === null && conversation.message_count > 1) {
            // Store message for history
            await supabase.from('wa_messages').insert({
              conversation_id: conversation.id, role: 'user', content: userMessage,
            })

            const reentryDelay = whatsappConfig?.delayMinutes ?? 0

            // Cancel any pending drafts
            await supabase
              .from('bot_reply_drafts')
              .update({ status: 'cancelled', resolved_at: new Date().toISOString() })
              .eq('conversation_ref', `whatsapp_${conversation.id}`)
              .eq('status', 'pending')

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
                channel: 'whatsapp',
                conversation_ref: `whatsapp_${conversation.id}`,
                trigger_message_id: message.id || 'unknown',
                booth_id: sellerBoothId,
                seller_id: conn.user_id,
                suggestions: JSON.stringify([]),
                auto_send_at: new Date(Date.now() + reentryDelay * 60 * 1000).toISOString(),
                status: 'pending',
                buyer_message: userMessage,
              })
              console.log(`[WHATSAPP] Seller active — draft created, bot resumes in ${reentryDelay}min if seller doesn't reply`)
            }
            continue
          }

          // ── Multi-booth routing ──
          const allBooths = await loadAllSellerBooths(supabase, conn.user_id)

          if (allBooths.length === 0) {
            await sendWhatsAppMessage(phoneNumberId, conn.fb_page_access_token, userPhone, 
              "Thanks for reaching out! I'm still setting up my booth. Please check back soon!"
            )
            continue
          }

          let knownBuyerZip: string | null = conversation?.buyer_zip || null
          const siteUrl = Deno.env.get('SITE_URL') || 'https://casagrown.com'
          let boothId: string | null = conversation?.matched_booth_id || null

          if (allBooths.length === 1) {
            boothId = allBooths[0].id
          } else if (!boothId) {
            const zipMatch = userMessage.match(/\b(\d{5})\b/)
            if (zipMatch) {
              const buyerZip = zipMatch[1]
              knownBuyerZip = buyerZip

              const deliveryMatch = allBooths.find(b =>
                b.offersDelivery && b.deliveryZipcodes?.includes(buyerZip)
              )
              if (deliveryMatch) {
                boothId = deliveryMatch.id
              } else {
                const pickupMatch = allBooths.find(b => b.offersPickup)
                if (pickupMatch) boothId = pickupMatch.id
              }

              if (boothId && conversation) {
                await supabase
                  .from('wa_conversations')
                  .update({ buyer_zip: buyerZip, matched_booth_id: boothId })
                  .eq('id', conversation.id)
              }
            }
          }

          if (!boothId && allBooths.length > 1) {
            let routingMessage: string
            if (allBooths.length <= 3) {
              const boothLines = allBooths.map((b, i) => {
                const fulfillment = [
                  b.offersPickup ? `📍 Pickup${b.pickupDisplayAddress ? ` (${b.pickupDisplayAddress})` : ''}` : null,
                  b.offersDelivery ? `🚗 Delivery${b.deliveryRadius ? ` (${b.deliveryRadius} mi)` : ''}` : null,
                ].filter(Boolean).join(' • ')
                return `${i + 1}. *${b.name}*\n   ${fulfillment}\n   → ${siteUrl}/market/booth/${b.id}`
              }).join('\n\n')

              routingMessage = `Hi! I'm GrowBot 🤖 — thanks for your interest!\n\nWe're available at:\n\n${boothLines}\n\nWhich works best for you? Or share your zip code and I'll find the closest one!`
            } else {
              routingMessage = `Hi! I'm GrowBot 🤖 — thanks for your interest!\n\nWe're available at ${allBooths.length} locations! Share your zip code and I'll find the closest one for you!`
            }

            await sendWhatsAppMessage(phoneNumberId, conn.fb_page_access_token, userPhone, routingMessage)
            continue
          }

          if (!boothId) {
            boothId = allBooths[0].id
          }

          const ctx = await loadBoothContext(supabase, boothId)
          if (!ctx) {
            await sendWhatsAppMessage(phoneNumberId, conn.fb_page_access_token, userPhone,
              "Thanks for your interest! Please visit our CasaGrown page for the latest products."
            )
            continue
          }

          const sellerRules = await loadSellerBotRules(supabase)
          let systemPrompt = buildSellerSystemPrompt(ctx, sellerRules)
          systemPrompt += `\n\nBUYER CONTEXT:\n- Buyer's First Name: ${buyerFirstName}`

          if (knownBuyerZip && allBooths.length > 1) {
            const matchedBooth = allBooths.find(b => b.id === boothId)
            systemPrompt += `\n- Buyer's zip code: ${knownBuyerZip}`
            if (conversation?.buyer_fulfillment_pref) {
              systemPrompt += `\n- Preferred fulfillment: ${conversation.buyer_fulfillment_pref}`
            }
            if (matchedBooth) {
              systemPrompt += `\n- Matched to booth: "${matchedBooth.name}"`
            }
          }

          // System prompt URL tracking instruction
          systemPrompt += `\n\nURL TRACKING: When sharing any CasaGrown link, append ?wa_phone=${userPhone}&wa_number_id=${phoneNumberId} to the URL.`

          // History
          const historyContents: Array<{ role: string; parts: Array<{ text: string }> }> = []
          if (conversation) {
            const { data: history } = await supabase
              .from('wa_messages')
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

          const allContents = [...historyContents, { role: 'user', parts: [{ text: userMessage }] }]
          const cleanedContents: typeof allContents = []
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

          const AI_KEY = Deno.env.get('GEMINI_API_KEY') || ''
          const AI_MOCK = Deno.env.get('AI_MOCK') === 'true'
          const model = Deno.env.get('AI_MODEL') || 'gemini-2.5-flash'

          if (!AI_KEY && !AI_MOCK) {
            await sendWhatsAppMessage(phoneNumberId, conn.fb_page_access_token, userPhone,
              `Thanks for your interest in ${ctx.boothName}! Visit ${ctx.siteUrl}/market/booth/${ctx.boothId} to browse and order.`
            )
            continue
          }

          // Calculate delay before AI call so catch block can use it
          let whatsappDelay = whatsappConfig?.delayMinutes ?? 0
          if (conversation?.bot_conversation_mode_until) {
            const modeUntil = new Date(conversation.bot_conversation_mode_until)
            if (modeUntil > new Date()) {
              whatsappDelay = 0
            }
          }

          try {
            let rawReply: string

            if (AI_MOCK) {
              console.log('[WHATSAPP] Skipping Gemini — AI_MOCK is true')
              rawReply = `Hi! I'm GrowBot 🤖, responding on behalf of ${ctx.sellerName}. Visit ${ctx.siteUrl}/market/booth/${ctx.boothId} to browse and order.`
            } else {
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
              rawReply = geminiData.candidates?.[0]?.content?.parts
                ?.filter((p: any) => p.text && p.thought !== true)
                ?.map((p: any) => p.text)
                ?.join('') || `Thanks for your interest! Visit ${ctx.siteUrl}/market/booth/${ctx.boothId} to see our products.`
            }

            const escalation = detectEscalation(rawReply)
            const replyText = cleanBotReply(rawReply)


            if (whatsappDelay > 0 && conversation) {
              // Store user message first
              await supabase.from('wa_messages').insert({
                conversation_id: conversation.id, role: 'user', content: userMessage,
              })

              // Cancel any pending drafts
              await supabase
                .from('bot_reply_drafts')
                .update({ status: 'cancelled', resolved_at: new Date().toISOString() })
                .eq('conversation_ref', `whatsapp_${conversation.id}`)
                .eq('status', 'pending')

              // Insert delayed draft
              await supabase.from('bot_reply_drafts').insert({
                channel: 'whatsapp',
                conversation_ref: `whatsapp_${conversation.id}`,
                trigger_message_id: message.id || 'unknown',
                booth_id: boothId,
                seller_id: conn.user_id,
                suggestions: JSON.stringify([replyText]),
                auto_send_at: new Date(Date.now() + whatsappDelay * 60 * 1000).toISOString(),
                status: 'pending',
                buyer_message: userMessage,
              })

              console.log(`[WHATSAPP] Draft created for ${userPhone}, auto-send in ${whatsappDelay}min`)
            } else {
              // Send WhatsApp message instantly
              await sendWhatsAppMessage(phoneNumberId, conn.fb_page_access_token, userPhone, replyText)

              if (conversation) {
                await supabase.from('wa_messages').insert([
                  { conversation_id: conversation.id, role: 'user', content: userMessage },
                  { conversation_id: conversation.id, role: 'bot', content: replyText },
                ])
              }

              console.log(`[WHATSAPP] Replied instantly to ${userPhone}: "${replyText.slice(0, 100)}"`)
            }

            // Meta preferences
            const zipInMsg = userMessage.match(/\b(\d{5})\b/)
            if (zipInMsg && conversation) {
              const updates: any = { buyer_zip: zipInMsg[1] }
              const prefDelivery = /\b(deliver|delivery|ship)\b/i.test(userMessage)
              const prefPickup = /\b(pick\s*up|pickup)\b/i.test(userMessage)
              if (prefDelivery) updates.buyer_fulfillment_pref = 'delivery'
              else if (prefPickup) updates.buyer_fulfillment_pref = 'pickup'

              await supabase
                .from('wa_conversations')
                .update(updates)
                .eq('id', conversation.id)
            }

            if (boothId && conversation && !conversation.matched_booth_id) {
              await supabase
                .from('wa_conversations')
                .update({ matched_booth_id: boothId })
                .eq('id', conversation.id)
            }

            // Escalation — notify seller
            if (escalation.escalate) {
              if (conversation) {
                await supabase
                  .from('wa_conversations')
                  .update({ bot_conversation_mode_until: null })
                  .eq('id', conversation.id)
              }

              const msgPreview = userMessage.slice(0, 80)
              const linkUrl = conversation ? `/messages/whatsapp/${conversation.id}` : '/messages'

              // SMS
              const { data: seller } = await supabase
                .from('profiles')
                .select('phone_number, phone_verified')
                .eq('id', conn.user_id)
                .single()

              if (seller?.phone_verified && seller?.phone_number) {
                try {
                  await supabase.functions.invoke('send-sms-notification', {
                    body: {
                      userId: conn.user_id,
                      message: `🔔 WhatsApp: A customer needs help — "${msgPreview}"`,
                      linkUrl,
                    },
                  })
                } catch (smsErr: any) {
                  console.error('[WHATSAPP] SMS escalation failed:', smsErr.message)
                }
              }

              // Email
              try {
                await supabase.functions.invoke('send-notification-email', {
                  body: {
                    type: 'chat_initiated',
                    userId: conn.user_id,
                    data: {
                      buyerName: 'A WhatsApp customer',
                      productName: 'WhatsApp',
                      message: msgPreview,
                      actionUrl: linkUrl,
                    },
                  },
                })
              } catch (emailErr: any) {
                console.error('[WHATSAPP] Email escalation failed:', emailErr.message)
              }

              // Push notification
              try {
                await supabase.functions.invoke('send-push-notification', {
                  body: {
                    userId: conn.user_id,
                    title: `🔔 WhatsApp: Customer needs help`,
                    body: `"${msgPreview}"`,
                    data: { url: linkUrl },
                  },
                })
              } catch (pushErr: any) {
                console.error('[WHATSAPP] Push escalation failed:', pushErr.message)
              }
            }
          } catch (aiErr: any) {
            console.error('[WHATSAPP] AI error:', aiErr.message)

            // If delayed mode, still create a draft (process-bot-replies will retry AI)
            if (whatsappDelay > 0 && conversation) {
              await supabase.from('wa_messages').insert({
                conversation_id: conversation.id, role: 'user', content: userMessage,
              })
              await supabase.from('bot_reply_drafts').insert({
                channel: 'whatsapp',
                conversation_ref: `whatsapp_${conversation.id}`,
                trigger_message_id: message.id || null,
                booth_id: boothId,
                seller_id: conn.user_id,
                suggestions: JSON.stringify([]),
                auto_send_at: new Date(Date.now() + whatsappDelay * 60 * 1000).toISOString(),
                status: 'pending',
                buyer_message: userMessage,
              })
              console.log(`[WHATSAPP] AI failed but draft created for delayed processing`)
            } else {
              await sendWhatsAppMessage(phoneNumberId, conn.fb_page_access_token, userPhone,
                `Thanks for reaching out! Visit ${ctx.siteUrl}/market/booth/${boothId} to browse our products and place an order.`
              )
            }
          }
        }
      }
    }
  } catch (err: any) {
    console.error('[WHATSAPP] Webhook processing error:', err)
  }

  return jsonOk({ received: true }, corsHeaders)
})
