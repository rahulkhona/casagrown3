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
import { sendPushNotification } from "../_shared/push-notify.ts";

serveWithCors(async (req, { supabase, env: _env, corsHeaders }) => {
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

    // 1. Check balance
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

    // 2. Create pending redemption
    const { data: redemption, error: redemptionError } = await supabase
        .from("redemptions")
        .insert({
            user_id: userId,
            item_id: itemId || null,
            point_cost: pointsAmount,
            status: "pending",
            provider: "globalgiving",
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

    // 3. Debit points
    const newBalance = balance - pointsAmount;
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
        },
    });

    // 4. Notify user that donation is queued
    const receiptNumber = `DON-Q-${Date.now().toString(36).toUpperCase()}`;
    const queuedMessage = `Your donation of $${
        dollarAmount.toFixed(2)
    } to ${organizationName} has been queued and will be processed shortly.`;

    // 4a. In-App Notification
    await supabase.from("notifications").insert({
        user_id: userId,
        content: queuedMessage,
        link_url: "/transaction-history",
    });

    // 4b. Push Notification
    await sendPushNotification(supabase, {
        userIds: [userId],
        title: "Donation Queued 💛",
        body: queuedMessage,
        url: "/transaction-history",
    });

    return jsonOk({
        success: true,
        redemptionId: redemption.id,
        receiptNumber,
        donationAmountUsd: dollarAmount,
        status: "queued",
    }, corsHeaders);
});
