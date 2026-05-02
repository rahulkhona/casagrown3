/**
 * market-donate-earnings - Edge Function for donating market earnings to GlobalGiving
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

  // 4. Create pending redemption for audit trail
  const receiptNumberFallback = `DON-Q-${Date.now().toString(36).toUpperCase()}`;
  const { data: redemption, error: redemptionError } = await supabase
    .from("redemptions")
    .insert({
      user_id: userId,
      item_id: itemId || null,
      point_cost: amountCents,
      status: "pending",
      provider: "globalgiving",
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

  // 5. Atomically debit market balance before any API attempt
  const { data: debitResult, error: debitError } = await supabase.rpc("debit_market_balance", {
    p_user_id: userId,
    p_amount_usd: dollarAmount,
    p_redemption_id: redemption.id,
    p_metadata: {
      description: `Donation $${dollarAmount.toFixed(2)} to ${organizationName}`,
      organization: organizationName,
      project_title: projectTitle,
    },
  });

  if (debitError || !debitResult?.success) {
    console.error("Failed to debit market balance:", debitError || debitResult?.error);
    await supabase.from("redemptions").delete().eq("id", redemption.id);
    return jsonError(debitResult?.error || "Failed to debit balance.", corsHeaders);
  }

  // 6. Try Live Fulfillment
  // Fetch user info for GlobalGiving donor receipt (501c3 tax receipt sent to donor email)
  const { data: donorProfile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .single();

  let donorEmail = donorProfile?.email || "";
  if (!donorEmail) {
    const { data: authUser } = await supabase.auth.admin.getUserById(userId);
    donorEmail = authUser?.user?.email || "";
  }
  const donorName = donorProfile?.full_name || "CasaGrown User";
  const [firstName, ...lastParts] = donorName.split(" ");
  const lastName = lastParts.join(" ") || firstName;

  let externalOrderId = "";
  let receiptUrl = "";
  let ggReceipt: any = {};
  let finalStatus = "pending";
  let externalErrorMsg: string | null = null;

  if (!isQueuing && !isSandbox && env("GLOBALGIVING_API_KEY") && itemId) {
    try {
      const response = await fetch(
        `https://api.globalgiving.org/api/public/projects/${itemId}/donate?api_key=${
          env("GLOBALGIVING_API_KEY")
        }`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: dollarAmount,
            currency: "USD",
            refcode: `cg_${userId.substring(0, 8)}_${Date.now()}`,
            ...(donorEmail ? {
              email: donorEmail,
              firstname: firstName,
              lastname: lastName,
            } : {}),
          }),
        },
      );

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText);
      }

      const data = await response.json();
      externalOrderId = data.donationId || data.id || "";
      finalStatus = "completed";
      ggReceipt = data.receipt || {};
      receiptUrl = data.receiptUrl || data.receipt_url || "";
      
      // CRASH-SAFE: immediately persist provider result
      await supabase.from("redemptions").update({
        provider_order_id: externalOrderId || null,
        metadata: {
          ...redemption.metadata,
          ...(externalOrderId ? { donation_id: externalOrderId } : {}),
          ...(receiptUrl ? { charity_receipt_url: receiptUrl } : {}),
          ...(ggReceipt?.receiptNumber ? {
            gg_receipt_number: ggReceipt.receiptNumber,
            tax_deductible_amount: ggReceipt.taxDeductibleContributionAmount,
          } : {}),
        },
      }).eq("id", redemption.id);
      
      console.log(`[DONATE] GlobalGiving API succeeded: donationId=${externalOrderId}`);
    } catch (err) {
      externalErrorMsg = err instanceof Error ? err.message : "Donation API failed";
      console.error("[DONATE] GlobalGiving API failed. Tripping Breaker.", err);
      finalStatus = "pending";

      await supabase
        .from("instrument_queuing_status")
        .update({ is_queuing: true })
        .eq("instrument", "globalgiving");
    }
  } else {
     console.log(`[DONATE] Queuing enabled explicitly for globalgiving`);
  }

  if (isQueuing || externalErrorMsg) {
    const finalReason = externalErrorMsg || "Queue is currently enabled for globalgiving";
    await supabase
      .from("redemptions")
      .update({ status: "queued", failed_reason: finalReason })
      .eq("id", redemption.id);

    const queuedMessage = `Your donation of $${dollarAmount.toFixed(2)} to ${organizationName} will be processed at noon of the next business day.`;
    
    await supabase.from("market_notifications").insert({
      user_id: userId,
      content: queuedMessage,
      link_url: "/earnings",
    });

    // Run external notifications in parallel with a timeout to prevent hanging
    const sendNotifications = async () => {
      await sendPushNotification(supabase, {
        userIds: [userId],
        title: "Donation Queued ⏳",
        body: queuedMessage,
        url: "/earnings",
      });

      const userEmailForNotify = await getUserEmail(supabase, userId);
      if (userEmailForNotify) {
        const { subject, htmlBody } = buildPayoutEmail({
          type: "donation",
          status: "queued",
          userName: firstName || "there",
          organizationName,
          amount: dollarAmount,
          redemptionId: redemption.id,
        });
        await sendTransactionEmail({ to: userEmailForNotify, subject, htmlBody });
      }
    };

    try {
      await Promise.race([
        sendNotifications(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Notification timeout")), 4000))
      ]);
    } catch (err) {
      console.warn("[DONATE] Notifications timed out or failed:", err);
    }

    return jsonOk({
      success: true,
      donationId: null,
      usd_amount: dollarAmount,
      status: "queued",
      redemptionId: redemption.id,
    }, corsHeaders);
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
      link_url: "/earnings",
    });

    await sendPushNotification(supabase, {
      userIds: [userId],
      title: "Donation Complete 💛",
      body: successMessage,
      url: "/earnings",
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
      link_url: "/earnings",
    });

    await sendPushNotification(supabase, {
      userIds: [userId],
      title: "Donation Queued 💛",
      body: queuedMessage,
      url: "/earnings",
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
