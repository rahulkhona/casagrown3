/**
 * send-messenger-reply — Send a seller's reply to a Facebook Messenger buyer
 *
 * POST /functions/v1/send-messenger-reply
 * Body: { conversation_id, message, seller_id }
 *
 * 1. Looks up fb_sender_id from messenger_conversations
 * 2. Looks up fb_page_access_token from seller_fb_connections
 * 3. Calls Facebook Graph API to send the message
 * 4. Stores the sent message in messenger_messages with role='seller'
 * 5. Updates last_message_at on messenger_conversations
 */
import { serveWithCors, jsonOk, jsonError } from '../_shared/serve-with-cors.ts'
import { sendMessengerMessage } from '../_shared/facebook.ts'

serveWithCors(async (req, { supabase, corsHeaders }) => {
  if (req.method !== 'POST') {
    return jsonError('Method not allowed', corsHeaders, 405)
  }

  const body = await req.json()
  const { conversation_id, message, seller_id } = body

  if (!conversation_id || !message || !seller_id) {
    return jsonError('Missing required fields: conversation_id, message, seller_id', corsHeaders)
  }

  // 1. Look up the conversation's fb_sender_id
  const { data: conversation, error: convError } = await supabase
    .from('messenger_conversations')
    .select('fb_sender_id, seller_id')
    .eq('id', conversation_id)
    .single()

  if (convError || !conversation) {
    return jsonError('Conversation not found', corsHeaders, 404)
  }

  // Verify seller owns this conversation
  if (conversation.seller_id !== seller_id) {
    return jsonError('Unauthorized: seller does not own this conversation', corsHeaders, 403)
  }

  const fbSenderId = conversation.fb_sender_id

  // 2. Look up seller's fb_page_access_token from seller_fb_connections
  const { data: fbConn, error: fbError } = await supabase
    .from('seller_fb_connections')
    .select('fb_page_access_token, fb_page_id')
    .eq('user_id', seller_id)
    .eq('status', 'connected')
    .single()

  if (fbError || !fbConn?.fb_page_access_token) {
    return jsonError('Facebook connection not found or token missing', corsHeaders, 400)
  }

  // 3. Call Facebook Graph API to send the message (text or image attachment)
  try {
    const isImage = message.startsWith('http') && (
      message.includes('chat-media') ||
      message.includes('.png') ||
      message.includes('.jpg') ||
      message.includes('.jpeg') ||
      message.includes('.webp')
    )

    if (isImage) {
      await sendMessengerMessage(fbConn.fb_page_access_token, fbSenderId, {
        attachment: {
          type: 'image',
          payload: { url: message, is_reusable: true }
        }
      })
    } else {
      await sendMessengerMessage(fbConn.fb_page_access_token, fbSenderId, { text: message })
    }
  } catch (fbSendErr: any) {
    console.error('[SEND-MESSENGER-REPLY] Facebook API error:', fbSendErr.message)
    return jsonError(`Facebook API error: ${fbSendErr.message}`, corsHeaders, 502)
  }

  // 4. Store the sent message in messenger_messages with role='seller'
  const { error: insertError } = await supabase
    .from('messenger_messages')
    .insert({
      conversation_id,
      role: 'seller',
      content: message,
    })

  if (insertError) {
    console.error('[SEND-MESSENGER-REPLY] DB insert error:', insertError.message)
    // Don't fail — the FB message was already sent
  }

  // 5. Update last_message_at and message_count on messenger_conversations
  const { error: updateError } = await supabase
    .from('messenger_conversations')
    .update({
      last_message_at: new Date().toISOString(),
      message_count: (await supabase
        .from('messenger_messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', conversation_id)
      ).count || 0,
    })
    .eq('id', conversation_id)

  if (updateError) {
    console.error('[SEND-MESSENGER-REPLY] Conversation update error:', updateError.message)
  }

  console.log(`[SEND-MESSENGER-REPLY] Sent reply to FB user ${fbSenderId} in conversation ${conversation_id}`)

  return jsonOk({
    success: true,
    conversation_id,
    fb_sender_id: fbSenderId,
  }, corsHeaders)
})
