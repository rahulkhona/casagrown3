/**
 * Order Service — Supabase Data Layer
 *
 * Provides CRUD operations for orders, offers, escalations, and ratings
 * against the real Supabase database.
 */

import { supabase } from "../auth/auth-hook";
import type {
    Escalation,
    Order,
    OrderFilter,
    OrderStatus,
    RatingScore,
    RefundOffer,
} from "./order-types";
import { isOpenOrder } from "./order-types";

// =============================================================================
// Helpers
// =============================================================================

/**
 * Map a Supabase row into the client-side Order shape.
 *
 * DB columns on `orders` table:
 *   id, offer_id, buyer_id, seller_id, category, product, quantity,
 *   points_per_unit, delivery_date, delivery_time, delivery_instructions,
 *   delivery_proof_media_id, conversation_id, status,
 *   buyer_rating, buyer_feedback, seller_rating, seller_feedback,
 *   created_at, updated_at
 *
 * Joined: buyer (profiles), seller (profiles), delivery_proof_media (media_assets)
 */
function mapOrderRow(row: Record<string, unknown>): Order {
    return {
        id: row.id as string,
        offer_id: row.offer_id as string,
        buyer_id: row.buyer_id as string,
        seller_id: row.seller_id as string,
        conversation_id: row.conversation_id as string,
        category: row.category as string,
        product: row.product as string,
        quantity: Number(row.quantity),
        points_per_unit: Number(row.points_per_unit),
        total_price: Number(row.quantity) * Number(row.points_per_unit),
        delivery_date: (row.delivery_date as string) ?? null,
        // create-order joins address + instructions with "\n"
        delivery_instructions: (() => {
            const raw = (row.delivery_instructions as string) ?? "";
            const lines = raw.split("\n");
            return lines.length > 1 ? lines.slice(1).join("\n").trim() : null;
        })(),
        delivery_address: (() => {
            const raw = (row.delivery_instructions as string) ?? "";
            return raw.split("\n")[0]?.trim() || null;
        })(),
        delivery_proof_media_id: (row.delivery_proof_media_id as string) ??
            null,
        delivery_proof_url: null,
        // These columns may not exist in the DB yet — default to null
        delivery_proof_location: null,
        delivery_proof_timestamp: null,
        dispute_proof_media_id: null,
        dispute_proof_url: null,
        status: row.status as OrderStatus,
        buyer_rating: (row.buyer_rating as RatingScore) ?? null,
        buyer_feedback: (row.buyer_feedback as string) ?? null,
        seller_rating: (row.seller_rating as RatingScore) ?? null,
        seller_feedback: (row.seller_feedback as string) ?? null,
        created_at: row.created_at as string,
        updated_at: row.updated_at as string,
        version: Number(row.version ?? 1),
        buyer_name: null, // no FK to profiles on orders table
        buyer_avatar_url: null,
        seller_name: null,
        seller_avatar_url: null,
        // Extract from nested join: conversations(posts(want_to_sell_details(unit)))
        post_id: (() => {
            const conv = row.conversations as Record<string, unknown> | null;
            const posts = conv?.posts as Record<string, unknown> | null;
            return (posts?.id as string) ?? null;
        })(),
        unit: (() => {
            const conv = row.conversations as Record<string, unknown> | null;
            const posts = conv?.posts as Record<string, unknown> | null;
            const wsd = posts?.want_to_sell_details as
                | Array<Record<string, unknown>>
                | null;
            return (wsd?.[0]?.unit as string) ?? null;
        })(),
    };
}

/**
 * Select all order columns.
 * Note: orders table has no FK to profiles for buyer_id/seller_id,
 * so we cannot do PostgREST resource embedding for profile names.
 */
const ORDER_SELECT =
    `*, conversations:conversation_id(posts!conversations_post_id_fkey(id, want_to_sell_details(unit)))`;

// =============================================================================
// Queries
// =============================================================================

/** Get all orders for a user, filtered */
export async function getOrders(
    userId: string,
    filter: OrderFilter,
): Promise<Order[]> {
    let query = supabase
        .from("orders")
        .select(ORDER_SELECT)
        .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
        .order("updated_at", { ascending: false });

    // Role filter
    if (filter.role === "buying") {
        query = query.eq("buyer_id", userId);
    } else if (filter.role === "selling") {
        query = query.eq("seller_id", userId);
    }

    // Search
    if (filter.searchQuery) {
        query = query.ilike("product", `%${filter.searchQuery}%`);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch orders: ${error.message}`);

    let results = (data ?? []).map(mapOrderRow);

    // Tab filter (client-side since it involves logic)
    if (filter.tab === "open") {
        results = results.filter(isOpenOrder);
    } else {
        results = results.filter((o) => !isOpenOrder(o));
    }

    return results;
}

/** Get single order by ID */
export async function getOrderById(orderId: string): Promise<Order | null> {
    const { data, error } = await supabase
        .from("orders")
        .select(ORDER_SELECT)
        .eq("id", orderId)
        .maybeSingle();

    if (error) throw new Error(`Failed to fetch order: ${error.message}`);
    if (!data) return null;
    return mapOrderRow(data);
}

/** Get order for a conversation (if any) */
export async function getOrderByConversation(
    conversationId: string,
): Promise<Order | null> {
    const { data, error } = await supabase
        .from("orders")
        .select(ORDER_SELECT)
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) throw new Error(`Failed to fetch order: ${error.message}`);
    if (!data) return null;
    return mapOrderRow(data);
}

/** Get escalation for an order */
export async function getEscalation(
    orderId: string,
): Promise<Escalation | null> {
    const { data, error } = await supabase
        .from("escalations")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) throw new Error(`Failed to fetch escalation: ${error.message}`);
    if (!data) return null;

    return {
        id: data.id,
        order_id: data.order_id,
        initiator_id: data.initiator_id,
        reason: data.reason,
        dispute_proof_media_id: data.dispute_proof_media_id ?? null,
        dispute_proof_url: null, // would need media join
        status: data.status,
        resolution_type: data.resolution_type ?? null,
        accepted_refund_offer_id: data.accepted_refund_offer_id ?? null,
        resolved_at: data.resolved_at ?? null,
        created_at: data.created_at,
    };
}

/** Get refund offers for an escalation */
export async function getRefundOffers(
    escalationId: string,
): Promise<RefundOffer[]> {
    const { data, error } = await supabase
        .from("refund_offers")
        .select("*")
        .eq("escalation_id", escalationId)
        .order("created_at", { ascending: false });

    if (error) {
        throw new Error(`Failed to fetch refund offers: ${error.message}`);
    }
    return (data ?? []).map((r) => ({
        id: r.id,
        escalation_id: r.escalation_id,
        offered_by: "", // not in DB schema
        amount: Number(r.amount),
        message: r.message ?? null,
        status: r.status,
        created_at: r.created_at,
    }));
}

// =============================================================================
// Mutations
// =============================================================================

/** Update order status */
export async function updateOrderStatus(
    orderId: string,
    newStatus: OrderStatus,
    metadata?: Record<string, unknown>,
): Promise<Order> {
    const updates: Record<string, unknown> = {
        status: newStatus,
        updated_at: new Date().toISOString(),
        ...metadata,
    };

    const { data, error } = await supabase
        .from("orders")
        .update(updates)
        .eq("id", orderId)
        .select(ORDER_SELECT)
        .single();

    if (error) throw new Error(`Failed to update order: ${error.message}`);
    return mapOrderRow(data);
}

/** Cancel an order — refunds escrow, restores qty if accepted, sends chat message */
export async function cancelOrder(
    orderId: string,
    userId: string,
): Promise<{ success: boolean; error?: string }> {
    const { data, error } = await supabase.rpc("cancel_order_with_message", {
        p_order_id: orderId,
        p_user_id: userId,
    });

    if (error) throw new Error(`Failed to cancel order: ${error.message}`);

    const result = data as { success?: boolean; error?: string };
    if (result.error) {
        return { success: false, error: result.error };
    }
    return { success: true };
}

/** Accept an order (seller) — versioned to prevent race conditions */
export async function acceptOrder(
    orderId: string,
    expectedVersion: number,
): Promise<{ success: boolean; error?: string; code?: string }> {
    const { data, error } = await supabase.rpc("accept_order_versioned", {
        p_order_id: orderId,
        p_expected_version: expectedVersion,
    });

    if (error) throw new Error(`Failed to accept order: ${error.message}`);

    const result = data as { success?: boolean; error?: string; code?: string };
    if (result.error) {
        return { success: false, error: result.error, code: result.code };
    }
    return { success: true };
}

/** Reject an order (seller) — versioned to prevent race conditions */
export async function rejectOrder(
    orderId: string,
    expectedVersion: number,
): Promise<{ success: boolean; error?: string; code?: string }> {
    const { data, error } = await supabase.rpc("reject_order_versioned", {
        p_order_id: orderId,
        p_expected_version: expectedVersion,
    });

    if (error) throw new Error(`Failed to reject order: ${error.message}`);

    const result = data as { success?: boolean; error?: string; code?: string };
    if (result.error) {
        return { success: false, error: result.error, code: result.code };
    }
    return { success: true };
}

/** Modify an order (buyer only) — bumps version, adjusts escrow */
export async function modifyOrder(
    orderId: string,
    buyerId: string,
    changes: {
        quantity?: number;
        deliveryDate?: string;
        pointsPerUnit?: number;
        deliveryAddress?: string;
        deliveryInstructions?: string;
    },
): Promise<
    {
        success: boolean;
        error?: string;
        code?: string;
        newVersion?: number;
        newTotal?: number;
    }
> {
    const { data, error } = await supabase.rpc("modify_order", {
        p_order_id: orderId,
        p_buyer_id: buyerId,
        p_quantity: changes.quantity ?? null,
        p_delivery_date: changes.deliveryDate ?? null,
        p_points_per_unit: changes.pointsPerUnit ?? null,
        p_delivery_address: changes.deliveryAddress ?? null,
        p_delivery_instructions: changes.deliveryInstructions ?? null,
    });

    if (error) throw new Error(`Failed to modify order: ${error.message}`);

    const result = data as {
        success?: boolean;
        error?: string;
        code?: string;
        newVersion?: number;
        newTotal?: number;
    };
    if (result.error) {
        return { success: false, error: result.error, code: result.code };
    }
    return {
        success: true,
        newVersion: result.newVersion,
        newTotal: result.newTotal,
    };
}

/** Mark order as delivered with proof — stores proof, sends media message */
export async function markDelivered(
    orderId: string,
    sellerId: string,
    proofMediaId: string,
): Promise<{ success: boolean; error?: string }> {
    const { data, error } = await supabase.rpc("mark_order_delivered", {
        p_order_id: orderId,
        p_seller_id: sellerId,
        p_proof_media_id: proofMediaId,
    });

    if (error) throw new Error(`Failed to mark delivered: ${error.message}`);

    const result = data as { success?: boolean; error?: string };
    if (result.error) {
        return { success: false, error: result.error };
    }
    return { success: true };
}

/** Confirm delivery (buyer) — completes order, sends chat message */
export async function confirmDelivery(
    orderId: string,
    buyerId: string,
): Promise<{ success: boolean; error?: string }> {
    const { data, error } = await supabase.rpc("confirm_order_delivery", {
        p_order_id: orderId,
        p_buyer_id: buyerId,
    });

    if (error) throw new Error(`Failed to confirm delivery: ${error.message}`);

    const result = data as { success?: boolean; error?: string };
    if (result.error) {
        return { success: false, error: result.error };
    }
    return { success: true };
}

/** Dispute delivery (buyer) — calls RPC that sends chat message */
export async function disputeOrder(
    orderId: string,
    buyerId: string,
    reason: string,
): Promise<{ success: boolean; error?: string; escalation_id?: string }> {
    const { data, error } = await supabase.rpc("dispute_order_with_message", {
        p_order_id: orderId,
        p_buyer_id: buyerId,
        p_reason: reason,
    });

    if (error) return { success: false, error: error.message };

    const result = data as Record<string, unknown>;
    if (result.error) {
        return { success: false, error: result.error as string };
    }
    return { success: true, escalation_id: result.escalation_id as string };
}

/** Make a refund offer (seller during dispute) — calls RPC that sends chat message */
export async function makeRefundOffer(
    orderId: string,
    sellerId: string,
    amount: number,
    message?: string,
): Promise<{ success: boolean; error?: string; offer_id?: string }> {
    const { data, error } = await supabase.rpc(
        "make_refund_offer_with_message",
        {
            p_order_id: orderId,
            p_seller_id: sellerId,
            p_amount: amount,
            p_message: message ?? null,
        },
    );

    if (error) return { success: false, error: error.message };

    const result = data as Record<string, unknown>;
    if (result.error) {
        return { success: false, error: result.error as string };
    }
    return { success: true, offer_id: result.offer_id as string };
}

/** Accept a refund offer (buyer) — calls RPC that processes refund + sends message */
export async function acceptRefundOffer(
    orderId: string,
    buyerId: string,
    offerId: string,
): Promise<{ success: boolean; error?: string }> {
    const { data, error } = await supabase.rpc(
        "accept_refund_offer_with_message",
        {
            p_order_id: orderId,
            p_buyer_id: buyerId,
            p_offer_id: offerId,
        },
    );

    if (error) return { success: false, error: error.message };

    const result = data as Record<string, unknown>;
    if (result.error) {
        return { success: false, error: result.error as string };
    }
    return { success: true };
}

/** Reject a refund offer */
export async function rejectRefundOffer(
    refundOfferId: string,
): Promise<void> {
    const { error } = await supabase
        .from("refund_offers")
        .update({ status: "rejected" })
        .eq("id", refundOfferId);

    if (error) {
        throw new Error(`Failed to reject refund offer: ${error.message}`);
    }
}

/** Escalate dispute to CasaGrown — calls RPC that sends chat message */
export async function escalateDispute(
    orderId: string,
    userId: string,
): Promise<{ success: boolean; error?: string }> {
    const { data, error } = await supabase.rpc(
        "escalate_order_with_message",
        {
            p_order_id: orderId,
            p_user_id: userId,
        },
    );

    if (error) return { success: false, error: error.message };

    const result = data as Record<string, unknown>;
    if (result.error) {
        return { success: false, error: result.error as string };
    }
    return { success: true };
}

/** Resolve dispute without additional refund — calls RPC that sends chat message */
export async function resolveDispute(
    orderId: string,
    userId: string,
): Promise<{ success: boolean; error?: string }> {
    const { data, error } = await supabase.rpc(
        "resolve_dispute_with_message",
        {
            p_order_id: orderId,
            p_user_id: userId,
        },
    );

    if (error) return { success: false, error: error.message };

    const result = data as Record<string, unknown>;
    if (result.error) {
        return { success: false, error: result.error as string };
    }
    return { success: true };
}

/** Submit a rating */
export async function submitRating(
    orderId: string,
    raterRole: "buyer" | "seller",
    score: RatingScore,
    feedback?: string,
): Promise<Order> {
    const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
    };

    if (raterRole === "buyer") {
        updates.seller_rating = score;
        updates.seller_feedback = feedback ?? null;
    } else {
        updates.buyer_rating = score;
        updates.buyer_feedback = feedback ?? null;
    }

    const { data, error } = await supabase
        .from("orders")
        .update(updates)
        .eq("id", orderId)
        .select(ORDER_SELECT)
        .single();

    if (error) throw new Error(`Failed to submit rating: ${error.message}`);
    return mapOrderRow(data);
}
