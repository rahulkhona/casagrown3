import { jsonOk, serveWithCors } from "../_shared/serve-with-cors.ts";
import {
    getUserDisplayName,
    sendPushNotification,
} from "../_shared/push-notify.ts";

/**
 * notify-on-message — Supabase Edge Function
 *
 * Called by a Postgres trigger when a new chat message is inserted.
 * Sends a push notification to the OTHER participant in the conversation.
 *
 * Handles:
 *   - User messages (text, media, location)
 *   - System messages (order/offer state changes)
 *
 * Request body (from pg_net trigger):
 *   { messageId, conversationId, senderId (nullable), messageType }
 *
 * Uses service-role key from the trigger — no user auth required.
 */

serveWithCors(async (req, { supabase, corsHeaders }) => {
    const { messageId, conversationId, senderId, messageType: _messageType } =
        await req
            .json();

    if (!messageId || !conversationId) {
        console.warn("⚠️ notify-on-message: missing required fields");
        return jsonOk({ skipped: true, reason: "missing fields" }, corsHeaders);
    }

    // 1. Fetch the message content
    const { data: message, error: msgError } = await supabase
        .from("chat_messages")
        .select("type, content, media_id, metadata")
        .eq("id", messageId)
        .single();

    if (msgError || !message) {
        console.warn(`⚠️ notify-on-message: message not found: ${messageId}`);
        return jsonOk(
            { skipped: true, reason: "message not found" },
            corsHeaders,
        );
    }

    // 2. Look up the conversation to find buyer & seller
    const { data: conversation, error: convError } = await supabase
        .from("conversations")
        .select("buyer_id, seller_id, post_id")
        .eq("id", conversationId)
        .single();

    if (convError || !conversation) {
        console.warn(
            `⚠️ notify-on-message: conversation not found: ${conversationId}`,
        );
        return jsonOk(
            { skipped: true, reason: "conversation not found" },
            corsHeaders,
        );
    }

    // 3. Determine recipients (exclude the sender if present)
    const allParticipants = [conversation.buyer_id, conversation.seller_id];
    let recipientIds = senderId
        ? allParticipants.filter((id: string) => id !== senderId)
        : allParticipants; // System messages → notify both

    if (message.metadata?.visible_to) {
        recipientIds = [message.metadata.visible_to];
    }

    if (recipientIds.length === 0) {
        console.warn(
            `⚠️ notify-on-message: no recipients for ${conversationId}`,
        );
        return jsonOk(
            { skipped: true, reason: "no recipients" },
            corsHeaders,
        );
    }

    // 4. Build notification title and body
    let title: string;
    let body: string;

    const isSystemMessage = message.type === "system" || !senderId;

    if (isSystemMessage) {
        // System message — order/offer state change
        title = "CasaGrown";
        let content = message.content || "";
        content = content.replace(
            /escrowed points released/g,
            "points debited",
        );

        body = content.length > 120
            ? content.substring(0, 117) + "..."
            : content || "Order update";
    } else {
        // User message — look up sender name
        title = await getUserDisplayName(supabase, senderId);

        if (message.type === "text") {
            const content = message.content || "";
            body = content.length > 100
                ? content.substring(0, 97) + "..."
                : content;
        } else if (message.media_id) {
            body = "📷 Sent a photo";
        } else {
            body = "Sent a message";
        }
    }

    // 5. Send push — tag collapses per conversation
    // Send separate push payloads so each recipient gets the correct otherUserId route
    for (const recipientId of recipientIds) {
        const otherUserId = conversation.buyer_id === recipientId
            ? conversation.seller_id
            : conversation.buyer_id;

        await sendPushNotification(supabase, {
            userIds: [recipientId],
            title,
            body,
            url: `/chat?postId=${conversation.post_id}&otherUserId=${otherUserId}`,
            tag: `chat-${conversationId}`,
        });
    }

    console.log(
        `📬 Chat notification: ${title} → ${recipientIds.length} recipient(s) in ${conversationId}`,
    );

    return jsonOk(
        { sent: true, recipients: recipientIds.length },
        corsHeaders,
    );
});
