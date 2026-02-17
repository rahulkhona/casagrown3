/**
 * useOrders — React hook for order data
 *
 * Wraps order-service with loading/error/refresh state.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type {
    Escalation,
    Order,
    OrderFilter,
    RefundOffer,
} from "./order-types";
import {
    getEscalation,
    getOrderByConversation,
    getOrders,
    getRefundOffers,
} from "./order-service";
import { supabase } from "../auth/auth-hook";

interface UseOrdersReturn {
    orders: Order[];
    loading: boolean;
    error: string | null;
    refresh: () => void;
}

/** Fetch orders list with filters */
export function useOrders(
    userId: string,
    filter: OrderFilter,
): UseOrdersReturn {
    const [data, setData] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);

        getOrders(userId, filter)
            .then((result) => {
                if (!cancelled) {
                    setData(result);
                    setLoading(false);
                }
            })
            .catch((err) => {
                if (!cancelled) {
                    setError(
                        err instanceof Error
                            ? err.message
                            : "Failed to load orders",
                    );
                    setLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [userId, filter.tab, filter.role, filter.searchQuery, refreshKey]);

    const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

    return { orders: data, loading, error, refresh };
}

// =============================================================================
// useConversationOrder — Fetch order for a specific conversation
// =============================================================================

interface UseConversationOrderReturn {
    order: Order | null;
    escalation: Escalation | null;
    refundOffers: RefundOffer[];
    loading: boolean;
    error: string | null;
    refresh: () => void;
}

export function useConversationOrder(
    conversationId: string | null,
): UseConversationOrderReturn {
    const [order, setOrder] = useState<Order | null>(null);
    const [escalation, setEscalation] = useState<Escalation | null>(null);
    const [refundOffers, setRefundOffers] = useState<RefundOffer[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        if (!conversationId) return;
        let cancelled = false;
        setLoading(true);
        setError(null);

        const load = async () => {
            try {
                console.log(
                    "[useConversationOrder] Loading order for conversation:",
                    conversationId,
                );
                const ord = await getOrderByConversation(conversationId);
                console.log(
                    "[useConversationOrder] Order result:",
                    ord ? `id=${ord.id} status=${ord.status}` : "null",
                );
                if (cancelled) return;
                setOrder(ord);

                if (
                    ord &&
                    (ord.status === "disputed" || ord.status === "escalated")
                ) {
                    const esc = await getEscalation(ord.id);
                    if (cancelled) return;
                    setEscalation(esc);

                    if (esc) {
                        const offers = await getRefundOffers(esc.id);
                        if (!cancelled) setRefundOffers(offers);
                    }
                } else {
                    setEscalation(null);
                    setRefundOffers([]);
                }
                setLoading(false);
            } catch (err) {
                console.error(
                    "[useConversationOrder] Error loading order:",
                    err,
                );
                if (!cancelled) {
                    setError(
                        err instanceof Error
                            ? err.message
                            : "Failed to load order",
                    );
                    setLoading(false);
                }
            }
        };

        load();
        return () => {
            cancelled = true;
        };
    }, [conversationId, refreshKey]);

    // ── Realtime: auto-refresh when order is updated by the other party ──
    useEffect(() => {
        if (!conversationId) return;

        const channel = supabase
            .channel(`order-updates:${conversationId}`)
            .on(
                "postgres_changes",
                {
                    event: "UPDATE",
                    schema: "public",
                    table: "orders",
                    filter: `conversation_id=eq.${conversationId}`,
                },
                () => {
                    // Order was modified — refresh to get latest version/status
                    setRefreshKey((k) => k + 1);
                },
            )
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "orders",
                    filter: `conversation_id=eq.${conversationId}`,
                },
                () => {
                    // New order created in this conversation
                    setRefreshKey((k) => k + 1);
                },
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [conversationId]);

    const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

    return { order, escalation, refundOffers, loading, error, refresh };
}
