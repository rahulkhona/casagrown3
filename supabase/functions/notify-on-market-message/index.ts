import { jsonOk, serveWithCors } from "../_shared/serve-with-cors.ts";
import {
    getUserDisplayName,
    sendPushNotification,
} from "../_shared/push-notify.ts";

/**
 * notify-on-market-message — Supabase Edge Function
 *
 * Called by a Postgres trigger when a new order_chat_messages row is inserted.
 * Sends a push notification to the OTHER participant in the order.
 *
 * Request body (from pg_net trigger):
 *   { messageId, orderId, senderId }
 */

serveWithCors(async (req, { supabase, corsHeaders }) => {
    const { messageId, orderId, senderId } = await req.json();

    if (!messageId || !orderId) {
        console.warn("⚠️ notify-on-market-message: missing required fields");
        return jsonOk({ skipped: true, reason: "missing fields" }, corsHeaders);
    }

    // 1. Fetch the message content
    const { data: message, error: msgError } = await supabase
        .from("order_chat_messages")
        .select("content, created_at")
        .eq("id", messageId)
        .single();

    if (msgError || !message) {
        console.warn(
            `⚠️ notify-on-market-message: message not found: ${messageId}`,
        );
        return jsonOk(
            { skipped: true, reason: "message not found" },
            corsHeaders,
        );
    }

    // 2. Look up the order to find buyer & seller
    const { data: order, error: orderError } = await supabase
        .from("market_orders")
        .select("buyer_id, seller_id, product_name")
        .eq("id", orderId)
        .single();

    if (orderError || !order) {
        console.warn(
            `⚠️ notify-on-market-message: order not found: ${orderId}`,
        );
        return jsonOk(
            { skipped: true, reason: "order not found" },
            corsHeaders,
        );
    }

    // 3. Determine recipient (the other participant)
    const recipientId = senderId === order.buyer_id
        ? order.seller_id
        : order.buyer_id;

    // 4. Build notification title and body
    const senderName = await getUserDisplayName(supabase, senderId);
    const content = message.content || "";
    const body = content.length > 100
        ? content.substring(0, 97) + "..."
        : content || "Sent a message";

    // 5. Send push — tag collapses per order
    await sendPushNotification(supabase, {
        userIds: [recipientId],
        title: `${senderName} — ${order.product_name}`,
        body,
        url: `/orders/${orderId}`,
        tag: `market-chat-${orderId}`,
    });

    // 6. Invoke SMS Fallback
    try {
        const smsMessage = `💬 ${senderName}: ${body}`;
        await supabase.functions.invoke("send-sms-notification", {
            body: {
                userId: recipientId,
                message: smsMessage,
                linkUrl: `/orders/${orderId}`,
            },
        });
    } catch (err) {
        console.warn(`⚠️ notify-on-market-message: Failed to trigger SMS fallback: ${err}`);
    }

    console.log(
        `📬 Market chat notification: ${senderName} → ${recipientId} (order ${orderId})`,
    );

    return jsonOk(
        { sent: true, recipientId },
        corsHeaders,
    );
});
