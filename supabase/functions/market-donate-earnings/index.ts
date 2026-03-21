/**
 * market-donate-earnings — Edge Function for donating market earnings to GlobalGiving
 *
 * Flow:
 * 1. Validate user's available market balance
 * 2. Atomically debit via debit_market_balance RPC
 * 3. Call GlobalGiving Donation API
 * 4. Store donation receipt
 * 5. On failure: queue for retry
 */

import {
  jsonError,
  jsonOk,
  requireAuth,
  serveWithCors,
} from "../_shared/serve-with-cors.ts";
import { getProviderGracePeriodMs } from "../_shared/grace-period.ts";
import { sendPushNotification } from "../_shared/push-notify.ts";
import { sendTransactionEmail, getUserEmail } from "../_shared/postmark.ts";
import { buildPayoutEmail } from "../_shared/payout-email.ts";

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

  // pointsAmount is in cents from the frontend
  const amountCents = pointsAmount;
  const dollarAmount = amountCents / 100;

  // 1. Check Instrument Active & Queue Status
  const instrumentName = "globalgiving";

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
          `[DONATE] Instrument is disabled, but transaction permitted within ${gracePeriodMs}ms grace window.`,
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

  const { data: queueRow } = await supabase
    .from("instrument_queuing_status")
    .select("is_queuing")
    .eq("instrument", instrumentName)
    .maybeSingle();

  const isQueuing = queueRow?.is_queuing ?? false;
  const isSandbox = env("GLOBALGIVING_SANDBOX") === "true";

  // 2. Check market balance (user_balances.available_usd)
  const { data: balanceRow, error: balanceError } = await supabase
    .from("user_balances")
    .select("available_usd")
    .eq("user_id", userId)
    .maybeSingle();

  if (balanceError) {
    return jsonError("Failed to fetch balance", corsHeaders);
  }

  const availableUsd = Number(balanceRow?.available_usd ?? 0);
  if (availableUsd < dollarAmount) {
    return jsonError(
      `Insufficient balance. You have $${availableUsd.toFixed(2)} available.`,
      corsHeaders,
    );
  }

  let externalOrderId = "";
  let finalStatus = "pending";

  // 4. Try Live Fulfillment
  if (!isQueuing && !isSandbox && env("GLOBALGIVING_API_KEY") && itemId) {
    try {
      const response = await fetch(
        `https://api.globalgiving.org/api/public/projects/${itemId}/donate?api_key=${
          env(
            "GLOBALGIVING_API_KEY",
          )
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
      console.error("[DONATE] GlobalGiving API failed. Tripping Breaker.", err);
      finalStatus = "pending";

      // Trip the breaker
      await supabase
        .from("instrument_queuing_status")
        .update({ is_queuing: true })
        .eq("instrument", "globalgiving");
    }
  }

  // 5. Create redemption for audit trail
  const { data: redemption, error: redemptionError } = await supabase
    .from("redemptions")
    .insert({
      user_id: userId,
      item_id: itemId || null,
      point_cost: amountCents, // cents for backward compat
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
        source: "market",
      },
    })
    .select()
    .single();

  if (redemptionError || !redemption) {
    return jsonError("Failed to create redemption", corsHeaders);
  }

  // 6. Atomically debit market balance
  const receiptNumber = finalStatus === "completed"
    ? `DON-${Date.now().toString(36).toUpperCase()}`
    : `DON-Q-${Date.now().toString(36).toUpperCase()}`;

  const { data: debitResult, error: debitError } = await supabase.rpc("debit_market_balance", {
    p_user_id: userId,
    p_amount_usd: dollarAmount,
    p_redemption_id: redemption.id,
    p_metadata: {
      description: `Donation $${dollarAmount.toFixed(2)} to ${organizationName}`,
      organization: organizationName,
      project_title: projectTitle,
      receipt_number: receiptNumber,
    },
  });

  if (debitError || !debitResult?.success) {
    console.error("Failed to debit market balance:", debitError || debitResult?.error);
    await supabase.from("redemptions").delete().eq("id", redemption.id);
    return jsonError(debitResult?.error || "Failed to debit balance.", corsHeaders);
  }

  if (finalStatus === "completed") {
    // ACID: Use finalize_redemption RPC for provider_transactions + donation_receipts
    const { error: finalizeError } = await supabase.rpc("finalize_redemption", {
      p_payload: {
        redemption_id: redemption.id,
        redemption_type: "donation",
        provider_name: "globalgiving",
        external_order_id: externalOrderId,
        actual_cost_cents: amountCents,
        receipt_number: receiptNumber,
      },
    });

    if (finalizeError) {
      console.error(
        "[DONATE] Critical Error finalizing donation:",
        finalizeError,
      );
    }

    // Record bank ledger outflow for platform cash tracking
    await supabase.rpc("append_bank_ledger_entry", {
      p_event_type: "donation_sent",
      p_direction: "outflow",
      p_amount_usd: dollarAmount,
      p_provider: "globalgiving",
      p_reference_type: "redemption",
      p_reference_id: redemption.id,
      p_metadata: { organization: organizationName, receipt_number: receiptNumber },
    }).then(({ error }) => {
      if (error) console.warn("[DONATE] Bank ledger entry failed:", error.message);
    });

    const successMessage = `Your donation of $${
      dollarAmount.toFixed(
        2,
      )
    } to ${organizationName} has been successfully processed!`;
    await supabase.from("market_notifications").insert({
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

    // Email notification for successful donation
    const userEmail = await getUserEmail(supabase, userId);
    if (userEmail) {
      const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", userId).single();
      const { subject, htmlBody } = buildPayoutEmail({
        type: "donation",
        status: "completed",
        userName: profile?.full_name || "there",
        organizationName,
        projectTitle: projectTitle || organizationName,
        amount: dollarAmount,
        receiptNumber,
        redemptionId: redemption.id,
      });
      await sendTransactionEmail({ to: userEmail, subject, htmlBody });
    }
  } else {
    // Queue state
    const queuedMessage = `Your donation of $${
      dollarAmount.toFixed(
        2,
      )
    } to ${organizationName} has been queued and will be processed shortly.`;

    await supabase.from("market_notifications").insert({
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

    // Email notification for queued donation
    const userEmail = await getUserEmail(supabase, userId);
    if (userEmail) {
      const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", userId).single();
      const { subject, htmlBody } = buildPayoutEmail({
        type: "donation",
        status: "queued",
        userName: profile?.full_name || "there",
        organizationName,
        projectTitle: projectTitle || organizationName,
        amount: dollarAmount,
        redemptionId: redemption.id,
      });
      await sendTransactionEmail({ to: userEmail, subject, htmlBody });
    }
  }

  return jsonOk(
    {
      success: true,
      redemptionId: redemption.id,
      receiptNumber,
      donationAmountUsd: dollarAmount,
      status: finalStatus === "completed" ? "completed" : "queued",
    },
    corsHeaders,
  );
});
