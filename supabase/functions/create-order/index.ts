import {
    jsonError,
    jsonOk,
    requireAuth,
    serveWithCors,
} from "../_shared/serve-with-cors.ts";
import {
    getUserDisplayName,
    sendPushNotification,
} from "../_shared/push-notify.ts";

/**
 * create-order — Supabase Edge Function
 *
 * Atomically creates a "buy now" order from the feed via a single
 * Postgres RPC call (create_order_atomic). This ensures all-or-nothing
 * execution: conversation, offer, order, escrow, and system message
 * are all committed or all rolled back.
 *
 * When sales tax applies, a separate `sales_tax` ledger entry is
 * inserted after the order for audit / tax-filing purposes.
 *
 * Request body: {
 *   postId: string,
 *   sellerId: string,
 *   quantity: number,
 *   pointsPerUnit: number,
 *   totalPrice: number,          // FULL total (subtotal + tax)
 *   category: string,
 *   product: string,
 *   deliveryDate: string,        // ISO date
 *   deliveryInstructions?: string,
 *   deliveryAddress: string,
 *   taxRatePct?: number,         // Sales tax rate applied
 *   taxAmount?: number           // Tax in points (rounded up)
 * }
 *
 * Response: { orderId: string, conversationId: string, newBalance: number }
 */

serveWithCors(async (req, { supabase, corsHeaders }) => {
    // Authenticate
    const auth = await requireAuth(req, supabase, corsHeaders);
    if (auth instanceof Response) return auth;
    const buyerId = auth;

    // Parse request
    const {
        postId,
        sellerId,
        quantity,
        pointsPerUnit,
        totalPrice,
        category,
        product,
        deliveryDate,
        deliveryInstructions,
        deliveryAddress,
        taxRatePct,
        taxAmount,
    } = await req.json();

    // Validate required fields
    if (!postId) throw new Error("postId is required");
    if (!sellerId) throw new Error("sellerId is required");
    if (!quantity || quantity <= 0) {
        throw new Error("quantity must be positive");
    }
    if (!pointsPerUnit || pointsPerUnit < 0) {
        throw new Error("pointsPerUnit is required");
    }
    if (totalPrice === undefined || totalPrice < 0) {
        throw new Error("totalPrice is required");
    }
    if (!category) throw new Error("category is required");
    if (!product) throw new Error("product is required");

    // Can't buy from yourself
    if (buyerId === sellerId) {
        return jsonError("Cannot order from yourself", corsHeaders);
    }

    // Combine delivery address and instructions
    const combinedInstructions =
        [deliveryAddress, deliveryInstructions].filter(Boolean).join("\n") ||
        null;

    // Call atomic RPC — escrows the FULL totalPrice (subtotal + tax)
    const { data, error } = await supabase.rpc("create_order_atomic", {
        p_buyer_id: buyerId,
        p_seller_id: sellerId,
        p_post_id: postId,
        p_quantity: quantity,
        p_points_per_unit: pointsPerUnit,
        p_total_price: totalPrice,
        p_category: category,
        p_product: product,
        p_delivery_date: deliveryDate || null,
        p_delivery_instructions: combinedInstructions,
    });

    if (error) {
        throw new Error(`create_order_atomic failed: ${error.message}`);
    }

    // RPC returns jsonb — check for business logic errors
    if (data.error) {
        return jsonOk(
            {
                error: data.error,
                currentBalance: data.currentBalance,
                required: data.required,
            },
            corsHeaders,
            400,
        );
    }

    const effectiveTax = taxAmount ?? 0;
    const effectiveRate = taxRatePct ?? 0;

    console.log(
        `✅ Order created: ${data.orderId}, buyer=${buyerId}, seller=${sellerId}, ` +
            `product=${product}, qty=${quantity}, total=${totalPrice}pts` +
            (effectiveTax > 0
                ? `, tax=${effectiveTax}pts (${effectiveRate}%)`
                : "") +
            `, newBalance=${data.newBalance}`,
    );

    // ── Tax ledger entry + order update ────────────────────────────────
    if (effectiveTax > 0) {
        // 1. Persist tax columns on the order row
        await supabase
            .from("orders")
            .update({
                tax_rate_pct: effectiveRate,
                tax_amount: effectiveTax,
            })
            .eq("id", data.orderId);

        // 2. Insert separate sales_tax ledger entry for audit/reporting.
        //    The amount is 0 because the tax was already included in the
        //    escrow deduction. This entry serves as an audit record with
        //    tax-specific metadata for tax-filing purposes.
        await supabase.from("point_ledger").insert({
            user_id: buyerId,
            type: "sales_tax",
            amount: 0,
            balance_after: data.newBalance,
            reference_id: data.orderId,
            metadata: {
                order_id: data.orderId,
                post_id: postId,
                seller_id: sellerId,
                product,
                category,
                quantity,
                subtotal: totalPrice - effectiveTax,
                tax_amount: effectiveTax,
                tax_rate_pct: effectiveRate,
                delivery_address: deliveryAddress || null,
            },
        });
    }

    // Fire-and-forget push notification to seller
    getUserDisplayName(supabase, buyerId).then((buyerName: string) => {
        sendPushNotification(supabase, {
            userIds: [sellerId],
            title: "New Order! 🛒",
            body: `${buyerName} ordered ${quantity} ${product}`,
            url: "/orders",
            tag: `order-${data.orderId}`,
        });
    });

    return jsonOk(
        {
            orderId: data.orderId,
            conversationId: data.conversationId,
            newBalance: data.newBalance,
        },
        corsHeaders,
    );
});
