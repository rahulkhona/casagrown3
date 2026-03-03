import {
  jsonError,
  jsonOk,
  requireAuth,
  serveWithCors,
} from "../_shared/serve-with-cors.ts";
import { sendPushNotification } from "../_shared/push-notify.ts";
import { getProviderGracePeriodMs } from "../_shared/grace-period.ts";

/**
 * redeem-paypal-payout — Supabase Edge Function
 *
 * Request body: { pointsToRedeem: number, payoutId?: string }
 *
 * 1. Checks if the user has enough points.
 * 2. Fetches their `paypal_payout_id` (or uses the new one provided).
 * 3. Calls PayPal Payouts API to send the funds.
 * 4. Deducts points and records the transaction.
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

  // Kill switch: set PAYPAL_ENABLED=false in .env.local to block ALL PayPal API calls
  const paypalEnabled = env("PAYPAL_ENABLED");
  if (paypalEnabled === "false") {
    return jsonError(
      "PayPal payouts are currently disabled. Set PAYPAL_ENABLED=true to re-enable.",
      corsHeaders,
      400,
    );
  }

  // 1. Authenticate user
  const auth = await requireAuth(req, supabase, corsHeaders);
  if (auth instanceof Response) return auth;
  const userId = auth;

  // 2. Parse request
  const body = await req.json().catch(() => ({}));
  const pointsToRedeem = Number(body.pointsToRedeem);
  const providedPayoutId = body.payoutId?.trim();

  // Validate points amount (must be positive, min 1)
  if (!pointsToRedeem || isNaN(pointsToRedeem) || pointsToRedeem < 1) {
    return jsonError(
      "Invalid points amount. Must redeem at least 1 point.",
      corsHeaders,
      400,
    );
  }

  // Fetch user's profile to check for existing payout ID and get name
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name, paypal_payout_id")
    .eq("id", userId)
    .single();

  if (profileError) {
    console.error("Profile fetch error:", profileError);
    return jsonError("Could not fetch user profile", corsHeaders, 400);
  }

  let finalPayoutId = profile?.paypal_payout_id;

  // If they provided a new ID and it's different from the saved one, update the saved one
  if (providedPayoutId && providedPayoutId !== finalPayoutId) {
    finalPayoutId = providedPayoutId;
    await supabase.from("profiles").update({ paypal_payout_id: finalPayoutId })
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

  // 3. Verify Points Balance (Closed-Loop: Earned only)
  const conversionRate = 100; // 100 points = $1
  const usdAmount = Number((pointsToRedeem / conversionRate).toFixed(2));

  const { data: balances, error: balanceError } = await supabase
    .rpc("get_user_balances", { p_user_id: userId })
    .maybeSingle();

  if (balanceError || !balances) {
    return jsonError("Failed to verify user point balance.", corsHeaders, 400);
  }

  const earnedBalance = (balances as any).earned_balance ?? 0;
  if (earnedBalance < pointsToRedeem) {
    return jsonError(
      `Insufficient earned points. You have ${earnedBalance} but tried to redeem ${pointsToRedeem}. Purchased points cannot be cashed out via PayPal.`,
      corsHeaders,
      400,
    );
  }

  // 4. Create pending redemption record FIRST so we can reference it
  const { data: redemption, error: redemptionError } = await supabase
    .from("redemptions")
    .insert({
      user_id: userId,
      item_id: null,
      point_cost: pointsToRedeem,
      status: "pending",
      metadata: {
        type: "paypal_cashout",
        usd_amount: usdAmount,
        payout_target: finalPayoutId,
        refund_usd_cents: usdAmount * 100,
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

  // 5. Fallible external step: PayPal API
  let payoutData: any = null;
  let txId: string = "";
  let externalErrorMsg: string | null = null;

  if (!isQueuing) {
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
          sender_batch_id: `casagrown_payout_${Date.now()}_${
            userId.substring(0, 8)
          }`,
          email_subject: "Here is your CasaGrown Reward!",
          email_message:
            `You earned $${usdAmount} by redeeming ${pointsToRedeem} points on CasaGrown! Keep up the great work.`,
        },
        items: [
          {
            recipient_type: receiverType,
            amount: { value: usdAmount.toFixed(2), currency: "USD" },
            note: "CasaGrown Points Redemption",
            sender_item_id: `item_${Date.now()}`,
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
    await supabase.from("notifications").insert({
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

  // 6. Unified ACID Transaction for Redemptions
  const { error: finalizeError } = await supabase.rpc("finalize_redemption", {
    p_payload: {
      redemption_id: redemption.id,
      redemption_type: "paypal",
      provider_name: "paypal",
      external_order_id: txId,
      actual_cost_cents: Math.round(usdAmount * 100),
      batch_id: txId, // will be merged into metadata
      payout_target: finalPayoutId,
    },
  });

  // Because this endpoint creates the point_ledger entry dynamically, the universal RPC handles the metadata
  // update. But we must still manually deduct the points BEFORE the RPC seals it. (The RPC only UPDATES existing ledger rows).
  const { error: logError } = await supabase.from("point_ledger").insert({
    user_id: userId,
    amount: -pointsToRedeem,
    type: "redemption",
    reference_id: redemption.id,
    metadata: {
      description: `Redeemed $${usdAmount} to PayPal/Venmo (${finalPayoutId})`,
      payout_target: finalPayoutId,
      provider: "paypal",
      batch_id: txId,
      refund_usd_cents: usdAmount * 100,
      fee_deducted_cents: 0,
      status: "completed",
    },
  });

  if (logError || finalizeError) {
    console.error(
      "Failed to log transaction. User got free money!",
      logError || finalizeError,
    );
    await supabase.from("redemptions").delete().eq("id", redemption.id);
    return jsonOk({
      success: false,
      error: "Failed to deduct points or lock receipt.",
    }, corsHeaders);
  }

  // The RPC handles the redemption 'completed' status update.

  // 8. Send push notification and in-app notification
  const successMessage = `Your cashout of $${
    usdAmount.toFixed(
      2,
    )
  } to ${finalPayoutId} was successful!`;

  await supabase.from("notifications").insert({
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
