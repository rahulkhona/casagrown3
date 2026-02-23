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

serveWithCors(async (req, { supabase, env, corsHeaders }) => {
    const auth = await requireAuth(req, supabase, corsHeaders);
    if (auth instanceof Response) return auth;
    const userId = auth;

    const body = await req.json();
    const {
        projectId,
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
    const donationCents = Math.round(dollarAmount * 100);

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

    // 4. Call GlobalGiving API
    // ⚠️ GlobalGiving has NO sandbox — GLOBALGIVING_SANDBOX=true forces simulation
    let externalOrderId = "";
    const ggApiKey = env("GLOBALGIVING_API_KEY");
    const isSandbox = env("GLOBALGIVING_SANDBOX") === "true";

    try {
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
                throw new Error(
                    `GlobalGiving API error: ${await response.text()}`,
                );
            }

            const data = await response.json();
            externalOrderId = data.donationId || data.id || "";
        } else {
            // Sandbox mode or no API key — simulate success
            externalOrderId = `GG-SIM-${Date.now()}`;
            console.log(
                `🧪 [SANDBOX] Simulated GlobalGiving donation: $${dollarAmount} to "${organizationName}"`,
            );
        }
    } catch (err) {
        // Refund on failure
        const errorMsg = err instanceof Error ? err.message : "Donation failed";

        await supabase.from("point_ledger").insert({
            user_id: userId,
            type: "refund",
            amount: pointsAmount,
            balance_after: balance, // Restore original balance
            reference_id: redemption.id,
            metadata: { reason: "Donation failed", error: errorMsg },
        });

        await supabase
            .from("redemptions")
            .update({ status: "failed", failed_reason: errorMsg })
            .eq("id", redemption.id);

        return jsonError(`Donation failed: ${errorMsg}`, corsHeaders);
    }

    // 5. Log provider transaction
    await supabase.from("provider_transactions").insert({
        provider_name: "globalgiving",
        redemption_id: redemption.id,
        user_id: userId,
        external_order_id: externalOrderId,
        item_type: "donation",
        item_name: `Donation to ${organizationName}`,
        face_value_cents: donationCents,
        cost_cents: donationCents,
        status: "success",
    });

    // 6. Store donation receipt
    const receiptNumber = `DON-${Date.now().toString(36).toUpperCase()}`;
    const receiptUrl = `https://casagrown.com/receipts/${receiptNumber}`;

    await supabase.from("donation_receipts").insert({
        redemption_id: redemption.id,
        organization_name: organizationName,
        project_title: projectTitle,
        theme: theme,
        donation_amount_cents: donationCents,
        points_spent: pointsAmount,
        receipt_url: receiptUrl,
        receipt_number: receiptNumber,
        tax_deductible: true,
    });

    // 7. Mark completed
    await supabase
        .from("redemptions")
        .update({
            status: "completed",
            provider: "globalgiving",
            provider_order_id: externalOrderId,
            completed_at: new Date().toISOString(),
        })
        .eq("id", redemption.id);

    return jsonOk({
        success: true,
        redemptionId: redemption.id,
        receiptNumber,
        receiptUrl,
        donationAmountUsd: dollarAmount,
    }, corsHeaders);
});
