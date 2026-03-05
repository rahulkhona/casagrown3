/**
 * usePurchaseLimits — Fetches and validates point purchase limits
 *
 * Limits are stored in CENTS (dollar amounts) in the `point_purchase_limits` table:
 *   - max_outstanding_cents: $2,000 default (200,000 cents)
 *   - daily_limit_cents: $500 default (50,000 cents)
 *
 * The hook validates by converting point amounts to dollar amounts
 * (100 points = $1.00) and comparing against the dollar-based limits.
 *
 * Error messages display dollar amounts for compliance purposes.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../features/auth/auth-hook";

const POINTS_PER_DOLLAR = 100;

export interface PurchaseLimits {
    /** Maximum total outstanding purchases in cents */
    maxOutstandingCents: number;
    /** Maximum daily purchases in cents */
    dailyLimitCents: number;
}

export interface PurchaseUsage {
    /** Total outstanding purchase amount in cents */
    outstandingCents: number;
    /** Today's purchase amount in cents */
    dailySpentCents: number;
}

interface UsePurchaseLimitsReturn {
    limits: PurchaseLimits;
    usage: PurchaseUsage;
    loading: boolean;
    error: string | null;
    /** Validates a point amount. Returns null if valid, or a dollar-based error message if limits exceeded */
    validate: (pointsAmount: number) => string | null;
    /** Max additional points the user can purchase right now */
    maxPurchasablePoints: number;
    refetch: () => Promise<void>;
}

const DEFAULT_LIMITS: PurchaseLimits = {
    maxOutstandingCents: 200_000, // $2,000
    dailyLimitCents: 50_000, // $500
};

const DEFAULT_USAGE: PurchaseUsage = {
    outstandingCents: 0,
    dailySpentCents: 0,
};

/** Convert points to cents (1 point = 1 cent) */
function pointsToCents(points: number): number {
    return points; // 100 points = $1.00 = 100 cents → 1:1
}

/** Format cents as dollar string (e.g. 50000 → "$500") */
function centsToDollars(cents: number): string {
    const dollars = cents / 100;
    return dollars % 1 === 0
        ? `$${dollars.toLocaleString()}`
        : `$${dollars.toFixed(2)}`;
}

export function usePurchaseLimits(userId?: string): UsePurchaseLimitsReturn {
    const [limits, setLimits] = useState<PurchaseLimits>(DEFAULT_LIMITS);
    const [usage, setUsage] = useState<PurchaseUsage>(DEFAULT_USAGE);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const mountedRef = useRef(true);

    const fetchLimitsAndUsage = useCallback(async () => {
        if (!userId) {
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            // Fetch dollar-based limits from config table
            const { data: limitsData } = await supabase
                .from("point_purchase_limits")
                .select("max_outstanding_cents, daily_limit_cents")
                .eq("country_iso_3", "USA")
                .single();

            if (!mountedRef.current) return;

            if (limitsData) {
                setLimits({
                    maxOutstandingCents: limitsData.max_outstanding_cents ??
                        DEFAULT_LIMITS.maxOutstandingCents,
                    dailyLimitCents: limitsData.daily_limit_cents ??
                        DEFAULT_LIMITS.dailyLimitCents,
                });
            }

            // Fetch outstanding total in cents (completed purchases)
            const { data: outstandingData } = await supabase
                .from("payment_transactions")
                .select("amount_cents")
                .eq("user_id", userId)
                .eq("status", "completed");

            if (!mountedRef.current) return;

            const outstandingCents = (outstandingData || []).reduce(
                (sum: number, t: { amount_cents: number }) =>
                    sum + t.amount_cents,
                0,
            );

            // Fetch daily spend in cents (today's completed + pending)
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);

            const { data: dailyData } = await supabase
                .from("payment_transactions")
                .select("amount_cents")
                .eq("user_id", userId)
                .in("status", ["completed", "pending"])
                .gte("created_at", todayStart.toISOString());

            if (!mountedRef.current) return;

            const dailySpentCents = (dailyData || []).reduce(
                (sum: number, t: { amount_cents: number }) =>
                    sum + t.amount_cents,
                0,
            );

            setUsage({ outstandingCents, dailySpentCents });
        } catch (err) {
            if (!mountedRef.current) return;
            console.warn("[usePurchaseLimits] Error:", err);
            setError(
                err instanceof Error
                    ? err.message
                    : "Failed to fetch purchase limits",
            );
        } finally {
            if (mountedRef.current) {
                setLoading(false);
            }
        }
    }, [userId]);

    useEffect(() => {
        mountedRef.current = true;
        fetchLimitsAndUsage();
        return () => {
            mountedRef.current = false;
        };
    }, [fetchLimitsAndUsage]);

    const remainingOutstandingCents = Math.max(
        0,
        limits.maxOutstandingCents - usage.outstandingCents,
    );
    const remainingDailyCents = Math.max(
        0,
        limits.dailyLimitCents - usage.dailySpentCents,
    );
    const maxPurchasableCents = Math.min(
        remainingOutstandingCents,
        remainingDailyCents,
    );
    const maxPurchasablePoints = maxPurchasableCents; // 1 cent = 1 point

    const validate = useCallback((pointsAmount: number): string | null => {
        if (pointsAmount <= 0) return null;

        const purchaseCents = pointsToCents(pointsAmount);

        if (
            usage.outstandingCents + purchaseCents > limits.maxOutstandingCents
        ) {
            return `Exceeds maximum purchase limit of ${
                centsToDollars(limits.maxOutstandingCents)
            }. ` +
                `You've purchased ${
                    centsToDollars(usage.outstandingCents)
                } so far. ` +
                `You can buy up to ${
                    centsToDollars(remainingOutstandingCents)
                } more.`;
        }

        if (usage.dailySpentCents + purchaseCents > limits.dailyLimitCents) {
            return `Exceeds daily purchase limit of ${
                centsToDollars(limits.dailyLimitCents)
            }. ` +
                `You've spent ${
                    centsToDollars(usage.dailySpentCents)
                } today. ` +
                `You can buy up to ${
                    centsToDollars(remainingDailyCents)
                } more today.`;
        }

        return null;
    }, [limits, usage, remainingOutstandingCents, remainingDailyCents]);

    return {
        limits,
        usage,
        loading,
        error,
        validate,
        maxPurchasablePoints,
        refetch: fetchLimitsAndUsage,
    };
}
