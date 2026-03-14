/**
 * market-hold — Supabase Edge Function
 *
 * Creates or tops up a Stripe PaymentIntent with capture_method: 'manual'
 * for the market buy flow (authorize-then-capture).
 *
 * Flow:
 *   1. Check if buyer has an active hold (market_holds.status = 'active')
 *   2. If yes: cancel old PI, create new PI with old_hold + new_amount (top-up)
 *   3. If no: create new PI with amount (or buyer's suggested higher amount)
 *   4. Record/update market_holds row
 *   5. Link order to hold
 *
 * Request: { order_id, amount_cents, suggested_hold_cents? }
 * Response: { clientSecret, holdId, holdAmountCents, isTopUp }
 */

import {
    jsonOk,
    jsonError,
    requireAuth,
    serveWithCors,
} from "../_shared/serve-with-cors.ts";

serveWithCors(async (req, { supabase, env, corsHeaders }) => {
    const STRIPE_SECRET_KEY = env("STRIPE_SECRET_KEY");
    if (!STRIPE_SECRET_KEY) {
        return jsonError("STRIPE_SECRET_KEY not configured", corsHeaders);
    }

    const { order_id, amount_cents, suggested_hold_cents } = await req.json();

    if (!order_id || !amount_cents) {
        return jsonError("order_id and amount_cents are required", corsHeaders);
    }

    // Authenticate
    const auth = await requireAuth(req, supabase, corsHeaders);
    if (auth instanceof Response) return auth;
    const buyerId = auth;

    // Verify order belongs to buyer
    const { data: order, error: orderErr } = await supabase
        .from("market_orders")
        .select("id, total_usd, status")
        .eq("id", order_id)
        .eq("buyer_id", buyerId)
        .single();

    if (orderErr || !order) {
        return jsonError("Order not found", corsHeaders);
    }

    // Check for existing active hold
    const { data: existingHold } = await supabase
        .from("market_holds")
        .select("*")
        .eq("buyer_id", buyerId)
        .eq("status", "active")
        .single();

    let holdAmountCents: number;
    let isTopUp = false;

    if (existingHold) {
        // Top-up: cancel old PI, create new with old_hold + new_amount
        isTopUp = true;
        const newSpent = existingHold.spent_amount_cents + amount_cents;
        // Hold amount is the max of: new spent total, or buyer's suggested amount
        holdAmountCents = Math.max(
            newSpent,
            suggested_hold_cents || 0,
            existingHold.hold_amount_cents, // don't reduce the hold
        );

        // Cancel old Stripe PI
        await fetch(
            `https://api.stripe.com/v1/payment_intents/${existingHold.stripe_payment_intent_id}/cancel`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            },
        );

        // Create new PI with larger amount
        const piResponse = await fetch(
            "https://api.stripe.com/v1/payment_intents",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({
                    amount: String(holdAmountCents),
                    currency: "usd",
                    capture_method: "manual",
                    "metadata[user_id]": buyerId,
                    "metadata[type]": "market_hold",
                    "metadata[order_ids]": order_id,
                    description: `CasaGrown Market Hold — $${(holdAmountCents / 100).toFixed(2)}`,
                }),
            },
        );

        if (!piResponse.ok) {
            const error = await piResponse.json();
            console.error("Stripe PI create error:", error);
            return jsonError(
                error?.error?.message || "Failed to create payment hold",
                corsHeaders,
            );
        }

        const piData = await piResponse.json();

        // Update existing hold record
        const { error: updateErr } = await supabase
            .from("market_holds")
            .update({
                stripe_payment_intent_id: piData.id,
                stripe_client_secret: piData.client_secret,
                hold_amount_cents: holdAmountCents,
                spent_amount_cents: newSpent,
                updated_at: new Date().toISOString(),
            })
            .eq("id", existingHold.id);

        if (updateErr) {
            console.error("Failed to update hold:", updateErr);
            return jsonError("Failed to update hold record", corsHeaders);
        }

        // Link order to hold
        await supabase
            .from("market_orders")
            .update({ hold_id: existingHold.id })
            .eq("id", order_id);

        console.log(
            `✅ [MARKET-HOLD] Top-up: hold ${existingHold.id}, new PI: ${piData.id}, ` +
            `amount: $${(holdAmountCents / 100).toFixed(2)}, spent: $${(newSpent / 100).toFixed(2)}`,
        );

        return jsonOk({
            clientSecret: piData.client_secret,
            holdId: existingHold.id,
            holdAmountCents,
            spentAmountCents: newSpent,
            isTopUp: true,
            requiresCardEntry: true, // New PI needs card confirmation
        }, corsHeaders);
    }

    // No existing hold — create fresh
    holdAmountCents = Math.max(amount_cents, suggested_hold_cents || 0);

    const piResponse = await fetch(
        "https://api.stripe.com/v1/payment_intents",
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
                amount: String(holdAmountCents),
                currency: "usd",
                capture_method: "manual",
                "metadata[user_id]": buyerId,
                "metadata[type]": "market_hold",
                "metadata[order_ids]": order_id,
                description: `CasaGrown Market Hold — $${(holdAmountCents / 100).toFixed(2)}`,
            }),
        },
    );

    if (!piResponse.ok) {
        const error = await piResponse.json();
        console.error("Stripe PI create error:", error);
        return jsonError(
            error?.error?.message || "Failed to create payment hold",
            corsHeaders,
        );
    }

    const piData = await piResponse.json();

    // Create hold record
    const { data: hold, error: holdErr } = await supabase
        .from("market_holds")
        .insert({
            buyer_id: buyerId,
            stripe_payment_intent_id: piData.id,
            stripe_client_secret: piData.client_secret,
            hold_amount_cents: holdAmountCents,
            spent_amount_cents: amount_cents,
            status: "active",
        })
        .select("id")
        .single();

    if (holdErr) {
        console.error("Failed to create hold:", holdErr);
        return jsonError("Failed to record hold", corsHeaders);
    }

    // Link order to hold
    await supabase
        .from("market_orders")
        .update({ hold_id: hold.id })
        .eq("id", order_id);

    console.log(
        `✅ [MARKET-HOLD] New hold: ${hold.id}, PI: ${piData.id}, ` +
        `amount: $${(holdAmountCents / 100).toFixed(2)}`,
    );

    return jsonOk({
        clientSecret: piData.client_secret,
        holdId: hold.id,
        holdAmountCents,
        spentAmountCents: amount_cents,
        isTopUp: false,
        requiresCardEntry: true,
    }, corsHeaders);
});
