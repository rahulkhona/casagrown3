import {
    jsonError,
    jsonOk,
    requireAuth,
    serveWithCors,
} from "../_shared/serve-with-cors.ts";

/**
 * create-offer — Supabase Edge Function
 *
 * Atomically creates a seller's offer on a want_to_buy post via
 * the create_offer_atomic RPC. Includes conversation creation,
 * offer record, and system message.
 *
 * Request body: {
 *   postId: string,        // the want_to_buy post
 *   buyerId: string,       // the post author
 *   quantity: number,
 *   pointsPerUnit: number,
 *   category: string,
 *   product: string,
 *   unit?: string,
 *   deliveryDate?: string, // ISO date
 *   message?: string,
 *   sellerPostId?: string, // optional link to seller's matching sell post
 *   media?: Array<{ storage_path: string; media_type: 'image' | 'video' }>
 * }
 *
 * Response: { offerId: string, conversationId: string }
 */

serveWithCors(async (req, { supabase, corsHeaders }) => {
    // Authenticate
    const auth = await requireAuth(req, supabase, corsHeaders);
    if (auth instanceof Response) return auth;
    const sellerId = auth;

    // Parse request
    const {
        postId,
        buyerId,
        quantity,
        pointsPerUnit,
        category,
        product,
        unit,
        deliveryDate,
        message,
        sellerPostId,
        media,
    } = await req.json();

    // Validate required fields
    if (!postId) throw new Error("postId is required");
    if (!buyerId) throw new Error("buyerId is required");
    if (!quantity || quantity <= 0) {
        throw new Error("quantity must be positive");
    }
    if (!pointsPerUnit || pointsPerUnit < 0) {
        throw new Error("pointsPerUnit is required");
    }
    if (!category) throw new Error("category is required");
    if (!product) throw new Error("product is required");

    // Can't offer on your own post
    if (sellerId === buyerId) {
        return jsonError("Cannot make an offer on your own post", corsHeaders);
    }

    // Call atomic RPC
    const { data, error } = await supabase.rpc("create_offer_atomic", {
        p_seller_id: sellerId,
        p_buyer_id: buyerId,
        p_post_id: postId,
        p_quantity: quantity,
        p_points_per_unit: pointsPerUnit,
        p_category: category,
        p_product: product,
        p_unit: unit || null,
        p_delivery_date: deliveryDate || null,
        p_message: message || null,
        p_seller_post_id: sellerPostId || null,
        p_media: media || [],
    });

    if (error) {
        throw new Error(`create_offer_atomic failed: ${error.message}`);
    }

    // RPC returns jsonb — check for business logic errors
    if (data.error) {
        return jsonOk(
            {
                error: data.error,
                existingOfferId: data.existingOfferId,
                existingOrderId: data.existingOrderId,
                conversationId: data.conversationId,
            },
            corsHeaders,
            400,
        );
    }

    console.log(
        `✅ Offer created: ${data.offerId}, seller=${sellerId}, buyer=${buyerId}, ` +
            `product=${product}, qty=${quantity}, ppu=${pointsPerUnit}`,
    );

    return jsonOk(
        {
            offerId: data.offerId,
            conversationId: data.conversationId,
        },
        corsHeaders,
    );
});
