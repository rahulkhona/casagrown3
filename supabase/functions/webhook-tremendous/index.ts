/**
 * webhook-tremendous — Supabase Edge Function
 *
 * Receives webhook events from Tremendous when gift card rewards are delivered or fail.
 *
 * Events:
 *   - REWARDS.DELIVERY.SUCCEEDED → complete redemption, notify user with card link
 *   - REWARDS.DELIVERY.FAILED → refund balance, mark failed, notify user
 *
 * Security: Verifies Tremendous webhook signature (HMAC-SHA256).
 *
 * Setup:
 *   1. Set TREMENDOUS_WEBHOOK_SECRET env var (from Tremendous dashboard → Webhooks)
 *   2. Configure Tremendous webhook endpoint: {SUPABASE_URL}/functions/v1/webhook-tremendous
 *   3. Subscribe to events: REWARDS.DELIVERY.SUCCEEDED, REWARDS.DELIVERY.FAILED
 */

import {
    jsonError,
    jsonOk,
    serveWithCors,
} from "../_shared/serve-with-cors.ts";
import { sendPushNotification } from "../_shared/push-notify.ts";
import { sendTransactionEmail, getUserEmail } from "../_shared/postmark.ts";
import { buildPayoutEmail } from "../_shared/payout-email.ts";

serveWithCors(async (req, { supabase, env, corsHeaders }) => {
    const WEBHOOK_SECRET = env("TREMENDOUS_WEBHOOK_SECRET");

    const body = await req.text();
    const signature = req.headers.get("tremendous-webhook-signature") ||
        req.headers.get("x-tremendous-webhook-signature");

    // Verify signature if secret is configured
    if (WEBHOOK_SECRET && signature) {
        const isValid = await verifyHmacSha256(body, signature, WEBHOOK_SECRET);
        if (!isValid) {
            console.error("[WEBHOOK-TREMENDOUS] Invalid signature");
            return jsonError("Invalid signature", corsHeaders, 401);
        }
    } else if (WEBHOOK_SECRET && !signature) {
        console.error("[WEBHOOK-TREMENDOUS] Missing signature header");
        return jsonError("Missing signature", corsHeaders, 401);
    }

    const event = JSON.parse(body);
    const eventType = event.event?.type || event.type;
    console.log(`[WEBHOOK-TREMENDOUS] Received: ${eventType}`);

    // Extract reward data
    const payload = event.event?.payload || event.payload || event.data;
    if (!payload) {
        console.warn("[WEBHOOK-TREMENDOUS] No payload in event");
        return jsonOk({ received: true, warning: "No payload" }, corsHeaders);
    }

    // The external_id we passed is our redemption.id
    const order = payload.order || payload;
    const externalId = order.external_id;
    const reward = (order.rewards || payload.rewards)?.[0] || payload.reward || payload;
    const credential = reward?.credential || {};

    if (!externalId) {
        console.warn("[WEBHOOK-TREMENDOUS] No external_id in payload, skipping");
        return jsonOk({ received: true, warning: "No external_id" }, corsHeaders);
    }

    // Look up our redemption by the external_id (= redemption.id)
    const { data: redemption, error: lookupErr } = await supabase
        .from("redemptions")
        .select("id, user_id, status, point_cost, metadata")
        .eq("id", externalId)
        .single();

    if (lookupErr || !redemption) {
        console.error(`[WEBHOOK-TREMENDOUS] Redemption ${externalId} not found`);
        return jsonOk({ received: true, warning: "Redemption not found" }, corsHeaders);
    }

    // Idempotency: skip if already completed or failed
    if (redemption.status === "completed" || redemption.status === "refunded") {
        console.log(`[WEBHOOK-TREMENDOUS] Redemption ${externalId} already ${redemption.status}, skipping`);
        return jsonOk({ received: true, alreadyProcessed: true }, corsHeaders);
    }

    switch (eventType) {
        case "REWARDS.DELIVERY.SUCCEEDED": {
            const cardCode = credential.code || "";
            const cardUrl = credential.link || "";
            const orderId = order.id || "";
            const brandName = redemption.metadata?.brand_name || "Gift card";

            // Update redemption to completed
            await supabase.from("redemptions").update({
                metadata: {
                    ...redemption.metadata,
                    card_code: cardCode,
                    provider_order_id: orderId,
                    completed_via: "webhook",
                },
            }).eq("id", redemption.id);

            const { error: finalizeError } = await supabase.rpc("finalize_redemption", {
                p_payload: {
                    redemption_id: redemption.id,
                    redemption_type: "gift_card",
                    provider_name: "tremendous",
                    external_order_id: orderId,
                    card_code: cardCode,
                    card_url: cardUrl,
                    actual_cost_cents: redemption.point_cost,
                },
            });

            if (finalizeError) {
                console.error(`[WEBHOOK-TREMENDOUS] Finalize error for ${redemption.id}:`, finalizeError);
            }

            console.log(`✅ [WEBHOOK-TREMENDOUS] Redemption ${redemption.id} completed: ${brandName}`);

            // Notify user
            const successMsg = `Your ${brandName} gift card ($${(redemption.point_cost / 100).toFixed(2)}) is ready! ${cardUrl ? "Tap to view." : "Check your transaction history."}`;

            await supabase.from("market_notifications").insert({
                user_id: redemption.user_id,
                content: successMsg,
                link_url: cardUrl || "/earnings",
            });

            await sendPushNotification(supabase, {
                userIds: [redemption.user_id],
                title: "Gift Card Ready! 🎁",
                body: successMsg,
                url: cardUrl || "/earnings",
            });

            // Email with card link
            const userEmail = await getUserEmail(supabase, redemption.user_id);
            if (userEmail) {
                const { data: profile } = await supabase.from("profiles")
                    .select("full_name").eq("id", redemption.user_id).single();
                const { subject, htmlBody } = buildPayoutEmail({
                    type: "gift_card",
                    status: "completed",
                    userName: profile?.full_name || "there",
                    brandName,
                    amount: redemption.point_cost / 100,
                    cardCode,
                    cardUrl,
                    provider: "tremendous",
                    redemptionId: redemption.id,
                });
                await sendTransactionEmail({ to: userEmail, subject, htmlBody });
            }

            return jsonOk({ received: true, status: "completed" }, corsHeaders);
        }

        case "REWARDS.DELIVERY.FAILED": {
            const failReason = payload.failure_reason || reward?.failure_details || "Delivery failed";
            const brandName = redemption.metadata?.brand_name || "Gift card";
            const refundUsd = redemption.point_cost / 100;

            // Mark redemption as failed
            await supabase.from("redemptions").update({
                status: "failed",
                failed_reason: `Webhook: ${failReason}`,
                metadata: {
                    ...redemption.metadata,
                    failed_via: "webhook",
                    failure_reason: failReason,
                },
            }).eq("id", redemption.id);

            // Refund balance
            await supabase.rpc("credit_market_balance", {
                p_user_id: redemption.user_id,
                p_amount_usd: refundUsd,
                p_event_type: "refund_issued",
                p_metadata: {
                    description: `Refund: ${brandName} gift card delivery failed`,
                    redemption_id: redemption.id,
                    reason: failReason,
                },
            });

            console.log(`❌ [WEBHOOK-TREMENDOUS] Redemption ${redemption.id} failed, refunded $${refundUsd}`);

            // Notify user
            await supabase.from("market_notifications").insert({
                user_id: redemption.user_id,
                content: `❌ Your ${brandName} gift card failed to deliver. $${refundUsd.toFixed(2)} has been refunded to your balance.`,
                link_url: "/earnings",
            });

            await sendPushNotification(supabase, {
                userIds: [redemption.user_id],
                title: "Gift Card Issue ❌",
                body: `Your ${brandName} gift card failed. $${refundUsd.toFixed(2)} has been refunded.`,
                url: "/earnings",
            });

            return jsonOk({ received: true, status: "failed", refunded: refundUsd }, corsHeaders);
        }

        default:
            console.log(`[WEBHOOK-TREMENDOUS] Unhandled event: ${eventType}`);
            return jsonOk({ received: true }, corsHeaders);
    }
}, { extraCorsHeaders: "tremendous-webhook-signature,x-tremendous-webhook-signature", errorStatus: 500 });

// ── HMAC-SHA256 Signature Verification ──
async function verifyHmacSha256(
    payload: string,
    signature: string,
    secret: string,
): Promise<boolean> {
    try {
        const key = await crypto.subtle.importKey(
            "raw",
            new TextEncoder().encode(secret),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign"],
        );
        const mac = await crypto.subtle.sign(
            "HMAC",
            key,
            new TextEncoder().encode(payload),
        );
        const computed = Array.from(new Uint8Array(mac))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
        return computed === signature.replace(/^sha256=/, "");
    } catch (e) {
        console.error("[WEBHOOK-TREMENDOUS] Signature verification error:", e);
        return false;
    }
}
