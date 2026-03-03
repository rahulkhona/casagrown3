import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../auth/auth-hook";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface Notification {
    id: string;
    user_id: string;
    content: string;
    link_url: string | null;
    read_at: string | null;
    created_at: string;
}

/**
 * useNotifications — React hook for notification data management.
 *
 * - Fetches the 50 most recent notifications on mount
 * - Subscribes to Realtime INSERT on the `notifications` table
 * - Provides markAsRead, markAllAsRead, and clearAll actions
 * - Derives unreadCount from the local state
 */
export function useNotifications(userId: string | undefined) {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(false);
    const channelRef = useRef<RealtimeChannel | null>(null);

    const fetchNotifications = useCallback(async () => {
        if (!userId) return;
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from("notifications")
                .select("id, user_id, content, link_url, read_at, created_at")
                .eq("user_id", userId)
                .order("created_at", { ascending: false })
                .limit(50);

            if (!error && data) {
                setNotifications(data);
            }
        } finally {
            setLoading(false);
        }
    }, [userId]);

    // Initial fetch + Realtime subscription
    useEffect(() => {
        if (!userId) return;

        fetchNotifications();

        // Subscribe to new notification INSERTs for this user
        const channel = supabase
            .channel(`notifications:${userId}`)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "notifications",
                    filter: `user_id=eq.${userId}`,
                },
                (payload) => {
                    const newNotif = payload.new as Notification;
                    setNotifications((prev) =>
                        [newNotif, ...prev].slice(0, 50)
                    );
                },
            )
            .subscribe();

        channelRef.current = channel;

        return () => {
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
            }
        };
    }, [userId, fetchNotifications]);

    const unreadCount = notifications.filter((n) => !n.read_at).length;

    const markAsRead = useCallback(async (notificationId: string) => {
        // Optimistic update
        setNotifications((prev) =>
            prev.map((n) =>
                n.id === notificationId
                    ? { ...n, read_at: new Date().toISOString() }
                    : n
            )
        );

        await supabase
            .from("notifications")
            .update({ read_at: new Date().toISOString() })
            .eq("id", notificationId);
    }, []);

    const markAllAsRead = useCallback(async () => {
        if (!userId) return;

        const now = new Date().toISOString();

        // Optimistic update
        setNotifications((prev) =>
            prev.map((n) => (n.read_at ? n : { ...n, read_at: now }))
        );

        await supabase
            .from("notifications")
            .update({ read_at: now })
            .eq("user_id", userId)
            .is("read_at", null);
    }, [userId]);

    const clearAll = useCallback(async () => {
        if (!userId) return;

        // Optimistic update
        setNotifications([]);

        await supabase
            .from("notifications")
            .delete()
            .eq("user_id", userId);
    }, [userId]);

    return {
        notifications,
        unreadCount,
        loading,
        markAsRead,
        markAllAsRead,
        clearAll,
        refetch: fetchNotifications,
    };
}
