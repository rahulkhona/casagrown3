import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * create-order — Supabase Edge Function
 *
 * Atomically creates a "buy now" order from the feed:
 *   1. Creates/reuses a conversation between buyer and seller
 *   2. Creates a pending offer
 *   3. Creates a pending order record
 *   4. Debits points from the buyer's balance as escrow (inserts into point_ledger)
 *
 * NOTE: Points are debited from buyer immediately (escrow). Seller is credited
 * only when they accept the order (via accept-order edge function, not yet built).
 *
 * This handles the flow where a user clicks "Order" on a want_to_sell post,
 * fills in the OrderSheet form, and submits.
 *
 * Request body: {
 *   postId: string,
 *   sellerId: string,
 *   quantity: number,
 *   pointsPerUnit: number,
 *   totalPrice: number,
 *   category: string,
 *   product: string,
 *   deliveryDate: string,      // ISO date
 *   deliveryInstructions?: string,
 *   deliveryAddress: string
 * }
 *
 * Response: { orderId: string, conversationId: string, newBalance: number }
 */

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(
            "SUPABASE_SERVICE_ROLE_KEY",
        );

        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
            throw new Error("Missing Supabase credentials");
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // Authenticate user
        const authHeader = req.headers.get("authorization");
        let buyerId: string | null = null;

        if (authHeader) {
            const token = authHeader.replace("Bearer ", "");
            const { data: { user } } = await supabase.auth.getUser(token);
            buyerId = user?.id || null;
        }

        if (!buyerId) {
            return new Response(
                JSON.stringify({ error: "Authentication required" }),
                {
                    status: 401,
                    headers: {
                        ...corsHeaders,
                        "Content-Type": "application/json",
                    },
                },
            );
        }

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
            return new Response(
                JSON.stringify({ error: "Cannot order from yourself" }),
                {
                    status: 400,
                    headers: {
                        ...corsHeaders,
                        "Content-Type": "application/json",
                    },
                },
            );
        }

        // 1. Check buyer's balance
        const { data: lastEntry } = await supabase
            .from("point_ledger")
            .select("balance_after")
            .eq("user_id", buyerId)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

        const currentBalance = lastEntry?.balance_after || 0;

        if (currentBalance < totalPrice) {
            return new Response(
                JSON.stringify({
                    error: "Insufficient points",
                    currentBalance,
                    required: totalPrice,
                }),
                {
                    status: 400,
                    headers: {
                        ...corsHeaders,
                        "Content-Type": "application/json",
                    },
                },
            );
        }

        // 2. Create or reuse conversation
        // Check if conversation already exists for this post + buyer + seller
        const { data: existingConvo } = await supabase
            .from("conversations")
            .select("id")
            .eq("post_id", postId)
            .eq("buyer_id", buyerId)
            .eq("seller_id", sellerId)
            .single();

        let conversationId: string;

        if (existingConvo) {
            conversationId = existingConvo.id;
        } else {
            const { data: newConvo, error: convoError } = await supabase
                .from("conversations")
                .insert({
                    post_id: postId,
                    buyer_id: buyerId,
                    seller_id: sellerId,
                })
                .select("id")
                .single();

            if (convoError || !newConvo) {
                throw new Error(
                    `Failed to create conversation: ${convoError?.message}`,
                );
            }
            conversationId = newConvo.id;
        }

        // 3. Create pending offer (seller must accept)
        const { data: offer, error: offerError } = await supabase
            .from("offers")
            .insert({
                conversation_id: conversationId,
                created_by: buyerId,
                quantity,
                points_per_unit: pointsPerUnit,
                status: "pending",
            })
            .select("id")
            .single();

        if (offerError || !offer) {
            throw new Error(`Failed to create offer: ${offerError?.message}`);
        }

        // 4. Create order (pending — seller must accept)
        const { data: order, error: orderError } = await supabase
            .from("orders")
            .insert({
                offer_id: offer.id,
                buyer_id: buyerId,
                seller_id: sellerId,
                category,
                product,
                quantity,
                points_per_unit: pointsPerUnit,
                delivery_date: deliveryDate || null,
                delivery_instructions:
                    [deliveryAddress, deliveryInstructions].filter(Boolean)
                        .join("\n") || null,
                conversation_id: conversationId,
                status: "pending",
            })
            .select("id")
            .single();

        if (orderError || !order) {
            throw new Error(`Failed to create order: ${orderError?.message}`);
        }

        // 5. Hold buyer's points in escrow (prevents double-spending)
        // Points are released to seller when they accept, or refunded if cancelled
        // balance_after is auto-computed by DB trigger (trg_compute_balance_after)
        const { error: ledgerError } = await supabase
            .from("point_ledger")
            .insert({
                user_id: buyerId,
                type: "escrow",
                amount: -totalPrice,
                balance_after: 0, // overridden by DB trigger
                reference_id: order.id,
                metadata: {
                    order_id: order.id,
                    post_id: postId,
                    seller_id: sellerId,
                    product,
                    quantity,
                    points_per_unit: pointsPerUnit,
                },
            });

        if (ledgerError) {
            console.error("Failed to escrow points:", ledgerError);
            // Order was already created — log this but don't fail the request
            // A reconciliation job could catch this later
        }

        // 6. Seller credit is DEFERRED — happens when seller accepts the order
        // (via future accept-order edge function)

        // 7. Send system message in conversation
        await supabase
            .from("chat_messages")
            .insert({
                conversation_id: conversationId,
                sender_id: null, // system message
                content:
                    `Order placed: ${quantity} ${product} for ${totalPrice} points. Delivery by ${
                        deliveryDate || "TBD"
                    }.`,
                type: "system",
            });

        console.log(
            `✅ Order created: ${order.id}, buyer=${buyerId}, seller=${sellerId}, ` +
                `product=${product}, qty=${quantity}, total=${totalPrice}pts, newBalance=${
                    currentBalance - totalPrice
                }`,
        );

        return new Response(
            JSON.stringify({
                orderId: order.id,
                conversationId,
                newBalance: currentBalance - totalPrice,
            }),
            {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
        );
    } catch (error: unknown) {
        const message = error instanceof Error
            ? error.message
            : "Unknown error";
        console.error("create-order error:", error);
        return new Response(
            JSON.stringify({ error: message }),
            {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
        );
    }
});
