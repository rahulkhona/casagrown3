/**
 * process-bot-replies — Send auto-replies when co-pilot timer expires
 *
 * Called by pg_cron every minute. Picks up bot_reply_drafts where:
 *   - status = 'pending'
 *   - auto_send_at <= now()
 *
 * After sending, enters "conversation mode" — subsequent messages get
 * immediate bot replies (no timer) until seller steps in.
 *
 * POST /functions/v1/process-bot-replies
 * Also accepts: { draftId, selectedIndex? } for seller-initiated send
 */
import { serveWithCors, jsonOk } from '../_shared/serve-with-cors.ts'

serveWithCors(async (req, { supabase, corsHeaders }) => {
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}

  let draftsToSend: any[] = []

  if (body.draftId) {
    // Seller tapped "Send This" on a specific suggestion
    const { data } = await supabase
      .from('bot_reply_drafts')
      .select('*')
      .eq('id', body.draftId)
      .eq('status', 'pending')
      .single()

    if (data) {
      data._selectedIndex = body.selectedIndex ?? 0
      draftsToSend = [data]
    }
  } else {
    // Batch: pick up expired timers
    const { data } = await supabase
      .from('bot_reply_drafts')
      .select('*')
      .eq('status', 'pending')
      .lte('auto_send_at', new Date().toISOString())
      .order('auto_send_at', { ascending: true })
      .limit(20)

    draftsToSend = (data || []).map((d: any) => ({ ...d, _selectedIndex: 0 }))
  }

  if (draftsToSend.length === 0) {
    return jsonOk({ sent: 0 }, corsHeaders)
  }

  let sent = 0

  for (const draft of draftsToSend) {
    try {
      // Parse suggestions
      const suggestions = typeof draft.suggestions === 'string'
        ? JSON.parse(draft.suggestions)
        : draft.suggestions

      const selectedIndex = draft._selectedIndex ?? 0
      const replyText = suggestions[selectedIndex] || suggestions[0] || 'Thanks for your message!'

      // Check if seller already replied while we were processing
      const convRef = draft.conversation_ref
      const channel = draft.channel

      if (channel === 'order') {
        // Check for seller reply after the buyer message
        const { data: sellerReply } = await supabase
          .from('order_chat_messages')
          .select('id')
          .eq('order_id', convRef)
          .eq('sender_id', draft.seller_id)
          .eq('is_bot', false)
          .gt('created_at', draft.created_at)
          .limit(1)

        if (sellerReply && sellerReply.length > 0) {
          // Seller already replied — cancel draft
          await supabase
            .from('bot_reply_drafts')
            .update({ status: 'seller_replied', resolved_at: new Date().toISOString() })
            .eq('id', draft.id)
          continue
        }

        // Send the bot reply
        await supabase.from('order_chat_messages').insert({
          order_id: convRef,
          sender_id: draft.seller_id,
          content: `🤖 ${replyText}`,
          is_bot: true,
        })

      } else if (channel === 'dm') {
        // Check for seller reply
        const { data: sellerReply } = await supabase
          .from('market_chat_messages')
          .select('id')
          .eq('conversation_id', convRef)
          .eq('sender_id', draft.seller_id)
          .eq('is_bot', false)
          .gt('created_at', draft.created_at)
          .limit(1)

        if (sellerReply && sellerReply.length > 0) {
          await supabase
            .from('bot_reply_drafts')
            .update({ status: 'seller_replied', resolved_at: new Date().toISOString() })
            .eq('id', draft.id)
          continue
        }

        // Send the bot reply
        await supabase.from('market_chat_messages').insert({
          conversation_id: convRef,
          sender_id: draft.seller_id,
          content: `🤖 ${replyText}`,
          is_bot: true,
        })
      } else if (channel === 'messenger') {
        // Messenger: convRef = "messenger_{conversation_id}"
        const messengerConvId = convRef.replace('messenger_', '')

        // Check if seller sent an echo (replied) after the draft was created
        const { data: conv } = await supabase
          .from('messenger_conversations')
          .select('fb_sender_id, seller_id, bot_conversation_mode_until, matched_booth_id')
          .eq('id', messengerConvId)
          .single()

        if (!conv) { continue }

        // If bot_conversation_mode_until was re-set to null AFTER draft creation,
        // seller replied again → cancel
        // We check by looking at seller echo messages after draft creation
        // For simplicity: if bot_conversation_mode_until is still null, seller hasn't resumed bot
        // The draft was created precisely because it was null, so proceed

        // Generate AI reply if suggestions are empty (messenger drafts store [] initially)
        let finalReply = replyText
        if (!suggestions || suggestions.length === 0 || !suggestions[0]) {
          // Need to generate a reply — load context and call AI
          const { loadBoothContext, buildSellerSystemPrompt, loadSellerBotRules, cleanBotReply } = await import('../_shared/growbot-seller.ts')
          const ctx = await loadBoothContext(supabase, draft.booth_id)

          if (ctx) {
            const sellerRules = await loadSellerBotRules(supabase)
            const systemPrompt = buildSellerSystemPrompt(ctx, sellerRules)

            // Load conversation history
            const { data: history } = await supabase
              .from('messenger_messages')
              .select('role, content')
              .eq('conversation_id', messengerConvId)
              .order('created_at', { ascending: false })
              .limit(30)

            const sortedHistory = (history || []).reverse()
            const contents: Array<{ role: string; parts: Array<{ text: string }> }> = []
            for (const h of sortedHistory) {
              const geminiRole = h.role === 'bot' ? 'model' : 'user'
              if (contents.length > 0 && contents[contents.length - 1].role === geminiRole) {
                contents[contents.length - 1].parts[0].text += '\n' + h.content
              } else {
                contents.push({ role: geminiRole, parts: [{ text: h.content }] })
              }
            }
            // Ensure first turn is user
            while (contents.length > 0 && contents[0].role !== 'user') { contents.shift() }

            const AI_KEY = Deno.env.get('GEMINI_API_KEY') || ''
            const AI_MOCK = Deno.env.get('AI_MOCK') === 'true'
            const model = Deno.env.get('AI_MODEL') || 'gemini-2.5-flash'

            if (AI_MOCK) {
              finalReply = `Thanks for your patience! I'm here to help. Visit ${ctx.siteUrl}/market/booth/${ctx.boothId} to browse our products.`
            } else if (AI_KEY && contents.length > 0) {
              try {
                const geminiRes = await fetch(
                  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${AI_KEY}`,
                  {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: (() => {
                      const bodyObj: any = {
                        system_instruction: { parts: [{ text: systemPrompt }] },
                        contents,
                        generationConfig: {
                          temperature: 0.3,
                          maxOutputTokens: 512,
                        },
                      };
                      if (model.includes('gemini-2.5')) {
                        bodyObj.generationConfig.thinkingConfig = { thinkingBudget: 0 };
                      }
                      return JSON.stringify(bodyObj);
                    })(),
                  },
                )
                if (geminiRes.ok) {
                  const geminiData = await geminiRes.json()
                  const rawReply = geminiData.candidates?.[0]?.content?.parts
                    ?.filter((p: any) => p.text && p.thought !== true)
                    ?.map((p: any) => p.text)
                    ?.join('') || finalReply
                  finalReply = cleanBotReply(rawReply)
                }
              } catch (aiErr: any) {
                console.error('[PROCESS-BOT] Messenger AI error:', aiErr.message)
              }
            }
          }
        }

        // Check if seller replied after draft was created
        const { data: sellerEcho } = await supabase
          .from('messenger_messages')
          .select('id')
          .eq('conversation_id', messengerConvId)
          .eq('role', 'seller')
          .gt('created_at', draft.created_at)
          .limit(1)

        if (sellerEcho && sellerEcho.length > 0) {
          await supabase
            .from('bot_reply_drafts')
            .update({ status: 'seller_replied', resolved_at: new Date().toISOString() })
            .eq('id', draft.id)
          continue
        }

        // Send via Messenger API
        const { data: fbConn } = await supabase
          .from('seller_fb_connections')
          .select('fb_page_access_token, fb_page_id')
          .eq('user_id', draft.seller_id)
          .eq('status', 'connected')
          .single()

        if (fbConn?.fb_page_access_token) {
          const { sendMessengerMessage, appendMessengerParamsToUrls } = await import('../_shared/facebook.ts')
          const trackedReply = appendMessengerParamsToUrls(finalReply, conv.fb_sender_id, fbConn.fb_page_id)
          await sendMessengerMessage(fbConn.fb_page_access_token, conv.fb_sender_id, {
            text: trackedReply,
          })

          // Store in history
          await supabase.from('messenger_messages').insert({
            conversation_id: messengerConvId,
            role: 'bot',
            content: trackedReply,
          })

          // Re-enable bot for this conversation
          await supabase
            .from('messenger_conversations')
            .update({
              bot_conversation_mode_until: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
            })
            .eq('id', messengerConvId)
        }
      } else if (channel === 'instagram') {
        // Instagram: convRef = "instagram_{conversation_id}"
        const instagramConvId = convRef.replace('instagram_', '')

        // Get the conversation
        const { data: conv } = await supabase
          .from('ig_conversations')
          .select('ig_sender_id, seller_id, bot_conversation_mode_until, matched_booth_id')
          .eq('id', instagramConvId)
          .single()

        if (!conv) { continue }

        let finalReply = replyText
        if (!suggestions || suggestions.length === 0 || !suggestions[0]) {
          const { loadBoothContext, buildSellerSystemPrompt, loadSellerBotRules, cleanBotReply } = await import('../_shared/growbot-seller.ts')
          const ctx = await loadBoothContext(supabase, draft.booth_id)

          if (ctx) {
            const sellerRules = await loadSellerBotRules(supabase)
            let systemPrompt = buildSellerSystemPrompt(ctx, sellerRules)

            // Dynamic channel specific parts
            const { data: fbConn } = await supabase
              .from('seller_fb_connections')
              .select('fb_page_access_token, ig_business_account_id')
              .eq('user_id', draft.seller_id)
              .eq('status', 'connected')
              .single()

            systemPrompt += `\n\nURL TRACKING: When sharing any CasaGrown link, append ?ig_sender_id=${conv.ig_sender_id}&ig_account=${fbConn?.ig_business_account_id || ''} to the URL.`

            // Load conversation history
            const { data: history } = await supabase
              .from('ig_messages')
              .select('role, content')
              .eq('conversation_id', instagramConvId)
              .order('created_at', { ascending: false })
              .limit(30)

            const sortedHistory = (history || []).reverse()
            const contents: Array<{ role: string; parts: Array<{ text: string }> }> = []
            for (const h of sortedHistory) {
              const geminiRole = h.role === 'bot' ? 'model' : 'user'
              if (contents.length > 0 && contents[contents.length - 1].role === geminiRole) {
                contents[contents.length - 1].parts[0].text += '\n' + h.content
              } else {
                contents.push({ role: geminiRole, parts: [{ text: h.content }] })
              }
            }
            while (contents.length > 0 && contents[0].role !== 'user') { contents.shift() }

            const AI_KEY = Deno.env.get('GEMINI_API_KEY') || ''
            const AI_MOCK = Deno.env.get('AI_MOCK') === 'true'
            const model = Deno.env.get('AI_MODEL') || 'gemini-2.5-flash'

            if (AI_MOCK) {
              finalReply = `Thanks for your patience! I'm here to help. Visit ${ctx.siteUrl}/market/booth/${ctx.boothId} to browse our products.`
            } else if (AI_KEY && contents.length > 0) {
              try {
                const geminiRes = await fetch(
                  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${AI_KEY}`,
                  {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: (() => {
                      const bodyObj: any = {
                        system_instruction: { parts: [{ text: systemPrompt }] },
                        contents,
                        generationConfig: {
                          temperature: 0.3,
                          maxOutputTokens: 512,
                        },
                      };
                      if (model.includes('gemini-2.5')) {
                        bodyObj.generationConfig.thinkingConfig = { thinkingBudget: 0 };
                      }
                      return JSON.stringify(bodyObj);
                    })(),
                  },
                )
                if (geminiRes.ok) {
                  const geminiData = await geminiRes.json()
                  const rawReply = geminiData.candidates?.[0]?.content?.parts
                    ?.filter((p: any) => p.text && p.thought !== true)
                    ?.map((p: any) => p.text)
                    ?.join('') || finalReply
                  finalReply = cleanBotReply(rawReply)
                }
              } catch (aiErr: any) {
                console.error('[PROCESS-BOT] Instagram AI error:', aiErr.message)
              }
            }
          }
        }

        // Check if seller replied after draft was created
        const { data: igSellerEcho } = await supabase
          .from('ig_messages')
          .select('id')
          .eq('conversation_id', instagramConvId)
          .eq('role', 'seller')
          .gt('created_at', draft.created_at)
          .limit(1)

        if (igSellerEcho && igSellerEcho.length > 0) {
          await supabase
            .from('bot_reply_drafts')
            .update({ status: 'seller_replied', resolved_at: new Date().toISOString() })
            .eq('id', draft.id)
          continue
        }

        const { data: fbConn } = await supabase
          .from('seller_fb_connections')
          .select('fb_page_access_token, ig_business_account_id')
          .eq('user_id', draft.seller_id)
          .eq('status', 'connected')
          .single()

        if (fbConn?.fb_page_access_token) {
          const { sendInstagramMessage } = await import('../_shared/facebook.ts')
          await sendInstagramMessage(fbConn.fb_page_access_token, conv.ig_sender_id, {
            text: finalReply,
          })

          // Store in history
          await supabase.from('ig_messages').insert({
            conversation_id: instagramConvId,
            role: 'bot',
            content: finalReply,
          })

          // Re-enable bot for this conversation
          await supabase
            .from('ig_conversations')
            .update({
              bot_conversation_mode_until: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
            })
            .eq('id', instagramConvId)
        }
      } else if (channel === 'whatsapp') {
        // WhatsApp: convRef = "whatsapp_{conversation_id}"
        const whatsappConvId = convRef.replace('whatsapp_', '')

        // Get the conversation
        const { data: conv } = await supabase
          .from('wa_conversations')
          .select('wa_sender_phone, seller_id, bot_conversation_mode_until, matched_booth_id')
          .eq('id', whatsappConvId)
          .single()

        if (!conv) { continue }

        let finalReply = replyText
        if (!suggestions || suggestions.length === 0 || !suggestions[0]) {
          const { loadBoothContext, buildSellerSystemPrompt, loadSellerBotRules, cleanBotReply } = await import('../_shared/growbot-seller.ts')
          const ctx = await loadBoothContext(supabase, draft.booth_id)

          if (ctx) {
            const sellerRules = await loadSellerBotRules(supabase)
            let systemPrompt = buildSellerSystemPrompt(ctx, sellerRules)

            // Dynamic channel specific parts
            const { data: fbConn } = await supabase
              .from('seller_fb_connections')
              .select('fb_page_access_token, wa_phone_number_id')
              .eq('user_id', draft.seller_id)
              .eq('status', 'connected')
              .single()

            systemPrompt += `\n\nURL TRACKING: When sharing any CasaGrown link, append ?wa_phone=${conv.wa_sender_phone}&wa_number_id=${fbConn?.wa_phone_number_id || ''} to the URL.`

            // Load conversation history
            const { data: history } = await supabase
              .from('wa_messages')
              .select('role, content')
              .eq('conversation_id', whatsappConvId)
              .order('created_at', { ascending: false })
              .limit(30)

            const sortedHistory = (history || []).reverse()
            const contents: Array<{ role: string; parts: Array<{ text: string }> }> = []
            for (const h of sortedHistory) {
              const geminiRole = h.role === 'bot' ? 'model' : 'user'
              if (contents.length > 0 && contents[contents.length - 1].role === geminiRole) {
                contents[contents.length - 1].parts[0].text += '\n' + h.content
              } else {
                contents.push({ role: geminiRole, parts: [{ text: h.content }] })
              }
            }
            while (contents.length > 0 && contents[0].role !== 'user') { contents.shift() }

            const AI_KEY = Deno.env.get('GEMINI_API_KEY') || ''
            const AI_MOCK = Deno.env.get('AI_MOCK') === 'true'
            const model = Deno.env.get('AI_MODEL') || 'gemini-2.5-flash'

            if (AI_MOCK) {
              finalReply = `Thanks for your patience! I'm here to help. Visit ${ctx.siteUrl}/market/booth/${ctx.boothId} to browse our products.`
            } else if (AI_KEY && contents.length > 0) {
              try {
                const geminiRes = await fetch(
                  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${AI_KEY}`,
                  {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: (() => {
                      const bodyObj: any = {
                        system_instruction: { parts: [{ text: systemPrompt }] },
                        contents,
                        generationConfig: {
                          temperature: 0.3,
                          maxOutputTokens: 512,
                        },
                      };
                      if (model.includes('gemini-2.5')) {
                        bodyObj.generationConfig.thinkingConfig = { thinkingBudget: 0 };
                      }
                      return JSON.stringify(bodyObj);
                    })(),
                  },
                )
                if (geminiRes.ok) {
                  const geminiData = await geminiRes.json()
                  const rawReply = geminiData.candidates?.[0]?.content?.parts
                    ?.filter((p: any) => p.text && p.thought !== true)
                    ?.map((p: any) => p.text)
                    ?.join('') || finalReply
                  finalReply = cleanBotReply(rawReply)
                }
              } catch (aiErr: any) {
                console.error('[PROCESS-BOT] WhatsApp AI error:', aiErr.message)
              }
            }
          }
        }

        // Check if seller replied after draft was created
        const { data: waSellerEcho } = await supabase
          .from('wa_messages')
          .select('id')
          .eq('conversation_id', whatsappConvId)
          .eq('role', 'seller')
          .gt('created_at', draft.created_at)
          .limit(1)

        if (waSellerEcho && waSellerEcho.length > 0) {
          await supabase
            .from('bot_reply_drafts')
            .update({ status: 'seller_replied', resolved_at: new Date().toISOString() })
            .eq('id', draft.id)
          continue
        }

        const { data: fbConn } = await supabase
          .from('seller_fb_connections')
          .select('fb_page_access_token, wa_phone_number_id')
          .eq('user_id', draft.seller_id)
          .eq('status', 'connected')
          .single()

        if (fbConn?.fb_page_access_token && fbConn?.wa_phone_number_id) {
          const { sendWhatsAppMessage } = await import('../_shared/facebook.ts')
          await sendWhatsAppMessage(fbConn.wa_phone_number_id, fbConn.fb_page_access_token, conv.wa_sender_phone, finalReply)

          // Store in history
          await supabase.from('wa_messages').insert({
            conversation_id: whatsappConvId,
            role: 'bot',
            content: finalReply,
          })

          // Re-enable bot for this conversation
          await supabase
            .from('wa_conversations')
            .update({
              bot_conversation_mode_until: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
            })
            .eq('id', whatsappConvId)
        }
      }

      // Mark draft as sent
      await supabase
        .from('bot_reply_drafts')
        .update({
          status: 'sent',
          selected_index: selectedIndex,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', draft.id)

      sent++
      console.log(`[PROCESS-BOT] Sent ${channel} reply for draft ${draft.id}: "${replyText.slice(0, 80)}"`)

    } catch (err: any) {
      console.error(`[PROCESS-BOT] Error processing draft ${draft.id}:`, err.message)
      await supabase
        .from('bot_reply_drafts')
        .update({ status: 'expired', resolved_at: new Date().toISOString() })
        .eq('id', draft.id)
    }
  }

  return jsonOk({ sent, total: draftsToSend.length }, corsHeaders)
})
