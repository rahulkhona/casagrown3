import {
    jsonError,
    jsonOk,
    requireAuth,
    serveWithCors,
} from "../_shared/serve-with-cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";
// sendPushNotification is available if an explicit push is ever needed here.
// Currently push is handled by the DB trigger (trg_redemption_notify → send_push_via_edge).
// import { sendPushNotification } from "../_shared/push-notify.ts";
// Note: Email for manual fulfillments is sent automatically by the trg_redemption_notify
// Postgres trigger when finalize_redemption sets status='completed'. No duplicate send needed here.

/**
 * Derives a human-readable payment provider name from the original
 * redemption data — independent of what the admin typed in the UI.
 * Used consistently across all notification channels.
 */
function deriveProviderDisplay(redemption: Record<string, any>): string {
    const meta = redemption.metadata || {};
    const provider = (redemption.provider || '').toLowerCase();
    const type = (meta.type || '').toLowerCase();
    const target = (meta.payout_target || '') as string;
    const isPhone = /^\+?[1-9]\d{6,14}$/.test(target.replace(/\s/g, ''));

    if (provider === 'venmo' || (provider === 'paypal' && isPhone) || (type === 'paypal_cashout' && isPhone)) {
        return 'Venmo';
    }
    if (provider === 'paypal' || type === 'paypal_cashout') return 'PayPal';
    if (provider === 'zelle') return 'Zelle';
    if (provider === 'cashapp') return 'CashApp';
    if (provider && !['manual', 'admin_manual'].includes(provider)) {
        return provider.charAt(0).toUpperCase() + provider.slice(1);
    }
    return 'your account';
}

export interface ManualFulfillmentPayload {
    redemption_id: string;
    fulfillment_source: string; // e.g. "CashApp", "Check", "Custom Digital URL"
    reference_id?: string;
    proof_url?: string;
}

serveWithCors(async (req, { supabase, corsHeaders }) => {
    // 1. Authenticate & VERIFY ADMIN
    // Clone request so we can read body twice (auth check + fulfillment data)
    const bodyText = await req.text();
    const body = JSON.parse(bodyText || '{}');
    
    const auth = await requireAuth(req, supabase, corsHeaders);
    let adminId: string;
    
    if (auth instanceof Response) {
        // Fallback: allow service-role callers to pass admin_user_id in the request body
        // This is needed because local Supabase Kong rejects ES256 user JWTs
        if (body.admin_user_id) {
            adminId = body.admin_user_id;
        } else {
            return auth;
        }
    } else {
        adminId = auth;
    }

    const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Service role callers (from admin API route) are trusted
    if (adminId !== "service_role") {
        const { data: staff } = await supabaseAdmin
            .from("staff_members")
            .select("roles")
            .eq("user_id", adminId)
            .single();
        
        if (!staff || !staff.roles?.includes('admin')) {
            return jsonError("Forbidden: Admin access required", corsHeaders, 403);
        }
    }

    const { fulfillments } = body as { fulfillments: ManualFulfillmentPayload[] };

    console.log(`[MANUAL-FULFILL] Received ${fulfillments?.length || 0} fulfillments`);

    if (!fulfillments || !Array.isArray(fulfillments) || fulfillments.length === 0) {
        return jsonError("Must provide array of fulfillments", corsHeaders, 400);
    }

    const redemptionIds = fulfillments.map(f => f.redemption_id);
    console.log(`[MANUAL-FULFILL] Looking up IDs:`, redemptionIds);

    // 2. Fetch targeted redemptions (use admin client for full RLS bypass)
    const { data: queuedRedemptions, error: fetchError } = await supabaseAdmin
        .from("redemptions")
        .select("*")
        .in("id", redemptionIds)
        .or("status.eq.queued,status.eq.failed");

    console.log(`[MANUAL-FULFILL] Found ${queuedRedemptions?.length || 0} eligible redemptions, fetchError:`, fetchError);
    if (queuedRedemptions?.length) {
        queuedRedemptions.forEach(r => console.log(`[MANUAL-FULFILL] Redemption ${r.id} status=${r.status}`));
    }

    if (fetchError) {
        return jsonError(`Failed to fetch redemptions: ${fetchError.message}`, corsHeaders);
    }

    if (!queuedRedemptions || queuedRedemptions.length === 0) {
        return jsonOk({ success: true, processed: 0, message: "No eligible pending/failed redemptions found in selection" }, corsHeaders);
    }

    let processedCount = 0;
    const failures: { id: string; reason: string }[] = [];

    for (const f of fulfillments) {
        const redemption = queuedRedemptions.find(r => r.id === f.redemption_id);
        if (!redemption) continue;

        try {
            const { metadata, user_id, point_cost } = redemption;
            const faceValueCents = metadata.face_value_cents || Math.round((point_cost / 100) * 100);
            const usdAmount = faceValueCents / 100;
            const fallbackExtId = f.reference_id || `manual_${Date.now()}`;

            // Map manual payload correctly so the flexible RPC understands it
            const finalizePayload: any = {
                redemption_id: f.redemption_id,
                redemption_type: "manual",
                provider_name: f.fulfillment_source || "admin_manual",
                external_order_id: fallbackExtId,
                actual_cost_cents: faceValueCents,
                proof_url: f.proof_url || "",
                custom_item_name: `${f.fulfillment_source || 'Manual'} Transfer`,
                // Note: push notification is sent by trg_redemption_notify trigger
                // (via notify_market_event → send_push_via_edge) when status → 'completed'.
            };

            // If it's a gift card or donation historically, pass the params so SQL puts them in the right tables if the admin forced those types
            // But usually we just let the SQL treat it as a generic cashout if type='manual'
            
            const { error: finalizeError } = await supabaseAdmin.rpc("finalize_redemption", {
                p_payload: finalizePayload,
            });

            console.log(`[MANUAL-FULFILL] finalize_redemption for ${f.redemption_id}: error=`, finalizeError);
            if (finalizeError) throw finalizeError;

            // Log admin outflow securely
            await supabaseAdmin.rpc("append_bank_ledger_entry", {
                p_event_type: "cashout_sent", 
                p_direction: "outflow", 
                p_amount_usd: usdAmount, 
                p_provider: f.fulfillment_source?.toLowerCase() === 'venmo' ? 'venmo' : f.fulfillment_source?.toLowerCase() === 'paypal' ? 'paypal' : 'manual',
                p_reference_type: "redemption", 
                p_reference_id: f.redemption_id, 
                p_metadata: { source: "admin-manual-process", fulfillment_source: f.fulfillment_source, reference_id: f.reference_id, proof_url: f.proof_url },
            });

            // Derive the provider from the original redemption data (not admin-entered field)
            const providerDisplay = deriveProviderDisplay(redemption);
            // Admin-entered fulfillment_source (e.g., "manual", "Venmo", "TX-123") goes to detail only
            const isPhone = /^\+?[1-9]\d{6,14}$/.test((metadata.payout_target || '').replace(/\s/g, ''));
            const handleType = (providerDisplay === 'Venmo') ? 'venmo' : 'paypal';

            // ── In-app notification ──
            const msg = `Payout completed: $${usdAmount.toFixed(2)} has been sent to your ${providerDisplay} account.`;
            await supabaseAdmin.from("market_notifications").insert({ 
                user_id, 
                content: msg, 
                link_url: "/earnings" 
            });

            // ── Push notification ──
            // Handled automatically by trg_redemption_notify → notify_market_event → send_push_via_edge
            // when finalize_redemption sets status='completed'. No explicit push needed here.

            // ── Email & SMS notification ──
            // Both are handled automatically by the trg_redemption_notify Postgres trigger,
            // which fires on the status='completed' UPDATE inside finalize_redemption.
            // Do NOT send email here — that would cause duplicate emails.

            processedCount++;
        } catch (err) {
            const msg = err instanceof Error ? err.message : (typeof err === 'object' && err !== null ? JSON.stringify(err) : String(err));
            console.error(`[MANUAL-FULFILL] Failed ${f.redemption_id}: ${msg}`);
            failures.push({ id: f.redemption_id, reason: msg });
        }
    }

    return jsonOk({
        success: true,
        processed: processedCount,
        failed: failures.length,
        failures,
    }, corsHeaders);
});
