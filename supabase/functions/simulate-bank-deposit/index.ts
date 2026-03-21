/**
 * simulate-bank-deposit — Supabase Edge Function (Staff-only)
 *
 * For alpha/staging testing: simulates a Stripe payout arriving.
 * Bypasses waiting for actual Stripe payout webhook by directly calling
 * confirm_settlement_funds_received() and recording a bank ledger inflow.
 *
 * Request: { settlement_id }
 * Response: { success, result }
 */

import {
    jsonOk,
    jsonError,
    requireAuth,
    serveWithCors,
} from "../_shared/serve-with-cors.ts";

serveWithCors(async (req, { supabase, env, corsHeaders }) => {
    const { settlement_id } = await req.json();
    if (!settlement_id) {
        return jsonError("settlement_id is required", corsHeaders);
    }

    // Authenticate + staff check
    const auth = await requireAuth(req, supabase, corsHeaders);
    if (auth instanceof Response) return auth;

    const { data: staffCheck } = await supabase.rpc("is_staff", {
        uid: auth,
    });
    if (!staffCheck) {
        return jsonError("Staff access required", corsHeaders, 403);
    }

    // Get settlement to check status and compute simulated payout amount
    const { data: settlement, error: settErr } = await supabase
        .from("market_settlements")
        .select("*")
        .eq("id", settlement_id)
        .single();

    if (settErr || !settlement) {
        return jsonError("Settlement not found", corsHeaders, 404);
    }

    if (settlement.status !== "funds_pending") {
        return jsonError(
            `Settlement is in '${settlement.status}' state, expected 'funds_pending'`,
            corsHeaders,
            400,
        );
    }

    // Simulate payout amount: total captured minus estimated Stripe fees
    const capturedUsd = settlement.total_captured_usd || 0;
    const { data: captureCount } = await supabase
        .from("settlement_captures")
        .select("id", { count: "exact" })
        .eq("settlement_id", settlement_id)
        .gt("capture_amount_usd", 0);

    const numCaptures = captureCount?.length || 0;
    const estimatedFees = (capturedUsd * 0.029) + (numCaptures * 0.30);
    const simulatedPayoutUsd = Math.round((capturedUsd - estimatedFees) * 100) / 100;

    // Record bank ledger inflow
    await supabase.rpc("append_bank_ledger_entry", {
        p_event_type: "stripe_payout_received",
        p_direction: "inflow",
        p_amount_usd: simulatedPayoutUsd,
        p_provider: "stripe",
        p_reference_type: "settlement",
        p_reference_id: settlement_id,
        p_settlement_id: settlement_id,
        p_metadata: {
            simulated: true,
            estimated_fees: estimatedFees,
            captures: numCaptures,
        },
    });

    // Record estimated Stripe fees as outflow
    if (estimatedFees > 0) {
        await supabase.rpc("append_bank_ledger_entry", {
            p_event_type: "stripe_fees",
            p_direction: "outflow",
            p_amount_usd: Math.round(estimatedFees * 100) / 100,
            p_provider: "stripe",
            p_reference_type: "settlement",
            p_reference_id: settlement_id,
            p_settlement_id: settlement_id,
            p_metadata: { simulated: true },
        });
    }

    // Call confirm_settlement_funds_received to clear the settlement
    const { data: result, error: confirmErr } = await supabase.rpc(
        "confirm_settlement_funds_received",
        {
            p_settlement_id: settlement_id,
            p_stripe_payout_id: `sim_${Date.now()}`,
            p_stripe_payout_amount_usd: simulatedPayoutUsd,
        },
    );

    if (confirmErr) {
        console.error("confirm_settlement_funds_received failed:", confirmErr);
        return jsonError(
            `Settlement confirmation failed: ${confirmErr.message}`,
            corsHeaders,
        );
    }

    // Run reconciliation check
    const { data: reconciliation } = await supabase.rpc(
        "reconcile_platform_balances",
    );

    console.log(
        `✅ [SIMULATE-DEPOSIT] Settlement ${settlement_id} cleared. ` +
        `Simulated payout: $${simulatedPayoutUsd.toFixed(2)} (fees: $${estimatedFees.toFixed(2)})`,
    );

    return jsonOk({
        success: true,
        settlement_id,
        simulated_payout_usd: simulatedPayoutUsd,
        estimated_fees_usd: estimatedFees,
        settlement_result: result,
        reconciliation,
    }, corsHeaders);
});
