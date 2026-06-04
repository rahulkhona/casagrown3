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
import { extractWhatsAppProductRef, lookupProductById, buildProductContextPrompt } from '../_shared/product-context.ts'

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

        if (!sub || !['active', 'trialing'].includes(sub.status)) {
          console.warn(`[WHATSAPP] Seller ${conn.user_id} does not have an active subscription, skipping`)
          continue
        }

        // Check if WhatsApp Auto-Responder is enabled in subscription tier features
        const { data: tier } = await supabase
          .from('subscription_tiers')
          .select('features')
          .eq('tier_name', sub.plan)
          .single()

        if (!tier?.features?.whatsapp_chat) {
          console.warn(`[WHATSAPP] Seller ${conn.user_id} does not have WhatsApp Auto-Responder enabled in subscription tier, skipping`)
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

          // ── Extract product context from catalog, referred_product, or wa.me link ──
          const waProductRef = extractWhatsAppProductRef(message, userMessage)
          if (waProductRef.cleanedMessage) {
            userMessage = waProductRef.cleanedMessage  // Strip ref tag from display
          }

          console.log(`[WHATSAPP] Message from ${userPhone} on Phone ID ${phoneNumberId}: "${userMessage.slice(0, 100)}"${waProductRef.productId ? ` [product: ${waProductRef.productId}]` : ''}`)

          // Retrieve buyer profile name if provided by Meta
          const buyerContact = contacts.find((c: any) => c.wa_id === userPhone)
          const buyerFirstName = buyerContact?.profile?.name?.split(' ')[0] || 'Neighbor'

          const allBooths = await loadAllSellerBooths(supabase, conn.user_id)
          if (allBooths.length === 0) {
            await sendWhatsAppMessage(phoneNumberId, conn.fb_page_access_token, userPhone, 
              "Thanks for reaching out! I'm still setting up my booth. Please check back soon!"
            )
            continue
          }

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

          let lockDraft: any = null
          if (conversation) {
            const triggerMessageId = message.id || `msg_${Date.now()}`

            // 1. Lock check for deduplication
            const { data: existingDraft } = await supabase
              .from('bot_reply_drafts')
              .select('id')
              .eq('trigger_message_id', triggerMessageId)
              .limit(1)

            if (existingDraft && existingDraft.length > 0) {
              console.log(`[WHATSAPP] Duplicate webhook call detected for mid ${triggerMessageId}, skipping.`)
              continue
            }

            // 2. Log customer message immediately so seller sees it in their chat dashboard
            await supabase.from('wa_messages').insert({
              conversation_id: conversation.id,
              role: 'user',
              content: userMessage,
            })

            // 3. Create locked draft to act as lock
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
            if (!sellerBoothId && allBooths.length > 0) {
              sellerBoothId = allBooths[0].id
            }

            const { data: insertedDraft, error: draftErr } = await supabase
              .from('bot_reply_drafts')
              .insert({
                channel: 'whatsapp',
                conversation_ref: `whatsapp_${conversation.id}`,
                trigger_message_id: triggerMessageId,
                booth_id: sellerBoothId,
                seller_id: conn.user_id,
                status: 'pending',
                suggestions: JSON.stringify([]),
                auto_send_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
                buyer_message: userMessage,
              })
              .select()
              .single()

            if (draftErr) {
              console.error('[WHATSAPP] Error inserting draft:', draftErr.message, draftErr.details)
            }
            lockDraft = insertedDraft

            await supabase
              .from('wa_conversations')
              .update({
                message_count: (conversation.message_count || 0) + 1,
                last_message_at: new Date().toISOString(),
              })
              .eq('id', conversation.id)
          }

          // Check if seller has taken over (manual reply via CasaGrown → bot paused)
          if (conversation.bot_conversation_mode_until === null && conversation.message_count > 1) {
            const reentryDelay = whatsappConfig?.delayMinutes ?? 0

            // Cancel any pending drafts
            await supabase
              .from('bot_reply_drafts')
              .update({ status: 'cancelled', resolved_at: new Date().toISOString() })
              .eq('conversation_ref', `whatsapp_${conversation.id}`)
              .eq('status', 'pending')
              .neq('id', lockDraft?.id)

            if (lockDraft) {
              await supabase
                .from('bot_reply_drafts')
                .update({
                  status: 'pending',
                  auto_send_at: new Date(Date.now() + reentryDelay * 60 * 1000).toISOString(),
                })
                .eq('id', lockDraft.id)
            }

            console.log(`[WHATSAPP] Seller active — draft updated, bot resumes in ${reentryDelay}min if seller doesn't reply`)
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

          // Inject product context if buyer messaged from a catalog/product link
          if (waProductRef.productId) {
            const productCtx = await lookupProductById(supabase, waProductRef.productId)
            if (productCtx) {
              systemPrompt += buildProductContextPrompt(productCtx)
              console.log(`[WHATSAPP] Product context: ${productCtx.name} (source: ${waProductRef.source})`)
            }
            // Save to conversation for future messages in this thread
            if (conversation) {
              await supabase.from('wa_conversations')
                .update({ last_product_id: waProductRef.productId })
                .eq('id', conversation.id)
            }
          } else if (conversation?.last_product_id) {
            // Continuing conversation — load previously identified product
            const productCtx = await lookupProductById(supabase, conversation.last_product_id)
            if (productCtx) {
              systemPrompt += buildProductContextPrompt(productCtx)
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
          const model = Deno.env.get('AI_MODEL') || 'gemini-3.5-flash'

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
                    generationConfig: {
                      temperature: 0.3,
                      maxOutputTokens: 2048,
                      ...(model.includes('gemini-2.5') ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
                    },
                  }),
                },
              )

              if (!geminiRes.ok) {
                throw new Error(`Gemini API error: ${geminiRes.status}`)
              }

              const geminiData = await geminiRes.json()
              const cleanReplyText = geminiData.candidates?.[0]?.content?.parts
                ?.filter((p: any) => p.text && p.thought !== true)
                ?.map((p: any) => p.text)
                ?.join('')

              if (!cleanReplyText) {
                await supabase.from('edge_function_errors').insert({
                  function_name: 'whatsapp-webhook-gemini-fallback',
                  error_message: 'Gemini returned empty response or no candidates',
                  error_stack: JSON.stringify(geminiData),
                  request_method: req.method,
                  request_path: new URL(req.url).pathname,
                }).then(() => {});

                throw new Error('Gemini returned empty response or no candidates')
              }
              rawReply = cleanReplyText
            }

            const escalation = detectEscalation(rawReply)
            const replyText = cleanBotReply(rawReply)


            if (whatsappDelay > 0 && conversation) {
              // Cancel any pending drafts except current lockDraft
              await supabase
                .from('bot_reply_drafts')
                .update({ status: 'cancelled', resolved_at: new Date().toISOString() })
                .eq('conversation_ref', `whatsapp_${conversation.id}`)
                .eq('status', 'pending')
                .neq('id', lockDraft?.id)

              // Update the current lockDraft to pending with suggestions
              if (lockDraft) {
                await supabase
                  .from('bot_reply_drafts')
                  .update({
                    suggestions: JSON.stringify([replyText]),
                    auto_send_at: new Date(Date.now() + whatsappDelay * 60 * 1000).toISOString(),
                    status: 'pending',
                  })
                  .eq('id', lockDraft.id)
                console.log(`[WHATSAPP] Draft updated for ${userPhone}, auto-send in ${whatsappDelay}min`)
              } else {
                console.error(`[WHATSAPP] Failed to update draft for ${userPhone} because lockDraft is null!`)
              }
            } else {
              // Send WhatsApp message instantly
              await sendWhatsAppMessage(phoneNumberId, conn.fb_page_access_token, userPhone, replyText)

              if (conversation) {
                await supabase.from('wa_messages').insert({
                  conversation_id: conversation.id, role: 'bot', content: replyText,
                })
              }

              // Update lockDraft to sent status
              if (lockDraft) {
                await supabase
                  .from('bot_reply_drafts')
                  .update({
                    status: 'sent',
                    suggestions: JSON.stringify([replyText]),
                    resolved_at: new Date().toISOString(),
                  })
                  .eq('id', lockDraft.id)
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
            await supabase.from('edge_function_errors').insert({
              function_name: 'whatsapp-webhook-ai',
              error_message: aiErr.message,
              error_stack: aiErr.stack ?? null,
              request_method: req.method,
              request_path: new URL(req.url).pathname,
            }).then(() => {})

            // If delayed mode, still create/update a draft (process-bot-replies will retry AI)
            if (whatsappDelay > 0 && conversation) {
              if (lockDraft) {
                await supabase
                  .from('bot_reply_drafts')
                  .update({
                    status: 'pending',
                    suggestions: JSON.stringify([]),
                    auto_send_at: new Date(Date.now() + whatsappDelay * 60 * 1000).toISOString(),
                  })
                  .eq('id', lockDraft.id)
              }
              console.log(`[WHATSAPP] AI failed but draft updated for delayed processing`)
            } else {
              // Keyword-based product matching fallback
              let matchedProdId: string | null = null
              let matchedProdName: string | null = null
              try {
                const { data: boothProds } = await supabase
                  .from('market_products')
                  .select('id, name')
                  .eq('booth_id', boothId)
                  .eq('is_deleted', false)
                  .eq('is_active', true)
                
                if (boothProds && boothProds.length > 0 && userMessage) {
                  const cleanMsg = userMessage.toLowerCase()
                  const match = boothProds.find((p: any) => {
                    const prodName = p.name.toLowerCase()
                    return cleanMsg.includes(prodName) || prodName.includes(cleanMsg)
                  })
                  if (match) {
                    matchedProdId = match.id
                    matchedProdName = match.name
                  }
                }
              } catch (prodErr: any) {
                console.error('[WHATSAPP] Fallback product lookup error:', prodErr.message)
              }

              const boothNameStr = ctx.boothName || 'our stand'
              const fallbackText = matchedProdId && matchedProdName
                ? `Thanks for reaching out! You can view and order ${matchedProdName} directly at ${ctx.siteUrl}/market/booth/${boothId}/product/${matchedProdId}`
                : `Thanks for your interest in ${boothNameStr}! Visit ${ctx.siteUrl}/market/booth/${boothId} to browse our products and place an order.`

              await sendWhatsAppMessage(phoneNumberId, conn.fb_page_access_token, userPhone, fallbackText)

              if (conversation) {
                await supabase.from('wa_messages').insert({
                  conversation_id: conversation.id, role: 'bot', content: fallbackText,
                })
              }

              // Update lockDraft to sent status with the fallback suggestions
              if (lockDraft) {
                await supabase
                  .from('bot_reply_drafts')
                  .update({
                    status: 'sent',
                    suggestions: JSON.stringify([fallbackText]),
                    resolved_at: new Date().toISOString(),
                  })
                  .eq('id', lockDraft.id)
                  .then(() => {});
              }
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
