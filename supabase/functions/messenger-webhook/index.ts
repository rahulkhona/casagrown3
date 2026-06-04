/**
 * messenger-webhook — Facebook Messenger webhook for auto-reply
 *
 * GET:  Webhook verification (hub.verify_token check)
 * POST: Handle incoming messages → AI-powered reply with multi-booth routing
 */
import { serveWithCors, jsonOk, jsonError } from '../_shared/serve-with-cors.ts'
import { sendMessengerMessage, getFbUserProfile, publishComment } from '../_shared/facebook.ts'
import {
  loadBoothContext, buildSellerSystemPrompt, loadSellerBotRules,
  loadAllSellerBooths, detectEscalation, cleanBotReply,
  type BoothSummary,
} from '../_shared/growbot-seller.ts'
import { extractMessengerReferral, lookupProductById, buildProductContextPrompt, lookupProductByFbPostId, findBestProductMatch } from '../_shared/product-context.ts'

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
      // 1. Process Page comment/feed events (changes)
      const changes = entry.changes || []
      for (const change of changes) {
        if (change.field === 'feed' && change.value?.item === 'comment' && change.value?.verb === 'add') {
          const commentId = change.value.comment_id
          const postId = change.value.post_id
          const message = change.value.message
          const senderId = change.value.sender_id
          const pageId = entry.id

          if (!commentId || !postId || !message || !senderId) continue
          if (senderId === pageId) {
            console.log(`[MESSENGER] Comment by page itself (${senderId}), skipping loop.`)
            continue
          }

          console.log(`[MESSENGER] Comment on post ${postId} from ${senderId}: "${message.slice(0, 100)}"`)

          try {
            // Find seller connection for this page
            const { data: conn } = await supabase
              .from('seller_fb_connections')
              .select('user_id, fb_page_access_token, fb_page_id')
              .eq('fb_page_id', pageId)
              .eq('status', 'connected')
              .single()

            if (!conn || !conn.fb_page_access_token) {
              console.warn(`[MESSENGER] No connected page for page ${pageId}`)
              continue
            }

            // Verify seller has active Pro/Elite subscription
            const { data: sub } = await supabase
              .from('seller_subscriptions')
              .select('plan, status')
              .eq('user_id', conn.user_id)
              .single()

            if (!sub || !['active', 'trialing'].includes(sub.status)) {
              console.warn(`[MESSENGER] Seller ${conn.user_id} does not have active subscription for comments`)
              continue
            }

            // Check if Facebook Auto-Responder is enabled in subscription tier features
            const { data: tier } = await supabase
              .from('subscription_tiers')
              .select('features')
              .eq('tier_name', sub.plan)
              .single()

            if (!tier?.features?.facebook_chat) {
              console.warn(`[MESSENGER] Seller ${conn.user_id} does not have Facebook Auto-Responder enabled in tier`)
              continue
            }

            // Check if Messenger auto-reply is enabled in bot_channels
            const { data: sellerProfile } = await supabase
              .from('profiles')
              .select('bot_channels')
              .eq('id', conn.user_id)
              .single()

            const messengerConfig = (sellerProfile?.bot_channels as Record<string, any>)?.messenger
            if (messengerConfig?.enabled === false) {
              console.log(`[MESSENGER] Messenger auto-reply disabled for seller ${conn.user_id}`)
              continue
            }

            // Look up product by FB post ID
            const productCtx = await lookupProductByFbPostId(supabase, postId)
            let boothId = productCtx?.boothId || null

            if (!boothId) {
              // Fallback to default booth
              const { data: defaultBooth } = await supabase
                .from('market_booths')
                .select('id')
                .eq('owner_id', conn.user_id)
                .eq('is_default', true)
                .single()
              boothId = defaultBooth?.id || null
            }

            if (!boothId) {
              console.warn(`[MESSENGER] No booth found for comments on page ${pageId}`)
              continue
            }

            const ctx = await loadBoothContext(supabase, boothId)
            if (!ctx) continue

            const sellerRules = await loadSellerBotRules(supabase)
            let systemPrompt = `You are GrowBot 🤖, a friendly AI sales assistant answering comments on behalf of ${ctx.sellerName} for their farm stand "${ctx.boothName}" on CasaGrown.\n` +
              `Keep your response short, friendly, and direct. Since this is a public comment on a social media post, write a concise reply (1-2 sentences).\n` +
              `If someone is asking a question about a product, pricing, pickup/delivery, answer using the context provided below.\n` +
              `Always guide them to check out the full menu or place an order using the link provided.`

            systemPrompt += '\n\n' + buildSellerSystemPrompt(ctx, sellerRules)

            if (productCtx) {
              systemPrompt += buildProductContextPrompt(productCtx)
            }

            const AI_KEY = Deno.env.get('GEMINI_API_KEY') || ''
            const model = Deno.env.get('AUTO_RESPONDER_MODEL') || 'gemini-3.1-flash-lite'

            if (!AI_KEY) continue

            const requestBody: any = {
              system_instruction: { parts: [{ text: systemPrompt }] },
              contents: [{ role: 'user', parts: [{ text: message }] }],
              generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 256,
              },
            }
            if (model.includes('gemini-2.5') || model.includes('gemini-3.')) {
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

            if (!geminiRes.ok) throw new Error(`Gemini API error: ${geminiRes.status}`)

            const geminiData = await geminiRes.json()
            const rawReply = geminiData.candidates?.[0]?.content?.parts
              ?.filter((p: any) => p.text && p.thought !== true)
              ?.map((p: any) => p.text)
              ?.join('') || ''

            if (!rawReply) continue

            const escalation = detectEscalation(rawReply)
            const replyText = cleanBotReply(rawReply)

            if (escalation.escalate) {
              console.log(`[MESSENGER] Comment escalated. Skipping reply, notifying seller.`)
              const msgPreview = message.slice(0, 80)
              const linkUrl = `https://facebook.com/${postId}`

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
                      message: `🔔 Facebook Comment: A customer needs help on your post — "${msgPreview}"`,
                      linkUrl,
                    },
                  })
                } catch (smsErr: any) {
                  console.error('[MESSENGER] SMS comment escalation failed:', smsErr.message)
                }
              }

              try {
                await supabase.functions.invoke('send-notification-email', {
                  body: {
                    type: 'chat_initiated',
                    userId: conn.user_id,
                    data: {
                      buyerName: 'A Facebook user in comments',
                      productName: 'Facebook Comment',
                      message: msgPreview,
                      actionUrl: linkUrl,
                    },
                  },
                })
              } catch (emailErr: any) {
                console.error('[MESSENGER] Email comment escalation failed:', emailErr.message)
              }

              try {
                await supabase.functions.invoke('send-push-notification', {
                  body: {
                    userId: conn.user_id,
                    title: '🔔 Facebook Comment: Attention needed',
                    body: `"${msgPreview}"`,
                    data: { url: linkUrl },
                  },
                })
              } catch (pushErr: any) {
                console.error('[MESSENGER] Push comment escalation failed:', pushErr.message)
              }
            } else {
              await publishComment(commentId, replyText, conn.fb_page_access_token)
              console.log(`[MESSENGER] Comment reply published: "${replyText}"`)
            }
          } catch (err: any) {
            console.error('[MESSENGER] Error processing feed comment change:', err.message)
          }
        }
      }

      // 2. Process Messenger DM events (messaging)
      const messaging = entry.messaging || []

      for (const event of messaging) {
        // Detect seller echo — seller replied from Facebook Page inbox
        // In this case, event.message.is_echo === true
        if (event.message?.is_echo) {
          const appId = Deno.env.get('FACEBOOK_APP_ID') || ''
          const eventAppId = String(event.message?.app_id || '')
          if (eventAppId && eventAppId === appId) {
            console.log(`[MESSENGER] Echo is from our own bot app (${appId}). Skipping duplicate insert and bot pause.`)
            continue
          }

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
              // Robust Messenger echo deduplication
              let isDuplicateBotEcho = false
              if (event.message?.text) {
                const fiveSecondsAgo = new Date(Date.now() - 5000).toISOString()
                const { data: recentMsgs } = await supabase
                  .from('messenger_messages')
                  .select('content, role')
                  .eq('conversation_id', c.id)
                  .gte('created_at', fiveSecondsAgo)
                  .order('created_at', { ascending: false })
                  .limit(5)

                if (recentMsgs && recentMsgs.length > 0) {
                  const isDuplicate = recentMsgs.some(m => m.role === 'bot' && m.content === event.message.text)
                  if (isDuplicate) {
                    isDuplicateBotEcho = true
                  }
                }
              }

              if (isDuplicateBotEcho) {
                console.log(`[MESSENGER] Echo matches our recent bot message. Skipping duplicate insert and bot pause.`)
                continue
              }

              // Avoid pausing co-pilot bot on native Page automated greetings:
              // Check if the buyer has ever sent a message in this conversation.
              const { count: userMsgCount } = await supabase
                .from('messenger_messages')
                .select('id', { count: 'exact', head: true })
                .eq('conversation_id', c.id)
                .eq('role', 'user')

              if (!userMsgCount || userMsgCount === 0) {
                console.log(`[MESSENGER] Echo detected but no user messages in history for conversation ${c.id}. Likely native Welcome automation. Skipping bot pause.`)
                continue
              }

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

            console.log(`[MESSENGER] Seller manual echo processed — active presence set, pending drafts cancelled`)
          }
          continue
        }

        // Skip non-message events (reads, deliveries, etc.) unless they are image attachments or postbacks
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

        // ── Extract product context from referral (catalog, marketplace, post) ──
        const referral = extractMessengerReferral(event)

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

        if (!sub || !['active', 'trialing'].includes(sub.status)) {
          console.warn(`[MESSENGER] Seller ${conn.user_id} does not have an active subscription, skipping`)
          continue
        }

        // Check if Facebook Messenger Auto-Responder is enabled in subscription tier features
        const { data: tier } = await supabase
          .from('subscription_tiers')
          .select('features')
          .eq('tier_name', sub.plan)
          .single()

        if (!tier?.features?.facebook_chat) {
          console.warn(`[MESSENGER] Seller ${conn.user_id} does not have Facebook Auto-Responder enabled in subscription tier, skipping`)
          continue
        }

        // Check if Messenger auto-reply is enabled in bot_channels (stored on Profiles)
        const { data: sellerProfile } = await supabase
          .from('profiles')
          .select('bot_channels')
          .eq('id', conn.user_id)
          .single()

        const messengerConfig = (sellerProfile?.bot_channels as Record<string, any>)?.messenger
        if (messengerConfig?.enabled === false) {
          console.log(`[MESSENGER] Messenger auto-reply disabled for seller ${conn.user_id}`)
          continue
        }

        // Fetch seller's booths (needed for default routing and fallback booth context)
        const allBooths = await loadAllSellerBooths(supabase, conn.user_id)

        if (allBooths.length === 0) {
          await sendMessengerMessage(conn.fb_page_access_token, senderPsid, {
            text: "Thanks for reaching out! I'm still setting up my booth. Please check back soon!",
          })
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

        let lockDraft: any = null
        if (conversation) {
          const triggerMessageId = event.message?.mid || event.postback?.mid || (event.postback ? `postback_${event.postback.payload}_${event.timestamp}` : null) || `msg_${event.timestamp}`

          // 1. Lock check for deduplication
          const { data: existingDraft } = await supabase
            .from('bot_reply_drafts')
            .select('id')
            .eq('trigger_message_id', triggerMessageId)
            .limit(1)

          if (existingDraft && existingDraft.length > 0) {
            console.log(`[MESSENGER] Duplicate webhook call detected for mid ${triggerMessageId}, skipping.`)
            continue
          }

          // 2. Log customer message immediately so seller sees it in their chat dashboard
          await supabase.from('messenger_messages').insert({
            conversation_id: conversation.id,
            role: 'user',
            content: userMessage,
          })

          // 3. Send native typing indicator immediately
          try {
            const { sendMessengerAction } = await import('../_shared/facebook.ts')
            await sendMessengerAction(conn.fb_page_access_token, senderPsid, 'typing_on')
          } catch (typeErr: any) {
            console.error('[MESSENGER] Failed to trigger typing indicator:', typeErr.message)
          }

          // 4. Create locked draft to act as lock
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
              channel: 'messenger',
              conversation_ref: `messenger_${conversation.id}`,
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
            console.error('[MESSENGER] Error inserting draft:', draftErr.message, draftErr.details)
          }

          lockDraft = insertedDraft

          // 5. Increment message count and reset nudge timestamp
          await supabase
            .from('messenger_conversations')
            .update({
              message_count: (conversation.message_count || 0) + 1,
              last_message_at: new Date().toISOString(),
              nudge_sent_at: null,
            })
            .eq('id', conversation.id)

          // 6. Check if seller is active (paused bot mode)
          if (conversation.bot_conversation_mode_until === null && conversation.message_count > 1) {
            const reentryDelay = messengerConfig?.delayMinutes ?? 0

            // Cancel any existing pending drafts for this conversation (except the one we just made)
            await supabase
              .from('bot_reply_drafts')
              .update({ status: 'cancelled', resolved_at: new Date().toISOString() })
              .eq('conversation_ref', `messenger_${conversation.id}`)
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

            console.log(`[MESSENGER] Seller active — draft updated, bot resumes in ${reentryDelay}min if seller doesn't reply`)
            continue
          }
        }

        // Check for cross-seller memory: does this PSID have a linked CasaGrown profile?
        let knownBuyerZip: string | null = conversation?.buyer_zip || null
        let buyerFirstName = ''
        const { data: linked } = await supabase.rpc('find_profile_by_psid', { p_psid: senderPsid })
        if (linked && linked.length > 0) {
          if (linked[0].zip_code) knownBuyerZip = linked[0].zip_code
          const { data: prof } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', linked[0].user_id)
            .single()
          if (prof?.full_name) {
            buyerFirstName = prof.full_name.split(' ')[0]
          }
          console.log(`[MESSENGER] Cross-seller memory: found zip ${knownBuyerZip}, name ${buyerFirstName} for PSID ${senderPsid}`)
        }

        // If no linked profile name found, fetch dynamically from Facebook User Profile API
        if (!buyerFirstName) {
          const fbProfile = await getFbUserProfile(senderPsid, conn.fb_page_access_token)
          if (fbProfile?.first_name) {
            buyerFirstName = fbProfile.first_name
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

        // Inject buyer personal details into Gemini system instructions so the bot knows who it is talking to
        systemPrompt += `\n\nBUYER CONTEXT:\n- Buyer's First Name: ${buyerFirstName || 'Neighbor'}`

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

        // Inject product context if buyer messaged from a product listing
        if (referral.productId) {
          const productCtx = await lookupProductById(supabase, referral.productId)
          if (productCtx) {
            systemPrompt += buildProductContextPrompt(productCtx)
            console.log(`[MESSENGER] Product context: ${productCtx.name} (source: ${referral.source})`)
          }
          // Save to conversation for future messages in this thread
          if (conversation) {
            await supabase.from('messenger_conversations')
              .update({ last_product_id: referral.productId })
              .eq('id', conversation.id)
          }
        } else if (conversation?.last_product_id) {
          // Continuing conversation — load previously identified product
          const productCtx = await lookupProductById(supabase, conversation.last_product_id)
          if (productCtx) {
            systemPrompt += buildProductContextPrompt(productCtx)
          }
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
        const model = Deno.env.get('AUTO_RESPONDER_MODEL') || 'gemini-3.1-flash-lite'

        if (!AI_KEY) {
          await sendMessengerMessage(conn.fb_page_access_token, senderPsid, {
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
              maxOutputTokens: 2048,
            },
          }
          if (model.includes('gemini-2.5') || model.includes('gemini-3.')) {
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
              function_name: 'messenger-webhook-gemini-fallback',
              error_message: 'Gemini returned empty response or no candidates',
              error_stack: JSON.stringify(geminiData),
              request_method: req.method,
              request_path: new URL(req.url).pathname,
            }).then(() => {});

            throw new Error('Gemini returned empty response or no candidates')
          }

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
            // Delay mode: update the lockDraft to pending with delayed auto_send_at
            // Cancel any existing pending drafts for this conversation (except the one we just made)
            await supabase
              .from('bot_reply_drafts')
              .update({ status: 'cancelled', resolved_at: new Date().toISOString() })
              .eq('conversation_ref', `messenger_${conversation.id}`)
              .eq('status', 'pending')
              .neq('id', lockDraft?.id)

            if (lockDraft) {
              await supabase
                .from('bot_reply_drafts')
                .update({
                  suggestions: JSON.stringify([replyText]),
                  auto_send_at: new Date(Date.now() + messengerDelay * 60 * 1000).toISOString(),
                  status: 'pending',
                })
                .eq('id', lockDraft.id)
            }

            console.log(`[MESSENGER] Draft updated for ${senderPsid}, auto-send in ${messengerDelay}min`)

          } else {
            // Instant mode (delay = 0): send immediately
            await sendMessengerMessage(conn.fb_page_access_token, senderPsid, {
              text: replyText,
            })

            // Store bot reply in history (user message is already stored)
            if (conversation) {
              await supabase.from('messenger_messages').insert({
                conversation_id: conversation.id,
                role: 'bot',
                content: replyText,
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
          await supabase.from('edge_function_errors').insert({
            function_name: 'messenger-webhook-ai',
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
              .eq('is_active', true)
            
            if (boothProds && boothProds.length > 0 && userMessage) {
              const match = findBestProductMatch(userMessage, boothProds)
              if (match) {
                matchedProdId = match.id
                matchedProdName = match.name
              }
            }
          } catch (prodErr: any) {
            console.error('[MESSENGER] Fallback product lookup error:', prodErr.message)
          }

          const boothNameStr = ctx.boothName || 'our stand'
          const fallbackText = matchedProdId && matchedProdName
            ? `Thanks for reaching out! You can view and order ${matchedProdName} directly at ${ctx.siteUrl}/market/booth/${boothId}/product/${matchedProdId}`
            : `Thanks for your interest in ${boothNameStr}! Visit ${ctx.siteUrl}/market/booth/${boothId} to browse our products and place an order.`

          await sendMessengerMessage(conn.fb_page_access_token, senderPsid, {
            text: fallbackText,
          })

          if (conversation) {
            await supabase.from('messenger_messages').insert({
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
  } catch (err: any) {
    console.error('[MESSENGER] Webhook processing error:', err)
  }

  // Always return 200 OK to Facebook
  return jsonOk({ received: true }, corsHeaders)
})
