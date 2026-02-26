/**
 * usePointsBalance — Fetches the user's current points balance from point_ledger.
 *
 * Reads the most recent `balance_after` from `point_ledger` for the current user.
 * Provides a `refetch()` function to refresh after purchases or orders.
 *
 * Usage:
 *   const { balance, loading, refetch } = usePointsBalance(userId)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { supabase } from "../features/auth/auth-hook";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface UsePointsBalanceReturn {
    /** Current points balance (0 if no history) */
    balance: number;
    /** Whether the initial load is in progress */
    loading: boolean;
    /** Error message if fetch failed */
    error: string | null;
    /** Refetch balance from DB */
    refetch: () => Promise<void>;
    /** Optimistically adjust balance by delta (e.g., -1000 for redemption, +500 for purchase) */
    adjustBalance: (delta: number) => void;
}

export function usePointsBalance(userId?: string): UsePointsBalanceReturn {
    const [balance, setBalance] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const mountedRef = useRef(true);
    const balanceRef = useRef(0);

    // Keep ref in sync with state
    useEffect(() => {
        balanceRef.current = balance;
    }, [balance]);

    const fetchBalance = useCallback(async () => {
        // E2E Test Bypass: Force 50,000 balance without needing a valid session/userId
        if (
            Platform.OS === "web" && typeof window !== "undefined" &&
            window.localStorage.getItem("E2E_BYPASS_AUTH") === "true"
        ) {
            setBalance(50000);
            setLoading(false);
            return;
        }

        if (!userId) {
            setBalance(0);
            setLoading(false);
            return;
        }

        try {
            const { data, error: queryError } = await supabase
                .from("point_ledger")
                .select("balance_after")
                .eq("user_id", userId)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();

            if (!mountedRef.current) return;

            console.log("[POINTS DEBUG]", { data, queryError });

            if (queryError) {
                console.warn(
                    "[POINTS] Failed to fetch balance:",
                    queryError,
                );
                setError(queryError.message);
            } else {
                setBalance(data?.balance_after ?? 0);
                setError(null);
            }
        } catch (err) {
            if (!mountedRef.current) return;
            const message = err instanceof Error
                ? err.message
                : "Failed to fetch balance";
            console.error("[POINTS] Unexpected error:", err);
            setError(message);
        } finally {
            if (mountedRef.current) {
                setLoading(false);
            }
        }
    }, [userId]);

    useEffect(() => {
        mountedRef.current = true;
        fetchBalance();
        return () => {
            mountedRef.current = false;
        };
    }, [fetchBalance]);

    // ── Realtime: auto-refresh balance when ledger entries are created ──
    // The DB trigger (trg_compute_balance_after) may run AFTER the realtime
    // event fires, so we poll a few times with increasing delays.
    // IMPORTANT: We use balanceRef (not state) to avoid re-creating the channel
    // on every balance change, which would kill in-flight polling timers.
    //
    // ── Visibility-aware: disconnect when backgrounded, reconnect when foregrounded ──
    useEffect(() => {
        if (!userId) return;

        let channel: RealtimeChannel | null = null;
        let isChannelActive = false;

        const createChannel = () => {
            if (isChannelActive) return;
            channel = supabase
                .channel(`points-balance:${userId}`)
                .on(
                    "postgres_changes",
                    {
                        event: "INSERT",
                        schema: "public",
                        table: "point_ledger",
                        filter: `user_id=eq.${userId}`,
                    },
                    () => {
                        // Snapshot the current balance via ref (stable, no closure issue)
                        const previousBalance = balanceRef.current;
                        const delays = [100, 300, 600, 1200, 2500];
                        let attempt = 0;

                        const poll = async () => {
                            if (
                                !mountedRef.current || attempt >= delays.length
                            ) {
                                return;
                            }

                            const { data } = await supabase
                                .from("point_ledger")
                                .select("balance_after")
                                .eq("user_id", userId)
                                .order("created_at", { ascending: false })
                                .limit(1)
                                .maybeSingle();

                            const newBalance = data?.balance_after ?? 0;

                            if (newBalance !== previousBalance) {
                                if (mountedRef.current) setBalance(newBalance);
                            } else {
                                attempt++;
                                if (attempt < delays.length) {
                                    setTimeout(poll, delays[attempt]!);
                                }
                            }
                        };

                        setTimeout(poll, delays[0]!);
                    },
                )
                .subscribe();
            isChannelActive = true;
        };

        const destroyChannel = () => {
            if (channel) {
                supabase.removeChannel(channel);
                channel = null;
                isChannelActive = false;
            }
        };

        // Start immediately
        createChannel();

        // Native: visibility-aware via AppState
        let appStateSub: ReturnType<typeof AppState.addEventListener> | null =
            null;
        if (Platform.OS !== "web") {
            appStateSub = AppState.addEventListener("change", (state) => {
                if (state === "active") {
                    createChannel();
                    // Refetch on foreground to catch changes while backgrounded
                    if (mountedRef.current) fetchBalance();
                } else if (state === "background" || state === "inactive") {
                    destroyChannel();
                }
            });
        }

        // Web: visibility-aware via visibilitychange
        let handleVisibility: (() => void) | null = null;
        if (Platform.OS === "web" && typeof document !== "undefined") {
            handleVisibility = () => {
                if (document.visibilityState === "visible") {
                    createChannel();
                    if (mountedRef.current) fetchBalance();
                } else {
                    destroyChannel();
                }
            };
            document.addEventListener("visibilitychange", handleVisibility);
        }

        return () => {
            destroyChannel();
            appStateSub?.remove();
            if (handleVisibility && typeof document !== "undefined") {
                document.removeEventListener(
                    "visibilitychange",
                    handleVisibility,
                );
            }
        };
        // NOTE: Only depend on userId — NOT balance. Using balanceRef avoids
        // tearing down the channel on every optimistic balance update.
    }, [userId, fetchBalance]);

    // ── Web: refetch when tab regains focus ──
    useEffect(() => {
        if (Platform.OS !== "web") return;
        const handleFocus = () => {
            if (mountedRef.current) fetchBalance();
        };
        window.addEventListener("focus", handleFocus);
        return () => window.removeEventListener("focus", handleFocus);
    }, [fetchBalance]);

    // ── Cross-instance sync: listen for balance changes from other hook instances ──
    useEffect(() => {
        if (Platform.OS !== "web") return;
        const handleAdjust = (e: Event) => {
            const delta = (e as CustomEvent).detail?.delta;
            if (typeof delta === "number" && mountedRef.current) {
                setBalance((prev) => Math.max(0, prev + delta));
            }
        };
        const handleRefetch = () => {
            if (mountedRef.current) fetchBalance();
        };
        window.addEventListener("points-balance-adjust", handleAdjust);
        window.addEventListener("points-balance-refetch", handleRefetch);
        return () => {
            window.removeEventListener("points-balance-adjust", handleAdjust);
            window.removeEventListener("points-balance-refetch", handleRefetch);
        };
    }, [fetchBalance]);

    // ── All platforms: periodic poll every 5 seconds as safety net ──
    useEffect(() => {
        if (!userId) return;
        const interval = setInterval(() => {
            if (mountedRef.current) fetchBalance();
        }, 5000);
        return () => clearInterval(interval);
    }, [fetchBalance, userId]);

    const adjustBalance = useCallback((delta: number) => {
        setBalance((prev) => Math.max(0, prev + delta));
        // Notify all other hook instances (header, other pages) to apply the same delta
        if (Platform.OS === "web" && typeof window !== "undefined") {
            window.dispatchEvent(
                new CustomEvent("points-balance-adjust", { detail: { delta } }),
            );
        }
    }, []);

    // Wrap refetch to also trigger cross-instance refetch
    const triggerRefetch = useCallback(async () => {
        await fetchBalance();
        if (Platform.OS === "web" && typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("points-balance-refetch"));
        }
    }, [fetchBalance]);

    return {
        balance,
        loading,
        error,
        refetch: triggerRefetch,
        adjustBalance,
    };
}
