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
import { supabase } from "../features/auth/auth-hook";

interface UsePointsBalanceReturn {
    /** Current points balance (0 if no history) */
    balance: number;
    /** Whether the initial load is in progress */
    loading: boolean;
    /** Error message if fetch failed */
    error: string | null;
    /** Refetch balance from DB */
    refetch: () => Promise<void>;
}

export function usePointsBalance(userId?: string): UsePointsBalanceReturn {
    const [balance, setBalance] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const mountedRef = useRef(true);

    const fetchBalance = useCallback(async () => {
        if (!userId) {
            setBalance(0);
            setLoading(false);
            return;
        }

        try {
            // Get the most recent point_ledger entry for this user
            const { data, error: queryError } = await supabase
                .from("point_ledger")
                .select("balance_after")
                .eq("user_id", userId)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();

            if (!mountedRef.current) return;

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

    return {
        balance,
        loading,
        error,
        refetch: fetchBalance,
    };
}
