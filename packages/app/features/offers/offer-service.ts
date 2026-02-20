/**
 * Offer Service — Supabase Data Layer
 *
 * Provides CRUD operations for offers on buy posts,
 * including creating, accepting, rejecting, withdrawing,
 * modifying offers, and fetching offer lists.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../auth/auth-hook";
import type { Offer, OfferFilter } from "./offer-types";
import { isOpenOffer } from "./offer-types";

// =============================================================================
// Helpers
// =============================================================================

/** Map a Supabase row into the client-side Offer shape */
function mapOfferRow(row: Record<string, unknown>): Offer {
    // Profiles join may come as nested objects
    const conv = row.conversations as Record<string, unknown> | null;
    const buyerProfile = conv?.buyer as Record<string, unknown> | null;
    const sellerProfile = conv?.seller as Record<string, unknown> | null;

    return {
        id: row.id as string,
        conversation_id: row.conversation_id as string,
        post_id: (row.post_id as string) ?? null,
        created_by: row.created_by as string,
        quantity: Number(row.quantity),
        points_per_unit: Number(row.points_per_unit),
        category: (row.category as string) ?? null,
        product: (row.product as string) ?? null,
        unit: (row.unit as string) ?? null,
        delivery_date: (row.delivery_date as string) ?? null,
        delivery_dates: (row.delivery_dates as string[]) ?? null,
        message: (row.message as string) ?? null,
        seller_post_id: (row.seller_post_id as string) ?? null,
        status: row.status as Offer["status"],
        version: Number(row.version ?? 1),
        media: (row.media as Offer["media"]) ?? [],
        created_at: row.created_at as string,
        updated_at: (row.updated_at as string) ?? null,
        buyer_name: (buyerProfile?.full_name as string) ?? null,
        buyer_avatar_url: (buyerProfile?.avatar_url as string) ?? null,
        seller_name: (sellerProfile?.full_name as string) ?? null,
        seller_avatar_url: (sellerProfile?.avatar_url as string) ?? null,
        buyer_id: (conv?.buyer_id as string) ?? null,
        seller_id: (conv?.seller_id as string) ?? null,
    };
}

const OFFER_SELECT = `
  *,
  conversations!inner(
    buyer_id, seller_id,
    buyer:profiles!conversations_buyer_id_fkey(full_name, avatar_url),
    seller:profiles!conversations_seller_id_fkey(full_name, avatar_url)
  )
`;

// =============================================================================
// Queries
// =============================================================================

/** Get all offers for a user, filtered */
export async function getOffers(
    userId: string,
    filter: OfferFilter,
): Promise<Offer[]> {
    let query = supabase
        .from("offers")
        .select(OFFER_SELECT)
        .order("created_at", { ascending: false });

    // Tab filter
    if (filter.tab === "open") {
        query = query.eq("status", "pending");
    } else {
        query = query.in("status", ["accepted", "rejected", "withdrawn"]);
    }

    // Role filter — filter by conversation party
    if (filter.role === "selling") {
        query = query.eq("created_by", userId);
    } else if (filter.role === "buying") {
        query = query.neq("created_by", userId);
    }
    // "all" — no additional filter (RLS handles scoping)

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((row: Record<string, unknown>) => mapOfferRow(row));
}

/** Get offer by conversation ID */
export async function getOfferByConversation(
    conversationId: string,
): Promise<Offer | null> {
    const { data, error } = await supabase
        .from("offers")
        .select(OFFER_SELECT)
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(1);

    if (error) throw error;
    if (!data || data.length === 0) return null;
    return mapOfferRow(data[0] as Record<string, unknown>);
}

/** Get offer by ID */
export async function getOfferById(offerId: string): Promise<Offer | null> {
    const { data, error } = await supabase
        .from("offers")
        .select(OFFER_SELECT)
        .eq("id", offerId)
        .single();

    if (error) {
        if (error.code === "PGRST116") return null;
        throw error;
    }
    return mapOfferRow(data as Record<string, unknown>);
}

/**
 * Check if there is an active offer or order for a given post + user combo.
 * Used to decide whether to redirect to chat vs open the offer form.
 * Returns conversation info if active offer/order exists.
 */
export async function getActiveOfferOrOrder(
    postId: string,
    userId: string,
): Promise<
    {
        hasActiveOffer: boolean;
        hasActiveOrder: boolean;
        conversationId: string | null;
        otherUserId: string | null;
    } | null
> {
    // Find conversations for this post where user is a party
    const { data: convs, error: convErr } = await supabase
        .from("conversations")
        .select("id, buyer_id, seller_id")
        .eq("post_id", postId)
        .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`);

    if (convErr) throw convErr;
    if (!convs || convs.length === 0) return null;

    for (const conv of convs) {
        const otherUserId = conv.buyer_id === userId
            ? conv.seller_id
            : conv.buyer_id;

        // Check for pending offer
        const { data: offers } = await supabase
            .from("offers")
            .select("id")
            .eq("conversation_id", conv.id)
            .eq("status", "pending")
            .limit(1);

        if (offers && offers.length > 0) {
            return {
                hasActiveOffer: true,
                hasActiveOrder: false,
                conversationId: conv.id,
                otherUserId,
            };
        }

        // Check for active order
        const { data: orders } = await supabase
            .from("orders")
            .select("id, status")
            .eq("conversation_id", conv.id)
            .not("status", "in", '("cancelled","completed")')
            .limit(1);

        if (orders && orders.length > 0) {
            return {
                hasActiveOffer: false,
                hasActiveOrder: true,
                conversationId: conv.id,
                otherUserId,
            };
        }
    }

    return null;
}

// =============================================================================
// Mutations
// =============================================================================

/** Create a new offer via RPC */
export async function createOffer(data: {
    postId: string;
    buyerId: string;
    quantity: number;
    pointsPerUnit: number;
    category: string;
    product: string;
    unit?: string;
    deliveryDate?: string;
    deliveryDates?: string[];
    message?: string;
    sellerPostId?: string;
    media?: Array<{ storage_path: string; media_type: "image" | "video" }>;
    communityH3Index?: string;
    additionalCommunityH3Indices?: string[];
}): Promise<{ offerId: string; conversationId: string }> {
    const { data: session } = await supabase.auth.getSession();
    if (!session?.session?.user?.id) throw new Error("Not authenticated");

    const sellerId = session.session.user.id;

    // Can't offer on your own post
    if (sellerId === data.buyerId) {
        throw new Error("Cannot make an offer on your own post");
    }

    const { data: result, error } = await supabase.rpc(
        "create_offer_atomic",
        {
            p_seller_id: sellerId,
            p_buyer_id: data.buyerId,
            p_post_id: data.postId,
            p_quantity: data.quantity,
            p_points_per_unit: data.pointsPerUnit,
            p_category: data.category,
            p_product: data.product,
            p_unit: data.unit || null,
            p_delivery_date: data.deliveryDate || null,
            p_delivery_dates: data.deliveryDates || [],
            p_message: data.message || null,
            p_seller_post_id: data.sellerPostId || null,
            p_media: data.media || [],
            p_community_h3_index: data.communityH3Index || null,
            p_additional_community_h3_indices:
                data.additionalCommunityH3Indices || [],
        },
    );

    if (error) {
        throw new Error(`Failed to create offer: ${error.message}`);
    }

    if (result?.error) {
        throw new Error(result.error);
    }

    return {
        offerId: result.offerId,
        conversationId: result.conversationId,
    };
}

/** Accept an offer (buyer) — creates order, escrows points */
export async function acceptOffer(
    offerId: string,
    buyerId: string,
    deliveryAddress: string,
    deliveryInstructions?: string,
    quantity?: number,
): Promise<{
    success: boolean;
    error?: string;
    orderId?: string;
    conversationId?: string;
    newBalance?: number;
}> {
    const { data, error } = await supabase.rpc("accept_offer_atomic", {
        p_offer_id: offerId,
        p_buyer_id: buyerId,
        p_delivery_address: deliveryAddress,
        p_delivery_instructions: deliveryInstructions,
        p_quantity: quantity ?? null,
    });

    if (error) return { success: false, error: error.message };
    if (data?.error) return { success: false, error: data.error };

    return {
        success: true,
        orderId: data.orderId,
        conversationId: data.conversationId,
        newBalance: data.newBalance,
    };
}

/** Reject an offer (buyer) */
export async function rejectOffer(
    offerId: string,
    buyerId: string,
): Promise<{ success: boolean; error?: string }> {
    const { data, error } = await supabase.rpc("reject_offer_with_message", {
        p_offer_id: offerId,
        p_buyer_id: buyerId,
    });

    if (error) return { success: false, error: error.message };
    if (data?.error) return { success: false, error: data.error };
    return { success: true };
}

/** Withdraw an offer (seller) */
export async function withdrawOffer(
    offerId: string,
    sellerId: string,
): Promise<{ success: boolean; error?: string }> {
    const { data, error } = await supabase.rpc("withdraw_offer_with_message", {
        p_offer_id: offerId,
        p_seller_id: sellerId,
    });

    if (error) return { success: false, error: error.message };
    if (data?.error) return { success: false, error: data.error };
    return { success: true };
}

/** Modify a pending offer (seller) */
export async function modifyOffer(
    offerId: string,
    sellerId: string,
    changes: {
        quantity?: number;
        pointsPerUnit?: number;
        deliveryDate?: string;
        deliveryDates?: string[];
        message?: string;
        media?: Array<{ storage_path: string; media_type: "image" | "video" }>;
        communityH3Index?: string;
        additionalCommunityH3Indices?: string[];
    },
): Promise<{ success: boolean; error?: string; newVersion?: number }> {
    const { data, error } = await supabase.rpc("modify_offer_with_message", {
        p_offer_id: offerId,
        p_seller_id: sellerId,
        p_quantity: changes.quantity ?? null,
        p_points_per_unit: changes.pointsPerUnit ?? null,
        p_delivery_date: changes.deliveryDate ?? null,
        p_delivery_dates: changes.deliveryDates ?? null,
        p_message: changes.message ?? null,
        p_media: changes.media ?? null,
        p_community_h3_index: changes.communityH3Index ?? null,
        p_additional_community_h3_indices:
            changes.additionalCommunityH3Indices ?? null,
    });

    if (error) return { success: false, error: error.message };
    if (data?.error) return { success: false, error: data.error };
    return { success: true, newVersion: data.newVersion };
}

// =============================================================================
// React Hook — useConversationOffer
// =============================================================================

export function useConversationOffer(conversationId: string | null) {
    const [offer, setOffer] = useState<Offer | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refetch = useCallback(async () => {
        if (!conversationId) {
            setOffer(null);
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            const result = await getOfferByConversation(conversationId);
            setOffer(result);
            setError(null);
        } catch (err: unknown) {
            const message = err instanceof Error
                ? err.message
                : "Failed to load offer";
            setError(message);
        } finally {
            setLoading(false);
        }
    }, [conversationId]);

    useEffect(() => {
        refetch();
    }, [refetch]);

    // Subscribe to realtime updates on offers
    useEffect(() => {
        if (!conversationId) return;

        const channel = supabase
            .channel(`offers:${conversationId}`)
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "offers",
                    filter: `conversation_id=eq.${conversationId}`,
                },
                () => {
                    refetch();
                },
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [conversationId, refetch]);

    return { offer, loading, error, refetch };
}

/** Get the count of open offers for a user */
export async function getOpenOfferCount(userId: string): Promise<number> {
    const { count, error } = await supabase
        .from("offers")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending")
        .or(
            `conversations.buyer_id.eq.${userId},conversations.seller_id.eq.${userId}`,
        );

    if (error) return 0;
    return count ?? 0;
}
