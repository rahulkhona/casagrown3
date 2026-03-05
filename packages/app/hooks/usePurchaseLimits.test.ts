/**
 * usePurchaseLimits Compliance Tests
 *
 * Tests the purchase limit enforcement logic:
 * - Per-transaction limit validation
 * - Daily limit validation
 * - Outstanding limit validation
 * - Default limit values
 * - Max purchasable points calculation
 *
 * These tests catch regressions where purchase limits are accidentally
 * bypassed, preventing unlimited point purchases.
 */

import { act, renderHook, waitFor } from "@testing-library/react-native";

// Mock supabase before importing the hook
const mockFrom = jest.fn();
const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockIn = jest.fn();
const mockGte = jest.fn();
const mockSingle = jest.fn();

jest.mock("../features/auth/auth-hook", () => ({
    supabase: {
        from: (...args: any[]) => {
            mockFrom(...args);
            return {
                select: (...sArgs: any[]) => {
                    mockSelect(...sArgs);
                    return {
                        eq: (...eArgs: any[]) => {
                            mockEq(...eArgs);
                            return {
                                single: () => mockSingle(),
                                in: (...iArgs: any[]) => {
                                    mockIn(...iArgs);
                                    return {
                                        gte: (...gArgs: any[]) => {
                                            mockGte(...gArgs);
                                            return Promise.resolve({
                                                data: [],
                                                error: null,
                                            });
                                        },
                                    };
                                },
                            };
                        },
                    };
                },
            };
        },
    },
}));

import { usePurchaseLimits } from "./usePurchaseLimits";

// =============================================================================
// Tests
// =============================================================================

describe("usePurchaseLimits", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Default: no limits row → use defaults
        mockSingle.mockResolvedValue({ data: null, error: null });
    });

    describe("default limits", () => {
        it("uses default maxOutstanding of $2,000 (200,000 cents)", async () => {
            const { result } = renderHook(() => usePurchaseLimits("user-1"));

            await waitFor(() => expect(result.current.loading).toBe(false));

            expect(result.current.limits.maxOutstandingCents).toBe(200_000);
        });

        it("uses default daily limit of $500 (50,000 cents)", async () => {
            const { result } = renderHook(() => usePurchaseLimits("user-1"));

            await waitFor(() => expect(result.current.loading).toBe(false));

            expect(result.current.limits.dailyLimitCents).toBe(50_000);
        });
    });

    describe("custom limits from DB", () => {
        it("uses limits from point_purchase_limits table", async () => {
            mockSingle.mockResolvedValue({
                data: {
                    max_outstanding_cents: 100_000,
                    daily_limit_cents: 30_000,
                },
                error: null,
            });

            const { result } = renderHook(() => usePurchaseLimits("user-1"));

            await waitFor(() => expect(result.current.loading).toBe(false));

            expect(result.current.limits.maxOutstandingCents).toBe(100_000);
            expect(result.current.limits.dailyLimitCents).toBe(30_000);
        });
    });

    describe("validate()", () => {
        it("returns null for valid purchase within limits", async () => {
            const { result } = renderHook(() => usePurchaseLimits("user-1"));

            await waitFor(() => expect(result.current.loading).toBe(false));

            // 100 points = $1.00, well within $2,000 outstanding and $500 daily
            expect(result.current.validate(100)).toBeNull();
        });

        it("returns null for zero amount", async () => {
            const { result } = renderHook(() => usePurchaseLimits("user-1"));

            await waitFor(() => expect(result.current.loading).toBe(false));

            expect(result.current.validate(0)).toBeNull();
        });

        it("returns error when exceeding outstanding limit", async () => {
            mockSingle.mockResolvedValue({
                data: {
                    max_outstanding_cents: 10_000,
                    daily_limit_cents: 50_000,
                },
                error: null,
            });

            const { result } = renderHook(() => usePurchaseLimits("user-1"));

            await waitFor(() => expect(result.current.loading).toBe(false));

            // Try to buy 20,000 points = $200 = 20,000 cents, limit is 10,000 cents
            const error = result.current.validate(20_000);
            expect(error).not.toBeNull();
            expect(error).toContain("maximum purchase limit");
            expect(error).toContain("$100"); // $100 = 10,000 cents
        });

        it("returns error when exceeding daily limit", async () => {
            mockSingle.mockResolvedValue({
                data: {
                    max_outstanding_cents: 200_000,
                    daily_limit_cents: 5_000,
                },
                error: null,
            });

            const { result } = renderHook(() => usePurchaseLimits("user-1"));

            await waitFor(() => expect(result.current.loading).toBe(false));

            // Try to buy 10,000 points = $100 = 10,000 cents, daily limit is 5,000 cents
            const error = result.current.validate(10_000);
            expect(error).not.toBeNull();
            expect(error).toContain("daily purchase limit");
            expect(error).toContain("$50"); // $50 = 5,000 cents
        });
    });

    describe("maxPurchasablePoints", () => {
        it("calculates correctly with no prior purchases", async () => {
            mockSingle.mockResolvedValue({
                data: {
                    max_outstanding_cents: 100_000,
                    daily_limit_cents: 50_000,
                },
                error: null,
            });

            const { result } = renderHook(() => usePurchaseLimits("user-1"));

            await waitFor(() => expect(result.current.loading).toBe(false));

            // min(100,000 outstanding remaining, 50,000 daily remaining) = 50,000
            expect(result.current.maxPurchasablePoints).toBe(50_000);
        });
    });

    describe("no userId", () => {
        it("returns immediately when no userId provided", async () => {
            const { result } = renderHook(() => usePurchaseLimits(undefined));

            await waitFor(() => expect(result.current.loading).toBe(false));

            expect(result.current.limits.maxOutstandingCents).toBe(200_000);
            expect(result.current.limits.dailyLimitCents).toBe(50_000);
        });
    });
});
