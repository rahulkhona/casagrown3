/**
 * post-checkout-messenger — Asynchronously send a thank-you note
 * and follow-page link via Facebook Messenger when a buyer checkouts
 * from a tracked Facebook Messenger link.
 *
 * Called asynchronously via Postgres trigger:
 *   POST /functions/v1/post-checkout-messenger
 *   Body: { orderId }
 */
import { serveWithCors, jsonOk, jsonError } from '../_shared/serve-with-cors.ts'
import { sendMessengerMessage } from '../_shared/facebook.ts'

serveWithCors(async (req, { supabase, corsHeaders }) => {
  if (req.method !== 'POST') {
    return jsonError('Method not allowed', corsHeaders, 405)
  }

  const { orderId } = await req.json()
  if (!orderId) {
    return jsonError('Missing orderId', corsHeaders)
  }

  // 1. Fetch order details, verify Pro plan
  const { data: order, error: orderErr } = await supabase
    .from('market_orders')
    .select('id, seller_id, product_name, quantity, total_usd, seller_plan, fb_metadata')
    .eq('id', orderId)
    .single()

  if (orderErr || !order) {
    console.error(`[POST-CHECKOUT-MESSENGER] Order not found: ${orderId}`, orderErr?.message)
    return jsonError('Order not found', corsHeaders, 404)
  }

  // Ensure seller plan is indeed Pro or Elite
  if (order.seller_plan !== 'pro' && order.seller_plan !== 'elite') {
    console.log(`[POST-CHECKOUT-MESSENGER] Seller is not on Pro/Elite plan for order ${orderId}, skipping engagement.`)
    return jsonOk({ skipped: true, reason: 'not_pro_or_elite' }, corsHeaders)
  }

  // Extract FB parameters
  const fbMetadata = order.fb_metadata as Record<string, any>
  const psid = fbMetadata?.fb_psid
  const pageId = fbMetadata?.fb_page_id

  if (!psid) {
    console.log(`[POST-CHECKOUT-MESSENGER] No fb_psid in order metadata for order ${orderId}, skipping.`)
    return jsonOk({ skipped: true, reason: 'no_psid' }, corsHeaders)
  }

  // 2. Fetch Page access token and seller details
  const { data: fbConn, error: fbConnErr } = await supabase
    .from('seller_fb_connections')
    .select('fb_page_access_token, fb_page_id')
    .eq('user_id', order.seller_id)
    .eq('status', 'connected')
    .single()

  if (fbConnErr || !fbConn?.fb_page_access_token) {
    console.error(`[POST-CHECKOUT-MESSENGER] Seller connected Page token not found for seller ${order.seller_id}`, fbConnErr?.message)
    return jsonError('Facebook connection not found', corsHeaders, 400)
  }

  const activePageId = pageId || fbConn.fb_page_id

  // 3. Fetch Seller name
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', order.seller_id)
    .single()

  const sellerName = profile?.full_name || 'the seller'

  // Construct message content
  const thankYouText = `Thank you for your order of ${order.quantity}x ${order.product_name}! ${sellerName} is preparing it.`
  const followPageText = `Follow our Facebook Page for updates: https://www.facebook.com/${activePageId}`

  console.log(`[POST-CHECKOUT-MESSENGER] Sending checkout followups to PSID ${psid} on page ${activePageId}...`)

  try {
    // 4. Send messages via Facebook Graph API
    await sendMessengerMessage(fbConn.fb_page_access_token, psid, { text: thankYouText })
    await sendMessengerMessage(fbConn.fb_page_access_token, psid, { text: followPageText })
  } catch (fbErr: any) {
    console.error(`[POST-CHECKOUT-MESSENGER] Facebook Send API failed:`, fbErr.message)
    return jsonError(`Facebook Send API failed: ${fbErr.message}`, corsHeaders, 502)
  }

  // 5. Log both replies into conversation history & update counters
  try {
    // Check if conversation exists, or create a resilient fallback
    let { data: conv } = await supabase
      .from('messenger_conversations')
      .select('id, message_count')
      .eq('seller_id', order.seller_id)
      .eq('fb_sender_id', psid)
      .single()

    if (!conv) {
      const { data: newConv } = await supabase
        .from('messenger_conversations')
        .insert({
          fb_sender_id: psid,
          seller_id: order.seller_id,
          last_message_at: new Date().toISOString(),
          message_count: 0,
        })
        .select()
        .single()
      conv = newConv
    }

    if (conv) {
      // Record bot messages in messenger_messages
      await supabase.from('messenger_messages').insert([
        { conversation_id: conv.id, role: 'bot', content: thankYouText },
        { conversation_id: conv.id, role: 'bot', content: followPageText },
      ])

      // Update counters
      await supabase
        .from('messenger_conversations')
        .update({
          last_message_at: new Date().toISOString(),
          message_count: (conv.message_count || 0) + 2,
        })
        .eq('id', conv.id)
    }
  } catch (dbErr: any) {
    console.error(`[POST-CHECKOUT-MESSENGER] Failed to log messages to history:`, dbErr.message)
    // Non-fatal, FB messages were already sent
  }

  console.log(`[POST-CHECKOUT-MESSENGER] Successfully completed checkout engagement for order ${orderId}`)

  return jsonOk({
    success: true,
    orderId,
    thankYouText,
    followPageText,
  }, corsHeaders)
})
