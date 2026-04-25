/**
 * market-purchase-gift-card - Edge Function for purchasing gift cards with market earnings
 *
 * Flow:
 * 1. Validate user's available market balance
 * 2. Look up brand in cached catalog to find available providers
 * 3. Pick cheapest provider (Tremendous first - free, Reloadly as fallback)
 * 4. If Reloadly: compute net fee = fee − discount. Add to cost if > 0
 * 5. Atomically debit market balance via debit_market_balance RPC
 * 6. Place order with selected provider
 * 7. On success: store card code/URL, update redemption status
 * 8. On failure: queue for retry
 */

import {
  jsonError,
  jsonOk,
  requireAuth,
  serveWithCors,
} from "../_shared/serve-with-cors.ts";
import { sendPushNotification } from "../_shared/push-notify.ts";
import {
  computeNetFee,
  ProviderOption,
  ProviderOrderResult,
} from "../_shared/gift-card-types.ts";
import { getProviderGracePeriodMs } from "../_shared/grace-period.ts";
import { orderFromTremendous } from "../_shared/tremendous.ts";
import { orderFromReloadly } from "../_shared/reloadly.ts";
import { pickBestProvider } from "../_shared/pick-best-provider.ts";
import { sendTransactionEmail, getUserEmail } from "../_shared/postmark.ts";
import { buildPayoutEmail } from "../_shared/payout-email.ts";

// ── Types (ProviderOption and computeNetFee imported from shared) ──

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
    .eq("status", "active")
    .maybeSingle();

  let cachedProviders: ProviderOption[] = [];

  if (catalogRow?.data) {
    try {
      const catalog = catalogRow.data as any[];
      const brand = catalog.find((c: any) =>
        normalizeBrand(c.brandName) === brandKey
      );
      if (brand?.availableProviders?.length > 0) {
        cachedProviders = brand.availableProviders;
      }
    } catch {
      console.warn("[REDEEM] Failed to parse cached catalog");
    }
  }

  // ── 1b. Real-time provider comparison (single-product lookups) ──
  if (cachedProviders.length > 0) {
    try {
      const best = await pickBestProvider(
        faceValueCents,
        cachedProviders,
        env,
      );
      selectedProvider = best.provider;
      netFeeCents = best.netFeeCents;
      console.log(
        `[REDEEM] Provider: ${best.provider.provider} (${best.source}), net fee: $${
          (netFeeCents / 100).toFixed(2)
        }`,
      );
    } catch (err) {
      console.warn(
        "[REDEEM] pickBestProvider failed, using cached fallback:",
        err,
      );
      selectedProvider = cachedProviders[0]!;
      netFeeCents = Math.round(
        computeNetFee(faceValueCents, selectedProvider) * 100,
      );
    }
  }

  // Fallback: try Tremendous first, then Reloadly
  if (!selectedProvider) {
    const tremendousKey = env("TREMENDOUS_API_KEY");
    if (tremendousKey) {
      selectedProvider = {
        provider: "tremendous",
        productId: "",
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
          feePerTransaction: 0.5,
          feePercentage: 0,
        };
        netFeeCents = 50;
      }
    }
  }

  if (!selectedProvider) {
    return jsonError(
      "No gift card provider available - API keys not configured",
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
      const disabledTime = new Date(instrumentState.disabled_at).getTime();
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

  // ── 3. Check user balance (user_balances.available_usd) ──
  const usdAmount = pointsCost / 100; // pointsCost is in cents from frontend
  const { data: balanceRow, error: balanceError } = await supabase
    .from("user_balances")
    .select("available_usd")
    .eq("user_id", userId)
    .maybeSingle();

  if (balanceError) {
    return jsonError("Failed to fetch balance", corsHeaders);
  }

  const availableUsd = Number(balanceRow?.available_usd ?? 0);
  if (availableUsd < usdAmount) {
    return jsonError(
      `Insufficient balance. You have $${availableUsd.toFixed(2)} available.`,
      corsHeaders,
    );
  }

  // ── 4. Create pending redemption for audit trail ──
  const { data: redemption, error: redemptionError } = await supabase
    .from("redemptions")
    .insert({
      user_id: userId,
      item_id: null,
      point_cost: totalPointsCost, // cents for backward compat
      status: "pending",
      metadata: {
        brand_name: brandName,
        face_value_cents: faceValueCents,
        provider: selectedProvider.provider,
        product_id: selectedProvider.productId,
        net_fee_cents: netFeeCents,
        discount_pct: selectedProvider.discountPercentage,
        source: "market",
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
      `Failed to create redemption: ${redemptionError?.message || "unknown"}`,
      corsHeaders,
    );
  }
  console.log(`[REDEEM] Step 4 OK: redemption ${redemption.id}`);

  // ── 5. Atomically debit market balance ──
  const { data: debitResult, error: debitError } = await supabase.rpc("debit_market_balance", {
    p_user_id: userId,
    p_amount_usd: usdAmount,
    p_redemption_id: redemption.id,
    p_metadata: {
      description: `Gift card: ${brandName} $${(faceValueCents / 100).toFixed(2)}`,
      brand_name: brandName,
      face_value_cents: faceValueCents,
      provider: selectedProvider.provider,
    },
  });

  if (debitError || !debitResult?.success) {
    console.error("Failed to debit market balance:", debitError || debitResult?.error);
    await supabase.from("redemptions").delete().eq("id", redemption.id);
    return jsonError(debitResult?.error || "Failed to debit balance", corsHeaders);
  }

  // ── 6. Place order with selected provider ──
  let providerResult: ProviderOrderResult | null = null;
  let externalErrorMsg: string | null = null;

  // Fetch user email so providers also deliver the card directly to the user
  const recipientEmail = await getUserEmail(supabase, userId);

  if (!isQueuing) {
    try {
      if (selectedProvider.provider === "tremendous") {
        providerResult = await orderFromTremendous(
          env("TREMENDOUS_API_KEY") || "",
          selectedProvider.productId,
          brandName,
          faceValueCents,
          redemption.id,
          recipientEmail || undefined,
        );
      } else {
        providerResult = await orderFromReloadly(
          env("RELOADLY_CLIENT_ID") || "",
          env("RELOADLY_CLIENT_SECRET") || "",
          selectedProvider.productId,
          brandName,
          faceValueCents,
          env("RELOADLY_SANDBOX") !== "false",
          redemption.id,
          recipientEmail || undefined,
        );
      }

      // ── 6b. CRASH-SAFE: immediately persist provider result ──
      // Save the provider order ID and card URL to the redemption row
      // BEFORE finalize_redemption, so we can reconcile if finalize crashes.
      if (providerResult) {
        await supabase.from("redemptions").update({
          provider: providerResult.provider,
          provider_order_id: providerResult.externalOrderId,
          metadata: {
            ...redemption.metadata,
            provider_order_id: providerResult.externalOrderId,
            card_code: providerResult.cardCode || "",
            card_url: providerResult.cardUrl || "",
          },
        }).eq("id", redemption.id);
        console.log(`[REDEEM] Step 6b: saved provider_order_id=${providerResult.externalOrderId} (crash-safe)`);
      }
    } catch (err) {
      externalErrorMsg = err instanceof Error ? err.message : "Provider error";
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
    // Provider failed or queue is explicitly on - queue for retry
    const finalReason = externalErrorMsg ||
      "Queue is currently enabled for this instrument";

    await supabase
      .from("redemptions")
      .update({ status: "failed", failed_reason: finalReason })
      .eq("id", redemption.id);

    const queuedMessage =
      `Your ${brandName} redemption has been queued due to provider delays and will be processed shortly.`;

    // Notify user of queuing
    await supabase.from("market_notifications").insert({
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

    // Email notification for queued gift card
    const userEmail = await getUserEmail(supabase, userId);
    if (userEmail) {
      const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", userId).single();
      const { subject, htmlBody } = buildPayoutEmail({
        type: "gift_card",
        status: "queued",
        userName: profile?.full_name || "there",
        brandName,
        amount: faceValueCents / 100,
        redemptionId: redemption.id,
      });
      await sendTransactionEmail({ to: userEmail, subject, htmlBody });
    }

    // Option to trip the breaker immediately if API failed
    if (externalErrorMsg) {
      await supabase
        .from("instrument_queuing_status")
        .update({ is_queuing: true })
        .eq("instrument", selectedProvider.provider);
    }

    return jsonOk(
      {
        success: true,
        redemptionId: redemption.id,
        provider: selectedProvider.provider,
        netFeeCents,
        status: "queued",
      },
      corsHeaders,
    );
  }

  // ── 7. Unified ACID Transaction for 4 tables ──
  if (providerResult!.cardUrl) {
    const { error: finalizeError } = await supabase.rpc("finalize_redemption", {
      p_payload: {
        redemption_id: redemption.id,
        redemption_type: "gift_card",
        provider_name: providerResult!.provider,
        external_order_id: providerResult!.externalOrderId || "N/A",
        card_code: providerResult!.cardCode || "",
        card_url: providerResult!.cardUrl || "",
        actual_cost_cents: providerResult!.actualCostCents || faceValueCents,
      },
    });

    if (finalizeError) {
      console.error("[REDEEM] Critical Error finalizing Gift Card to Database:", finalizeError);
      return jsonError("Gift Card procured but failed to save receipt safely.", corsHeaders, 500);
    }
  } else {
    // Asynchronous fulfillment fallback for direct auto-purchases
    await supabase.from("redemptions").update({
      status: "pending",
      metadata: {
        ...redemption.metadata,
        pending_async_webhook: true,
      }
    }).eq("id", redemption.id);
    console.log(`[REDEEM] Gift Card triggered asynchronously. Awaiting webhook for ${redemption.id}.`);
  }

  console.log(
    `✅ Gift card redeemed: ${brandName} $${
      (faceValueCents / 100).toFixed(2)
    }, ` +
      `provider=${providerResult!.provider}, cost=$${
        (
          providerResult!.actualCostCents / 100
        ).toFixed(2)
      }`,
  );

  // Record bank ledger outflow for platform cash tracking
  const outflowUsd = (providerResult!.actualCostCents || faceValueCents) / 100;
  await supabase.rpc("append_bank_ledger_entry", {
    p_event_type: "gift_card_purchased",
    p_direction: "outflow",
    p_amount_usd: outflowUsd,
    p_provider: providerResult!.provider,
    p_reference_type: "redemption",
    p_reference_id: redemption.id,
    p_metadata: { brand_name: brandName, face_value_usd: faceValueCents / 100 },
  }).then(({ error }) => {
    if (error) console.warn("[REDEEM] Bank ledger entry failed:", error.message);
  });

  // ── 8. Send push notification and in-app notification ──
  const successMessage = `Your ${brandName} gift card ($${(faceValueCents / 100).toFixed(2)}) is ready! ${providerResult!.cardUrl ? 'Tap to view.' : 'Check your transaction history.'}`

  await supabase.from("market_notifications").insert({
    user_id: userId,
    content: successMessage,
    link_url: providerResult!.cardUrl || "/transaction-history",
  });

  await sendPushNotification(supabase, {
    userIds: [userId],
    title: "Gift Card Ready! 🎁",
    body: successMessage,
    url: providerResult!.cardUrl || "/transaction-history",
  });

  // Email notification for successful gift card
  const userEmail = await getUserEmail(supabase, userId);
  if (userEmail) {
    const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", userId).single();
    const { subject, htmlBody } = buildPayoutEmail({
      type: "gift_card",
      status: "completed",
      userName: profile?.full_name || "there",
      brandName,
      amount: faceValueCents / 100,
      cardCode: providerResult!.cardCode,
      cardUrl: providerResult!.cardUrl,
      provider: providerResult!.provider,
      redemptionId: redemption.id,
    });
    await sendTransactionEmail({ to: userEmail, subject, htmlBody });
  }

  return jsonOk(
    {
      success: true,
      redemptionId: redemption.id,
      provider: providerResult!.provider,
      cardCode: providerResult!.cardCode,
      cardUrl: providerResult!.cardUrl,
      netFeeCents,
      status: "completed",
    },
    corsHeaders,
  );
});
