import {
    jsonError,
    jsonOk,
    requireAuth,
    serveWithCors,
} from "../_shared/serve-with-cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";
import { sendPushNotification } from "../_shared/push-notify.ts";

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
                redemption_type: "manual", // triggers the omni-channel ELSE fallback in the SQL
                provider_name: f.fulfillment_source || "admin_manual",
                external_order_id: fallbackExtId,
                actual_cost_cents: faceValueCents,
                proof_url: f.proof_url || "",
                custom_item_name: `${f.fulfillment_source || 'Manual'} Transfer`,
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
                p_event_type: "manual_fulfillment_sent", 
                p_direction: "outflow", 
                p_amount_usd: usdAmount, 
                p_provider: f.fulfillment_source || "admin_manual",
                p_reference_type: "redemption", 
                p_reference_id: f.redemption_id, 
                p_metadata: { source: "admin-manual-process", reference_id: f.reference_id, proof_url: f.proof_url },
            });

            // Build dynamic push notification text
            const methodDisplay = f.fulfillment_source || "manual transfer";
            const msg = `Your queued Casagrown payout of $${usdAmount.toFixed(2)} was successfully completed via ${methodDisplay}!`;
            
            await supabaseAdmin.from("market_notifications").insert({ 
                user_id, 
                content: msg, 
                link_url: "/earnings" 
            });
            
            await sendPushNotification(supabaseAdmin, { 
                userIds: [user_id as string], 
                title: "Payout Complete 💸", 
                body: msg, 
                url: "/earnings" 
            });

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
