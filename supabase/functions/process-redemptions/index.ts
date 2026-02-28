/**
 * retry-redemptions — Edge Function for processing queued redemptions
 *
 * Flow:
 * 1. Fetch all redemptions where status = 'failed' (Tremendous/Reloadly) or 'pending' for GlobalGiving
 * 2. Invoke appropriate provider API
 * 3. On success: Update redemption, point_ledger, create receipt/delivery, and fire push notification
 * 4. On failure: Skip and leave in queue
 */

import {
    jsonError,
    jsonOk,
    serveWithCors,
} from "../_shared/serve-with-cors.ts";
import { sendPushNotification } from "../_shared/push-notify.ts";
import {
    fetchTremendousBalance,
    orderFromTremendous,
} from "../_shared/tremendous.ts";
import {
    fetchReloadlyBalance,
    orderFromReloadly,
} from "../_shared/reloadly.ts";

// Note: To be secure, this endpoint should require a service_role key or an internal secret
// For now, we will just use a simple static API token check since it's an internal cron job.

serveWithCors(async (req, { supabase, env, corsHeaders }) => {
    // Basic auth check for cron jobs
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || authHeader !== `Bearer ${env("CRON_SECRET")}`) {
        return jsonError("Unauthorized", corsHeaders, 401);
    }

    // 1. Fetch live queue states
    const { data: _queueProviders } = await supabase
        .from("instrument_queuing_status")
        .select("instrument, is_queuing");

    let tremendousBalance = 0;
    let reloadlyBalance = 0;

    try {
        if (env("TREMENDOUS_API_KEY")) {
            tremendousBalance = await fetchTremendousBalance(
                env("TREMENDOUS_API_KEY")!,
            );
        }
        if (env("RELOADLY_CLIENT_ID") && env("RELOADLY_CLIENT_SECRET")) {
            reloadlyBalance = await fetchReloadlyBalance(
                env("RELOADLY_CLIENT_ID")!,
                env("RELOADLY_CLIENT_SECRET")!,
                env("RELOADLY_SANDBOX") !== "false",
            );
        }
    } catch (balanceError) {
        console.warn(
            `[RETRY] Failed verifying provider balances: ${balanceError}`,
        );
        // We do not short circuit; we let the provider calls fail individually if balance check API flakes
    }

    console.log(
        `[RETRY] Provider Balances -> Tremendous: $${
            (tremendousBalance / 100).toFixed(2)
        }, Reloadly: $${(reloadlyBalance / 100).toFixed(2)}`,
    );

    // 2. Fetch all redemptions in FIFO order (oldest pending FIRST) per provider
    const { data: queuedRedemptions, error: fetchError } = await supabase
        .from("redemptions")
        .select("*")
        .or("status.eq.failed,status.eq.pending")
        .order("created_at", { ascending: true })
        .limit(50);

    if (fetchError) {
        return jsonError(
            `Failed to fetch queued redemptions: ${fetchError.message}`,
            corsHeaders,
        );
    }

    if (!queuedRedemptions || queuedRedemptions.length === 0) {
        return jsonOk({
            success: true,
            processed: 0,
            message: "No queued redemptions found",
        }, corsHeaders);
    }

    let processedCount = 0;
    const failures: { id: string; provider: string; reason: string }[] = [];
    const providersAttempted = new Set<string>();

    // Process each redemption strict FIFO, checking available remaining balance for each
    for (const redemption of queuedRedemptions) {
        const { provider, metadata, user_id, point_cost } = redemption;

        providersAttempted.add(provider);

        const faceValueCents = metadata.face_value_cents ||
            Math.round((point_cost / 100) * 100);

        try {
            if (provider === "globalgiving") {
                await processGlobalGiving(
                    supabase,
                    env,
                    redemption,
                    user_id,
                    point_cost,
                    metadata,
                );
            } else if (provider === "tremendous") {
                if (
                    faceValueCents > tremendousBalance && tremendousBalance > 0
                ) {
                    console.log(
                        `[RETRY] Insufficient Tremendous balance ($${
                            (tremendousBalance / 100).toFixed(2)
                        }) for redemption ${redemption.id} ($${
                            (faceValueCents / 100).toFixed(2)
                        }). Waiting.`,
                    );
                    continue;
                }

                await processGiftCard(supabase, env, redemption, "tremendous");
                tremendousBalance -= faceValueCents;
            } else if (provider === "reloadly") {
                // Note: Reloadly often has sender fees, so the actual cost is lightly higher than face value.
                const estimatedCost = faceValueCents +
                    (metadata.net_fee_cents || 50);

                if (estimatedCost > reloadlyBalance && reloadlyBalance > 0) {
                    console.log(
                        `[RETRY] Insufficient Reloadly balance ($${
                            (reloadlyBalance / 100).toFixed(2)
                        }) for redemption ${redemption.id} ($${
                            (estimatedCost / 100).toFixed(2)
                        }). Waiting.`,
                    );
                    continue;
                }

                await processGiftCard(supabase, env, redemption, "reloadly");
                reloadlyBalance -= estimatedCost;
            } else if (provider === "paypal") {
                await processPayPalCashout(
                    supabase,
                    env,
                    redemption,
                    user_id,
                    point_cost,
                    metadata,
                );
            } else {
                throw new Error(`Unknown provider for retry: ${provider}`);
            }

            processedCount++;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(
                `[RETRY] Failed processing ${redemption.id} via ${provider}: ${msg}`,
            );
            failures.push({
                id: redemption.id,
                provider: provider,
                reason: msg,
            });

            // Mark provider status failing to 'failed' from 'pending' if this is its first loop
            if (redemption.status === "pending") {
                await supabase
                    .from("redemptions")
                    .update({ status: "failed", failed_reason: msg })
                    .eq("id", redemption.id);
            } else {
                // Backoff existing failures slightly to avoid log spam, simply update failed_reason timestamp
                await supabase
                    .from("redemptions")
                    .update({
                        failed_reason: `${msg} at ${new Date().toISOString()}`,
                    })
                    .eq("id", redemption.id);
            }
        }
    }

    // 3. Reset Circuit Breaker for Successes
    // For any provider we attempted to process, if it has 0 failures in this run, we can mark is_queuing = false
    const failedProvidersList = failures.map((f) => f.provider);
    const successfullyClearedProviders = Array.from(providersAttempted).filter(
        (p) => !failedProvidersList.includes(p),
    );

    for (const clearedProvider of successfullyClearedProviders) {
        console.log(`[RETRY] Clearing Circuit Breaker for ${clearedProvider}`);
        await supabase
            .from("instrument_queuing_status")
            .update({ is_queuing: false })
            .eq("instrument", clearedProvider);
    }

    // For any provider that failed, ensure circuit breaker is ON so future immediate redemptions are queued
    for (const failedProvider of failedProvidersList) {
        console.log(`[RETRY] Setting Circuit Breaker ON for ${failedProvider}`);
        await supabase
            .from("instrument_queuing_status")
            .update({ is_queuing: true })
            .eq("instrument", failedProvider);
    }

    return jsonOk({
        success: true,
        processed: processedCount,
        failed: failures.length,
        failures,
        cleared_circuit_breakers: successfullyClearedProviders,
    }, corsHeaders);
});

// ============================================================================
// Gift Card Processing (Tremendous / Reloadly)
// ============================================================================
async function processGiftCard(
    // deno-lint-ignore no-explicit-any
    supabase: any,
    env: (key: string) => string | undefined,
    redemption: Record<string, unknown>,
    provider: "tremendous" | "reloadly",
) {
    const metadata = redemption.metadata as Record<string, unknown>;
    const brand_name = metadata.brand_name as string;
    const product_id = metadata.product_id as string;
    const face_value_cents = metadata.face_value_cents as number;

    let providerResult;

    if (provider === "tremendous") {
        providerResult = await orderFromTremendous(
            env("TREMENDOUS_API_KEY") || "",
            product_id,
            brand_name,
            face_value_cents,
        );
    } else {
        providerResult = await orderFromReloadly(
            env("RELOADLY_CLIENT_ID") || "",
            env("RELOADLY_CLIENT_SECRET") || "",
            product_id,
            brand_name,
            face_value_cents,
            env("RELOADLY_SANDBOX") !== "false",
        );
    }

    // Log provider transaction
    await supabase.from("provider_transactions").insert({
        provider_name: providerResult.provider,
        redemption_id: redemption.id,
        user_id: redemption.user_id,
        external_order_id: providerResult.externalOrderId,
        item_type: "gift_card",
        item_name: `${brand_name} $${
            (face_value_cents / 100).toFixed(2)
        } Gift Card`,
        face_value_cents: face_value_cents,
        cost_cents: providerResult.actualCostCents,
        status: "success",
    });

    // Update point ledger
    await supabase
        .from("point_ledger")
        .update({
            metadata: {
                ...metadata,
                card_code: providerResult.cardCode,
                card_url: providerResult.cardUrl,
                status: "completed",
            },
        })
        .eq("reference_id", redemption.id)
        .eq("type", "redemption");

    // Store delivery
    await supabase.from("gift_card_deliveries").insert({
        redemption_id: redemption.id,
        brand_name: brand_name,
        face_value_cents: face_value_cents,
        card_code: providerResult.cardCode,
        card_url: providerResult.cardUrl,
        delivered_at: new Date().toISOString(),
    });

    // Mark redemption complete
    await supabase
        .from("redemptions")
        .update({
            status: "completed",
            provider_order_id: providerResult.externalOrderId as string,
            completed_at: new Date().toISOString(),
        })
        .eq("id", redemption.id);

    // Fire Push Notification
    const msg = `Good news! Your $${
        (face_value_cents / 100).toFixed(2)
    } ${brand_name} Gift Card redemption is now complete and ready to use.`;

    await supabase.from("notifications").insert({
        user_id: redemption.user_id,
        content: msg,
        link_url: "/transaction-history",
    });

    await sendPushNotification(supabase, {
        userIds: [redemption.user_id as string],
        title: "Redemption Complete 🎉",
        body: msg,
        url: "/transaction-history",
    });
}

// ============================================================================
// GlobalGiving Processing
// ============================================================================
async function processGlobalGiving(
    // deno-lint-ignore no-explicit-any
    supabase: any,
    env: (key: string) => string | undefined,
    redemption: Record<string, unknown>,
    userId: string,
    pointsAmount: number,
    metadata: Record<string, unknown>,
) {
    const organization = metadata.organization as string;
    const project_title = metadata.project_title as string;
    const theme = metadata.theme as string;

    const projectId = redemption.item_id as string;

    const POINTS_PER_DOLLAR = 100;
    const dollarAmount = pointsAmount / POINTS_PER_DOLLAR;
    const donationCents = Math.round(dollarAmount * 100);

    let externalOrderId = "";
    const ggApiKey = env("GLOBALGIVING_API_KEY");
    const isSandbox = env("GLOBALGIVING_SANDBOX") === "true";

    if (ggApiKey && projectId && !isSandbox) {
        const response = await fetch(
            `https://api.globalgiving.org/api/public/projects/${projectId}/donate?api_key=${ggApiKey}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    amount: dollarAmount,
                    currency: "USD",
                }),
            },
        );

        if (!response.ok) {
            throw new Error(`GlobalGiving API error: ${await response.text()}`);
        }

        const data = await response.json();
        externalOrderId = data.donationId || data.id || "";
    } else {
        externalOrderId = `GG-SIM-${Date.now()}`;
        console.log(
            `🧪 [SANDBOX] Simulated GlobalGiving donation: $${dollarAmount} to "${organization}"`,
        );
    }

    // Log provider transaction
    await supabase.from("provider_transactions").insert({
        provider_name: "globalgiving",
        redemption_id: redemption.id,
        user_id: userId as string,
        external_order_id: externalOrderId,
        item_type: "donation",
        item_name: `Donation to ${organization}`,
        face_value_cents: donationCents,
        cost_cents: donationCents,
        status: "success",
    });

    // Store donation receipt
    const receiptNumber = `DON-${Date.now().toString(36).toUpperCase()}`;
    const receiptUrl = `https://casagrown.com/receipts/${receiptNumber}`;

    await supabase.from("donation_receipts").insert({
        redemption_id: redemption.id,
        organization_name: organization,
        project_title: project_title,
        theme: theme,
        donation_amount_cents: donationCents,
        points_spent: pointsAmount,
        receipt_url: receiptUrl,
        receipt_number: receiptNumber,
        tax_deductible: true,
    });

    // Update ledger metadata with tracking
    await supabase
        .from("point_ledger")
        .update({
            metadata: {
                ...metadata,
                receipt_number: receiptNumber,
                status: "completed",
            },
        })
        .eq("reference_id", redemption.id)
        .eq("type", "donation");

    // Mark completion
    await supabase
        .from("redemptions")
        .update({
            status: "completed",
            provider_order_id: externalOrderId,
            completed_at: new Date().toISOString(),
        })
        .eq("id", redemption.id);

    // Fire Push
    const msg = `Your queued donation of $${
        dollarAmount.toFixed(2)
    } to ${organization} has been successfully processed!`;

    await supabase.from("notifications").insert({
        user_id: userId,
        content: msg,
        link_url: "/transaction-history",
    });

    await sendPushNotification(supabase, {
        userIds: [userId],
        title: "Donation Complete 💛",
        body: msg,
        url: "/transaction-history",
    });
}

// ============================================================================
// PayPal Cashout Processing
// ============================================================================
async function processPayPalCashout(
    // deno-lint-ignore no-explicit-any
    supabase: any,
    env: (key: string) => string | undefined,
    redemption: Record<string, unknown>,
    userId: string,
    pointsAmount: number,
    metadata: Record<string, unknown>,
) {
    const usdAmount = metadata.usd_amount as number;
    const payoutTarget = metadata.payout_target as string;

    const PAYPAL_CLIENT_ID = env("PAYPAL_CLIENT_ID");
    const PAYPAL_SECRET = env("PAYPAL_SECRET");

    const IS_PROD = env("SUPABASE_URL")?.includes("casagrown") &&
        !env("SUPABASE_URL")?.includes("localhost");
    const PAYPAL_BASE_URL = IS_PROD
        ? "https://api-m.paypal.com"
        : "https://api-m.sandbox.paypal.com";

    if (!PAYPAL_CLIENT_ID || !PAYPAL_SECRET) {
        throw new Error("PayPal API keys are missing in Cron");
    }

    // A. Get OAuth Token
    const credentials = btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`);
    const authRes = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
        method: "POST",
        headers: {
            "Authorization": `Basic ${credentials}`,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
    });

    if (!authRes.ok) {
        throw new Error("Failed to authenticate with PayPal processor.");
    }
    const { access_token } = await authRes.json();

    // B. Send Payout
    const isPhone = /^\+?[1-9]\d{1,14}$/.test(payoutTarget);
    const receiverType = isPhone ? "PHONE" : "EMAIL";

    const payoutPayload = {
        sender_batch_header: {
            sender_batch_id: `retry_${Date.now()}_${userId.substring(0, 8)}`,
            email_subject: "Here is your CasaGrown Reward!",
            email_message:
                `You earned $${usdAmount} by redeeming ${pointsAmount} points on CasaGrown! Keep up the great work.`,
        },
        items: [
            {
                recipient_type: receiverType,
                amount: {
                    value: usdAmount.toFixed(2),
                    currency: "USD",
                },
                note: "CasaGrown Points Redemption",
                sender_item_id: `retry_item_${Date.now()}`,
                receiver: payoutTarget,
            },
        ],
    };

    const payoutRes = await fetch(`${PAYPAL_BASE_URL}/v1/payments/payouts`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${access_token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payoutPayload),
    });

    const payoutData = await payoutRes.json();

    if (!payoutRes.ok || payoutData.name === "INSUFFICIENT_FUNDS") {
        throw new Error(
            payoutData.message || "PayPal rejected retry transfer.",
        );
    }

    const txId = payoutData.batch_header?.payout_batch_id ||
        `paypal_retry_id_${Date.now()}`;

    // Mark completion
    await supabase
        .from("redemptions")
        .update({
            status: "completed",
            provider_order_id: txId,
            completed_at: new Date().toISOString(),
        })
        .eq("id", redemption.id);

    // Update ledger metadata to completed
    await supabase
        .from("point_ledger")
        .update({
            metadata: {
                ...metadata,
                status: "completed",
                batch_id: txId,
            },
        })
        .eq("reference_id", redemption.id)
        .eq("type", "redemption");

    // Fire Push
    const msg = `Your queued cashout of $${
        usdAmount.toFixed(2)
    } to ${payoutTarget} has been successfully processed!`;

    await supabase.from("notifications").insert({
        user_id: userId,
        content: msg,
        link_url: "/transaction-history",
    });

    await sendPushNotification(supabase, {
        userIds: [userId],
        title: "Cashout Complete 💸",
        body: msg,
        url: "/transaction-history",
    });
}
