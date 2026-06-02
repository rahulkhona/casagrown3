/**
 * send-instagram-reply — Send a seller's reply to an Instagram Direct Message buyer
 *
 * POST /functions/v1/send-instagram-reply
 * Body: { conversation_id, message, seller_id }
 */
import { serveWithCors, jsonOk, jsonError } from '../_shared/serve-with-cors.ts'
import { sendInstagramMessage } from '../_shared/facebook.ts'

serveWithCors(async (req, { supabase, corsHeaders }) => {
  if (req.method !== 'POST') {
    return jsonError('Method not allowed', corsHeaders, 405)
  }

  const body = await req.json()
  const { conversation_id, message, seller_id } = body

  if (!conversation_id || !message || !seller_id) {
    return jsonError('Missing required fields: conversation_id, message, seller_id', corsHeaders)
  }

  // 1. Look up the conversation's ig_sender_id
  const { data: conversation, error: convError } = await supabase
    .from('ig_conversations')
    .select('ig_sender_id, seller_id')
    .eq('id', conversation_id)
    .single()

  if (convError || !conversation) {
    return jsonError('Conversation not found', corsHeaders, 404)
  }

  // Verify seller owns this conversation
  if (conversation.seller_id !== seller_id) {
    return jsonError('Unauthorized: seller does not own this conversation', corsHeaders, 403)
  }

  const igSenderId = conversation.ig_sender_id

  // 2. Look up seller's access token from seller_fb_connections
  const { data: fbConn, error: fbError } = await supabase
    .from('seller_fb_connections')
    .select('fb_page_access_token, ig_business_account_id')
    .eq('user_id', seller_id)
    .eq('status', 'connected')
    .single()

  if (fbError || !fbConn?.fb_page_access_token) {
    return jsonError('Instagram connection not found or token missing', corsHeaders, 400)
  }

  let finalMessageText = message

  // 3. Call Facebook Graph API to send the Instagram DM
  try {
    const isImage = message.startsWith('http') && (
      message.includes('chat-media') ||
      message.includes('.png') ||
      message.includes('.jpg') ||
      message.includes('.jpeg') ||
      message.includes('.webp')
    )

    if (isImage) {
      await sendInstagramMessage(fbConn.fb_page_access_token, igSenderId, {
        attachment: {
          type: 'image',
          payload: { url: message, is_reusable: true }
        }
      })
    } else {
      await sendInstagramMessage(fbConn.fb_page_access_token, igSenderId, { text: finalMessageText })
    }
  } catch (igSendErr: any) {
    console.error('[SEND-INSTAGRAM-REPLY] Instagram API error:', igSendErr.message)
    return jsonError(`Instagram API error: ${igSendErr.message}`, corsHeaders, 502)
  }

  // 4. Store the sent message in ig_messages with role='seller'
  const { error: insertError } = await supabase
    .from('ig_messages')
    .insert({
      conversation_id,
      role: 'seller',
      content: finalMessageText,
    })

  if (insertError) {
    console.error('[SEND-INSTAGRAM-REPLY] DB insert error:', insertError.message)
  }

  // 5. Update last_message_at and message_count on ig_conversations
  const { error: updateError } = await supabase
    .from('ig_conversations')
    .update({
      last_message_at: new Date().toISOString(),
      message_count: (await supabase
        .from('ig_messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', conversation_id)
      ).count || 0,
      seller_last_active_at: new Date().toISOString(),
    })
    .eq('id', conversation_id)

  if (updateError) {
    console.error('[SEND-INSTAGRAM-REPLY] Conversation update error:', updateError.message)
  }

  console.log(`[SEND-INSTAGRAM-REPLY] Sent reply to IG user ${igSenderId} in conversation ${conversation_id}`)

  return jsonOk({
    success: true,
    conversation_id,
    ig_sender_id: igSenderId,
  }, corsHeaders)
})
