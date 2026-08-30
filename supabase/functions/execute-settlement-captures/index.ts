/**
 * execute-settlement-captures — Supabase Edge Function
 *
 * Called after run_market_settlement() to execute actual Stripe captures.
 * For each settlement_captures record in 'captured' status (DB-side marking),
 * calls Stripe API to capture the PaymentIntent.
 *
 * Flow:
 *   1. Query settlement_captures with capture_status = 'captured' for the given settlement
 *   2. For each: POST /v1/payment_intents/{id}/capture with the exact amount
 *   3. On success: update capture with stripe_capture_id
 *   4. On failure: auto-retry once after 5s delay
 *   5. If retry fails: create buyer_debt, notify buyer
 *   6. Record bank ledger inflow for successful captures
 *
 * Trigger: Called by settlement cron via pg_net, or manually by admin
 *
 * Request: { settlement_id }
 * Response: { total, succeeded, failed, debts_created }
 */

import {
    jsonOk,
    jsonError,
    serveWithCors,
} from "../_shared/serve-with-cors.ts";
import { getStripeApiBase } from "../_shared/stripe.ts";

serveWithCors(async (req, { supabase, env, corsHeaders }) => {
    const STRIPE_SECRET_KEY = env("STRIPE_SECRET_KEY");
    if (!STRIPE_SECRET_KEY) {
        return jsonError("STRIPE_SECRET_KEY not configured", corsHeaders);
    }
    // Configurable Stripe API base URL — defaults to production.
    // Set STRIPE_API_BASE=http://localhost:<port> in tests to use the simulator.
    const STRIPE_API_BASE = getStripeApiBase();

    const { settlement_id } = await req.json();
    if (!settlement_id) {
        return jsonError("settlement_id is required", corsHeaders);
    }

    // Get all captures for this settlement that need Stripe execution
    // BUG-18: Filter out rows already claimed by another worker within the last 30 minutes
    const lockCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: rawCaptures, error: captureErr } = await supabase
        .from("settlement_captures")
        .select("*")
        .eq("settlement_id", settlement_id)
        .eq("capture_status", "captured")  // DB marked as captured, but Stripe API not yet called
        .gt("capture_amount_usd", 0)
        .or(`processing_started_at.is.null,processing_started_at.lt.${lockCutoff}`);

    if (captureErr) {
        console.error("Failed to fetch captures:", captureErr);
        return jsonError("Failed to fetch captures", corsHeaders);
    }

    if (!rawCaptures || rawCaptures.length === 0) {
        return jsonOk({
            message: "No captures to execute",
            total: 0,
            succeeded: 0,
            failed: 0,
            debts_created: 0,
            transfers_total: 0,
            transfers_succeeded: 0,
            transfers_failed: 0,
        }, corsHeaders);
    }

    // BUG-18: Immediately stamp processing_started_at to soft-lock these rows
    // so concurrent cron runs skip them
    const captureIds = rawCaptures.map(c => c.id);
    const { error: lockErr } = await supabase
        .from("settlement_captures")
        .update({ processing_started_at: new Date().toISOString() })
        .in("id", captureIds);

    if (lockErr) {
        console.warn("[CAPTURE] Failed to stamp processing_started_at:", lockErr);
        // Continue anyway — the soft lock is best-effort
    }

    const captures = rawCaptures;

    console.log(`[CAPTURE] Processing ${captures.length} captures for settlement ${settlement_id}`);

    let succeeded = 0;
    let failed = 0;
    let debtsCreated = 0;

    // BUG-15: Track per-capture results for accurate totalCaptured computation
    const captureResults = captures.map(c => ({ id: c.id, success: false, amount: 0 }));
    const BATCH_SIZE = 10;
    for (let i = 0; i < captures.length; i += BATCH_SIZE) {
        const batch = captures.slice(i, i + BATCH_SIZE);
        
        await Promise.all(batch.map(async (capture, batchIdx) => {
            const captureIdx = i + batchIdx;
            const captureAmountCents = Math.round(capture.capture_amount_usd * 100);

            // BUG-17: Check if PaymentIntent auth has expired (> 6 days / 144 hours)
            const createdAt = new Date(capture.created_at);
            const ageMs = Date.now() - createdAt.getTime();
            const maxAgeMs = 144 * 60 * 60 * 1000; // 6 days in ms
            if (ageMs > maxAgeMs) {
                console.warn(
                    `⚠️ [CAPTURE] Skipping expired PI ${capture.stripe_payment_intent_id} ` +
                    `(created ${createdAt.toISOString()}, age: ${(ageMs / 3600000).toFixed(1)}h)`,
                );
                await supabase
                    .from("settlement_captures")
                    .update({
                        capture_status: "expired",
                        error_message: `PaymentIntent auth expired (age: ${(ageMs / 3600000).toFixed(1)}h, max: 144h)`,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", capture.id);
                failed++;
                return;
            }

            // Attempt Stripe capture
            const result = await attemptStripeCapture(
                STRIPE_SECRET_KEY,
                capture.stripe_payment_intent_id,
                captureAmountCents,
                STRIPE_API_BASE,
                capture.id,
            );

            if (result.success) {
                // Update capture record with Stripe charge ID
                await supabase
                    .from("settlement_captures")
                    .update({
                        stripe_capture_id: result.chargeId,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", capture.id);

                console.log(`✅ [CAPTURE] ${capture.stripe_payment_intent_id} → $${capture.capture_amount_usd}`);
                captureResults[captureIdx].success = true;
                captureResults[captureIdx].amount = capture.capture_amount_usd;
                succeeded++;
            } else {
                console.warn(`⚠️ [CAPTURE] First attempt failed for ${capture.stripe_payment_intent_id}: ${result.error}`);

                // Auto-retry after 5 second delay
                await new Promise((resolve) => setTimeout(resolve, 5000));

                const retryResult = await attemptStripeCapture(
                    STRIPE_SECRET_KEY,
                    capture.stripe_payment_intent_id,
                    captureAmountCents,
                    STRIPE_API_BASE,
                    capture.id,
                );

                if (retryResult.success) {
                    await supabase
                        .from("settlement_captures")
                        .update({
                            stripe_capture_id: retryResult.chargeId,
                            updated_at: new Date().toISOString(),
                        })
                        .eq("id", capture.id);

                    console.log(`✅ [CAPTURE] Retry succeeded: ${capture.stripe_payment_intent_id}`);
                    captureResults[captureIdx].success = true;
                    captureResults[captureIdx].amount = capture.capture_amount_usd;
                    succeeded++;
                } else {
                    // Permanent failure → mark capture failed, create buyer debt
                    const errorMsg = retryResult.error || "Capture failed after retry";

                    await supabase
                        .from("settlement_captures")
                        .update({
                            capture_status: "failed",
                            error_message: errorMsg,
                            updated_at: new Date().toISOString(),
                        })
                        .eq("id", capture.id);

                    // Create buyer debt
                    await supabase.from("buyer_debts").insert({
                        buyer_id: capture.buyer_id,
                        settlement_id: settlement_id,
                        capture_id: capture.id,
                        amount_usd: capture.capture_amount_usd,
                        reason: "capture_failed",
                        stripe_payment_intent_id: capture.stripe_payment_intent_id,
                        error_message: errorMsg,
                        retry_count: 2,
                    });

                    // Notify buyer (GAP-9: fix table + add email + SMS)
                    await supabase.from("market_notifications").insert({
                        user_id: capture.buyer_id,
                        content: `⚠️ Payment of $${capture.capture_amount_usd.toFixed(2)} could not be processed. ` +
                            `Please update your payment method to continue using the market.`,
                        link_url: "/profile",
                    });

                    // Typed email for capture failure
                    try {
                        const { data: profile } = await supabase
                            .from("profiles").select("full_name").eq("id", capture.buyer_id).single();
                        const { data: emailData } = await supabase
                            .rpc("get_user_email", { p_user_id: capture.buyer_id });

                        if (emailData) {
                            await supabase.functions.invoke("send-notification-email", {
                                body: {
                                    type: "capture_failed",
                                    recipients: [{ email: emailData, name: profile?.full_name || "there" }],
                                    dollarAmount: capture.capture_amount_usd,
                                },
                            });
                        }
                    } catch (emailErr) {
                        console.warn("Capture failure email failed:", emailErr);
                    }

                    // SMS fallback for capture failure
                    try {
                        await supabase.functions.invoke("send-sms-notification", {
                            body: {
                                userId: capture.buyer_id,
                                message: `⚠️ CasaGrown: Payment of $${capture.capture_amount_usd.toFixed(2)} could not be processed. Please update your payment method.`,
                                linkUrl: "/profile",
                            },
                        });
                    } catch (smsErr) {
                        console.warn("Capture failure SMS failed:", smsErr);
                    }

                    console.error(`❌ [CAPTURE] Failed permanently: ${capture.stripe_payment_intent_id} → debt created`);
                    failed++;
                    debtsCreated++;
                }
            }
        }));
    }

    // Record bank ledger inflow for total successfully captured amount
    if (succeeded > 0) {
        const totalCaptured = captureResults
            .filter(r => r.success === true)
            .reduce((sum, r) => sum + r.amount, 0);

        // We'll let the payout webhook handle the actual bank ledger inflow
        // since money doesn't arrive until Stripe sends the payout
        console.log(`[CAPTURE] Total captured: $${totalCaptured.toFixed(2)} (awaiting payout)`);
    }

    // ── Execute Stripe Connect Direct Transfers ─────────────────────────────────
    console.log(`[STRIPE-CONNECT-TRANSFER] Querying pending transfers for settlement ${settlement_id}...`);
    const { data: stripeSettlements, error: stripeSettlementsErr } = await supabase
        .from("user_settlements")
        .select(`
            id,
            user_id,
            net_payout_usd,
            profiles (
                stripe_connect_id,
                full_name,
                email
            )
        `)
        .eq("settlement_id", settlement_id)
        .eq("status", "stripe_transfer_pending");

    let transfersSucceeded = 0;
    let transfersFailed = 0;

    if (stripeSettlementsErr) {
        console.error("[STRIPE-CONNECT-TRANSFER] Failed to query user settlements for transfers:", stripeSettlementsErr);
    } else if (stripeSettlements && stripeSettlements.length > 0) {
        console.log(`[STRIPE-CONNECT-TRANSFER] Found ${stripeSettlements.length} pending transfers to execute.`);

        for (const stripeSettlement of stripeSettlements) {
            const userId = stripeSettlement.user_id;
            const netPayoutUsd = Number(stripeSettlement.net_payout_usd);
            const profile = stripeSettlement.profiles as any;
            const stripeConnectId = profile?.stripe_connect_id;
            const fullName = profile?.full_name || "Seller";
            const email = profile?.email;

            console.log(`[STRIPE-CONNECT-TRANSFER] Transferring $${netPayoutUsd} to user ${userId} (Stripe Connect ID: ${stripeConnectId})`);

            if (!stripeConnectId) {
                const errorMsg = "Seller has no linked Stripe Connect ID";
                console.error(`[STRIPE-CONNECT-TRANSFER] ${errorMsg} for user ${userId}`);
                await supabase
                    .from("user_settlements")
                    .update({
                        status: "stripe_transfer_failed",
                        stripe_transfer_error: errorMsg,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", stripeSettlement.id);
                transfersFailed++;
                continue;
            }

            // HIGH-1: Build transfer with retry for transient failures.
            // Only retry on 5xx (server errors); 4xx are permanent (e.g. invalid account).
            const transferResult = await attemptStripeTransferWithRetry(
                STRIPE_SECRET_KEY,
                stripeConnectId,
                netPayoutUsd,
                settlement_id,
                userId,
                STRIPE_API_BASE,
            );

            if (!transferResult.success) {
                const stripeError = transferResult.error ?? "Unknown transfer error";
                console.error(`[STRIPE-CONNECT-TRANSFER] Transfer permanently failed for user ${userId}: ${stripeError}`);

                await supabase
                    .from("user_settlements")
                    .update({
                        status: "stripe_transfer_failed",
                        stripe_transfer_error: stripeError,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", stripeSettlement.id);

                // C2 FIX: Restore wallet balance so seller can withdraw manually.
                // This reverses the payout_sent debit from settlement and credits pending_usd.
                try {
                    const { data: restoreResult, error: restoreErr } = await supabase.rpc(
                        "restore_wallet_after_failed_transfer",
                        {
                            p_user_settlement_id: stripeSettlement.id,
                            p_reason: "stripe_transfer_failed",
                            p_error_details: stripeError,
                            p_new_status: "wallet_fallback",
                        },
                    );
                    if (restoreErr) {
                        console.error(`[STRIPE-CONNECT-TRANSFER] CRITICAL: Failed to restore wallet for user ${userId}:`, restoreErr);
                    } else if (restoreResult?.error) {
                        console.error(`[STRIPE-CONNECT-TRANSFER] CRITICAL: Wallet restore RPC returned error for user ${userId}:`, restoreResult.error);
                    } else {
                        console.log(`[STRIPE-CONNECT-TRANSFER] Wallet restored for user ${userId}: $${netPayoutUsd.toFixed(2)} → pending_usd`);
                    }
                } catch (restoreEx) {
                    console.error(`[STRIPE-CONNECT-TRANSFER] CRITICAL: Exception restoring wallet for user ${userId}:`, restoreEx);
                }

                // 1. In-App Notification — tell user funds are in their wallet
                await supabase.from("notifications").insert({
                    user_id: userId,
                    content: `⚠️ Direct Payout Failed: We couldn't transfer $${netPayoutUsd.toFixed(2)} to your Stripe account (${stripeError}). Your funds have been restored to your CasaGrown wallet — you can withdraw via Gift Card, Venmo, or PayPal.`,
                    link_url: "/earnings/payout",
                });

                // 2. Push Notification for Failure
                try {
                    await supabase.functions.invoke("send-push-notification", {
                        body: {
                            userIds: [userId],
                            title: "⚠️ Direct deposit failed",
                            body: `Transfer of $${netPayoutUsd.toFixed(2)} failed. Funds restored to your wallet.`,
                            url: "/earnings/payout",
                        },
                    });
                } catch (pushErr) {
                    console.warn("[STRIPE-CONNECT-TRANSFER] Failed to send failure push notification:", pushErr);
                }

                // 3. SMS Notification for Failure
                try {
                    await supabase.functions.invoke("send-sms-notification", {
                        body: {
                            userId,
                            content: `CasaGrown: Direct deposit of $${netPayoutUsd.toFixed(2)} failed. Your funds have been restored to your wallet. Withdraw via Gift Card, Venmo, or PayPal at casagrown.org/earnings/payout`,
                        },
                    });
                } catch (smsErr) {
                    console.warn("[STRIPE-CONNECT-TRANSFER] Failed to send failure SMS notification:", smsErr);
                }

                // 4. Email Notification for Failure
                try {
                    if (email) {
                        await supabase.functions.invoke("send-notification-email", {
                            body: {
                                type: "stripe_connect_transfer_failed",
                                recipients: [{ email, name: fullName }],
                                dollarAmount: netPayoutUsd,
                                errorMessage: stripeError,
                            },
                        });
                    }
                } catch (emailErr) {
                    console.warn("[STRIPE-CONNECT-TRANSFER] Failed to send failure email notification:", emailErr);
                }

                transfersFailed++;
            } else {
                const transferData = transferResult.data!;
                const now = new Date().toISOString();

                // HIGH-6: Stamp stripe_transfer_completed_at for SLA tracking
                await supabase
                    .from("user_settlements")
                    .update({
                        status: "paid_out",
                        stripe_transfer_id: transferData.id,
                        stripe_transfer_completed_at: now,
                        updated_at: now,
                    })
                    .eq("id", stripeSettlement.id);

                // Log outflow bank ledger entry
                try {
                    await supabase.rpc("append_bank_ledger_entry", {
                        p_event_type: "stripe_connect_transfer",
                        p_direction: "outflow",
                        p_amount_usd: netPayoutUsd,
                        p_provider: "stripe",
                        p_reference_type: "transfer",
                        p_reference_id: transferData.id,
                        p_settlement_id: settlement_id,
                        p_metadata: { user_id: userId, stripe_connect_id: stripeConnectId },
                    });
                } catch (ledgerErr) {
                    console.warn("[STRIPE-CONNECT-TRANSFER] Failed to append bank ledger entry:", ledgerErr);
                }

                // 1. In-App Notification for Success
                await supabase.from("notifications").insert({
                    user_id: userId,
                    content: `Direct Payout Completed: $${netPayoutUsd.toFixed(2)} has been transferred to your linked bank account. Reference: ${transferData.id}.`,
                    link_url: "/earnings",
                });

                // 2. Push Notification for Success
                try {
                    await supabase.functions.invoke("send-push-notification", {
                        body: {
                            userIds: [userId],
                            title: "💸 Funds on the way!",
                            body: `$${netPayoutUsd.toFixed(2)} has been transferred to your bank via Stripe Connect.`,
                            url: "/earnings",
                        },
                    });
                } catch (pushErr) {
                    console.warn("[STRIPE-CONNECT-TRANSFER] Failed to send success push notification:", pushErr);
                }

                // 3. SMS Notification for Success
                try {
                    await supabase.functions.invoke("send-sms-notification", {
                        body: {
                            userId,
                            content: `CasaGrown: Direct payout of $${netPayoutUsd.toFixed(2)} has been sent to your bank. Check your Stripe dashboard for ETA.`,
                        },
                    });
                } catch (smsErr) {
                    console.warn("[STRIPE-CONNECT-TRANSFER] Failed to send success SMS notification:", smsErr);
                }

                // 4. Email Notification for Success
                try {
                    if (email) {
                        await supabase.functions.invoke("send-notification-email", {
                            body: {
                                type: "stripe_connect_transfer_success",
                                recipients: [{ email, name: fullName }],
                                dollarAmount: netPayoutUsd,
                                stripeTransferId: transferData.id,
                            },
                        });
                    }
                } catch (emailErr) {
                    console.warn("[STRIPE-CONNECT-TRANSFER] Failed to send success email notification:", emailErr);
                }

                console.log(`✅ [STRIPE-CONNECT-TRANSFER] Successfully transferred $${netPayoutUsd} to user ${userId} (${transferData.id})`);
                transfersSucceeded++;
            }
        }
    } else {
        console.log("[STRIPE-CONNECT-TRANSFER] No pending Stripe Connect transfers to execute.");
    }

    return jsonOk({
        settlement_id,
        total: captures.length,
        succeeded,
        failed,
        debts_created: debtsCreated,
        transfers_total: stripeSettlements?.length || 0,
        transfers_succeeded: transfersSucceeded,
        transfers_failed: transfersFailed,
    }, corsHeaders);
});

// ── Helper: Attempt Stripe capture ──────────────────────────────────────────

async function attemptStripeCapture(
    stripeKey: string,
    paymentIntentId: string,
    amountCents: number,
    apiBase: string,
    captureRecordId: string,
): Promise<{ success: boolean; chargeId?: string; error?: string }> {
    try {
        const response = await fetch(
            `${apiBase}/v1/payment_intents/${paymentIntentId}/capture`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${stripeKey}`,
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Idempotency-Key": `capture_${captureRecordId}`,
                },
                body: new URLSearchParams({
                    amount_to_capture: String(amountCents),
                }),
            },
        );

        const data = await response.json();

        if (!response.ok) {
            return {
                success: false,
                error: data?.error?.message || `HTTP ${response.status}`,
            };
        }

        // Get the charge ID from the captured payment intent
        const chargeId = data.latest_charge || data.charges?.data?.[0]?.id;

        return { success: true, chargeId };
    } catch (err) {
        return {
            success: false,
            error: err instanceof Error ? err.message : "Unknown error",
        };
    }
}

// ── Helper: Attempt Stripe Transfer with retry on transient 5xx errors ───────
// HIGH-1: Mirrors the PI capture retry pattern. Only retries on server errors
// (5xx); 4xx errors (invalid account, insufficient funds) are permanent.

async function attemptStripeTransferWithRetry(
    stripeKey: string,
    destination: string,
    amountUsd: number,
    transferGroup: string,
    userId: string,
    apiBase: string,
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
    const amountCents = Math.round(amountUsd * 100);
    const body = new URLSearchParams({
        amount: String(amountCents),
        currency: "usd",
        destination,
        transfer_group: transferGroup,
        "metadata[settlement_id]": transferGroup,
        "metadata[user_id]": userId,
    });

    for (let attempt = 1; attempt <= 2; attempt++) {
        if (attempt > 1) {
            console.warn(`[STRIPE-CONNECT-TRANSFER] Retrying transfer for user ${userId} (attempt ${attempt}/2 — waiting 5s)...`);
            await new Promise((resolve) => setTimeout(resolve, 5000));
        }

        try {
            const response = await fetch(`${apiBase}/v1/transfers`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${stripeKey}`,
                    "Content-Type": "application/x-www-form-urlencoded",
                    // C1 FIX: Idempotency key prevents duplicate transfers if the function
                    // crashes after Stripe processes the transfer but before we record success.
                    // Same settlement + same user = same key = Stripe deduplicates automatically.
                    "Idempotency-Key": `xfer_${transferGroup}_${userId}`,
                },
                body,
            });

            const data = await response.json();

            if (response.ok) {
                if (attempt > 1) {
                    console.log(`[STRIPE-CONNECT-TRANSFER] Retry succeeded for user ${userId} on attempt ${attempt}`);
                }
                return { success: true, data };
            }

            const errorMsg = data?.error?.message || `HTTP ${response.status}`;

            // 4xx = permanent failure (bad account, insufficient funds, etc.) — do not retry
            if (response.status < 500) {
                console.error(`[STRIPE-CONNECT-TRANSFER] Permanent transfer failure (${response.status}) for user ${userId}: ${errorMsg}`);
                return { success: false, error: errorMsg };
            }

            // 5xx = transient — will retry if attempt < 2
            console.warn(`[STRIPE-CONNECT-TRANSFER] Transient failure (${response.status}) for user ${userId}: ${errorMsg}`);
            if (attempt === 2) {
                return { success: false, error: `${errorMsg} (failed after 2 attempts)` };
            }
        } catch (fetchErr) {
            const errorStr = fetchErr instanceof Error ? fetchErr.message : "Network error";
            console.warn(`[STRIPE-CONNECT-TRANSFER] Fetch error on attempt ${attempt} for user ${userId}: ${errorStr}`);
            if (attempt === 2) {
                return { success: false, error: `${errorStr} (failed after 2 attempts)` };
            }
        }
    }

    return { success: false, error: "Transfer failed after all retry attempts" };
}
