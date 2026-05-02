/**
 * execute-auto-payouts — Supabase Edge Function (service-role cron)
 *
 * Triggered daily at 00:30 (after settlement captures at 00:05).
 *
 * OPTIMIZED: Batches payouts by method:
 *   - cashout → single PayPal Payouts batch API call (up to 15k recipients)
 *   - giftcards → concurrent Tremendous calls (concurrency: 10)
 *   - donate → concurrent GlobalGiving calls (concurrency: 5)
 *
 * Then bulk-debits all successful payouts via batch_debit_market_balance RPC.
 *
 * Trigger conditions:
 *   1. User threshold — balance ≥ user_auto_redemption_config.threshold_usd
 *   2. $500 AML cap — balance ≥ $500 (mandatory)
 *   3. 90-day sweep — last_active_at < now() - 90 days with balance > $0
 */

import {
  jsonError,
  jsonOk,
  serveWithCors,
} from "../_shared/serve-with-cors.ts";
import {
  sendBatchPayPalPayout,
  pAll,
  type PayPalRecipient,
} from "../_shared/batch-paypal-payout.ts";

interface EligibleUser {
  user_id: string;
  available_usd: number;
  trigger_reason: string;
  payout_method: string;
  threshold_usd: number;
  payout_handle: string;
  payout_handle_type: string;
  payout_verified: boolean;
  gift_card_brand: string;
  charity_project_id: string;
  charity_project_name: string;
}

interface PayoutResult {
  user_id: string;
  trigger: string;
  method: string;
  amount: number;
  status: "success" | "failed" | "fallback_giftcard";
  error?: string;
}

serveWithCors(async (req, { supabase, env, corsHeaders }) => {
  // Auth: service-role only
  const authHeader = req.headers.get("Authorization");
  const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!authHeader || !authHeader.includes(serviceRoleKey || "")) {
    return jsonError("Unauthorized", corsHeaders, 401);
  }

  // 1. Fetch eligible users
  const { data: eligible, error: queryError } = await supabase
    .rpc("get_auto_payout_eligible_users");

  if (queryError) {
    console.error("[AUTO-PAYOUT] Failed to query eligible users:", queryError);
    return jsonError(`Query failed: ${queryError.message}`, corsHeaders);
  }

  if (!eligible || eligible.length === 0) {
    return jsonOk({
      success: true,
      processed: 0,
      message: "No users eligible for auto-payout",
    }, corsHeaders);
  }

  console.log(`[AUTO-PAYOUT] Found ${eligible.length} eligible users`);

  // 2. Group by payout method
  const cashoutUsers: EligibleUser[] = [];
  const giftCardUsers: EligibleUser[] = [];
  const donateUsers: EligibleUser[] = [];

  for (const user of eligible as EligibleUser[]) {
    const method = user.payout_method || "giftcards";
    if (method === "cashout") {
      // Verified payout handle required for cashout; fallback to gift card
      if (user.payout_handle && user.payout_verified) {
        cashoutUsers.push(user);
      } else {
        console.warn(
          `[AUTO-PAYOUT] User ${user.user_id} wants cashout but no verified handle. Falling back to gift card.`
        );
        giftCardUsers.push({ ...user, payout_method: "giftcards" });
      }
    } else if (method === "donate") {
      donateUsers.push(user);
    } else {
      giftCardUsers.push(user);
    }
  }

  console.log(
    `[AUTO-PAYOUT] Grouped: ${cashoutUsers.length} cashout, ` +
    `${giftCardUsers.length} gift cards, ${donateUsers.length} donations`
  );

  const results: PayoutResult[] = [];

  // ── 3a. PayPal batch (single API call for ALL cashout users) ──
  if (cashoutUsers.length > 0) {
    // Check if PayPal cashouts should be queued (manual fulfillment)
    const { data: queueRow } = await supabase
      .from("redemption_instruments")
      .select("is_queuing")
      .eq("provider", "paypal")
      .single();
    
    const isQueuing = queueRow?.is_queuing ?? false;

    if (isQueuing) {
      console.log(`[AUTO-PAYOUT] is_queuing is TRUE for paypal. Routing ${cashoutUsers.length} cashouts to manual queue.`);
      
      // Process each user into the manual queue
      for (const u of cashoutUsers) {
        try {
          const amountCents = Math.round(Number(u.available_usd) * 100);
          
          // 1. Create queued redemption record
          const { data: redemption, error: redError } = await supabase
            .from("redemptions")
            .insert({
              user_id: u.user_id,
              item_id: null,
              point_cost: amountCents,
              provider: "paypal",
              status: "queued",
              metadata: {
                source: "auto_payout",
                trigger: u.trigger_reason,
                type: "paypal_cashout",
                usd_amount: Number(u.available_usd),
                payout_target: u.payout_handle,
                refund_usd_cents: amountCents,
                fee_deducted_cents: 0,
              },
            })
            .select()
            .single();

          if (redError) throw redError;

          // 2. Debit market balance
          const { error: debitError } = await supabase.rpc("debit_market_balance", {
            p_user_id: u.user_id,
            p_amount_usd: Number(u.available_usd),
            p_redemption_id: redemption.id,
            p_metadata: {
              source: "auto_payout",
              trigger: u.trigger_reason,
              provider: "paypal",
              payout_target: u.payout_handle,
              status: "queued"
            }
          });

          if (debitError) throw debitError;

          results.push({
            user_id: u.user_id,
            trigger: u.trigger_reason,
            method: "cashout",
            amount: Number(u.available_usd),
            status: "success",
          });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error(`[AUTO-PAYOUT] Failed to queue cashout for ${u.user_id}:`, errMsg);
          results.push({
            user_id: u.user_id,
            trigger: u.trigger_reason,
            method: "cashout",
            amount: Number(u.available_usd),
            status: "failed",
            error: errMsg,
          });
        }
      }
    } else {
      // Proceed with automated batch API (Original logic)
      const PAYPAL_CLIENT_ID = env("PAYPAL_CLIENT_ID")!;
      const PAYPAL_SECRET = env("PAYPAL_SECRET")!;
      const IS_PROD = env("SUPABASE_URL")?.includes("casagrown") &&
        !env("SUPABASE_URL")?.includes("localhost");
      const PAYPAL_BASE_URL = IS_PROD
        ? "https://api-m.paypal.com"
        : "https://api-m.sandbox.paypal.com";

      const recipients: PayPalRecipient[] = cashoutUsers.map((u) => ({
        user_id: u.user_id,
        payout_handle: u.payout_handle,
        amount_usd: Number(u.available_usd),
        note: `CasaGrown auto-payout (${u.trigger_reason})`,
      }));

      try {
        const batchResult = await sendBatchPayPalPayout(
          recipients,
          PAYPAL_CLIENT_ID,
          PAYPAL_SECRET,
          PAYPAL_BASE_URL,
          "auto-payout"
        );

        if (batchResult.success) {
          // Batch debit all cashout users at once
          const debits = cashoutUsers.map((u) => ({
            user_id: u.user_id,
            amount_usd: Number(u.available_usd),
            metadata: {
              provider: "paypal",
              payout_target: u.payout_handle,
              batch_id: batchResult.batch_id,
              trigger: u.trigger_reason,
            },
          }));

          const { data: debitResult, error: debitError } = await supabase
            .rpc("batch_debit_market_balance", { p_debits: debits });

          if (debitError) {
            console.error("[AUTO-PAYOUT] Batch debit error:", debitError);
          }

          for (const u of cashoutUsers) {
            results.push({
              user_id: u.user_id,
              trigger: u.trigger_reason,
              method: "cashout",
              amount: Number(u.available_usd),
              status: "success",
            });
          }

          console.log(
            `[AUTO-PAYOUT] PayPal batch sent: ${batchResult.items_count} items, ` +
            `batch_id=${batchResult.batch_id}, debits=${debitResult?.succeeded || 'unknown'}`
          );
        } else {
          console.error("[AUTO-PAYOUT] PayPal batch failed:", batchResult.error);
          for (const u of cashoutUsers) {
            results.push({
              user_id: u.user_id,
              trigger: u.trigger_reason,
              method: "cashout",
              amount: Number(u.available_usd),
              status: "failed",
              error: batchResult.error,
            });
          }
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error("[AUTO-PAYOUT] PayPal batch exception:", errMsg);
        for (const u of cashoutUsers) {
          results.push({
            user_id: u.user_id,
            trigger: u.trigger_reason,
            method: "cashout",
            amount: Number(u.available_usd),
            status: "failed",
            error: errMsg,
          });
        }
      }
    }
  }

  // ── 3b. Gift cards (concurrent, concurrency: 10) ──
  if (giftCardUsers.length > 0) {
    await pAll(giftCardUsers, async (user) => {
      try {
        const amountCents = Math.round(Number(user.available_usd) * 100);
        const { data, error } = await supabase.functions.invoke(
          "market-purchase-gift-card",
          {
            body: {
              brandName: user.gift_card_brand || "Visa",
              faceValueCents: amountCents,
              pointsCost: amountCents,
            },
          }
        );

        if (error || !data?.success) {
          throw new Error(error?.message || data?.error || "Gift card failed");
        }

        results.push({
          user_id: user.user_id,
          trigger: user.trigger_reason,
          method: "giftcards",
          amount: Number(user.available_usd),
          status: "success",
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        results.push({
          user_id: user.user_id,
          trigger: user.trigger_reason,
          method: "giftcards",
          amount: Number(user.available_usd),
          status: "failed",
          error: errMsg,
        });
      }
    }, { concurrency: 10 });
  }

  // ── 3c. Donations (concurrent, concurrency: 5) ──
  if (donateUsers.length > 0) {
    await pAll(donateUsers, async (user) => {
      try {
        const amountCents = Math.round(Number(user.available_usd) * 100);
        const { data, error } = await supabase.functions.invoke(
          "market-donate-earnings",
          {
            body: {
              pointsAmount: amountCents,
              projectId: user.charity_project_id || null,
              projectTitle: user.charity_project_name || "Auto-Donation",
              organizationName:
                user.charity_project_name || "Auto-selected charity",
              theme: "auto_payout",
              itemId: user.charity_project_id || null,
            },
          }
        );

        if (error || !data?.success) {
          throw new Error(error?.message || data?.error || "Donation failed");
        }

        results.push({
          user_id: user.user_id,
          trigger: user.trigger_reason,
          method: "donate",
          amount: Number(user.available_usd),
          status: "success",
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        results.push({
          user_id: user.user_id,
          trigger: user.trigger_reason,
          method: "donate",
          amount: Number(user.available_usd),
          status: "failed",
          error: errMsg,
        });
      }
    }, { concurrency: 5 });
  }

  // 4. Summary
  const successCount = results.filter((r) => r.status === "success").length;
  const failedCount = results.filter((r) => r.status === "failed").length;

  console.log(
    `[AUTO-PAYOUT] Complete: ${successCount} processed, ${failedCount} failed`
  );

  return jsonOk(
    {
      success: true,
      processed: successCount,
      failed: failedCount,
      total_eligible: eligible.length,
      batches: {
        paypal: cashoutUsers.length,
        gift_cards: giftCardUsers.length,
        donations: donateUsers.length,
      },
      results,
    },
    corsHeaders
  );
});
