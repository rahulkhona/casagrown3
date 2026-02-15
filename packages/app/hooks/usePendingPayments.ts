/**
 * usePendingPayments — Resolves stuck payments on app open.
 *
 * On mount (and when `enabled` is true), calls the resolve-pending-payments
 * edge function to check for any payment_transactions stuck in 'pending'.
 *
 * If any are resolved, fires `onResolved` callback with the total points recovered,
 * so the UI can show a toast/notification.
 *
 * Usage:
 *   usePendingPayments({
 *     enabled: isLoggedIn,
 *     onResolved: (points) => showToast(`${points} points recovered!`),
 *   })
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../utils/supabase";

interface ResolvedTransaction {
    id: string;
    points: number;
    status: string;
}

interface PendingTransaction {
    id: string;
    points: number;
    provider: string;
    createdAt: string;
}

interface UsePendingPaymentsOptions {
    /** Only run when true (e.g., user is authenticated) */
    enabled?: boolean;
    /** Called when pending transactions are resolved with total points recovered */
    onResolved?: (
        totalPoints: number,
        transactions: ResolvedTransaction[],
    ) => void;
    /** Called if there are transactions still pending (e.g., Stripe processing) */
    onStillPending?: (transactions: PendingTransaction[]) => void;
}

interface UsePendingPaymentsReturn {
    /** Whether the check is currently running */
    isChecking: boolean;
    /** Number of transactions resolved this session */
    resolvedCount: number;
    /** Total points recovered this session */
    recoveredPoints: number;
    /** Manually trigger a recheck */
    recheck: () => void;
}

export function usePendingPayments(
    options: UsePendingPaymentsOptions = {},
): UsePendingPaymentsReturn {
    const { enabled = true, onResolved, onStillPending } = options;
    const [isChecking, setIsChecking] = useState(false);
    const [resolvedCount, setResolvedCount] = useState(0);
    const [recoveredPoints, setRecoveredPoints] = useState(0);
    const hasChecked = useRef(false);

    const checkPending = useCallback(async () => {
        if (isChecking) return;

        setIsChecking(true);
        try {
            console.log(
                "[PENDING PAYMENTS] Checking for unresolved transactions...",
            );

            const { data, error } = await supabase.functions.invoke(
                "resolve-pending-payments",
                {
                    method: "POST",
                    body: {},
                },
            );

            if (error) {
                console.error("[PENDING PAYMENTS] Check failed:", error);
                return;
            }

            const resolved: ResolvedTransaction[] = data?.resolved || [];
            const pending: PendingTransaction[] = data?.pending || [];

            if (resolved.length > 0) {
                const totalPoints = resolved.reduce(
                    (sum: number, t: ResolvedTransaction) => sum + t.points,
                    0,
                );
                console.log(
                    `[PENDING PAYMENTS] ✅ Recovered ${totalPoints} points from ${resolved.length} transaction(s)`,
                );
                setResolvedCount((c) => c + resolved.length);
                setRecoveredPoints((p) => p + totalPoints);
                onResolved?.(totalPoints, resolved);
            }

            if (pending.length > 0) {
                console.log(
                    `[PENDING PAYMENTS] ⏳ ${pending.length} transaction(s) still pending`,
                );
                onStillPending?.(pending);
            }

            if (resolved.length === 0 && pending.length === 0) {
                console.log("[PENDING PAYMENTS] No pending transactions found");
            }
        } catch (err) {
            console.error("[PENDING PAYMENTS] Unexpected error:", err);
        } finally {
            setIsChecking(false);
        }
    }, [isChecking, onResolved, onStillPending]);

    // Check on mount (once)
    useEffect(() => {
        if (!enabled || hasChecked.current) return;
        hasChecked.current = true;
        checkPending();
    }, [enabled, checkPending]);

    return {
        isChecking,
        resolvedCount,
        recoveredPoints,
        recheck: checkPending,
    };
}
