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
import { orderFromTremendous } from "../_shared/tremendous.ts";
import { orderFromReloadly } from "../_shared/reloadly.ts";

// Note: To be secure, this endpoint should require a service_role key or an internal secret
// For now, we will just use a simple static API token check since it's an internal cron job.

serveWithCors(async (req, { supabase, env, corsHeaders }) => {
    // Basic auth check for cron jobs
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || authHeader !== `Bearer ${env("CRON_SECRET")}`) {
        return jsonError("Unauthorized", corsHeaders, 401);
    }

    // 1. Fetch redemptions that need retry
    const { data: queuedRedemptions, error: fetchError } = await supabase
        .from("redemptions")
        .select("*")
        .or("status.eq.failed,and(status.eq.pending,provider.eq.globalgiving)")
        .order("created_at", { ascending: true })
        .limit(20); // Process in batches to avoid edge function timeout

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
    const failures: { id: string; reason: string }[] = [];

    // Process each redemption
    for (const redemption of queuedRedemptions) {
        const { provider, metadata, user_id, point_cost } = redemption;

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
                await processGiftCard(supabase, env, redemption, "tremendous");
            } else if (provider === "reloadly") {
                await processGiftCard(supabase, env, redemption, "reloadly");
            } else {
                throw new Error(`Unknown provider for retry: ${provider}`);
            }

            processedCount++;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[RETRY] Failed processing ${redemption.id}: ${msg}`);
            failures.push({ id: redemption.id, reason: msg });
            // We intentionally do NOT update the status here.
            // It remains failed/pending to be picked up next time.
        }
    }

    return jsonOk({
        success: true,
        processed: processedCount,
        failed: failures.length,
        failures,
    }, corsHeaders);
});

// ============================================================================
// Gift Card Processing (Tremendous / Reloadly)
// ============================================================================
async function processGiftCard(
    supabase: any,
    env: any,
    redemption: any,
    provider: "tremendous" | "reloadly",
) {
    const { metadata } = redemption;
    const { brand_name, product_id, face_value_cents } = metadata;

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
            provider_order_id: providerResult.externalOrderId,
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
        userIds: [redemption.user_id],
        title: "Redemption Complete 🎉",
        body: msg,
        url: "/transaction-history",
    });
}

// ============================================================================
// GlobalGiving Processing
// ============================================================================
async function processGlobalGiving(
    supabase: any,
    env: any,
    redemption: any,
    userId: string,
    pointsAmount: number,
    metadata: any,
) {
    const { organization, project_title, theme } = metadata;
    const projectId = redemption.item_id;

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
        user_id: userId,
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
