/**
 * donate-points — Edge Function for donating points to GlobalGiving projects
 *
 * Flow:
 * 1. Validate user balance
 * 2. Debit points
 * 3. Call GlobalGiving Donation API
 * 4. Store donation receipt
 * 5. On failure: refund points
 */

import {
    jsonError,
    jsonOk,
    requireAuth,
    serveWithCors,
} from "../_shared/serve-with-cors.ts";
import { getProviderGracePeriodMs } from "../_shared/grace-period.ts";
import { sendPushNotification } from "../_shared/push-notify.ts";

serveWithCors(async (req, { supabase, env, corsHeaders }) => {
    const auth = await requireAuth(req, supabase, corsHeaders);
    if (auth instanceof Response) return auth;
    const userId = auth;

    const body = await req.json();
    const {
        projectId: _projectId,
        projectTitle,
        organizationName,
        theme,
        pointsAmount,
        itemId,
    } = body;

    if (!organizationName || !pointsAmount || pointsAmount <= 0) {
        return jsonError(
            "Missing required fields: organizationName, pointsAmount",
            corsHeaders,
        );
    }

    const POINTS_PER_DOLLAR = 100;
    const dollarAmount = pointsAmount / POINTS_PER_DOLLAR;
    const _donationCents = Math.round(dollarAmount * 100);

    // 1. Check Provider Queue Status
    const { data: queueStatus } = await supabase
        .from("provider_queue_status")
        .select("is_queuing, is_active, disabled_at")
        .eq("provider", "globalgiving")
        .single();

    if (queueStatus && !queueStatus.is_active) {
        let isGracePeriod = false;

        if (queueStatus.disabled_at) {
            const disabledTime = new Date(queueStatus.disabled_at).getTime();
            const now = Date.now();
            const gracePeriodMs = await getProviderGracePeriodMs(supabase);

            if (now - disabledTime < gracePeriodMs) {
                isGracePeriod = true;
                console.log(
                    `[DONATE] Provider is disabled, but transaction permitted within ${gracePeriodMs}ms grace window.`,
                );
            }
        }

        if (!isGracePeriod) {
            return jsonError(
                "Donations via GlobalGiving are temporarily offline. Please try again later.",
                corsHeaders,
                400,
            );
        }
    }

    const isQueuing = queueStatus?.is_queuing ?? false;
    const isSandbox = env("GLOBALGIVING_SANDBOX") === "true";

    // 2. Check balance
    const { data: ledgerEntry } = await supabase
        .from("point_ledger")
        .select("balance_after")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    const balance = ledgerEntry?.balance_after ?? 0;
    if (balance < pointsAmount) {
        return jsonError("Insufficient points balance", corsHeaders);
    }

    // 3. Deduction
    const newBalance = balance - pointsAmount;

    let externalOrderId = "";
    let finalStatus = "pending";

    // 4. Try Live Fulfillment
    if (!isQueuing && !isSandbox && env("GLOBALGIVING_API_KEY") && itemId) {
        try {
            const response = await fetch(
                `https://api.globalgiving.org/api/public/projects/${itemId}/donate?api_key=${
                    env("GLOBALGIVING_API_KEY")
                }`,
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
                // e.g. Braintree failure or Insufficient Funds
                const errText = await response.text();
                throw new Error(errText);
            }

            const data = await response.json();
            externalOrderId = data.donationId || data.id || "";
            finalStatus = "completed";
        } catch (err) {
            console.error(
                "[DONATE] GlobalGiving API failed. Tripping Breaker.",
                err,
            );
            finalStatus = "pending";

            // Trip the breaker
            await supabase
                .from("provider_queue_status")
                .update({ is_queuing: true })
                .eq("provider", "globalgiving");
        }
    }

    // 5. Create redemption
    const { data: redemption, error: redemptionError } = await supabase
        .from("redemptions")
        .insert({
            user_id: userId,
            item_id: itemId || null,
            point_cost: pointsAmount,
            status: finalStatus,
            provider_order_id: externalOrderId || null,
            provider: "globalgiving",
            completed_at: finalStatus === "completed"
                ? new Date().toISOString()
                : null,
            metadata: {
                organization: organizationName,
                project_title: projectTitle,
                theme,
            },
        })
        .select()
        .single();

    if (redemptionError || !redemption) {
        return jsonError("Failed to create redemption", corsHeaders);
    }

    // 6. Debit points
    const receiptNumber = finalStatus === "completed"
        ? `DON-${Date.now().toString(36).toUpperCase()}`
        : `DON-Q-${Date.now().toString(36).toUpperCase()}`;

    const receiptUrl = finalStatus === "completed"
        ? `https://casagrown.com/receipts/${receiptNumber}`
        : undefined;

    await supabase.from("point_ledger").insert({
        user_id: userId,
        type: "donation",
        amount: -pointsAmount,
        balance_after: newBalance,
        reference_id: redemption.id,
        metadata: {
            organization: organizationName,
            project_title: projectTitle,
            theme: theme,
            redemption_id: redemption.id,
            receipt_number: receiptNumber,
            status: finalStatus,
        },
    });

    if (finalStatus === "completed") {
        // Log provider transaction and donation receipt natively
        await supabase.from("provider_transactions").insert({
            provider_name: "globalgiving",
            redemption_id: redemption.id,
            user_id: userId,
            external_order_id: externalOrderId,
            item_type: "donation",
            item_name: `Donation to ${organizationName}`,
            face_value_cents: Math.round(dollarAmount * 100),
            cost_cents: Math.round(dollarAmount * 100),
            status: "success",
        });

        await supabase.from("donation_receipts").insert({
            redemption_id: redemption.id,
            organization_name: organizationName,
            project_title: projectTitle,
            theme: theme,
            donation_amount_cents: Math.round(dollarAmount * 100),
            points_spent: pointsAmount,
            receipt_url: receiptUrl,
            receipt_number: receiptNumber,
            tax_deductible: true,
        });

        const successMessage = `Your donation of $${
            dollarAmount.toFixed(2)
        } to ${organizationName} has been successfully processed!`;
        await supabase.from("notifications").insert({
            user_id: userId,
            content: successMessage,
            link_url: "/transaction-history",
        });

        await sendPushNotification(supabase, {
            userIds: [userId],
            title: "Donation Complete 💛",
            body: successMessage,
            url: "/transaction-history",
        });
    } else {
        // Queue state
        const queuedMessage = `Your donation of $${
            dollarAmount.toFixed(2)
        } to ${organizationName} has been queued and will be processed shortly.`;

        await supabase.from("notifications").insert({
            user_id: userId,
            content: queuedMessage,
            link_url: "/transaction-history",
        });

        await sendPushNotification(supabase, {
            userIds: [userId],
            title: "Donation Queued 💛",
            body: queuedMessage,
            url: "/transaction-history",
        });
    }

    return jsonOk({
        success: true,
        redemptionId: redemption.id,
        receiptNumber,
        donationAmountUsd: dollarAmount,
        status: finalStatus === "completed" ? "completed" : "queued",
    }, corsHeaders);
});
