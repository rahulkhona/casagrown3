/**
 * instagram-webhook — Instagram DM webhook for auto-reply
 *
 * GET:  Webhook verification (hub.verify_token check)
 * POST: Handle incoming messages → AI-powered reply with multi-booth routing
 */
import { serveWithCors, jsonOk, jsonError } from '../_shared/serve-with-cors.ts'
import { sendInstagramMessage, publishComment } from '../_shared/facebook.ts'
import {
  loadBoothContext, buildSellerSystemPrompt, loadSellerBotRules,
  loadAllSellerBooths, detectEscalation, cleanBotReply,
} from '../_shared/growbot-seller.ts'
import { extractInstagramReferral, lookupProductById, buildProductContextPrompt, lookupProductByIgPostId } from '../_shared/product-context.ts'

serveWithCors(async (req, { supabase, env, corsHeaders }) => {
  // ── GET: Webhook Verification ──
  if (req.method === 'GET') {
    const url = new URL(req.url)
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')

    const VERIFY_TOKEN = env('FACEBOOK_VERIFY_TOKEN') || 'casagrown_verify'

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('[INSTAGRAM] Webhook verified')
      return new Response(challenge, { status: 200, headers: corsHeaders })
    }

    return new Response('Forbidden', { status: 403, headers: corsHeaders })
  }

  // ── POST: Handle Incoming Messages ──
  const body = await req.json()

  // Always respond 200 to Instagram/Facebook (even on errors)
  try {
    const entries = body.entry || []

    for (const entry of entries) {
      const messaging = entry.messaging || []

      for (const event of messaging) {
        // Detect seller echo — seller replied from Instagram inbox
        if (event.message?.is_echo) {
          const appId = Deno.env.get('FACEBOOK_APP_ID') || ''
          const eventAppId = String(event.message?.app_id || '')
          if (eventAppId && eventAppId === appId) {
            console.log(`[INSTAGRAM] Echo is from our own bot app (${appId}). Skipping duplicate insert and bot pause.`)
            continue
          }

          const igAccountId = entry.id
          
          const { data: conn } = await supabase
            .from('seller_fb_connections')
            .select('user_id')
            .eq('ig_business_account_id', igAccountId)
            .single()

          if (conn) {
            // Robust Instagram echo deduplication
            const { data: convs } = await supabase
              .from('ig_conversations')
              .select('id')
              .eq('seller_id', conn.user_id)
              .eq('ig_sender_id', event.recipient?.id)

            let isDuplicateBotEcho = false
            if (convs && convs.length > 0 && event.message?.text) {
              const c = convs[0]
              const fiveSecondsAgo = new Date(Date.now() - 5000).toISOString()
              const { data: recentMsgs } = await supabase
                .from('ig_messages')
                .select('content, role')
                .eq('conversation_id', c.id)
                .gte('created_at', fiveSecondsAgo)
                .order('created_at', { ascending: false })
                .limit(1)

              if (recentMsgs && recentMsgs.length > 0) {
                const latestMsg = recentMsgs[0]
                if (latestMsg.role === 'bot' && latestMsg.content === event.message.text) {
                  isDuplicateBotEcho = true
                }
              }
            }

            if (isDuplicateBotEcho) {
              console.log(`[INSTAGRAM] Echo matches our recent bot message. Skipping duplicate insert and bot pause.`)
              continue
            }

            for (const c of (convs || [])) {
              // Avoid pausing co-pilot bot on native IG automated greetings:
              const { count: userMsgCount } = await supabase
                .from('ig_messages')
                .select('id', { count: 'exact', head: true })
                .eq('conversation_id', c.id)
                .eq('role', 'user')

              if (!userMsgCount || userMsgCount === 0) {
                console.log(`[INSTAGRAM] Echo detected but no user messages in history for conversation ${c.id}. Skipping bot pause.`)
                continue
              }

              await supabase
                .from('ig_conversations')
                .update({ 
                  bot_conversation_mode_until: null,
                  seller_last_active_at: new Date().toISOString(),
                })
                .eq('id', c.id)

              // Insert the seller's echo reply into local message history
              if (event.message?.text) {
                await supabase.from('ig_messages').insert({
                  conversation_id: c.id,
                  role: 'seller',
                  content: event.message.text,
                })
              }

              // Cancel any pending drafts for this conversation
              await supabase
                .from('bot_reply_drafts')
                .update({ status: 'seller_replied', resolved_at: new Date().toISOString() })
                .eq('conversation_ref', `instagram_${c.id}`)
                .eq('status', 'pending')
            }

            console.log(`[INSTAGRAM] Seller manual echo processed — active presence set, pending drafts cancelled`)
          }
          continue
        }

        // Skip non-message events unless they are images or postbacks
        let userMessage = event.message?.text
        if (!userMessage && event.postback) {
          userMessage = event.postback.title || event.postback.payload
        }
        if (!userMessage && event.message?.attachments && event.message.attachments.length > 0) {
          const firstAttachment = event.message.attachments[0]
          if (firstAttachment.type === 'image') {
            userMessage = firstAttachment.payload?.url
          }
        }

        if (!userMessage) continue

        const referral = extractInstagramReferral(event)

        const senderIgsid = event.sender?.id
        const igAccountId = entry.id

        if (!senderIgsid || !igAccountId) continue

        console.log(`[INSTAGRAM] Message from ${senderIgsid} on IG account ${igAccountId}: "${userMessage.slice(0, 100)}"`)

        // Find seller connection for this IG Business Account
        const { data: conn } = await supabase
          .from('seller_fb_connections')
          .select('user_id, fb_page_access_token, ig_business_account_id')
          .eq('ig_business_account_id', igAccountId)
          .eq('status', 'connected')
          .single()

        if (!conn || !conn.fb_page_access_token) {
          console.warn(`[INSTAGRAM] No connection for IG account ${igAccountId}`)
          continue
        }

        // Verify seller has active Elite subscription
        const { data: sub } = await supabase
          .from('seller_subscriptions')
          .select('plan, status')
          .eq('user_id', conn.user_id)
          .single()

        if (!sub || !['active', 'trialing'].includes(sub.status)) {
          console.warn(`[INSTAGRAM] Seller ${conn.user_id} does not have an active subscription, skipping`)
          continue
        }

        // Check if Instagram Auto-Responder is enabled in subscription tier features
        const { data: tier } = await supabase
          .from('subscription_tiers')
          .select('features')
          .eq('tier_name', sub.plan)
          .single()

        if (!tier?.features?.instagram_chat) {
          console.warn(`[INSTAGRAM] Seller ${conn.user_id} does not have Instagram Auto-Responder enabled in subscription tier, skipping`)
          continue
        }

        // Check if Instagram auto-reply is enabled in bot_channels (stored on Profiles)
        const { data: sellerProfile } = await supabase
          .from('profiles')
          .select('bot_channels')
          .eq('id', conn.user_id)
          .single()

        const instagramConfig = (sellerProfile?.bot_channels as Record<string, any>)?.instagram
        if (instagramConfig?.enabled === false) {
          console.log(`[INSTAGRAM] Instagram auto-reply disabled for seller ${conn.user_id}`)
          continue
        }

        // Get/create conversation record
        const { data: conversation } = await supabase
          .from('ig_conversations')
          .upsert({
            ig_sender_id: senderIgsid,
            seller_id: conn.user_id,
            last_message_at: new Date().toISOString(),
            message_count: 1,
          }, {
            onConflict: 'ig_sender_id,seller_id',
          })
          .select('*, buyer_zip, buyer_fulfillment_pref, matched_booth_id')
          .single()

        // Increment message count
        if (conversation) {
          await supabase
            .from('ig_conversations')
            .update({
              message_count: (conversation.message_count || 0) + 1,
              last_message_at: new Date().toISOString(),
            })
            .eq('id', conversation.id)

          // Check if seller has taken over (echo detected → bot paused)
          if (conversation.bot_conversation_mode_until === null && conversation.message_count > 1) {
            // Store message for history
            await supabase.from('ig_messages').insert({
              conversation_id: conversation.id, role: 'user', content: userMessage,
            })

            const reentryDelay = instagramConfig?.delayMinutes ?? 0

            // Cancel any pending drafts
            await supabase
              .from('bot_reply_drafts')
              .update({ status: 'cancelled', resolved_at: new Date().toISOString() })
              .eq('conversation_ref', `instagram_${conversation.id}`)
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
                channel: 'instagram',
                conversation_ref: `instagram_${conversation.id}`,
                trigger_message_id: event.message?.mid || 'unknown',
                booth_id: sellerBoothId,
                seller_id: conn.user_id,
                suggestions: JSON.stringify([]),
                auto_send_at: new Date(Date.now() + reentryDelay * 60 * 1000).toISOString(),
                status: 'pending',
                buyer_message: userMessage,
              })
              console.log(`[INSTAGRAM] Seller active — draft created, bot resumes in ${reentryDelay}min if seller doesn't reply`)
            }
            continue
          }
        }

        // ── Multi-booth routing ──
        const allBooths = await loadAllSellerBooths(supabase, conn.user_id)

        if (allBooths.length === 0) {
          await sendInstagramMessage(conn.fb_page_access_token, senderIgsid, {
            text: "Thanks for reaching out! I'm still setting up my booth. Please check back soon!",
          })
          continue
        }

        let knownBuyerZip: string | null = conversation?.buyer_zip || null
        let buyerFirstName = 'Neighbor'

        // Check if buyer has linked profile name via dynamic Graph metadata or default
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
                .from('ig_conversations')
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
              return `${i + 1}. **${b.name}**\n   ${fulfillment}\n   → ${siteUrl}/market/booth/${b.id}`
            }).join('\n\n')

            routingMessage = `Hi! I'm GrowBot 🤖 — thanks for your interest!\n\nWe're available at:\n\n${boothLines}\n\nWhich works best for you? Or share your zip code and I'll find the closest one!`
          } else {
            routingMessage = `Hi! I'm GrowBot 🤖 — thanks for your interest!\n\nWe're available at ${allBooths.length} locations! Share your zip code and I'll find the closest one for you!`
          }

          await sendInstagramMessage(conn.fb_page_access_token, senderIgsid, { text: routingMessage })
          continue
        }

        if (!boothId) {
          boothId = allBooths[0].id
        }

        const ctx = await loadBoothContext(supabase, boothId)
        if (!ctx) {
          await sendInstagramMessage(conn.fb_page_access_token, senderIgsid, {
            text: "Thanks for your interest! Please visit our CasaGrown page for the latest products.",
          })
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

        // Product context injection from referral or conversation history
        if (referral.productId) {
          const productCtx = await lookupProductById(supabase, referral.productId)
          if (productCtx) {
            systemPrompt += buildProductContextPrompt(productCtx)
            console.log(`[INSTAGRAM] Product context: ${productCtx.name} (source: ${referral.source})`)
          }
          if (conversation) {
            await supabase.from('ig_conversations')
              .update({ last_product_id: referral.productId })
              .eq('id', conversation.id)
          }
        } else if (conversation?.last_product_id) {
          const productCtx = await lookupProductById(supabase, conversation.last_product_id)
          if (productCtx) {
            systemPrompt += buildProductContextPrompt(productCtx)
          }
        }

        // System prompt URL tracking instruction
        systemPrompt += `\n\nURL TRACKING: When sharing any CasaGrown link, append ?ig_sender_id=${senderIgsid}&ig_account=${igAccountId} to the URL.`

        // History
        const historyContents: Array<{ role: string; parts: Array<{ text: string }> }> = []
        if (conversation) {
          const { data: history } = await supabase
            .from('ig_messages')
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
        const model = Deno.env.get('AI_MODEL') || 'gemini-2.5-flash'

        if (!AI_KEY) {
          await sendInstagramMessage(conn.fb_page_access_token, senderIgsid, {
            text: `Thanks for your interest in ${ctx.boothName}! Visit ${ctx.siteUrl}/market/booth/${ctx.boothId} to browse and order.`,
          })
          continue
        }

        try {
          const requestBody: any = {
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: cleanedContents,
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 512,
            },
          }

          if (model.includes('gemini-2.5')) {
            requestBody.generationConfig.thinkingConfig = { thinkingBudget: 0 }
          }

          const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${AI_KEY}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(requestBody),
            },
          )

          if (!geminiRes.ok) {
            throw new Error(`Gemini API error: ${geminiRes.status}`)
          }

          const geminiData = await geminiRes.json()
          const rawReply = geminiData.candidates?.[0]?.content?.parts
            ?.filter((p: any) => p.text && p.thought !== true)
            ?.map((p: any) => p.text)
            ?.join('')

          if (!rawReply) {
            await supabase.from('edge_function_errors').insert({
              function_name: 'instagram-webhook-gemini-fallback',
              error_message: 'Gemini returned empty response or no candidates',
              error_stack: JSON.stringify(geminiData),
              request_method: req.method,
              request_path: new URL(req.url).pathname,
            }).then(() => {});
          }

          const escalation = detectEscalation(rawReply || '')
          const replyText = cleanBotReply(rawReply || `Thanks for your interest! Visit ${ctx.siteUrl}/market/booth/${ctx.boothId} to see our products.`)

          let instagramDelay = instagramConfig?.delayMinutes ?? 0
          if (conversation?.bot_conversation_mode_until) {
            const modeUntil = new Date(conversation.bot_conversation_mode_until)
            if (modeUntil > new Date()) {
              instagramDelay = 0
            }
          }

          if (instagramDelay > 0 && conversation) {
            await supabase.from('ig_messages').insert({
              conversation_id: conversation.id, role: 'user', content: userMessage,
            })

            await supabase
              .from('bot_reply_drafts')
              .update({ status: 'cancelled', resolved_at: new Date().toISOString() })
              .eq('conversation_ref', `instagram_${conversation.id}`)
              .eq('status', 'pending')

            await supabase.from('bot_reply_drafts').insert({
              channel: 'instagram',
              conversation_ref: `instagram_${conversation.id}`,
              trigger_message_id: event.message?.mid || 'unknown',
              booth_id: boothId,
              seller_id: conn.user_id,
              suggestions: JSON.stringify([replyText]),
              auto_send_at: new Date(Date.now() + instagramDelay * 60 * 1000).toISOString(),
              status: 'pending',
              buyer_message: userMessage,
            })

            console.log(`[INSTAGRAM] Draft created for ${senderIgsid}, auto-send in ${instagramDelay}min`)

          } else {
            await sendInstagramMessage(conn.fb_page_access_token, senderIgsid, {
              text: replyText,
            })

            if (conversation) {
              await supabase.from('ig_messages').insert([
                { conversation_id: conversation.id, role: 'user', content: userMessage },
                { conversation_id: conversation.id, role: 'bot', content: replyText },
              ])
            }

            console.log(`[INSTAGRAM] Replied instantly to ${senderIgsid}: "${replyText.slice(0, 100)}"`)
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
              .from('ig_conversations')
              .update(updates)
              .eq('id', conversation.id)
          }

          if (boothId && conversation && !conversation.matched_booth_id) {
            await supabase
              .from('ig_conversations')
              .update({ matched_booth_id: boothId })
              .eq('id', conversation.id)
          }

          // Escalation — notify seller
          if (escalation.escalate) {
            if (conversation) {
              await supabase
                .from('ig_conversations')
                .update({ bot_conversation_mode_until: null })
                .eq('id', conversation.id)
            }

            const msgPreview = userMessage.slice(0, 80)
            const linkUrl = conversation ? `/messages/instagram/${conversation.id}` : '/messages'

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
                    message: `🔔 Instagram: A customer needs help — "${msgPreview}"`,
                    linkUrl,
                  },
                })
              } catch (smsErr: any) {
                console.error('[INSTAGRAM] SMS escalation failed:', smsErr.message)
              }
            }

            // Email
            try {
              await supabase.functions.invoke('send-notification-email', {
                body: {
                  type: 'chat_initiated',
                  userId: conn.user_id,
                  data: {
                    buyerName: 'An Instagram customer',
                    productName: 'Instagram',
                    message: msgPreview,
                    actionUrl: linkUrl,
                  },
                },
              })
            } catch (emailErr: any) {
              console.error('[INSTAGRAM] Email escalation failed:', emailErr.message)
            }

            // Push notification
            try {
              await supabase.functions.invoke('send-push-notification', {
                body: {
                  userId: conn.user_id,
                  title: `🔔 Instagram: Customer needs help`,
                  body: `"${msgPreview}"`,
                  data: { url: linkUrl },
                },
              })
            } catch (pushErr: any) {
              console.error('[INSTAGRAM] Push escalation failed:', pushErr.message)
            }
          }
        } catch (aiErr: any) {
          console.error('[INSTAGRAM] AI error:', aiErr.message)
          await supabase.from('edge_function_errors').insert({
            function_name: 'instagram-webhook-ai',
            error_message: aiErr.message,
            error_stack: aiErr.stack ?? null,
            request_method: req.method,
            request_path: new URL(req.url).pathname,
          }).then(() => {});

          // Keyword-based product matching fallback
          let matchedProdId: string | null = null
          let matchedProdName: string | null = null
          try {
            const { data: boothProds } = await supabase
              .from('market_products')
              .select('id, name')
              .eq('booth_id', boothId)
              .eq('is_deleted', false)
              .eq('status', 'active')
            
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
            console.error('[INSTAGRAM] Fallback product lookup error:', prodErr.message)
          }

          const boothNameStr = ctx.boothName || 'our stand'
          const fallbackText = matchedProdId && matchedProdName
            ? `Thanks for reaching out! You can view and order ${matchedProdName} directly at ${ctx.siteUrl}/market/booth/${boothId}/product/${matchedProdId}`
            : `Thanks for your interest in ${boothNameStr}! Visit ${ctx.siteUrl}/market/booth/${boothId} to browse our products and place an order.`

          await sendInstagramMessage(conn.fb_page_access_token, senderIgsid, {
            text: fallbackText,
          })

          if (conversation) {
            await supabase.from('ig_messages').insert([
              { conversation_id: conversation.id, role: 'user', content: userMessage },
              { conversation_id: conversation.id, role: 'bot', content: fallbackText },
            ])
          }
        }
      }
    }
  } catch (err: any) {
    console.error('[INSTAGRAM] Webhook processing error:', err)
    await supabase.from('edge_function_errors').insert({
      function_name: 'instagram-webhook',
      error_message: err.message,
      error_stack: err.stack ?? null,
      request_method: req.method,
      request_path: new URL(req.url).pathname,
    }).then(() => {});
  }

  return jsonOk({ received: true }, corsHeaders)
})
