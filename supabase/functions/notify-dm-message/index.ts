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

    // 5. Send push notification
    const pushResult = await sendPushNotification(supabase, {
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

    // 7. Trigger GrowBot auto-reply (copilot for Pro sellers)
    try {
        await supabase.functions.invoke('auto-reply-seller-chat', {
            body: {
                type: 'dm',
                messageId,
                senderId,
                recipientId,
                conversationId,
            },
        });
        console.log(`🤖 Auto-reply triggered for DM in ${conversationId}`);
    } catch (botErr: any) {
        console.warn(`⚠️ Auto-reply trigger failed: ${botErr.message}`);
    }

    // GAP-8: Email fallback if recipient has no push subscription
    // Batched: only send if no DM email was sent in the last hour
    try {
        const { data: hasPush } = await supabase
            .from("push_subscriptions")
            .select("id")
            .eq("user_id", recipientId)
            .limit(1);

        if (!hasPush || hasPush.length === 0) {
            // Check if we already sent a DM email to this user in the last hour
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
            const { data: recentEmail } = await supabase
                .from("market_notifications")
                .select("id")
                .eq("user_id", recipientId)
                .like("content", "💬 %")
                .gte("created_at", oneHourAgo)
                .limit(2);

            // Only send email if this is the first DM notification in the last hour
            // (recentEmail includes the one we just inserted above, so check for <= 1)
            if (!recentEmail || recentEmail.length <= 1) {
                const { data: emailData } = await supabase
                    .rpc("get_user_email", { p_user_id: recipientId });
                const recipientName = await getUserDisplayName(supabase, recipientId);

                if (emailData) {
                    await supabase.functions.invoke("send-notification-email", {
                        body: {
                            type: "chat_initiated",
                            recipients: [{ email: emailData, name: recipientName }],
                            senderName: title,
                            messagePreview: body,
                        },
                    });
                    console.log(`📧 DM email sent to ${recipientId} (no push subscription)`);
                }
            } else {
                console.log(`📧 DM email batched for ${recipientId} (recent email exists)`);
            }
        }
    } catch (emailErr) {
        console.warn("DM email fallback failed:", emailErr);
    }

    console.log(
        `📬 DM notification: ${title} → 1 recipient in ${conversationId}`,
    );

    return jsonOk(
        { sent: true, recipient: recipientId },
        corsHeaders,
    );
});
