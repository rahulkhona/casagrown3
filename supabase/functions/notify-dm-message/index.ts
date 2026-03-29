import { jsonOk, serveWithCors } from "../_shared/serve-with-cors.ts";
import {
    getUserDisplayName,
    sendPushNotification,
} from "../_shared/push-notify.ts";

/**
 * notify-dm-message — Supabase Edge Function
 *
 * Called by a Postgres trigger when a new Direct Message is inserted.
 * Sends a push notification to the OTHER participant in the conversation.
 *
 * Request body (from pg_net trigger):
 *   { messageId, conversationId, senderId }
 */

serveWithCors(async (req, { supabase, corsHeaders }) => {
    const { messageId, conversationId, senderId } = await req.json();

    if (!messageId || !conversationId) {
        console.warn("⚠️ notify-dm-message: missing required fields");
        return jsonOk({ skipped: true, reason: "missing fields" }, corsHeaders);
    }

    // 1. Fetch the message content
    const { data: message, error: msgError } = await supabase
        .from("market_chat_messages")
        .select("content, media")
        .eq("id", messageId)
        .single();

    if (msgError || !message) {
        console.warn(`⚠️ notify-dm-message: message not found: ${messageId}`);
        return jsonOk(
            { skipped: true, reason: "message not found" },
            corsHeaders,
        );
    }

    // 2. Look up the conversation to find the participants
    const { data: conversation, error: convError } = await supabase
        .from("market_conversations")
        .select("participant_a, participant_b")
        .eq("id", conversationId)
        .single();

    if (convError || !conversation) {
        console.warn(
            `⚠️ notify-dm-message: conversation not found: ${conversationId}`,
        );
        return jsonOk(
            { skipped: true, reason: "conversation not found" },
            corsHeaders,
        );
    }

    // 3. Determine recipient
    const recipientId = conversation.participant_a === senderId
        ? conversation.participant_b
        : conversation.participant_a;

    // 4. Build notification title and body
    const title = await getUserDisplayName(supabase, senderId);
    let body: string;

    const content = message.content || "";
    if (content) {
        body = content.length > 100
            ? content.substring(0, 97) + "..."
            : content;
    } else if (message.media && message.media.length > 0) {
        body = "📷 Sent an image";
    } else {
        body = "Sent you a message";
    }

    await sendPushNotification(supabase, {
        userIds: [recipientId],
        title,
        body,
        url: `/messages/${conversationId}`,
        tag: `dm-${conversationId}`,
    });

    // 6. Insert into market_notifications for the in-app Bell icon
    await supabase.from("market_notifications").insert({
        user_id: recipientId,
        content: `💬 ${title}: ${body}`,
        link_url: `/messages/${conversationId}`
    });

    console.log(
        `📬 DM notification: ${title} → 1 recipient in ${conversationId}`,
    );

    return jsonOk(
        { sent: true, recipient: recipientId },
        corsHeaders,
    );
});
