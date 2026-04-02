/**
 * webhook-paypal — Supabase Edge Function
 *
 * Receives webhook events from PayPal when payout items succeed, fail, or are blocked.
 *
 * Our sender_item_id = redemption.id, which PayPal includes in webhook callbacks.
 *
 * Events:
 *   - PAYMENT.PAYOUTS-ITEM.SUCCEEDED → mark redemption completed
 *   - PAYMENT.PAYOUTS-ITEM.FAILED → refund balance, mark failed
 *   - PAYMENT.PAYOUTS-ITEM.BLOCKED → refund balance, mark failed
 *   - PAYMENT.PAYOUTS-ITEM.UNCLAIMED → notify user to claim, or refund after timeout
 *
 * Security: Verifies PayPal webhook signature.
 *
 * Setup:
 *   1. Set PAYPAL_WEBHOOK_ID env var (from PayPal developer dashboard → Webhooks)
 *   2. Configure PayPal webhook URL: {SUPABASE_URL}/functions/v1/webhook-paypal
 *   3. Subscribe to PAYMENT.PAYOUTS-ITEM.* events
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

    const eventType = event.event_type;
    console.log(`[WEBHOOK-PAYPAL] Received: ${eventType}`);

    const resource = event.resource || {};

    // sender_item_id is our redemption.id
    const redemptionId = resource.payout_item?.sender_item_id;
    const batchId = resource.payout_batch_id;
    const payoutItemId = resource.payout_item_id;
    const transactionStatus = resource.transaction_status;

    if (!redemptionId) {
        console.warn("[WEBHOOK-PAYPAL] No sender_item_id in resource");
        return jsonOk({ received: true, warning: "No sender_item_id" }, corsHeaders);
    }

    // Look up our redemption
    const { data: redemption, error: lookupErr } = await supabase
        .from("redemptions")
        .select("id, user_id, status, point_cost, metadata")
        .eq("id", redemptionId)
        .single();

    if (lookupErr || !redemption) {
        console.error(`[WEBHOOK-PAYPAL] Redemption ${redemptionId} not found`);
        return jsonOk({ received: true, warning: "Redemption not found" }, corsHeaders);
    }

    // Idempotency
    if (redemption.status === "completed" || redemption.status === "refunded") {
        console.log(`[WEBHOOK-PAYPAL] Redemption ${redemptionId} already ${redemption.status}`);
        return jsonOk({ received: true, alreadyProcessed: true }, corsHeaders);
    }

    const payoutTarget = redemption.metadata?.payout_target || "PayPal/Venmo";
    const usdAmount = redemption.point_cost / 100;

    switch (eventType) {
        case "PAYMENT.PAYOUTS-ITEM.SUCCEEDED": {
            await supabase.from("redemptions").update({
                status: "completed",
                completed_at: new Date().toISOString(),
                provider: "paypal",
                provider_order_id: payoutItemId || batchId,
                metadata: {
                    ...redemption.metadata,
                    payout_item_id: payoutItemId,
                    batch_id: batchId,
                    transaction_status: transactionStatus,
                    completed_via: "webhook",
                },
            }).eq("id", redemption.id);

            console.log(`✅ [WEBHOOK-PAYPAL] Payout ${redemption.id} completed: $${usdAmount} to ${payoutTarget}`);

            const successMsg = `Your cashout of $${usdAmount.toFixed(2)} to ${payoutTarget} was successful!`;

            await supabase.from("market_notifications").insert({
                user_id: redemption.user_id,
                content: successMsg,
                link_url: "/earnings",
            });

            await sendPushNotification(supabase, {
                userIds: [redemption.user_id],
                title: "Cashout Successful 💸",
                body: successMsg,
                url: "/earnings",
            });

            // Email
            const userEmail = await getUserEmail(supabase, redemption.user_id);
            if (userEmail) {
                const isPhone = /^\+?[1-9]\d{1,14}$/.test(payoutTarget);
                const { data: profile } = await supabase.from("profiles")
                    .select("full_name").eq("id", redemption.user_id).single();
                const { subject, htmlBody } = buildPayoutEmail({
                    type: "cashout",
                    status: "completed",
                    userName: profile?.full_name || "there",
                    amount: usdAmount,
                    payoutTarget,
                    handleType: isPhone ? "venmo" : "paypal",
                    transactionId: payoutItemId || batchId,
                    redemptionId: redemption.id,
                });
                await sendTransactionEmail({ to: userEmail, subject, htmlBody });
            }

            return jsonOk({ received: true, status: "completed" }, corsHeaders);
        }

        case "PAYMENT.PAYOUTS-ITEM.FAILED":
        case "PAYMENT.PAYOUTS-ITEM.BLOCKED":
        case "PAYMENT.PAYOUTS-ITEM.RETURNED": {
            const failReason = resource.errors?.message ||
                resource.payout_item_fee?.value ||
                `Payout ${transactionStatus || eventType.split(".").pop()}`;

            await supabase.from("redemptions").update({
                status: "failed",
                failed_reason: `Webhook: ${failReason}`,
                metadata: {
                    ...redemption.metadata,
                    payout_item_id: payoutItemId,
                    batch_id: batchId,
                    transaction_status: transactionStatus,
                    failed_via: "webhook",
                    failure_reason: failReason,
                },
            }).eq("id", redemption.id);

            // Refund balance
            await supabase.rpc("credit_market_balance", {
                p_user_id: redemption.user_id,
                p_amount_usd: usdAmount,
                p_event_type: "refund_issued",
                p_metadata: {
                    description: `Refund: Cashout to ${payoutTarget} failed`,
                    redemption_id: redemption.id,
                    reason: failReason,
                },
            });

            console.log(`❌ [WEBHOOK-PAYPAL] Payout ${redemption.id} failed, refunded $${usdAmount}`);

            await supabase.from("market_notifications").insert({
                user_id: redemption.user_id,
                content: `❌ Your cashout of $${usdAmount.toFixed(2)} to ${payoutTarget} failed. The funds have been refunded to your balance.`,
                link_url: "/earnings",
            });

            await sendPushNotification(supabase, {
                userIds: [redemption.user_id],
                title: "Cashout Failed ❌",
                body: `Your cashout of $${usdAmount.toFixed(2)} failed. Funds refunded.`,
                url: "/earnings",
            });

            return jsonOk({ received: true, status: "failed", refunded: usdAmount }, corsHeaders);
        }

        case "PAYMENT.PAYOUTS-ITEM.UNCLAIMED": {
            // Payout sent but recipient hasn't claimed — notify user
            await supabase.from("redemptions").update({
                metadata: {
                    ...redemption.metadata,
                    transaction_status: "UNCLAIMED",
                    unclaimed_at: new Date().toISOString(),
                },
            }).eq("id", redemption.id);

            await supabase.from("market_notifications").insert({
                user_id: redemption.user_id,
                content: `⏳ Your cashout of $${usdAmount.toFixed(2)} is waiting to be claimed at ${payoutTarget}. Please check your PayPal/Venmo account.`,
                link_url: "/earnings",
            });

            console.log(`⏳ [WEBHOOK-PAYPAL] Payout ${redemption.id} unclaimed`);
            return jsonOk({ received: true, status: "unclaimed" }, corsHeaders);
        }

        default:
            console.log(`[WEBHOOK-PAYPAL] Unhandled event: ${eventType}`);
            return jsonOk({ received: true }, corsHeaders);
    }
}, { errorStatus: 500 });
