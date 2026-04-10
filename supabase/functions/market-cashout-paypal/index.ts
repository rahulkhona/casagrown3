import {
  jsonError,
  jsonOk,
  requireAuth,
  serveWithCors,
} from "../_shared/serve-with-cors.ts";
import { sendPushNotification } from "../_shared/push-notify.ts";
import { getProviderGracePeriodMs } from "../_shared/grace-period.ts";
import { sendTransactionEmail, getUserEmail } from "../_shared/postmark.ts";
import { buildPayoutEmail } from "../_shared/payout-email.ts";

/**
 * market-cashout-paypal — Supabase Edge Function
 *
 * Request body: { pointsToRedeem: number (cents), payoutId?: string }
 *
 * 1. Checks the user's available market balance (user_balances.available_usd).
 * 2. Fetches their verified payout handle.
 * 3. Calls PayPal Payouts API to send the funds.
 * 4. Atomically debits market balance via debit_market_balance RPC.
 */
serveWithCors(async (req, { supabase, env, corsHeaders }) => {
  const PAYPAL_CLIENT_ID = env("PAYPAL_CLIENT_ID");
  const PAYPAL_SECRET = env("PAYPAL_SECRET");

  // Use sandbox API in local/dev, live in production
  const IS_PROD = env("SUPABASE_URL")?.includes("casagrown") &&
    !env("SUPABASE_URL")?.includes("localhost");
  const PAYPAL_BASE_URL = IS_PROD
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

  if (!PAYPAL_CLIENT_ID || !PAYPAL_SECRET) {
    return jsonError("PayPal API keys are missing", corsHeaders);
  }

  // Kill switch constant — checked right before making external API calls
  const paypalEnabled = env("PAYPAL_ENABLED") !== "false";

  // 1. Authenticate user
  const auth = await requireAuth(req, supabase, corsHeaders);
  if (auth instanceof Response) return auth;
  const userId = auth;

  // 2. Parse request
  const body = await req.json().catch(() => ({}));
  // Frontend sends cents as "pointsToRedeem" for backward compatibility
  const amountCents = Number(body.pointsToRedeem || body.amountCents);
  const providedPayoutId = body.payoutId?.trim();

  // Validate amount (must be positive, min 100 cents = $1.00)
  if (!amountCents || isNaN(amountCents) || amountCents < 100) {
    return jsonError(
      "Invalid amount. Minimum cashout is $1.00.",
      corsHeaders,
      400,
    );
  }

  const usdAmount = Number((amountCents / 100).toFixed(2));

  // Fetch user's profile to check for existing payout handle
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name, payout_handle, payout_handle_type, payout_verified")
    .eq("id", userId)
    .single();

  if (profileError) {
    console.error("Profile fetch error:", profileError);
    return jsonError("Could not fetch user profile", corsHeaders, 400);
  }

  let finalPayoutId = profile?.payout_handle;

  // If they provided a new ID and it's different, update
  if (providedPayoutId && providedPayoutId !== finalPayoutId) {
    finalPayoutId = providedPayoutId;
    await supabase.from("profiles").update({ payout_handle: finalPayoutId })
      .eq("id", userId);
  }

  if (!finalPayoutId) {
    return jsonError(
      "No PayPal email or Venmo phone number provided.",
      corsHeaders,
      400,
    );
  }

  // 2.5 Check Instrument Active & Queue Status
  const instrumentName = "paypal";

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
          `[CASHOUT] Instrument is disabled, but transaction permitted within ${gracePeriodMs}ms grace window.`,
        );
      }
    }

    if (!isGracePeriod) {
      return jsonError(
        "Cashouts are temporarily offline. Please try again later.",
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

  // 3. Verify market balance (user_balances.available_usd)
  const { data: balanceRow, error: balanceError } = await supabase
    .from("user_balances")
    .select("available_usd")
    .eq("user_id", userId)
    .maybeSingle();

  if (balanceError) {
    return jsonError("Failed to verify balance.", corsHeaders, 400);
  }

  const availableUsd = Number(balanceRow?.available_usd ?? 0);
  if (availableUsd < usdAmount) {
    return jsonError(
      `Insufficient balance. You have $${availableUsd.toFixed(2)} available but requested $${usdAmount.toFixed(2)}.`,
      corsHeaders,
      400,
    );
  }

  // 4. Create pending redemption record for audit trail
  const { data: redemption, error: redemptionError } = await supabase
    .from("redemptions")
    .insert({
      user_id: userId,
      item_id: null,
      point_cost: amountCents, // cents for backward compatibility
      status: "pending",
      metadata: {
        type: "paypal_cashout",
        source: "market",
        usd_amount: usdAmount,
        payout_target: finalPayoutId,
        fee_deducted_cents: 0,
      },
    })
    .select()
    .single();

  if (redemptionError || !redemption) {
    console.error("Failed to create redemption record:", redemptionError);
    return jsonOk(
      {
        success: false,
        error: "Failed to initialize cashout redemption.",
      },
      corsHeaders,
    );
  }

  // 4b. Atomically debit market balance before any API/Queuing logic
  const { data: debitResult, error: debitError } = await supabase.rpc("debit_market_balance", {
    p_user_id: userId,
    p_amount_usd: usdAmount,
    p_redemption_id: redemption.id,
    p_metadata: {
      description: `Cashout $${usdAmount.toFixed(2)} to PayPal/Venmo (${finalPayoutId})`,
      payout_target: finalPayoutId,
      provider: "paypal",
    },
  });

  if (debitError || !debitResult?.success) {
    console.error("Failed to debit market balance:", debitError || debitResult?.error);
    await supabase.from("redemptions").delete().eq("id", redemption.id);
    return jsonOk({
      success: false,
      error: debitResult?.error || "Failed to debit balance.",
    }, corsHeaders);
  }

  // 5. Fallible external step: PayPal API
  let payoutData: any = null;
  let txId: string = "";
  let externalErrorMsg: string | null = null;

  if (!isQueuing) {
    // Kill switch: block actual PayPal API calls when disabled
    if (!paypalEnabled) {
      // Mark the redemption as queued instead of making the API call
      await supabase
        .from("redemptions")
        .update({ status: "queued" })
        .eq("id", redemption.id);

      return jsonOk(
        {
          success: true,
          queued: true,
          message:
            "PayPal payouts are currently disabled. Your cashout has been queued.",
          redemptionId: redemption.id,
          newBalance: availableUsd - usdAmount,
        },
        corsHeaders,
      );
    }
    try {
      // Step A: Get OAuth Token
      const credentials = btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`);
      const authRes = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      });

      if (!authRes.ok) {
        const errText = await authRes.text();
        console.error("PayPal Auth Failed:", errText);
        throw new Error("Failed to authenticate with payment processor.");
      }

      const { access_token } = await authRes.json();
      // Step B: Send Payout
      const isPhone = /^\+?[1-9]\d{1,14}$/.test(finalPayoutId);
      const receiverType = isPhone ? "PHONE" : "EMAIL";

      const payoutPayload = {
        sender_batch_header: {
          sender_batch_id: `cg_${redemption.id}`,
          email_subject: "Here is your CasaGrown payout!",
          email_message:
            `You earned $${usdAmount.toFixed(2)} on CasaGrown Market! Here's your payout.`,
        },
        items: [
          {
            recipient_type: receiverType,
            amount: { value: usdAmount.toFixed(2), currency: "USD" },
            note: "CasaGrown Market Payout",
            sender_item_id: redemption.id,
            receiver: finalPayoutId,
          },
        ],
      };

      const payoutRes = await fetch(`${PAYPAL_BASE_URL}/v1/payments/payouts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payoutPayload),
      });

      payoutData = await payoutRes.json();

      if (!payoutRes.ok || payoutData.name === "INSUFFICIENT_FUNDS") {
        throw new Error(payoutData.message || "PayPal rejected transfer.");
      }

      txId = payoutData.batch_header?.payout_batch_id ||
        `paypal_fallback_id_${Date.now()}`;

      // CRASH-SAFE: immediately save batch_id to redemption
      await supabase.from("redemptions").update({
        provider: "paypal",
        provider_order_id: txId,
        metadata: {
          ...redemption.metadata,
          batch_id: txId,
          payout_status: payoutData.batch_header?.batch_status,
        },
      }).eq("id", redemption.id);
      console.log(`[CASHOUT] Crash-safe: saved batch_id=${txId}`);
    } catch (err) {
      externalErrorMsg = err instanceof Error
        ? err.message
        : "PayPal API error";
      console.warn(`[CASHOUT] PayPal API failed, queuing: ${externalErrorMsg}`);
    }
  } else {
    console.log(
      `[CASHOUT] is_queuing is TRUE for paypal. Dropping directly into queue.`,
    );
  }

  if (isQueuing || externalErrorMsg) {
    const finalReason = externalErrorMsg ||
      "Queue is currently enabled for paypal";

    // Update the pending redemption so the admin knows what happened
    await supabase
      .from("redemptions")
      .update({
        status: "failed",
        failed_reason: finalReason,
      })
      .eq("id", redemption.id);

    const queuedMessage = `Your cashout of $${
      usdAmount.toFixed(
        2,
      )
    } to ${finalPayoutId} has been queued due to provider delays and will be processed shortly.`;

    // Notify user of queuing
    await supabase.from("market_notifications").insert({
      user_id: userId,
      content: queuedMessage,
      link_url: "/transaction-history",
    });

    await sendPushNotification(supabase, {
      userIds: [userId],
      title: "Cashout Queued ⏳",
      body: queuedMessage,
      url: "/transaction-history",
    });

    // Email notification for queued cashout
    const userEmail = await getUserEmail(supabase, userId);
    if (userEmail) {
      const isPhone = /^\+?[1-9]\d{1,14}$/.test(finalPayoutId);
      const { subject, htmlBody } = buildPayoutEmail({
        type: "cashout",
        status: "queued",
        userName: profile?.full_name || "there",
        amount: usdAmount,
        payoutTarget: finalPayoutId,
        handleType: isPhone ? "venmo" : "paypal",
        redemptionId: redemption.id,
      });
      await sendTransactionEmail({ to: userEmail, subject, htmlBody });
    }

    // Option to trip the breaker immediately if API failed
    if (externalErrorMsg) {
      await supabase
        .from("instrument_queuing_status")
        .update({ is_queuing: true })
        .eq("instrument", "paypal");
    }

    // Return gracefully so the frontend assumes success-but-queued
    return jsonOk(
      {
        success: true,
        batch_id: null,
        usd_amount: usdAmount,
        payout_target: finalPayoutId,
        status: "queued",
        redemptionId: redemption?.id,
      },
      corsHeaders,
    );
  }




  // 7. Finalize redemption (provider_transactions, receipt logging)
  const { error: finalizeError } = await supabase.rpc("finalize_redemption", {
    p_payload: {
      redemption_id: redemption.id,
      redemption_type: "paypal",
      provider_name: "paypal",
      external_order_id: txId,
      actual_cost_cents: amountCents,
      batch_id: txId,
      payout_target: finalPayoutId,
    },
  });

  if (finalizeError) {
    console.warn("[CASHOUT] finalize_redemption warning:", finalizeError.message);
  }

  // Record bank ledger outflow for platform cash tracking
  await supabase.rpc("append_bank_ledger_entry", {
    p_event_type: "cashout_sent",
    p_direction: "outflow",
    p_amount_usd: usdAmount,
    p_provider: "venmo",
    p_reference_type: "redemption",
    p_reference_id: redemption.id,
    p_metadata: { payout_target: finalPayoutId, batch_id: txId },
  }).then(({ error }) => {
    if (error) console.warn("[CASHOUT] Bank ledger entry failed:", error.message);
  });

  // The RPC handles the redemption 'completed' status update.

  // 8. Send push notification and in-app notification
  const successMessage = `Your cashout of $${
    usdAmount.toFixed(
      2,
    )
  } to ${finalPayoutId} was successful!`;

  await supabase.from("market_notifications").insert({
    user_id: userId,
    content: successMessage,
    link_url: "/transaction-history",
  });

  await sendPushNotification(supabase, {
    userIds: [userId],
    title: "Cashout Successful 💸",
    body: successMessage,
    url: "/transaction-history",
  });

  // Email notification for successful cashout
  const userEmail = await getUserEmail(supabase, userId);
  if (userEmail) {
    const isPhone = /^\+?[1-9]\d{1,14}$/.test(finalPayoutId);
    const { subject, htmlBody } = buildPayoutEmail({
      type: "cashout",
      status: "completed",
      userName: profile?.full_name || "there",
      amount: usdAmount,
      payoutTarget: finalPayoutId,
      handleType: isPhone ? "venmo" : "paypal",
      transactionId: txId,
      redemptionId: redemption.id,
    });
    await sendTransactionEmail({ to: userEmail, subject, htmlBody });
  }

  return jsonOk(
    {
      success: true,
      batch_id: txId,
      usd_amount: usdAmount,
      payout_target: finalPayoutId,
    },
    corsHeaders,
  );
});
