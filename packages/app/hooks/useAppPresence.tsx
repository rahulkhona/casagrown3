/**
 * useAppPresence — Root-level presence provider with visibility-aware connect/disconnect.
 *
 * Manages a single Supabase presence channel scoped to the user's community.
 * Subscribes when the app is in the foreground (or tab is visible) and
 * disconnects when backgrounded/hidden to avoid idle WebSocket overhead.
 *
 * Provides:
 *   - AppPresenceProvider: wraps the app tree
 *   - useIsOnline(userId): returns whether a specific user is online
 *   - useOnlineUsers(): returns the Set of online user IDs
 */

import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from "react";
import { AppState, Platform } from "react-native";
import { supabase } from "../features/auth/auth-hook";
import type { RealtimeChannel } from "@supabase/supabase-js";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AppPresenceContextValue {
    /** Set of currently online user IDs in the user's community */
    onlineUsers: Set<string>;
    /** Check if a specific user is online */
    isOnline: (userId: string) => boolean;
}

const DEFAULT_CTX: AppPresenceContextValue = {
    onlineUsers: new Set(),
    isOnline: () => false,
};

const AppPresenceContext = createContext<AppPresenceContextValue>(DEFAULT_CTX);

// ─── Provider ────────────────────────────────────────────────────────────────

interface AppPresenceProviderProps {
    userId: string | undefined;
    communityH3?: string | null;
    children: React.ReactNode;
}

/**
 * Wrap the app tree with this provider once the user is authenticated.
 * Pass the user's community H3 index for scoped presence, or omit
 * to use a global channel.
 */
export function AppPresenceProvider({
    userId,
    communityH3,
    children,
}: AppPresenceProviderProps) {
    const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
    const channelRef = useRef<RealtimeChannel | null>(null);
    const isSubscribedRef = useRef(false);
    const mountedRef = useRef(true);

    // Channel name: scoped to community if available, global fallback
    const channelName = communityH3
        ? `app-presence:${communityH3}`
        : "app-presence:global";

    // ── Subscribe to presence channel ────────────────────────────────────

    const subscribe = useCallback(() => {
        if (!userId || isSubscribedRef.current) return;

        const channel = supabase.channel(channelName, {
            config: { presence: { key: userId } },
        });

        channel
            .on("presence", { event: "sync" }, () => {
                const state = channel.presenceState();
                const ids = new Set<string>();
                for (const key of Object.keys(state)) {
                    if (key !== userId) {
                        ids.add(key);
                    }
                }
                if (mountedRef.current) setOnlineUsers(ids);
            })
            .on("presence", { event: "join" }, ({ key }) => {
                if (key && key !== userId && mountedRef.current) {
                    setOnlineUsers((prev) => {
                        const next = new Set(prev);
                        next.add(key);
                        return next;
                    });
                }
            })
            .on("presence", { event: "leave" }, ({ key }) => {
                if (key && key !== userId && mountedRef.current) {
                    setOnlineUsers((prev) => {
                        const next = new Set(prev);
                        next.delete(key);
                        return next;
                    });
                }
            })
            .subscribe(async (status) => {
                if (status === "SUBSCRIBED") {
                    isSubscribedRef.current = true;
                    await channel.track({ online: true });
                } else if (
                    status === "CHANNEL_ERROR" ||
                    status === "TIMED_OUT"
                ) {
                    isSubscribedRef.current = false;
                } else if (status === "CLOSED") {
                    isSubscribedRef.current = false;
                }
            });

        channelRef.current = channel;
    }, [userId, channelName]);

    // ── Unsubscribe from presence channel ────────────────────────────────

    const unsubscribe = useCallback(() => {
        if (channelRef.current) {
            channelRef.current.untrack();
            supabase.removeChannel(channelRef.current);
            channelRef.current = null;
            isSubscribedRef.current = false;
        }
    }, []);

    // ── Visibility-aware connect/disconnect ──────────────────────────────

    useEffect(() => {
        if (!userId) return;

        // Subscribe immediately if we have a user
        subscribe();

        // Native: AppState listener
        if (Platform.OS !== "web") {
            const sub = AppState.addEventListener("change", (state) => {
                if (state === "active") {
                    subscribe();
                } else if (state === "background" || state === "inactive") {
                    unsubscribe();
                }
            });

            return () => {
                sub.remove();
                unsubscribe();
            };
        }

        // Web: visibilitychange listener
        if (typeof document !== "undefined") {
            const handleVisibility = () => {
                if (document.visibilityState === "visible") {
                    subscribe();
                } else {
                    unsubscribe();
                }
            };
            document.addEventListener("visibilitychange", handleVisibility);

            return () => {
                document.removeEventListener(
                    "visibilitychange",
                    handleVisibility,
                );
                unsubscribe();
            };
        }

        return () => {
            unsubscribe();
        };
    }, [userId, subscribe, unsubscribe]);

    // Cleanup on unmount
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    // ── Context value ────────────────────────────────────────────────────

    const isOnline = useCallback(
        (uid: string) => onlineUsers.has(uid),
        [onlineUsers],
    );

    const value: AppPresenceContextValue = {
        onlineUsers,
        isOnline,
    };

    return (
        <AppPresenceContext.Provider value={value}>
            {children}
        </AppPresenceContext.Provider>
    );
}

// ─── Consumer hooks ──────────────────────────────────────────────────────────

/** Check if a specific user is currently online */
export function useIsOnline(userId: string | undefined): boolean {
    const { isOnline } = useContext(AppPresenceContext);
    return userId ? isOnline(userId) : false;
}

/** Get the full set of online user IDs */
export function useOnlineUsers(): Set<string> {
    const { onlineUsers } = useContext(AppPresenceContext);
    return onlineUsers;
}
