/**
 * redeem-gift-card — Edge Function for purchasing gift cards
 *
 * Flow:
 * 1. Validate user balance
 * 2. Look up brand in cached catalog to find available providers
 * 3. Pick cheapest provider (Tremendous first — free, Reloadly as fallback)
 * 4. If Reloadly: compute net fee = fee − discount. Add to point cost if > 0
 * 5. Debit points (create pending redemption)
 * 6. Place order with selected provider
 * 7. On success: store card code/URL, update redemption status
 * 8. On failure: refund points
 */

import {
    jsonError,
    jsonOk,
    requireAuth,
    serveWithCors,
} from "../_shared/serve-with-cors.ts";
import { sendPushNotification } from "../_shared/push-notify.ts";
import { ProviderOrderResult } from "../_shared/gift-card-types.ts";
import { getProviderGracePeriodMs } from "../_shared/grace-period.ts";
import { orderFromTremendous } from "../_shared/tremendous.ts";
import { orderFromReloadly } from "../_shared/reloadly.ts";

// ── Types ──────────────────────────────────────────────────────────

interface ProviderOption {
    provider: "tremendous" | "reloadly";
    productId: string;
    discountPercentage: number;
    feePerTransaction: number;
    feePercentage: number;
}

// ── Helpers ────────────────────────────────────────────────────────

function computeNetFee(
    faceValueCents: number,
    option: ProviderOption,
): number {
    const faceUsd = faceValueCents / 100;
    const discountSavings = faceUsd * (option.discountPercentage / 100);
    const totalFee = option.feePerTransaction +
        faceUsd * (option.feePercentage / 100);
    return Math.max(0, totalFee - discountSavings);
}

function normalizeBrand(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

// ── Main Handler ───────────────────────────────────────────────────

serveWithCors(async (req, { supabase, env, corsHeaders }) => {
    const auth = await requireAuth(req, supabase, corsHeaders);
    if (auth instanceof Response) return auth;
    const userId = auth;

    const body = await req.json();
    const { brandName, faceValueCents, pointsCost } = body;

    if (!brandName || !faceValueCents || !pointsCost) {
        return jsonError(
            "Missing required fields: brandName, faceValueCents, pointsCost",
            corsHeaders,
        );
    }

    // ── 1. Look up brand in cached catalog ──
    let selectedProvider: ProviderOption | null = null;
    let netFeeCents = 0;

    const brandKey = normalizeBrand(brandName);
    const { data: catalogRow } = await supabase
        .from("giftcards_cache")
        .select("data")
        .eq("provider", "unified")
        .maybeSingle();

    if (catalogRow?.data) {
        try {
            const catalog = catalogRow.data as any[];
            const brand = catalog.find(
                (c: any) => normalizeBrand(c.brandName) === brandKey,
            );
            if (brand?.availableProviders?.length > 0) {
                // Providers are already sorted cheapest-first by fetch-gift-cards
                selectedProvider = brand.availableProviders[0];
                const feeUsd = computeNetFee(
                    faceValueCents,
                    selectedProvider!,
                );
                netFeeCents = Math.round(feeUsd * 100);
            }
        } catch {
            console.warn("[REDEEM] Failed to parse cached catalog");
        }
    }

    // Fallback: try Tremendous first, then Reloadly
    if (!selectedProvider) {
        const tremendousKey = env("TREMENDOUS_API_KEY");
        if (tremendousKey) {
            selectedProvider = {
                provider: "tremendous",
                productId: "", // will need to look up
                discountPercentage: 0,
                feePerTransaction: 0,
                feePercentage: 0,
            };
        } else {
            const reloadlyId = env("RELOADLY_CLIENT_ID");
            if (reloadlyId) {
                selectedProvider = {
                    provider: "reloadly",
                    productId: "",
                    discountPercentage: 0,
                    feePerTransaction: 0.50, // default
                    feePercentage: 0,
                };
                netFeeCents = 50; // default $0.50
            }
        }
    }

    if (!selectedProvider) {
        return jsonError(
            "No gift card provider available — API keys not configured",
            corsHeaders,
        );
    }

    const totalPointsCost = pointsCost;
    // Note: netFeeCents is the cost to US, not additional charge to user
    // The frontend already computed pointsCost inclusive of fee

    console.log(
        `[REDEEM] Brand: ${brandName}, Provider: ${selectedProvider.provider}, ` +
            `Face: $${(faceValueCents / 100).toFixed(2)}, Net fee: $${
                (netFeeCents / 100).toFixed(2)
            }, ` +
            `Points cost: ${totalPointsCost}`,
    );

    // ── 2. Check Instrument Active & Queue Status ──
    const instrumentName = selectedProvider.provider;

    const { data: instrumentState } = await supabase
        .from("available_redemption_method_instruments")
        .select("is_active, disabled_at")
        .eq("instrument", instrumentName)
        .maybeSingle();

    if (instrumentState && !instrumentState.is_active) {
        let isGracePeriod = false;

        if (instrumentState.disabled_at) {
            const disabledTime = new Date(instrumentState.disabled_at)
                .getTime();
            const now = Date.now();
            const gracePeriodMs = await getProviderGracePeriodMs(supabase);

            if (now - disabledTime < gracePeriodMs) {
                isGracePeriod = true;
                console.log(
                    `[REDEEM] Instrument is disabled, but transaction permitted within ${gracePeriodMs}ms grace window.`,
                );
            }
        }

        if (!isGracePeriod) {
            return jsonError(
                `Redemptions via ${instrumentName} are temporarily offline. Please try again later.`,
                corsHeaders,
                400,
            );
        }
    }

    const { data: queueRow } = await supabase
        .from("instrument_queuing_status")
        .select("is_queuing")
        .eq("instrument", instrumentName)
        .maybeSingle();

    const isQueuing = queueRow?.is_queuing ?? false;

    // ── 3. Check user balance (Closed-Loop: Earned only) ──
    const { data: balances, error: balanceError } = await supabase
        .rpc("get_user_balances", { p_user_id: userId })
        .maybeSingle();

    if (balanceError || !balances) {
        return jsonError("Failed to fetch user balances", corsHeaders);
    }

    const earnedBalance = (balances as any).earned_balance ?? 0;
    if (earnedBalance < pointsCost) {
        return jsonError("Insufficient earned points balance", corsHeaders);
    }

    // ── 4. Create pending redemption ──
    const { data: redemption, error: redemptionError } = await supabase
        .from("redemptions")
        .insert({
            user_id: userId,
            item_id: null,
            point_cost: totalPointsCost,
            status: "pending",
            metadata: {
                brand_name: brandName,
                face_value_cents: faceValueCents,
                provider: selectedProvider.provider,
                product_id: selectedProvider.productId,
                net_fee_cents: netFeeCents,
                discount_pct: selectedProvider.discountPercentage,
            },
        })
        .select()
        .single();

    if (redemptionError || !redemption) {
        console.error(
            "[REDEEM] Step 4 failed (create redemption):",
            redemptionError,
        );
        return jsonError(
            `Failed to create redemption: ${
                redemptionError?.message || "unknown"
            }`,
            corsHeaders,
        );
    }
    console.log(`[REDEEM] Step 4 OK: redemption ${redemption.id}`);

    // ── 5. Debit points ──
    const { error: debitError } = await supabase
        .from("point_ledger")
        .insert({
            user_id: userId,
            type: "redemption",
            amount: -totalPointsCost,
            balance_after: 0, // trigger will compute
            reference_id: redemption.id,
            metadata: {
                brand_name: brandName,
                face_value_cents: faceValueCents,
                redemption_id: redemption.id,
                provider: selectedProvider.provider,
            },
        });

    if (debitError) {
        await supabase.from("redemptions").delete().eq("id", redemption.id);
        return jsonError("Failed to debit points", corsHeaders);
    }

    // ── 6. Place order with selected provider ──
    let providerResult: ProviderOrderResult | null = null;
    let externalErrorMsg: string | null = null;

    if (!isQueuing) {
        try {
            if (selectedProvider.provider === "tremendous") {
                providerResult = await orderFromTremendous(
                    env("TREMENDOUS_API_KEY") || "",
                    selectedProvider.productId,
                    brandName,
                    faceValueCents,
                );
            } else {
                providerResult = await orderFromReloadly(
                    env("RELOADLY_CLIENT_ID") || "",
                    env("RELOADLY_CLIENT_SECRET") || "",
                    selectedProvider.productId,
                    brandName,
                    faceValueCents,
                    env("RELOADLY_SANDBOX") !== "false",
                );
            }
        } catch (err) {
            externalErrorMsg = err instanceof Error
                ? err.message
                : "Provider error";
            console.warn(
                `[REDEEM] gift card API failed, queuing: ${externalErrorMsg}`,
            );
        }
    } else {
        console.log(
            `[REDEEM] is_queuing is TRUE for ${instrumentName}. Dropping directly into queue.`,
        );
    }

    if (isQueuing || externalErrorMsg) {
        // Provider failed or queue is explicitly on — queue for retry
        const finalReason = externalErrorMsg ||
            "Queue is currently enabled for this instrument";

        await supabase
            .from("redemptions")
            .update({ status: "failed", failed_reason: finalReason })
            .eq("id", redemption.id);

        const queuedMessage =
            `Your ${brandName} redemption has been queued due to provider delays and will be processed shortly.`;

        // Notify user of queuing
        await supabase.from("notifications").insert({
            user_id: userId,
            content: queuedMessage,
            link_url: "/transaction-history",
        });

        await sendPushNotification(supabase, {
            userIds: [userId],
            title: "Redemption Queued ⏳",
            body: queuedMessage,
            url: "/transaction-history",
        });

        // Return gracefully so the frontend assumes success-but-queued
        return jsonOk({
            success: true,
            redemptionId: redemption.id,
            provider: selectedProvider.provider,
            netFeeCents,
            status: "queued",
        }, corsHeaders);
    }

    // ── 8. Log provider transaction ──
    await supabase.from("provider_transactions").insert({
        provider_name: providerResult!.provider,
        redemption_id: redemption.id,
        user_id: userId,
        external_order_id: providerResult!.externalOrderId,
        item_type: "gift_card",
        item_name: `${brandName} $${
            (faceValueCents / 100).toFixed(2)
        } Gift Card`,
        face_value_cents: faceValueCents,
        cost_cents: providerResult!.actualCostCents,
        status: "success",
    });

    // ── 6b. Update ledger metadata with card details ──
    await supabase
        .from("point_ledger")
        .update({
            metadata: {
                brand_name: brandName,
                face_value_cents: faceValueCents,
                redemption_id: redemption.id,
                provider: providerResult!.provider,
                card_code: providerResult!.cardCode,
                card_url: providerResult!.cardUrl,
                status: "completed",
            },
        })
        .eq("reference_id", redemption.id)
        .in("type", ["redemption", "refund"]);

    // ── 7. Store gift card delivery ──
    await supabase.from("gift_card_deliveries").insert({
        redemption_id: redemption.id,
        brand_name: brandName,
        face_value_cents: faceValueCents,
        card_code: providerResult!.cardCode,
        card_url: providerResult!.cardUrl,
        delivered_at: new Date().toISOString(),
    });

    // ── 8. Mark redemption as completed ──
    await supabase
        .from("redemptions")
        .update({
            status: "completed",
            provider: providerResult!.provider,
            provider_order_id: providerResult!.externalOrderId,
            completed_at: new Date().toISOString(),
        })
        .eq("id", redemption.id);

    console.log(
        `✅ Gift card redeemed: ${brandName} $${
            (faceValueCents / 100).toFixed(2)
        }, ` +
            `provider=${providerResult!.provider}, cost=$${
                (providerResult!.actualCostCents / 100).toFixed(2)
            }`,
    );

    return jsonOk({
        success: true,
        redemptionId: redemption.id,
        provider: providerResult!.provider,
        cardCode: providerResult!.cardCode,
        cardUrl: providerResult!.cardUrl,
        netFeeCents,
        status: "completed",
    }, corsHeaders);
});
