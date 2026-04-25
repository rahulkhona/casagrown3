/**
 * stripe-webhook — Supabase Edge Function
 *
 * Receives webhook events from Stripe and processes them.
 * Primary event: payment_intent.succeeded → calls confirm-payment to credit points.
 *
 * This handles the case where the user kills the app before the frontend
 * can confirm the payment — Stripe still sends the webhook, and points
 * are credited server-side.
 *
 * Security: Verifies Stripe webhook signature to prevent spoofing.
 *
 * Setup:
 *   1. Set STRIPE_WEBHOOK_SECRET env var (from Stripe dashboard → Webhooks)
 *   2. Configure Stripe webhook endpoint to point to this function's URL
 *   3. Subscribe to event: payment_intent.succeeded
 */

import {
    jsonError,
    jsonOk,
    serveWithCors,
} from "../_shared/serve-with-cors.ts";

// ── Main handler ────────────────────────────────────────────────────────────

serveWithCors(async (req, { supabase, env, corsHeaders }) => {
    const STRIPE_WEBHOOK_SECRET = env("STRIPE_WEBHOOK_SECRET");

    // Parse the raw body for signature verification
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    // Verify webhook signature (if secret is configured)
    if (STRIPE_WEBHOOK_SECRET && signature) {
        const isValid = await verifyStripeSignature(
            body,
            signature,
            STRIPE_WEBHOOK_SECRET,
        );
        if (!isValid) {
            console.error("Invalid Stripe webhook signature");
            return jsonError("Invalid signature", corsHeaders, 401);
        }
    } else if (STRIPE_WEBHOOK_SECRET && !signature) {
        console.error("Missing stripe-signature header");
        return jsonError("Missing signature", corsHeaders, 401);
    }

    const event = JSON.parse(body);
    console.log(`Stripe webhook received: ${event.type}, id: ${event.id}`);

    switch (event.type) {
        case "payment_intent.succeeded": {
            const paymentIntent = event.data.object;
            const stripeId = paymentIntent.id;

            console.log(`Processing payment_intent.succeeded: ${stripeId}`);

            // Find the matching payment_transaction
            const { data: txn, error: txnError } = await supabase
                .from("payment_transactions")
                .select("id, status")
                .eq("stripe_payment_intent_id", stripeId)
                .single();

            if (txnError || !txn) {
                console.error(
                    `No payment_transaction found for Stripe PI: ${stripeId}`,
                    txnError,
                );
                // Return 200 anyway — Stripe will stop retrying
                return jsonOk(
                    { received: true, warning: "Transaction not found" },
                    corsHeaders,
                );
            }

            // Already processed (idempotency)
            if (txn.status === "succeeded") {
                console.log(
                    `Payment ${txn.id} already confirmed, skipping`,
                );
                return jsonOk(
                    { received: true, alreadyProcessed: true },
                    corsHeaders,
                );
            }

            // Call confirm-payment to credit points
            const { data: confirmResult, error: confirmError } = await supabase
                .functions
                .invoke("confirm-payment", {
                    body: { paymentTransactionId: txn.id },
                });

            if (confirmError) {
                console.error(
                    "confirm-payment invocation failed:",
                    confirmError,
                );
                throw new Error(
                    `Failed to confirm payment: ${confirmError.message}`,
                );
            }

            console.log(
                `✅ Webhook processed: ${stripeId} → ${confirmResult?.pointsAmount} points`,
            );

            return jsonOk(
                { received: true, ...confirmResult },
                corsHeaders,
            );
        }

        case "payment_intent.payment_failed": {
            const paymentIntent = event.data.object;
            const stripeId = paymentIntent.id;
            const failureMessage = paymentIntent.last_payment_error?.message ||
                "Payment failed";

            console.log(
                `Processing payment_intent.payment_failed: ${stripeId}`,
            );

            // Update the transaction status to failed
            await supabase
                .from("payment_transactions")
                .update({
                    status: "failed",
                    metadata: { failure_reason: failureMessage },
                    updated_at: new Date().toISOString(),
                })
                .eq("stripe_payment_intent_id", stripeId);

            return jsonOk({ received: true }, corsHeaders);
        }

        // ═══════════════════════════════════════════════════════
        // Payout events — settlement clearing
        // ═══════════════════════════════════════════════════════

        case "payout.paid": {
            const payout = event.data.object;
            const payoutId = payout.id;
            const payoutAmountUsd = payout.amount / 100;

            console.log(
                `Processing payout.paid: ${payoutId}, amount: $${payoutAmountUsd}`,
            );

            // ── Step 1: Try Balance Transactions API for exact matching ──
            const STRIPE_SECRET_KEY = env("STRIPE_SECRET_KEY");
            let matchedByApi = false;
            const matchedSettlements: string[] = [];
            const affectedUserIds: string[] = [];

            if (STRIPE_SECRET_KEY) {
                try {
                    // Fetch balance transactions for this payout
                    const btRes = await fetch(
                        `https://api.stripe.com/v1/balance_transactions?payout=${payoutId}&limit=100&type=charge`,
                        {
                            headers: {
                                Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
                            },
                        },
                    );

                    if (btRes.ok) {
                        const btData = await btRes.json();
                        const chargeIds = btData.data?.map(
                            (bt: { source: string }) => bt.source,
                        ) || [];

                        console.log(
                            `Balance Transactions API: ${chargeIds.length} charges in payout ${payoutId}`,
                        );

                        if (chargeIds.length > 0) {
                            // Find settlement_captures matching these charges
                            const { data: captures } = await supabase
                                .from("settlement_captures")
                                .select(
                                    "settlement_id, capture_amount_usd, buyer_id",
                                )
                                .in("stripe_capture_id", chargeIds);

                            if (captures && captures.length > 0) {
                                // Group by settlement and confirm each
                                const settlementMap = new Map<
                                    string,
                                    number
                                >();
                                for (const cap of captures) {
                                    const current = settlementMap.get(
                                        cap.settlement_id,
                                    ) || 0;
                                    settlementMap.set(
                                        cap.settlement_id,
                                        current +
                                            Number(cap.capture_amount_usd),
                                    );
                                    if (
                                        !affectedUserIds.includes(
                                            cap.buyer_id,
                                        )
                                    ) {
                                        affectedUserIds.push(cap.buyer_id);
                                    }
                                }

                                for (
                                    const [settlementId, capturedUsd]
                                        of settlementMap
                                ) {
                                    // Bank ledger inflow
                                    await supabase.rpc(
                                        "append_bank_ledger_entry",
                                        {
                                            p_event_type:
                                                "stripe_payout_received",
                                            p_direction: "inflow",
                                            p_amount_usd: capturedUsd,
                                            p_provider: "stripe",
                                            p_reference_type: "payout",
                                            p_reference_id: payoutId,
                                            p_settlement_id: settlementId,
                                            p_metadata: {
                                                payout_total: payoutAmountUsd,
                                                matched_via:
                                                    "balance_transactions_api",
                                            },
                                        },
                                    );

                                    // Confirm settlement
                                    const { error: confirmErr } = await supabase
                                        .rpc(
                                            "confirm_settlement_funds_received",
                                            {
                                                p_settlement_id: settlementId,
                                                p_stripe_payout_id: payoutId,
                                                p_stripe_payout_amount_usd:
                                                    capturedUsd,
                                            },
                                        );

                                    if (confirmErr) {
                                        console.error(
                                            `Failed to confirm settlement ${settlementId}:`,
                                            confirmErr,
                                        );
                                    } else {
                                        matchedSettlements.push(settlementId);
                                        console.log(
                                            `✅ Settlement ${settlementId} cleared via API-matched payout ${payoutId}`,
                                        );
                                    }
                                }

                                matchedByApi = true;
                            }
                        }
                    } else {
                        console.warn(
                            `Balance Transactions API failed (${btRes.status}), falling back to amount matching`,
                        );
                    }
                } catch (apiErr) {
                    console.warn(
                        "Balance Transactions API error, falling back:",
                        apiErr,
                    );
                }
            }

            // ── Step 2: Fallback — match by amount (oldest first) ──
            if (!matchedByApi) {
                const { data: pendingSettlements } = await supabase
                    .from("market_settlements")
                    .select("id, total_captured_usd")
                    .eq("status", "funds_pending")
                    .is("stripe_payout_id", null)
                    .order("created_at", { ascending: true });

                if (
                    !pendingSettlements || pendingSettlements.length === 0
                ) {
                    console.log(
                        `No pending settlements found for payout ${payoutId}`,
                    );

                    // Still record the event
                    await supabase.from("stripe_payout_events").insert({
                        stripe_payout_id: payoutId,
                        event_type: "paid",
                        amount_usd: payoutAmountUsd,
                        matched_settlement_ids: [],
                        affected_user_ids: [],
                        raw_event: event,
                    });

                    return jsonOk(
                        {
                            received: true,
                            warning: "No matching settlements",
                        },
                        corsHeaders,
                    );
                }

                let remainingAmount = payoutAmountUsd;
                for (const settlement of pendingSettlements) {
                    if (remainingAmount <= 0) break;

                    const portionUsd = Math.min(
                        remainingAmount,
                        settlement.total_captured_usd,
                    );

                    await supabase.rpc("append_bank_ledger_entry", {
                        p_event_type: "stripe_payout_received",
                        p_direction: "inflow",
                        p_amount_usd: portionUsd,
                        p_provider: "stripe",
                        p_reference_type: "payout",
                        p_reference_id: payoutId,
                        p_settlement_id: settlement.id,
                        p_metadata: {
                            payout_total: payoutAmountUsd,
                            matched_via: "amount_fallback",
                        },
                    });

                    const { error: confirmErr } = await supabase.rpc(
                        "confirm_settlement_funds_received",
                        {
                            p_settlement_id: settlement.id,
                            p_stripe_payout_id: payoutId,
                            p_stripe_payout_amount_usd: portionUsd,
                        },
                    );

                    if (confirmErr) {
                        console.error(
                            `Failed to confirm settlement ${settlement.id}:`,
                            confirmErr,
                        );
                    } else {
                        matchedSettlements.push(settlement.id);
                        console.log(
                            `✅ Settlement ${settlement.id} cleared via amount-matched payout ${payoutId}`,
                        );
                    }

                    remainingAmount -= portionUsd;
                }
            }

            // ── Step 3: Collect affected user IDs from matched settlements ──
            if (matchedSettlements.length > 0 && affectedUserIds.length === 0) {
                const { data: userSettlements } = await supabase
                    .from("user_settlements")
                    .select("user_id")
                    .in("settlement_id", matchedSettlements);
                if (userSettlements) {
                    for (const us of userSettlements) {
                        if (!affectedUserIds.includes(us.user_id)) {
                            affectedUserIds.push(us.user_id);
                        }
                    }
                }
            }

            // ── Step 4: Record payout event ──
            await supabase.from("stripe_payout_events").insert({
                stripe_payout_id: payoutId,
                event_type: "paid",
                amount_usd: payoutAmountUsd,
                matched_settlement_ids: matchedSettlements,
                affected_user_ids: affectedUserIds,
                raw_event: event,
            });

            return jsonOk({
                received: true,
                payout_id: payoutId,
                matched_settlements: matchedSettlements,
                matched_via: matchedByApi
                    ? "balance_transactions_api"
                    : "amount_fallback",
            }, corsHeaders);
        }

        case "payout.failed": {
            const payout = event.data.object;
            const payoutId = payout.id;
            const payoutAmountUsd = (payout.amount || 0) / 100;
            const failureCode = payout.failure_code || "unknown";
            const failureMessage = payout.failure_message ||
                "Payout failed";

            console.error(
                `⚠️ Payout FAILED: ${payoutId}, amount: $${payoutAmountUsd}, reason: ${failureMessage}`,
            );

            // ── Step 1: Identify affected settlements and users ──
            const { data: pendingSettlements } = await supabase
                .from("market_settlements")
                .select("id, total_captured_usd, market_date")
                .eq("status", "funds_pending")
                .order("created_at", { ascending: true });

            const affectedSettlementIds = (pendingSettlements || []).map(
                (s: { id: string }) => s.id,
            );

            // Get all users with pending balances in these settlements
            let affectedUsers: { user_id: string }[] = [];
            if (affectedSettlementIds.length > 0) {
                const { data: userSettlements } = await supabase
                    .from("user_settlements")
                    .select("user_id")
                    .in("settlement_id", affectedSettlementIds)
                    .eq("status", "pending");
                affectedUsers = userSettlements || [];
            }

            const affectedUserIds = [
                ...new Set(affectedUsers.map((u) => u.user_id)),
            ];

            // ── Step 2: Save payout failure event ──
            await supabase.from("stripe_payout_events").insert({
                stripe_payout_id: payoutId,
                event_type: "failed",
                amount_usd: payoutAmountUsd,
                failure_code: failureCode,
                failure_message: failureMessage,
                matched_settlement_ids: affectedSettlementIds,
                affected_user_ids: affectedUserIds,
                raw_event: event,
            });

            // ── Step 3: Notify admin staff ──
            const { data: adminStaff } = await supabase
                .from("staff_members")
                .select("user_id, email")
                .contains("roles", ["admin"]);

            const alertContent =
                `🚨 Stripe payout FAILED: $${payoutAmountUsd.toFixed(2)}. ` +
                `Reason: ${failureMessage}. ` +
                `${affectedSettlementIds.length} settlement(s) and ${affectedUserIds.length} user(s) affected. ` +
                `Fix in Stripe dashboard — funds will auto-clear on next successful payout.`;

            for (const staff of adminStaff || []) {
                // In-app notification (market_notifications)
                try {
                    await supabase.rpc("notify_market_event", {
                        p_user_id: staff.user_id,
                        p_content: alertContent,
                        p_link_url: "/earnings/admin/payouts",
                        p_send_sms: true, // GAP-6: SMS for critical admin alerts
                    });
                } catch (notifErr) {
                    console.warn(
                        `notify_market_event failed for staff ${staff.user_id}:`,
                        notifErr,
                    );
                }

                // Email notification
                if (staff.email) {
                    try {
                        await supabase.functions.invoke(
                            "send-market-email",
                            {
                                body: {
                                    to: staff.email,
                                    subject:
                                        `🚨 URGENT: Stripe Payout Failed — $${payoutAmountUsd.toFixed(2)}`,
                                    html: `
                                        <h2>⚠️ Stripe Payout Failed</h2>
                                        <table style="border-collapse:collapse;width:100%;max-width:500px;">
                                          <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Payout ID</strong></td><td style="padding:8px;border:1px solid #ddd;">${payoutId}</td></tr>
                                          <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Amount</strong></td><td style="padding:8px;border:1px solid #ddd;">$${payoutAmountUsd.toFixed(2)}</td></tr>
                                          <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Failure Code</strong></td><td style="padding:8px;border:1px solid #ddd;">${failureCode}</td></tr>
                                          <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Reason</strong></td><td style="padding:8px;border:1px solid #ddd;">${failureMessage}</td></tr>
                                          <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Settlements Affected</strong></td><td style="padding:8px;border:1px solid #ddd;">${affectedSettlementIds.length}</td></tr>
                                          <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Users Affected</strong></td><td style="padding:8px;border:1px solid #ddd;">${affectedUserIds.length}</td></tr>
                                        </table>
                                        <p style="margin-top:16px;">Seller funds remain in <code>pending_usd</code> until the next successful payout.</p>
                                        <p><strong>Action Required:</strong> Check the <a href="https://dashboard.stripe.com/payouts">Stripe Dashboard</a> and fix the bank routing issue. Stripe does NOT auto-retry failed payouts.</p>
                                    `,
                                },
                            },
                        );
                    } catch (emailErr) {
                        console.warn(
                            `Email to ${staff.email} failed:`,
                            emailErr,
                        );
                    }
                }
            }

            // Push notification to admin staff
            const adminUserIds = (adminStaff || []).map(
                (s: { user_id: string }) => s.user_id,
            );
            if (adminUserIds.length > 0) {
                try {
                    await supabase.functions.invoke(
                        "send-push-notification",
                        {
                            body: {
                                userIds: adminUserIds,
                                title: "🚨 Stripe Payout Failed",
                                body:
                                    `$${payoutAmountUsd.toFixed(2)} payout failed: ${failureMessage}. ${affectedUserIds.length} users affected.`,
                                url: "/earnings/admin/payouts",
                            },
                        },
                    );
                } catch (pushErr) {
                    console.warn("Push notification failed:", pushErr);
                }
            }

            return jsonOk({
                received: true,
                payout_id: payoutId,
                affected_settlements: affectedSettlementIds.length,
                affected_users: affectedUserIds.length,
            }, corsHeaders);
        }

        // ═══════════════════════════════════════════════════════
        // Dispute events — chargeback handling
        // ═══════════════════════════════════════════════════════

        case "charge.dispute.created": {
            const dispute = event.data.object;
            const chargeId = dispute.charge;
            const paymentIntentId = dispute.payment_intent;
            const disputeAmountUsd = dispute.amount / 100;
            const disputeFeeUsd = 15.00; // Stripe's standard dispute fee
            const evidenceDueBy = dispute.evidence_details?.due_by
                ? new Date(dispute.evidence_details.due_by * 1000).toISOString()
                : null;

            console.log(
                `Processing charge.dispute.created: ${dispute.id}, charge=${chargeId}, amount=$${disputeAmountUsd}`,
            );

            // Find the capture associated with this charge → get buyer + settlement
            const { data: capture } = await supabase
                .from("settlement_captures")
                .select("id, buyer_id, settlement_id")
                .or(`stripe_capture_id.eq.${chargeId},stripe_payment_intent_id.eq.${paymentIntentId}`)
                .limit(1)
                .single();

            const buyerId = capture?.buyer_id || null;
            const settlementId = capture?.settlement_id || null;

            // Get market_date from settlement
            let marketDate: string | null = null;
            if (settlementId) {
                const { data: settlement } = await supabase
                    .from("market_settlements")
                    .select("market_date")
                    .eq("id", settlementId)
                    .single();
                marketDate = settlement?.market_date || null;
            }

            // ── Insert into stripe_disputes ──
            const { error: insertErr } = await supabase
                .from("stripe_disputes")
                .insert({
                    stripe_dispute_id: dispute.id,
                    stripe_charge_id: chargeId,
                    stripe_payment_intent_id: paymentIntentId,
                    buyer_id: buyerId,
                    amount_usd: disputeAmountUsd,
                    fee_usd: disputeFeeUsd,
                    reason: dispute.reason || 'unknown',
                    status: dispute.status || 'needs_response',
                    evidence_due_by: evidenceDueBy,
                    settlement_id: settlementId,
                    market_date: marketDate,
                    stripe_metadata: dispute,
                });

            if (insertErr) {
                console.error("Failed to insert stripe_dispute:", insertErr);
            }

            // ── Create buyer debt ──
            if (capture) {
                await supabase.from("buyer_debts").insert({
                    buyer_id: capture.buyer_id,
                    settlement_id: capture.settlement_id,
                    capture_id: capture.id,
                    amount_usd: disputeAmountUsd,
                    reason: "chargeback",
                    stripe_payment_intent_id: paymentIntentId || chargeId,
                    metadata: {
                        dispute_id: dispute.id,
                        reason: dispute.reason,
                    },
                }).then(({ error }) => {
                    if (error) console.warn("buyer_debts insert (may already exist):", error.message);
                });
            }

            // ── Bank ledger outflow (funds withdrawn) ──
            await supabase.rpc("append_bank_ledger_entry", {
                p_event_type: "chargeback_debit",
                p_direction: "outflow",
                p_amount_usd: disputeAmountUsd + disputeFeeUsd,
                p_provider: "stripe",
                p_reference_type: "dispute",
                p_reference_id: dispute.id,
                p_settlement_id: settlementId,
                p_metadata: { fee: disputeFeeUsd, reason: dispute.reason },
            });

            // ── Notify admin staff (email + push + in-app) ──
            const { data: adminStaffDispute } = await supabase
                .from("staff_members")
                .select("user_id, email")
                .contains("roles", ["admin"]);

            const dueByStr = evidenceDueBy
                ? new Date(evidenceDueBy).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                : 'unknown';
            const daysLeft = evidenceDueBy
                ? Math.ceil((new Date(evidenceDueBy).getTime() - Date.now()) / 86400000)
                : null;

            for (const staff of adminStaffDispute || []) {
                // In-app notification
                try {
                    await supabase.rpc("notify_market_event", {
                        p_user_id: staff.user_id,
                        p_content:
                            `🚨 Chargeback dispute filed: $${disputeAmountUsd.toFixed(2)} — Reason: ${dispute.reason}. ` +
                            `Respond by ${dueByStr}${daysLeft ? ` (${daysLeft} days)` : ''}.`,
                        p_link_url: "/disputes",
                    });
                } catch (notifErr) {
                    console.warn("notify_market_event failed:", notifErr);
                }

                // Email
                if (staff.email) {
                    try {
                        await supabase.functions.invoke("send-market-email", {
                            body: {
                                to: staff.email,
                                subject: `🚨 Chargeback Dispute: $${disputeAmountUsd.toFixed(2)} — Respond by ${dueByStr}`,
                                html: `
                                    <h2>🚨 Chargeback Dispute Filed</h2>
                                    <table style="border-collapse:collapse;width:100%;max-width:500px;">
                                      <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Dispute ID</strong></td><td style="padding:8px;border:1px solid #ddd;">${dispute.id}</td></tr>
                                      <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Amount</strong></td><td style="padding:8px;border:1px solid #ddd;color:red;">$${disputeAmountUsd.toFixed(2)}</td></tr>
                                      <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Dispute Fee</strong></td><td style="padding:8px;border:1px solid #ddd;">$${disputeFeeUsd.toFixed(2)}</td></tr>
                                      <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Reason</strong></td><td style="padding:8px;border:1px solid #ddd;">${dispute.reason}</td></tr>
                                      <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Evidence Due</strong></td><td style="padding:8px;border:1px solid #ddd;color:red;font-weight:bold;">${dueByStr}${daysLeft ? ` (${daysLeft} days)` : ''}</td></tr>
                                      <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Market Date</strong></td><td style="padding:8px;border:1px solid #ddd;">${marketDate || 'N/A'}</td></tr>
                                    </table>
                                    <p style="margin-top:16px;color:red;"><strong>⚠️ If you don't submit evidence by the deadline, you automatically lose the dispute.</strong></p>
                                    <p>Go to <strong>Admin Portal → Disputes</strong> to review evidence and submit your response.</p>
                                `,
                            },
                        });
                    } catch (emailErr) {
                        console.warn(`Email failed for ${staff.email}:`, emailErr);
                    }
                }
            }

            // Push notification
            const disputeAdminIds = (adminStaffDispute || []).map(
                (s: { user_id: string }) => s.user_id,
            );
            if (disputeAdminIds.length > 0) {
                try {
                    await supabase.functions.invoke("send-push-notification", {
                        body: {
                            userIds: disputeAdminIds,
                            title: "🚨 Chargeback Dispute",
                            body: `$${disputeAmountUsd.toFixed(2)} disputed — ${dispute.reason}. Respond by ${dueByStr}.`,
                            url: "/disputes",
                        },
                    });
                } catch (pushErr) {
                    console.warn("Push notification failed:", pushErr);
                }
            }

            return jsonOk({
                received: true,
                dispute_id: dispute.id,
                amount: disputeAmountUsd,
                deadline: evidenceDueBy,
            }, corsHeaders);
        }

        case "charge.dispute.updated": {
            const dispute = event.data.object;
            console.log(`Processing charge.dispute.updated: ${dispute.id}, status=${dispute.status}`);

            await supabase
                .from("stripe_disputes")
                .update({
                    status: dispute.status,
                    stripe_metadata: dispute,
                    updated_at: new Date().toISOString(),
                })
                .eq("stripe_dispute_id", dispute.id);

            return jsonOk({ received: true }, corsHeaders);
        }

        case "charge.dispute.funds_withdrawn": {
            const dispute = event.data.object;
            console.log(`Processing charge.dispute.funds_withdrawn: ${dispute.id}`);
            // Funds already recorded on dispute.created — this is a confirmation
            // Update metadata
            await supabase
                .from("stripe_disputes")
                .update({
                    stripe_metadata: dispute,
                    updated_at: new Date().toISOString(),
                })
                .eq("stripe_dispute_id", dispute.id);

            return jsonOk({ received: true }, corsHeaders);
        }

        case "charge.dispute.funds_reinstated": {
            const dispute = event.data.object;
            const reinstatedAmountUsd = dispute.amount / 100;
            console.log(`Processing charge.dispute.funds_reinstated: ${dispute.id}, amount=$${reinstatedAmountUsd}`);

            // Get our dispute record for settlement_id
            const { data: ourDispute } = await supabase
                .from("stripe_disputes")
                .select("settlement_id, fee_usd")
                .eq("stripe_dispute_id", dispute.id)
                .single();

            // Credit back to bank ledger (amount only — fee is never returned)
            await supabase.rpc("append_bank_ledger_entry", {
                p_event_type: "chargeback_reversal",
                p_direction: "inflow",
                p_amount_usd: reinstatedAmountUsd,
                p_provider: "stripe",
                p_reference_type: "dispute_won",
                p_reference_id: dispute.id,
                p_settlement_id: ourDispute?.settlement_id || null,
            });

            await supabase
                .from("stripe_disputes")
                .update({
                    stripe_metadata: dispute,
                    updated_at: new Date().toISOString(),
                })
                .eq("stripe_dispute_id", dispute.id);

            return jsonOk({ received: true }, corsHeaders);
        }

        case "charge.dispute.closed": {
            const dispute = event.data.object;
            const chargeId = dispute.charge;
            const disputeStatus = dispute.status; // won or lost
            const isWon = disputeStatus === "won";

            console.log(
                `Processing charge.dispute.closed: ${dispute.id}, status=${disputeStatus}`,
            );

            // ── Update stripe_disputes ──
            await supabase
                .from("stripe_disputes")
                .update({
                    status: disputeStatus,
                    resolved_at: new Date().toISOString(),
                    stripe_metadata: dispute,
                    updated_at: new Date().toISOString(),
                })
                .eq("stripe_dispute_id", dispute.id);

            // ── Update buyer_debts ──
            const paymentIntentId = dispute.payment_intent;
            const { data: debt } = await supabase
                .from("buyer_debts")
                .select("*")
                .or(`stripe_payment_intent_id.eq.${paymentIntentId},stripe_payment_intent_id.eq.${chargeId}`)
                .eq("reason", "chargeback")
                .limit(1)
                .single();

            if (debt) {
                if (isWon) {
                    await supabase
                        .from("buyer_debts")
                        .update({
                            status: "recovered",
                            recovered_at: new Date().toISOString(),
                            updated_at: new Date().toISOString(),
                            metadata: { ...debt.metadata, dispute_result: "won" },
                        })
                        .eq("id", debt.id);
                } else {
                    await supabase
                        .from("buyer_debts")
                        .update({
                            updated_at: new Date().toISOString(),
                            metadata: { ...debt.metadata, dispute_result: "lost" },
                        })
                        .eq("id", debt.id);
                }
            }

            // ── Notify admins ──
            const { data: closeStaff } = await supabase
                .from("staff_members")
                .select("user_id, email")
                .contains("roles", ["admin"]);

            const disputeAmountClosed = dispute.amount / 100;
            const resultEmoji = isWon ? "✅" : "❌";
            const resultText = isWon
                ? `Won! $${disputeAmountClosed.toFixed(2)} reinstated (note: $15 fee is permanent).`
                : `Lost. $${disputeAmountClosed.toFixed(2)} + $15.00 fee forfeited.`;

            for (const staff of closeStaff || []) {
                try {
                    await supabase.rpc("notify_market_event", {
                        p_user_id: staff.user_id,
                        p_content: `${resultEmoji} Dispute ${dispute.id} closed: ${resultText}`,
                        p_link_url: "/disputes",
                    });
                } catch (e) {
                    console.warn("Close notification failed:", e);
                }

                // GAP-7: Send typed email for dispute closure
                if (staff.email) {
                    try {
                        await supabase.functions.invoke("send-notification-email", {
                            body: {
                                type: "dispute_closed",
                                recipients: [{ email: staff.email, name: "Admin" }],
                                dollarAmount: disputeAmountClosed,
                                disputeWon: isWon,
                                disputeFeeUsd: 15,
                            },
                        });
                    } catch (emailErr) {
                        console.warn(`Dispute close email to ${staff.email} failed:`, emailErr);
                    }
                }
            }

            return jsonOk({ received: true, result: disputeStatus }, corsHeaders);
        }

        default:
            console.log(`Unhandled event type: ${event.type}`);
            return jsonOk({ received: true }, corsHeaders);
    }
}, { extraCorsHeaders: "stripe-signature", errorStatus: 500 });

// ============================================================================
// Stripe Signature Verification (HMAC-SHA256)
// ============================================================================
async function verifyStripeSignature(
    payload: string,
    signature: string,
    secret: string,
): Promise<boolean> {
    try {
        // Parse Stripe signature header: t=timestamp,v1=hash
        const parts = signature.split(",");
        const timestampPart = parts.find((p) => p.startsWith("t="));
        const signaturePart = parts.find((p) => p.startsWith("v1="));

        if (!timestampPart || !signaturePart) return false;

        const timestamp = timestampPart.split("=")[1];
        const expectedSig = signaturePart.split("=")[1];

        // Construct signed payload
        const signedPayload = `${timestamp}.${payload}`;

        // Compute HMAC
        const key = await crypto.subtle.importKey(
            "raw",
            new TextEncoder().encode(secret),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign"],
        );

        const mac = await crypto.subtle.sign(
            "HMAC",
            key,
            new TextEncoder().encode(signedPayload),
        );

        const computedSig = Array.from(new Uint8Array(mac))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");

        return computedSig === expectedSig;
    } catch (e) {
        console.error("Signature verification error:", e);
        return false;
    }
}
