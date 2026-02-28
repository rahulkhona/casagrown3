import {
    jsonError,
    jsonOk,
    requireAuth,
    serveWithCors,
} from "../_shared/serve-with-cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * refund-purchased-points — Supabase Edge Function
 *
 * Flow:
 * 1. Read specific `purchased_points_buckets` id requested for refund.
 * 2. Hit Stripe refunds API for that underlying Payment Intent.
 * 3. On success, mark bucket as refunded, deduct points from point_ledger.
 * 4. Fallback: If Stripe returns `charge_expired` (>180 days), offer E-Gift Card or Physical Check
 *    with Stripe Identity Verification routing and restocking fee deductions.
 */

serveWithCors(async (req, { supabase, env, corsHeaders }) => {
    const auth = await requireAuth(req, supabase, corsHeaders);
    if (auth instanceof Response) return auth;
    const userId = auth;

    const supabaseAdmin = createClient(
        env("SUPABASE_URL", true) || Deno.env.get("SUPABASE_URL")!,
        env("SUPABASE_SERVICE_ROLE_KEY", true) ||
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();
    const {
        bucketId,
        amountCents,
        fallbackChoice,
        brand_name,
        product_id,
        face_value_cents,
    } = body;

    if (!bucketId) {
        return jsonError("bucketId is required", corsHeaders);
    }

    // 1. Fetch Bucket
    const { data: bucket, error: bucketError } = await supabase
        .from("purchased_points_buckets")
        .select(
            `*, payment_transactions ( stripe_payment_intent_id, service_fee_cents )`,
        )
        .eq("id", bucketId)
        .eq("user_id", userId)
        .in("status", ["active", "partially_refunded"])
        .single();

    if (bucketError || !bucket) {
        return jsonError("Invalid or depleted bucket", corsHeaders);
    }

    const refundAmountCents = amountCents || bucket.remaining_amount;
    if (refundAmountCents > bucket.remaining_amount) {
        return jsonError(
            "Refund amount exceeds remaining bucket balance",
            corsHeaders,
        );
    }

    const stripeId = bucket.payment_transactions?.stripe_payment_intent_id;

    // Age calculation
    const MS_PER_DAY = 1000 * 60 * 60 * 24;
    const bucketCreatedAt = new Date(
        bucket.payment_transactions?.created_at || bucket.created_at,
    ).getTime();
    const ageDays = (Date.now() - bucketCreatedAt) / MS_PER_DAY;
    const isExpired = ageDays > 120;

    // Fetch user profile and location
    // Note: Deno Edge Supabase types might complain about selecting unknown columns without strictly typing it.
    // Assuming profiles table has `email`, `country_code`, and `state`.
    const { data: profile } = await supabase.from("profiles").select("*").eq(
        "id",
        userId,
    ).single();
    const userEmail = profile?.email || "user@example.com";
    const countryIso3 = profile?.country_code || "USA";

    // Fetch state minimum threshold
    const userStateCode = body.stateCode || "DEFAULT";
    let stateMinimumCents = 0;

    if (countryIso3) {
        const { data: thresholdData } = await supabase
            .from("small_balance_refund_thresholds")
            .select("threshold_cents")
            .eq("country_iso_3", countryIso3)
            .eq("state_code", userStateCode)
            .maybeSingle();
        if (thresholdData) stateMinimumCents = thresholdData.threshold_cents;
        else stateMinimumCents = 500; // Match UI default
    } else {
        stateMinimumCents = 500;
    }

    const isSmallBalance = refundAmountCents < stateMinimumCents;

    // Validate requested fallback choice against the rule matrix
    if (!fallbackChoice || fallbackChoice === "card") {
        if (isExpired) {
            return jsonError(
                "Stripe refund window expired (120 days). Please select a fallback method.",
                corsHeaders,
                400,
            );
        }

        // Try automated Stripe refund
        if (!stripeId || stripeId.startsWith("mock_")) {
            await processDatabaseRefund(
                supabaseAdmin,
                bucket,
                refundAmountCents,
                userId,
                false,
                { refund_method: "Refunded to mock test card" },
            );
            return jsonOk({
                success: true,
                message: "Mock card refund processed",
            }, corsHeaders);
        }

        const STRIPE_SECRET = env("STRIPE_SECRET_KEY");
        if (!STRIPE_SECRET) {
            return jsonError("STRIPE_SECRET_KEY not configured", corsHeaders);
        }

        // --- Calculate Dynamic Restocking Fee to deduct from Stripe Refund ---
        const userPaidStripeFee =
            (bucket.payment_transactions?.service_fee_cents || 0) > 0;
        let finalRefundCents = refundAmountCents;

        if (!userPaidStripeFee) {
            const { data: feeData } = await supabase.from("country_refund_fees")
                .select("*").eq("country_iso_3", countryIso3).maybeSingle();

            if (feeData) {
                const calculatedRestockingFee = Math.round(
                    (refundAmountCents *
                        (feeData.transaction_fee_percent / 100)) +
                        feeData.transaction_fee_fixed_cents,
                );

                // Apply Waiver Rule
                if (calculatedRestockingFee >= refundAmountCents) {
                    // Fee waived
                    finalRefundCents = refundAmountCents;
                } else {
                    finalRefundCents = refundAmountCents -
                        calculatedRestockingFee;
                }
            }
        }

        const refundRes = await fetch("https://api.stripe.com/v1/refunds", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${STRIPE_SECRET}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
                payment_intent: stripeId,
                amount: finalRefundCents.toString(),
            }),
        });

        const refundData = await refundRes.json();
        if (refundRes.ok) {
            await processDatabaseRefund(
                supabaseAdmin,
                bucket,
                refundAmountCents, // Burn original full points amount
                userId,
                false,
                {
                    refund_method: `Refunded to card ending in ${
                        bucket.payment_transactions?.metadata?.last4 || "..."
                    }`,
                },
            );
            return jsonOk({
                success: true,
                message: "Refund processed successfully via Stripe",
                fee_deducted: refundAmountCents - finalRefundCents,
            }, corsHeaders);
        } else if (
            refundData.error?.code === "charge_expired" ||
            refundData.error?.message?.includes("expired")
        ) {
            return jsonError(
                "Stripe refund window strictly expired. Please select a fallback method.",
                corsHeaders,
                400,
            );
        }

        return jsonError(
            `Stripe refund failed: ${refundData.error?.message}`,
            corsHeaders,
        );
    }

    // Fallback Choices Processing
    if (fallbackChoice === "venmo") {
        const targetPhoneNumber = body.targetPhoneNumber || userEmail;

        if (!isSmallBalance && !isExpired) {
            return jsonError(
                "Venmo bypass is only available for small balances under the state minimum or expired payments.",
                corsHeaders,
                400,
            );
        }

        const { error: redemptionError, data: redemptionData } =
            await supabaseAdmin.from(
                "redemptions",
            ).insert({
                user_id: userId,
                item_id: null,
                point_cost: refundAmountCents, // Log amount as points equivalent
                status: "pending",
                metadata: {
                    type: "venmo_refund",
                    target_phone: targetPhoneNumber,
                    usd_amount: refundAmountCents / 100,
                    bucket_ids: [bucket.id],
                },
            }).select();

        console.log(
            "[DEBUG VENMO INSERT P1] Data:",
            JSON.stringify(redemptionData),
        );
        if (redemptionError) {
            console.error(
                "[CRITICAL VENMO INSERT ERROR]:",
                JSON.stringify(redemptionError),
            );
            return jsonError(
                "Internal error queuing Venmo refund: " +
                    redemptionError.message,
                corsHeaders,
                500,
            );
        }

        await processDatabaseRefund(
            supabaseAdmin,
            bucket,
            refundAmountCents,
            userId,
            true,
            { refund_method: `Venmo to ${targetPhoneNumber}` },
        );
        return jsonOk({
            success: true,
            fallback: "venmo",
            message: "Venmo cashout manually queued.",
        }, corsHeaders);
    }

    if (fallbackChoice === "egift_card") {
        if (!isExpired && !isSmallBalance) {
            return jsonError(
                "E-Gift Cards are only offered for expired balances or small state minimum balances.",
                corsHeaders,
                400,
            );
        }

        const { error: redemptionError } = await supabaseAdmin.from(
            "redemptions",
        ).insert({
            user_id: userId,
            item_id: null,
            point_cost: refundAmountCents,
            status: "pending",
            metadata: {
                type: "egift_card_refund",
                usd_amount: refundAmountCents / 100,
                target_email: userEmail,
                bucket_ids: [bucket.id],
                brand_name: brand_name || "Gift Card",
                product_id: product_id || "unknown",
                face_value_cents: face_value_cents || refundAmountCents,
            },
        });

        if (redemptionError) {
            console.error(
                "E-Gift Card redemption insert failed",
                redemptionError,
            );
            return jsonError(
                "Internal error queuing E-Gift Card refund",
                corsHeaders,
                500,
            );
        }

        await processDatabaseRefund(
            supabaseAdmin,
            bucket,
            refundAmountCents,
            userId,
            true,
            { refund_method: `Transferred to E-Gift Card` },
        );
        return jsonOk({
            success: true,
            fallback: "egift_card",
            message: "E-Gift Card queued.",
        }, corsHeaders);
    }

    return jsonError("Invalid fallbackChoice provided.", corsHeaders, 400);
});

async function processDatabaseRefund(
    supabase: any,
    bucket: any,
    amountCents: number,
    userId: string,
    isFallback = false,
    extraMetadata: any = {},
) {
    // 1. Force the ledger point burn to remove liability
    await supabase.from("point_ledger").insert({
        user_id: userId,
        type: "refund",
        amount: -amountCents,
        balance_after: 0,
        reference_id: bucket.payment_transaction_id,
        metadata: {
            bucket_id: bucket.id,
            is_fallback: isFallback,
            card_last4: bucket.payment_transactions?.metadata?.last4,
            card_brand: bucket.payment_transactions?.metadata?.brand,
            ...extraMetadata,
        },
    });

    // 2. Mark bucket as exhausted
    const newRemaining = bucket.remaining_amount - amountCents;
    await supabase.from("purchased_points_buckets")
        .update({
            remaining_amount: newRemaining,
            status: newRemaining === 0 ? "refunded" : "partially_refunded",
            updated_at: new Date().toISOString(),
        })
        .eq("id", bucket.id);
}
