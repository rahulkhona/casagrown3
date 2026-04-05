/**
 * submit-dispute-evidence — Supabase Edge Function
 *
 * Assembles and submits evidence for a Stripe chargeback dispute.
 * Called by the admin UI when staff clicks "Submit Evidence to Stripe".
 *
 * Input: { dispute_id: UUID, evidence?: JSONB, submit?: boolean }
 * - If submit=true (default), evidence is submitted to Stripe
 * - If submit=false, evidence is saved as draft
 */

import {
    jsonError,
    jsonOk,
    serveWithCors,
} from "../_shared/serve-with-cors.ts";

// ── Evidence formatters ──────────────────────────────────────────────────────

function formatProductDescription(evidence: any): string {
    const lines: string[] = [
        `MARKET DATE: ${evidence.dispute?.market_date || 'N/A'}`,
        '',
    ];

    for (const purchase of evidence.purchases || []) {
        lines.push(
            `ORDER #${purchase.order_number || purchase.order_id?.slice(0, 8)} (from ${purchase.seller_name || 'Unknown Seller'}):`,
        );
        for (const item of purchase.items || []) {
            lines.push(`  - ${item.name}: $${Number(item.total || 0).toFixed(2)}`);
        }
        lines.push(
            `  Subtotal: $${Number(purchase.total || 0).toFixed(2)} | Status: ${(purchase.status || '').toUpperCase()} | Fulfillment: ${purchase.fulfillment_method === 'delivery' ? 'Delivery' : 'Pickup'}`,
        );
        lines.push('');
    }

    const purchasesTotal = evidence.net_calculation?.purchases_total || 0;
    lines.push(`Total Purchases: $${Number(purchasesTotal).toFixed(2)}`);

    return lines.join('\n');
}

function formatFulfillmentLogs(evidence: any): string {
    const lines: string[] = [
        'ORDER FULFILLMENT HISTORY — PROOF OF DELIVERY/PICKUP',
        '',
    ];

    // Group status logs by order
    const logsByOrder: Record<string, any[]> = {};
    for (const log of evidence.order_status_logs || []) {
        if (!logsByOrder[log.order_id]) logsByOrder[log.order_id] = [];
        logsByOrder[log.order_id].push(log);
    }

    const allOrders = [
        ...(evidence.purchases || []),
        ...(evidence.sales || []),
    ];

    for (const [orderId, logs] of Object.entries(logsByOrder)) {
        const order = allOrders.find((o: any) => o.order_id === orderId);
        const orderLabel = order
            ? `${order.items?.[0]?.name || 'Order'} — ${order.fulfillment_method === 'delivery' ? 'DELIVERY' : 'PICKUP'}`
            : orderId.slice(0, 8);

        lines.push(
            `ORDER #${order?.order_number || orderId.slice(0, 8)} (${orderLabel}):`,
        );

        for (const log of logs) {
            const isHandoff = log.new_status === 'picked_up' || log.new_status === 'delivered';
            const statusLabel = (log.new_status || '').replace(/_/g, ' ');
            const when = log.changed_at
                ? new Date(log.changed_at).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                })
                : 'N/A';
            lines.push(
                `  ${statusLabel}: ${when} — by ${log.changed_by_name || 'system'}${isHandoff ? ' ← CONFIRMED' : ''}`,
            );
        }
        lines.push('');
    }

    // Fulfillment photos and pickup readiness proof
    const photos = evidence.fulfillment_photos || [];
    if (photos.length > 0) {
        lines.push('FULFILLMENT PROOF PHOTOS:');
        for (const photo of photos) {
            const order = allOrders.find((o: any) => o.order_id === photo.order_id);
            const readyAt = photo.ready_for_pickup_at
                ? `Seller marked ready for pickup: ${new Date(photo.ready_for_pickup_at).toLocaleString()}`
                : '';
            const deliveredAt = photo.delivered_at
                ? `Buyer picked up: ${new Date(photo.delivered_at).toLocaleString()}`
                : '';
            lines.push(
                `  Order #${order?.order_number || photo.order_id?.slice(0, 8)}: ${photo.fulfillment_method === 'delivery' ? 'Delivery' : 'Pickup'} proof captured at ${photo.proof_timestamp ? new Date(photo.proof_timestamp).toLocaleString() : 'N/A'}${photo.proof_location ? ` GPS: ${photo.proof_location.latitude?.toFixed(4)}, ${photo.proof_location.longitude?.toFixed(4)}` : ''}`,
            );
            if (readyAt) lines.push(`    ${readyAt}`);
            if (deliveredAt) lines.push(`    ${deliveredAt}`);
        }
    }

    // Include pickup readiness proof from purchases/sales
    const pickupOrders = [...(evidence.purchases || []), ...(evidence.sales || [])]
        .filter((o: any) => o.ready_for_pickup_at);
    if (pickupOrders.length > 0) {
        lines.push('');
        lines.push('PICKUP READINESS PROOF:');
        for (const order of pickupOrders) {
            lines.push(
                `  Order #${order.order_number || order.order_id?.slice(0, 8)}: Seller marked ready at ${new Date(order.ready_for_pickup_at).toLocaleString()}${order.delivered_at ? `, Buyer picked up at ${new Date(order.delivered_at).toLocaleString()}` : ' — Buyer did not pick up'}`,
            );
        }
    }

    lines.push('');
    lines.push(
        'All orders were fulfilled and confirmed via in-app status transitions by both buyer and seller.',
    );

    return lines.join('\n');
}

function formatCommunications(evidence: any): string {
    const lines: string[] = ['BUYER-SELLER COMMUNICATIONS', ''];

    const chatLogs = evidence.chat_logs || [];
    if (chatLogs.length > 0) {
        lines.push('Chat Messages:');
        for (const msg of chatLogs) {
            const when = msg.sent_at
                ? new Date(msg.sent_at).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                })
                : '';
            lines.push(
                `  ${when} — ${msg.from_name || 'Unknown'} → ${msg.to_name || 'Unknown'}: ${msg.text || ''}`,
            );
        }
        lines.push('');
    }

    return lines.join('\n');
}

function formatNetCalculation(evidence: any): string {
    const net = evidence.net_calculation || {};
    const dispute = evidence.dispute || {};
    const buyer = evidence.buyer || {};
    const opening = evidence.opening_balance || {};

    const lines: string[] = [
        'NET CHARGE CALCULATION — CasaGrown Marketplace Settlement',
        '',
        `Buyer: ${buyer.name || 'Unknown'} (${buyer.email || 'N/A'})`,
        `Market Date: ${dispute.market_date || 'N/A'}`,
        '',
        `Opening Balance (prior credit from sales):     ${Number(opening.amount_usd || 0) < 0 ? '-' : ''}$${Math.abs(Number(opening.amount_usd || 0)).toFixed(2)}`,
        `+ Purchases:                                   +$${Number(net.purchases_total || 0).toFixed(2)}`,
        `- Sales:                                       -$${Number(net.sales_total || 0).toFixed(2)}`,
        `+ Platform Fee (5% on net purchases):           +$${Number(net.platform_fee || 0).toFixed(2)}`,
        `- Refunds:                                      -$${Number(net.refunds || 0).toFixed(2)}`,
        '─────────────────────────────────────────────────',
        `NET CHARGED TO CARD:                            = $${Number(net.net_charged || 0).toFixed(2)}`,
        '',
        `Stripe Payment Intent: ${dispute.stripe_payment_intent_id || 'N/A'}`,
        '',
    ];

    // Note if disputed amount differs
    const disputedAmount = Number(dispute.amount_usd || 0);
    const netCharged = Number(net.net_charged || 0);
    if (Math.abs(disputedAmount - netCharged) > 0.01) {
        lines.push(
            `Note: The disputed amount ($${disputedAmount.toFixed(2)}) does not match the actual net charge ($${netCharged.toFixed(2)}).`,
        );
        lines.push(
            'This is a net settlement marketplace — the buyer\'s sales earnings offset their purchases.',
        );
    }

    return lines.join('\n');
}

// ── Main handler ──────────────────────────────────────────────────────────────

serveWithCors(async (req, { supabase, env, corsHeaders }) => {
    const { dispute_id, evidence: providedEvidence, submit = true } =
        await req.json();

    if (!dispute_id) {
        return jsonError("dispute_id is required", corsHeaders, 400);
    }

    // Get dispute record
    const { data: dispute, error: disputeError } = await supabase
        .from("stripe_disputes")
        .select("*")
        .eq("id", dispute_id)
        .single();

    if (disputeError || !dispute) {
        return jsonError("Dispute not found", corsHeaders, 404);
    }

    if (dispute.evidence_submitted_at) {
        return jsonError(
            "Evidence already submitted for this dispute",
            corsHeaders,
            400,
        );
    }

    // Use provided evidence or assemble fresh
    let evidence = providedEvidence;
    if (!evidence) {
        const { data: assembled, error: assembleErr } = await supabase.rpc(
            "get_dispute_evidence",
            { p_dispute_id: dispute_id },
        );
        if (assembleErr || !assembled) {
            return jsonError(
                `Failed to assemble evidence: ${assembleErr?.message}`,
                corsHeaders,
                500,
            );
        }
        evidence = assembled;
    }

    // Save evidence snapshot
    await supabase
        .from("stripe_disputes")
        .update({
            evidence_json: evidence,
            updated_at: new Date().toISOString(),
        })
        .eq("id", dispute_id);

    if (!submit) {
        return jsonOk(
            { success: true, action: "draft_saved" },
            corsHeaders,
        );
    }

    // ── Submit to Stripe ──
    const STRIPE_SECRET_KEY = env("STRIPE_SECRET_KEY");
    if (!STRIPE_SECRET_KEY) {
        return jsonError(
            "STRIPE_SECRET_KEY not configured",
            corsHeaders,
            500,
        );
    }

    // Format evidence fields
    const productDescription = formatProductDescription(evidence);
    const fulfillmentDocs = formatFulfillmentLogs(evidence);
    const communications = formatCommunications(evidence);
    const netCalculation = formatNetCalculation(evidence);

    // Build Stripe evidence params
    const stripeEvidence: Record<string, string> = {
        "evidence[customer_name]": evidence.buyer?.name || "",
        "evidence[customer_email_address]": evidence.buyer?.email || "",
        "evidence[product_description]": productDescription,
        "evidence[shipping_documentation]": fulfillmentDocs,
        "evidence[customer_communication]": communications,
        "evidence[uncategorized_text]": netCalculation,
    };

    // Submit to Stripe
    const params = new URLSearchParams({
        ...stripeEvidence,
        submit: "true",
    });

    const stripeRes = await fetch(
        `https://api.stripe.com/v1/disputes/${dispute.stripe_dispute_id}`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: params.toString(),
        },
    );

    const stripeData = await stripeRes.json();

    if (!stripeRes.ok) {
        console.error("Stripe evidence submission failed:", stripeData);
        return jsonError(
            `Stripe API error: ${stripeData.error?.message || "Unknown error"}`,
            corsHeaders,
            500,
        );
    }

    // Update our record
    await supabase
        .from("stripe_disputes")
        .update({
            evidence_submitted_at: new Date().toISOString(),
            status: "under_review",
            stripe_metadata: stripeData,
            updated_at: new Date().toISOString(),
        })
        .eq("id", dispute_id);

    console.log(
        `✅ Evidence submitted for dispute ${dispute.stripe_dispute_id}`,
    );

    return jsonOk(
        {
            success: true,
            action: "submitted",
            stripe_dispute_id: dispute.stripe_dispute_id,
            stripe_status: stripeData.status,
        },
        corsHeaders,
    );
}, { errorStatus: 500 });
