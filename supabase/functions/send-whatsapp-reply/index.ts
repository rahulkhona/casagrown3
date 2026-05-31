/**
 * send-whatsapp-reply — Send a seller's reply to a WhatsApp buyer
 *
 * POST /functions/v1/send-whatsapp-reply
 * Body: { conversation_id, message, seller_id }
 */
import { serveWithCors, jsonOk, jsonError } from '../_shared/serve-with-cors.ts'
import { sendWhatsAppMessage } from '../_shared/facebook.ts'

serveWithCors(async (req, { supabase, corsHeaders }) => {
  if (req.method !== 'POST') {
    return jsonError('Method not allowed', corsHeaders, 405)
  }

  const body = await req.json()
  const { conversation_id, message, seller_id } = body

  if (!conversation_id || !message || !seller_id) {
    return jsonError('Missing required fields: conversation_id, message, seller_id', corsHeaders)
  }

  // 1. Look up the conversation's wa_sender_phone
  const { data: conversation, error: convError } = await supabase
    .from('wa_conversations')
    .select('wa_sender_phone, seller_id')
    .eq('id', conversation_id)
    .single()

  if (convError || !conversation) {
    return jsonError('Conversation not found', corsHeaders, 404)
  }

  // Verify seller owns this conversation
  if (conversation.seller_id !== seller_id) {
    return jsonError('Unauthorized: seller does not own this conversation', corsHeaders, 403)
  }

  const waSenderPhone = conversation.wa_sender_phone

  // 2. Look up seller's WhatsApp connection from seller_fb_connections
  const { data: fbConn, error: fbError } = await supabase
    .from('seller_fb_connections')
    .select('fb_page_access_token, wa_phone_number_id')
    .eq('user_id', seller_id)
    .eq('status', 'connected')
    .single()

  if (fbError || !fbConn?.fb_page_access_token || !fbConn?.wa_phone_number_id) {
    return jsonError('WhatsApp connection not found or phone mapping missing', corsHeaders, 400)
  }

  // 3. Call Facebook/Meta Graph API to send the WhatsApp DM
  try {
    const res = await sendWhatsAppMessage(
      fbConn.wa_phone_number_id,
      fbConn.fb_page_access_token,
      waSenderPhone,
      message
    )
    if (!res.success) {
      throw new Error(res.error || 'Unknown error')
    }
  } catch (waSendErr: any) {
    console.error('[SEND-WHATSAPP-REPLY] WhatsApp Cloud API error:', waSendErr.message)
    return jsonError(`WhatsApp Cloud API error: ${waSendErr.message}`, corsHeaders, 502)
  }

  // 4. Store the sent message in wa_messages with role='seller'
  const { error: insertError } = await supabase
    .from('wa_messages')
    .insert({
      conversation_id,
      role: 'seller',
      content: message,
    })

  if (insertError) {
    console.error('[SEND-WHATSAPP-REPLY] DB insert error:', insertError.message)
  }

  // 5. Update last_message_at and message_count on wa_conversations
  const { error: updateError } = await supabase
    .from('wa_conversations')
    .update({
      last_message_at: new Date().toISOString(),
      message_count: (await supabase
        .from('wa_messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', conversation_id)
      ).count || 0,
      seller_last_active_at: new Date().toISOString(),
    })
    .eq('id', conversation_id)

  if (updateError) {
    console.error('[SEND-WHATSAPP-REPLY] Conversation update error:', updateError.message)
  }

  console.log(`[SEND-WHATSAPP-REPLY] Sent reply to WhatsApp user ${waSenderPhone} in conversation ${conversation_id}`)

  return jsonOk({
    success: true,
    conversation_id,
    wa_sender_phone: waSenderPhone,
  }, corsHeaders)
})
