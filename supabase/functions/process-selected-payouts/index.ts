/**
 * process-selected-payouts — Edge Function for processing admin-selected queued redemptions
 *
 * Flow:
 * 1. Takes an array of redemption_ids
 * 2. Fetches them and verifies they are 'failed' or 'pending'
 * 3. Invokes appropriate provider API
 * 4. On success: Updates redemption, creates receipt, invokes bank ledger, fires notification
 * 5. Explicitly bypasses resetting circuit breaker flags to maintain Manual Review parity
 */

import {
    jsonError,
    jsonOk,
    requireAuth,
    serveWithCors,
} from "../_shared/serve-with-cors.ts";
import { sendPushNotification } from "../_shared/push-notify.ts";
import {
    fetchReloadlyBalance,
    orderFromReloadly,
} from "../_shared/reloadly.ts";

serveWithCors(async (req, { supabase, env, corsHeaders }) => {
    // 1. Authenticate & VERIFY ADMIN
    const auth = await requireAuth(req, supabase, corsHeaders);
    if (auth instanceof Response) return auth;
    const adminId = auth;

    let isAdmin = false;
    if (adminId === "service_role") {
        isAdmin = true; // Trusted caller
    } else {
        const { data: profile } = await supabase
            .from("profiles")
            .select("admin_role")
            .eq("id", adminId)
            .single();
        if (profile?.admin_role) isAdmin = true;
    }
    
    if (!isAdmin) {
        return jsonError("Forbidden: Admin access required", corsHeaders, 403);
    }

    const { redemption_ids } = await req.json();

    if (!redemption_ids || !Array.isArray(redemption_ids) || redemption_ids.length === 0) {
        return jsonError("Must provide array of redemption_ids", corsHeaders, 400);
    }

    // 1. Fetch specific redemptions FIRST
    const { data: queuedRedemptions, error: fetchError } = await supabase
        .from("redemptions")
        .select("*")
        .in("id", redemption_ids)
        .or("status.eq.failed,status.eq.pending,status.eq.queued")
        .order("created_at", { ascending: true });

    if (fetchError) {
        return jsonError(`Failed to fetch redemptions: ${fetchError.message}`, corsHeaders);
    }

    if (!queuedRedemptions || queuedRedemptions.length === 0) {
        return jsonOk({ success: true, processed: 0, message: "No eligible queued redemptions found in selection" }, corsHeaders);
    }

    const needsReloadly = queuedRedemptions.some(r => r.provider === "reloadly");

    let reloadlyBalance = 0;

    try {
        if (needsReloadly && env("RELOADLY_CLIENT_ID") && env("RELOADLY_CLIENT_SECRET")) {
            reloadlyBalance = await fetchReloadlyBalance(
                env("RELOADLY_CLIENT_ID")!,
                env("RELOADLY_CLIENT_SECRET")!,
                env("RELOADLY_SANDBOX") !== "false",
            );
        }
    } catch (balanceError) {
        console.warn(`[MANUAL-RETRY] Failed verifying provider balances: ${balanceError}`);
    }

    console.log(
        `[MANUAL-RETRY] Provider Balances -> Reloadly: $${(reloadlyBalance / 100).toFixed(2)}`,
    );

    let processedCount = 0;
    const failures: { id: string; provider: string; reason: string }[] = [];

    for (const redemption of queuedRedemptions) {
        const { provider, user_id, point_cost } = redemption;
        const metadata = redemption.metadata || {};
        const faceValueCents = metadata.face_value_cents || Math.round((point_cost / 100) * 100);

        try {
            if (provider === "globalgiving") {
                await processGlobalGiving(supabase, env, redemption, user_id, point_cost, metadata);
            } else if (provider === "reloadly") {
                const estimatedCost = faceValueCents + (metadata.net_fee_cents || 50);
                if (estimatedCost > reloadlyBalance && reloadlyBalance > 0) {
                    throw new Error(`Insufficient Reloadly corporate balance`);
                }
                await processGiftCard(supabase, env, redemption, "reloadly");
                reloadlyBalance -= estimatedCost;
            } else if (provider === "paypal" || provider === "venmo") {
                await processPayPalCashout(supabase, env, redemption, user_id, point_cost, metadata);
            } else {
                throw new Error(`Unknown provider for retry: ${provider}`);
            }

            processedCount++;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[MANUAL-RETRY] Failed ${redemption.id}: ${msg}`);
            failures.push({ id: redemption.id, provider, reason: msg });

            if (redemption.status === "pending") {
                await supabase.from("redemptions").update({ status: "failed", failed_reason: `${msg} [Manual Auth]` }).eq("id", redemption.id);
            } else {
                await supabase.from("redemptions").update({ failed_reason: `${msg} at ${new Date().toISOString()} [Manual Auth]` }).eq("id", redemption.id);
            }
        }
    }

    // 3. DO NOT RESET CIRCUIT BREAKERS
    // Unlike `process-redemptions`, this is a targeted one-off admin action that doesn't imply the system is ready to un-queue everything.

    return jsonOk({
        success: true,
        processed: processedCount,
        failed: failures.length,
        failures,
    }, corsHeaders);
});

async function processGiftCard(supabase: any, env: any, redemption: Record<string, unknown>, provider: "reloadly") {
    const metadata = (redemption.metadata || {}) as Record<string, unknown>;
    const brand_name = metadata.brand_name as string;
    const product_id = metadata.product_id as string;
    const face_value_cents = (metadata.face_value_cents as number) || Math.round(((redemption.point_cost as number) / 100) * 100);

    // Fetch recipient email for gift card delivery
    let recipientEmail = "";
    const { data: authUser } = await supabase.auth.admin.getUserById(redemption.user_id);
    recipientEmail = authUser?.user?.email || "";

    const providerResult = await orderFromReloadly(env("RELOADLY_CLIENT_ID") || "", env("RELOADLY_CLIENT_SECRET") || "", product_id, brand_name, face_value_cents, env("RELOADLY_SANDBOX") !== "false", redemption.id as string, recipientEmail);

    if (providerResult.cardUrl) {
        // Synchronous fulfillment succeeded
        const { error: finalizeError } = await supabase.rpc("finalize_redemption", {
            p_payload: {
                redemption_id: redemption.id,
                redemption_type: "gift_card",
                provider_name: providerResult.provider,
                external_order_id: providerResult.externalOrderId || "N/A",
                card_code: providerResult.cardCode || "",
                card_url: providerResult.cardUrl || "",
                actual_cost_cents: providerResult.actualCostCents || face_value_cents,
            },
        });

        if (finalizeError) console.error(`[MANUAL-RETRY] Database finalize error:`, finalizeError);

        const outflowUsd = (providerResult.actualCostCents || face_value_cents) / 100;
        await supabase.rpc("append_bank_ledger_entry", {
            p_event_type: "gift_card_purchased", p_direction: "outflow", p_amount_usd: outflowUsd, p_provider: provider,
            p_reference_type: "redemption", p_reference_id: redemption.id, p_metadata: { brand_name, face_value_usd: face_value_cents / 100, source: "admin-manual-process" },
        });

        const msg = `Good news! Your $${(face_value_cents / 100).toFixed(2)} ${brand_name} Gift Card redemption is now complete and ready to use.`;
        await supabase.from("market_notifications").insert({ user_id: redemption.user_id, content: msg, link_url: providerResult.cardUrl || "/transaction-history" });
        await sendPushNotification(supabase, { userIds: [redemption.user_id as string], title: "Redemption Complete 🎉", body: msg, url: "/transaction-history" });
    } else {
        // Asynchronous fulfillment (wait for Webhook)
        await supabase.from("redemptions").update({
            provider: providerResult.provider,
            provider_order_id: providerResult.externalOrderId,
            status: "pending", // Keep pending so webhook can pick it up
            metadata: {
                ...metadata,
                provider_order_id: providerResult.externalOrderId,
                pending_async_webhook: true
            }
        }).eq("id", redemption.id);
        
        console.log(`[MANUAL-RETRY] Gift Card triggered asynchronously. Awaiting webhook for redemption ${redemption.id}.`);
    }
}

async function processGlobalGiving(supabase: any, env: any, redemption: Record<string, unknown>, userId: string, pointsAmount: number, metadata: Record<string, unknown> | null) {
    const safeMetadata = metadata || {};
    const organization = safeMetadata.organization as string;
    const projectId = redemption.item_id as string;
    const dollarAmount = pointsAmount / 100;
    const donationCents = Math.round(dollarAmount * 100);

    // Fetch donor email and name for GlobalGiving tax receipt (email is required by GG API)
    const { data: donorProfile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", userId)
        .single();

    let donorEmail = "";
    const { data: authUser } = await supabase.auth.admin.getUserById(userId);
    donorEmail = authUser?.user?.email || "";
    const donorName = donorProfile?.full_name || "CasaGrown User";
    const [firstName, ...lastParts] = donorName.split(" ");
    const lastName = lastParts.join(" ") || firstName;

    let externalOrderId = "";
    const ggApiKey = env("GLOBALGIVING_API_KEY");
    const isSandbox = env("GLOBALGIVING_SANDBOX") === "true";

    if (ggApiKey && projectId && !isSandbox) {
        const response = await fetch(`https://api.globalgiving.org/api/public/projects/${projectId}/donate?api_key=${ggApiKey}`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
                amount: dollarAmount,
                currency: "USD",
                refcode: `cg_${userId.substring(0, 8)}_${Date.now()}`,
                ...(donorEmail ? {
                    email: donorEmail,
                    firstname: firstName,
                    lastname: lastName,
                } : {}),
            }),
        });
        if (!response.ok) throw new Error(`GlobalGiving API error: ${await response.text()}`);
        const data = await response.json();
        externalOrderId = data.donationId || data.id || "";
    } else {
        externalOrderId = `GG-SIM-${Date.now()}`;
    }

    const receiptNumber = `DON-${Date.now().toString(36).toUpperCase()}`;
    const { error: finalizeError } = await supabase.rpc("finalize_redemption", {
        p_payload: { redemption_id: redemption.id, redemption_type: "donation", provider_name: "globalgiving", external_order_id: externalOrderId, actual_cost_cents: donationCents, receipt_number: receiptNumber },
    });

    if (finalizeError) console.error(`[MANUAL-RETRY] Finalize GlobalGiving error:`, finalizeError);

    await supabase.rpc("append_bank_ledger_entry", {
        p_event_type: "donation_sent", p_direction: "outflow", p_amount_usd: dollarAmount, p_provider: "globalgiving",
        p_reference_type: "redemption", p_reference_id: redemption.id, p_metadata: { organization, receipt_number: receiptNumber, source: "admin-manual-process" },
    });

    const msg = `Your queued donation of $${dollarAmount.toFixed(2)} to ${organization} has been successfully processed!`;
    await supabase.from("market_notifications").insert({ user_id: userId, content: msg, link_url: "/transaction-history" });
    await sendPushNotification(supabase, { userIds: [userId], title: "Donation Complete 💛", body: msg, url: "/transaction-history" });
}

async function processPayPalCashout(supabase: any, env: any, redemption: Record<string, unknown>, userId: string, pointsAmount: number, metadata: Record<string, unknown> | null) {
    const safeMetadata = metadata || {};
    const usdAmount = (safeMetadata.usd_amount as number) || (pointsAmount / 100);
    const payoutTarget = safeMetadata.payout_target as string;
    const provider = redemption.provider as string || "paypal";

    const PAYPAL_CLIENT_ID = env("PAYPAL_CLIENT_ID");
    const PAYPAL_SECRET = env("PAYPAL_SECRET");
    const PAYPAL_BASE_URL = env("PAYPAL_SANDBOX") !== "false" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";

    if (!PAYPAL_CLIENT_ID || !PAYPAL_SECRET) throw new Error("PayPal API keys missing");

    console.log(`[MANUAL-RETRY] Starting PayPal cashout for ${redemption.id} to ${payoutTarget}...`);
    const credentials = btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`);
    
    console.log(`[MANUAL-RETRY] Fetching PayPal token...`);
    const authController = new AbortController();
    const authTimeout = setTimeout(() => authController.abort(), 15000);
    const authRes = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
        method: "POST", headers: { "Authorization": `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials",
        signal: authController.signal
    });
    clearTimeout(authTimeout);

    if (!authRes.ok) {
        const errStr = await authRes.text();
        throw new Error(`Failed PayPal auth: ${authRes.status} ${errStr}`);
    }
    const { access_token } = await authRes.json();

    const isPhone = /^\+?[1-9]\d{1,14}$/.test(payoutTarget);
    const receiverType = isPhone ? "PHONE" : "EMAIL";

    const payoutPayload = {
        sender_batch_header: { sender_batch_id: `manual_${Date.now()}_${userId.substring(0, 8)}`, email_subject: "Here is your CasaGrown payout!", email_message: `You earned $${usdAmount.toFixed(2)} on CasaGrown Market!` },
        items: [{ recipient_type: receiverType, amount: { value: usdAmount.toFixed(2), currency: "USD" }, note: "CasaGrown Market Payout", sender_item_id: `manual_item_${Date.now()}`, receiver: payoutTarget }],
    };

    console.log(`[MANUAL-RETRY] Dispatching PayPal payout for ${usdAmount}...`);
    const payoutController = new AbortController();
    const payoutTimeout = setTimeout(() => payoutController.abort(), 15000);
    const payoutRes = await fetch(`${PAYPAL_BASE_URL}/v1/payments/payouts`, {
        method: "POST", headers: { "Authorization": `Bearer ${access_token}`, "Content-Type": "application/json" }, body: JSON.stringify(payoutPayload),
        signal: payoutController.signal
    });
    clearTimeout(payoutTimeout);

    const payoutData = await payoutRes.json();
    if (!payoutRes.ok || payoutData.name === "INSUFFICIENT_FUNDS") {
        throw new Error(payoutData.message || "PayPal rejected manual transfer.");
    }
    console.log(`[MANUAL-RETRY] PayPal payout successful!`);

    const txId = payoutData.batch_header?.payout_batch_id || `paypal_manual_id_${Date.now()}`;
    const { error: finalizeError } = await supabase.rpc("finalize_redemption", {
        p_payload: { redemption_id: redemption.id, redemption_type: provider, provider_name: provider, external_order_id: txId, actual_cost_cents: Math.round(usdAmount * 100) },
    });

    if (finalizeError) console.error(`[MANUAL-RETRY] Finalize PayPal error:`, finalizeError);

    await supabase.rpc("append_bank_ledger_entry", {
        p_event_type: "cashout_sent", p_direction: "outflow", p_amount_usd: usdAmount, p_provider: provider,
        p_reference_type: "redemption", p_reference_id: redemption.id, p_metadata: { payout_target: payoutTarget, batch_id: txId, source: "admin-manual-process" },
    });

    const msg = `Your queued cashout of $${usdAmount.toFixed(2)} to ${payoutTarget} has been successfully processed!`;
    await supabase.from("market_notifications").insert({ user_id: userId, content: msg, link_url: "/earnings" });
    
    try {
        await Promise.race([
            sendPushNotification(supabase, { userIds: [userId], title: "Cashout Complete 💸", body: msg, url: "/earnings" }),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Push notification timeout")), 4000))
        ]);
    } catch (err) {
        console.warn(`[MANUAL-RETRY] Push notification failed or timed out:`, err);
    }
}
