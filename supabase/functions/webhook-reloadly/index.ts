/**
 * webhook-reloadly - Supabase Edge Function
 *
 * Receives webhook callbacks from Reloadly when gift card transactions complete or fail.
 *
 * Reloadly sends transaction status updates to the configured webhook URL.
 * Our customIdentifier = redemption.id, which Reloadly includes in callbacks.
 *
 * Setup:
 *   1. Configure webhook URL in Reloadly dashboard: {SUPABASE_URL}/functions/v1/webhook-reloadly
 *   2. Set RELOADLY_WEBHOOK_SECRET env var if Reloadly supports signing
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
    const body = await req.text();
    const event = JSON.parse(body);

    console.log(`[WEBHOOK-RELOADLY] Received callback:`, JSON.stringify(event).substring(0, 200));

    // Extract our redemption ID from customIdentifier
    const customId = event.customIdentifier || event.data?.customIdentifier;
    const transactionId = event.transactionId?.toString() || event.data?.transactionId?.toString();
    const status = (event.status || event.data?.status || "").toUpperCase();

    if (!customId) {
        console.warn("[WEBHOOK-RELOADLY] No customIdentifier, skipping");
        return jsonOk({ received: true, warning: "No customIdentifier" }, corsHeaders);
    }

    // Look up redemption by our ID
    const { data: redemption, error: lookupErr } = await supabase
        .from("redemptions")
        .select("id, user_id, status, point_cost, metadata")
        .eq("id", customId)
        .single();

    if (lookupErr || !redemption) {
        console.error(`[WEBHOOK-RELOADLY] Redemption ${customId} not found`);
        return jsonOk({ received: true, warning: "Redemption not found" }, corsHeaders);
    }

    // Idempotency
    if (redemption.status === "completed" || redemption.status === "refunded") {
        console.log(`[WEBHOOK-RELOADLY] Redemption ${customId} already ${redemption.status}`);
        return jsonOk({ received: true, alreadyProcessed: true }, corsHeaders);
    }

    const brandName = redemption.metadata?.brand_name || "Gift card";

    if (status === "SUCCESSFUL" || status === "COMPLETED") {
        // Extract redeem code
        const redeemCode = event.redemptionPin?.code || event.data?.redemptionPin?.code || "";
        const redeemUrl = event.redemptionPin?.url || event.data?.redemptionPin?.url || "";

        await supabase.from("redemptions").update({
            metadata: {
                ...redemption.metadata,
                card_code: redeemCode,
                provider_order_id: transactionId,
                completed_via: "webhook",
            },
        }).eq("id", redemption.id);

        const { error: finalizeError } = await supabase.rpc("finalize_redemption", {
            p_payload: {
                redemption_id: redemption.id,
                redemption_type: "gift_card",
                provider_name: "reloadly",
                external_order_id: transactionId,
                card_code: redeemCode,
                card_url: redeemUrl,
                actual_cost_cents: redemption.point_cost,
            },
        });

        if (finalizeError) {
            console.error(`[WEBHOOK-RELOADLY] Finalize error for ${redemption.id}:`, finalizeError);
        }

        console.log(`✅ [WEBHOOK-RELOADLY] Redemption ${redemption.id} completed: ${brandName}`);

        // Notify user
        const successMsg = `Your ${brandName} gift card ($${(redemption.point_cost / 100).toFixed(2)}) is ready!`;

        await supabase.from("market_notifications").insert({
            user_id: redemption.user_id,
            content: successMsg,
            link_url: redeemUrl || "/earnings",
        });

        await sendPushNotification(supabase, {
            userIds: [redemption.user_id],
            title: "Gift Card Ready! 🎁",
            body: successMsg,
            url: redeemUrl || "/earnings",
        });

        // Email
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
                cardCode: redeemCode,
                cardUrl: redeemUrl,
                provider: "reloadly",
                redemptionId: redemption.id,
            });
            await sendTransactionEmail({ to: userEmail, subject, htmlBody });
        }

        return jsonOk({ received: true, status: "completed" }, corsHeaders);

    } else if (status === "FAILED" || status === "REFUNDED") {
        const failReason = event.errorMessage || event.data?.errorMessage || "Transaction failed";
        const refundUsd = redemption.point_cost / 100;

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
                description: `Refund: ${brandName} gift card failed`,
                redemption_id: redemption.id,
                reason: failReason,
            },
        });

        console.log(`❌ [WEBHOOK-RELOADLY] Redemption ${redemption.id} failed, refunded $${refundUsd}`);

        await supabase.from("market_notifications").insert({
            user_id: redemption.user_id,
            content: `❌ Your ${brandName} gift card failed. $${refundUsd.toFixed(2)} has been refunded.`,
            link_url: "/earnings",
        });

        return jsonOk({ received: true, status: "failed", refunded: refundUsd }, corsHeaders);
    }

    console.log(`[WEBHOOK-RELOADLY] Unhandled status: ${status}`);
    return jsonOk({ received: true, status: "unhandled" }, corsHeaders);
}, { errorStatus: 500 });
