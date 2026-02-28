/**
 * usePointsBalance Tests
 *
 * Tests the hook that fetches and streams the user's points balance.
 */

// ---------------------------------------------------------------------------
// Supabase mock
// ---------------------------------------------------------------------------

let mockQueryResult: { data: any | null; error: any | null } = {
    data: null,
    error: null,
};
const mockRemoveChannel = jest.fn();
const mockSubscribe = jest.fn().mockReturnThis();
let mockChannelOnListeners: Array<{ filter: any; callback: Function }> = [];

const mockChannelOn = jest.fn().mockImplementation(function (
    _type: string,
    filter: any,
    callback: Function,
) {
    mockChannelOnListeners.push({ filter, callback });
    return mockChannel;
});

const mockChannel = {
    on: mockChannelOn,
    subscribe: mockSubscribe,
};

function createChain(terminal?: any) {
    const result = terminal || mockQueryResult;
    const handler = {
        get(_target: any, prop: string) {
            if (prop === "then") return (resolve: any) => resolve(result);
            if (prop === "single" || prop === "maybeSingle") {
                return jest.fn().mockResolvedValue(result);
            }
            return jest.fn(function () {
                return new Proxy({}, handler);
            });
        },
    };
    return new Proxy({}, handler);
}

const mockFrom = jest.fn((_table?: string) => createChain(mockQueryResult));

jest.mock("../features/auth/auth-hook", () => ({
    supabase: {
        from: (table: string) => mockFrom(table),
        rpc: (fn: string) => mockFrom(fn),
        channel: (...args: any[]) => mockChannel,
        removeChannel: (...args: any[]) => mockRemoveChannel(...args),
    },
}));

import { act, renderHook, waitFor } from "@testing-library/react-native";
import { usePointsBalance } from "./usePointsBalance";

beforeEach(() => {
    jest.clearAllMocks();
    mockQueryResult = { data: null, error: null };
    mockChannelOnListeners = [];
    mockFrom.mockImplementation(() => createChain(mockQueryResult));
    mockChannelOn.mockImplementation(function (
        _type: string,
        filter: any,
        callback: Function,
    ) {
        mockChannelOnListeners.push({ filter, callback });
        return mockChannel;
    });
    mockSubscribe.mockReturnValue(mockChannel);
});

// =============================================================================
// Tests
// =============================================================================

describe("usePointsBalance", () => {
    it("fetches balance on mount", async () => {
        mockQueryResult = {
            data: {
                total_balance: 500,
                earned_balance: 500,
                purchased_balance: 0,
            },
            error: null,
        };
        mockFrom.mockImplementation(() => createChain(mockQueryResult));

        const { result } = renderHook(() => usePointsBalance("user-1"));

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.balance).toBe(500);
        expect(result.current.error).toBeNull();
        expect(mockFrom).toHaveBeenCalledWith("get_user_balances");
    });

    it("returns 0 when no entries exist", async () => {
        mockQueryResult = { data: null, error: null };
        mockFrom.mockImplementation(() => createChain(mockQueryResult));

        const { result } = renderHook(() => usePointsBalance("user-1"));

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.balance).toBe(0);
        expect(result.current.error).toBeNull();
    });

    it("returns 0 when userId is undefined", async () => {
        const { result } = renderHook(() => usePointsBalance(undefined));

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.balance).toBe(0);
    });

    it("sets error on query failure", async () => {
        mockQueryResult = { data: null, error: { message: "DB error" } };
        mockFrom.mockImplementation(() => createChain(mockQueryResult));

        const { result } = renderHook(() => usePointsBalance("user-1"));

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.error).toBe("DB error");
        expect(result.current.balance).toBe(0);
    });

    it("subscribes to realtime updates", async () => {
        mockQueryResult = {
            data: {
                total_balance: 100,
                earned_balance: 100,
                purchased_balance: 0,
            },
            error: null,
        };
        mockFrom.mockImplementation(() => createChain(mockQueryResult));

        renderHook(() => usePointsBalance("user-1"));

        await waitFor(() => expect(mockSubscribe).toHaveBeenCalled());
        expect(mockChannelOnListeners.length).toBeGreaterThan(0);
        const insertListener = mockChannelOnListeners.find(
            (l) =>
                l.filter.event === "INSERT" &&
                l.filter.table === "point_ledger",
        );
        expect(insertListener).toBeTruthy();
    });

    it("updates balance via realtime INSERT event", async () => {
        jest.useFakeTimers();
        mockQueryResult = {
            data: {
                total_balance: 100,
                earned_balance: 100,
                purchased_balance: 0,
            },
            error: null,
        };
        mockFrom.mockImplementation(() => createChain(mockQueryResult));

        const { result } = renderHook(() => usePointsBalance("user-1"));

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.balance).toBe(100);

        // Simulate realtime INSERT — the hook now polls via setTimeout
        const insertListener = mockChannelOnListeners.find(
            (l) =>
                l.filter.event === "INSERT" &&
                l.filter.table === "point_ledger",
        );

        // Update mock to return new balance for the poll refetch
        mockQueryResult = {
            data: {
                total_balance: 250,
                earned_balance: 250,
                purchased_balance: 0,
            },
            error: null,
        };
        mockFrom.mockImplementation(() => createChain(mockQueryResult));

        if (insertListener) {
            act(() => {
                insertListener.callback({
                    new: { balance_after: 250 },
                });
            });
        }

        // Advance timers to trigger the first poll (100ms delay)
        await act(async () => {
            jest.advanceTimersByTime(150);
        });

        expect(result.current.balance).toBe(250);
        jest.useRealTimers();
    });

    it("cleans up channel on unmount", async () => {
        mockQueryResult = {
            data: {
                total_balance: 100,
                earned_balance: 100,
                purchased_balance: 0,
            },
            error: null,
        };
        mockFrom.mockImplementation(() => createChain(mockQueryResult));

        const { unmount } = renderHook(() => usePointsBalance("user-1"));

        await waitFor(() => expect(mockSubscribe).toHaveBeenCalled());
        unmount();
        expect(mockRemoveChannel).toHaveBeenCalledWith(mockChannel);
    });

    it("refetch updates balance", async () => {
        mockQueryResult = {
            data: {
                total_balance: 100,
                earned_balance: 100,
                purchased_balance: 0,
            },
            error: null,
        };
        mockFrom.mockImplementation(() => createChain(mockQueryResult));

        const { result } = renderHook(() => usePointsBalance("user-1"));

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.balance).toBe(100);

        // Update mock for refetch
        mockQueryResult = {
            data: {
                total_balance: 200,
                earned_balance: 200,
                purchased_balance: 0,
            },
            error: null,
        };
        mockFrom.mockImplementation(() => createChain(mockQueryResult));

        await act(async () => {
            await result.current.refetch();
        });

        expect(result.current.balance).toBe(200);
    });

    it("adjustBalance optimistically updates and clamps to 0", async () => {
        mockQueryResult = {
            data: {
                total_balance: 100,
                earned_balance: 100,
                purchased_balance: 0,
            },
            error: null,
        };
        mockFrom.mockImplementation(() => createChain(mockQueryResult));

        const { result } = renderHook(() => usePointsBalance("user-1"));

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.balance).toBe(100);

        // Positive adjustment
        act(() => {
            result.current.adjustBalance(50);
        });
        expect(result.current.balance).toBe(150);

        // Negative adjustment that would go below zero
        act(() => {
            result.current.adjustBalance(-200);
        });
        expect(result.current.balance).toBe(0);
    });

    it("adjustBalance does not go below zero", async () => {
        mockQueryResult = {
            data: {
                total_balance: 30,
                earned_balance: 30,
                purchased_balance: 0,
            },
            error: null,
        };
        mockFrom.mockImplementation(() => createChain(mockQueryResult));

        const { result } = renderHook(() => usePointsBalance("user-1"));

        await waitFor(() => expect(result.current.loading).toBe(false));

        act(() => {
            result.current.adjustBalance(-100);
        });
        expect(result.current.balance).toBe(0);
    });

    // ── Visibility-awareness regression tests ──

    it("starts periodic poll (cross-platform, not web-only)", async () => {
        jest.useFakeTimers();
        mockQueryResult = {
            data: {
                total_balance: 100,
                earned_balance: 100,
                purchased_balance: 0,
            },
            error: null,
        };
        mockFrom.mockImplementation(() => createChain(mockQueryResult));

        renderHook(() => usePointsBalance("user-1"));

        await waitFor(() => expect(mockFrom).toHaveBeenCalled());

        // Clear calls from initial fetch
        mockFrom.mockClear();

        // Advance by 5s (the poll interval) — should trigger another fetch
        await act(async () => {
            jest.advanceTimersByTime(5100);
        });

        // The poll should fire regardless of platform (was web-only before fix)
        expect(mockFrom).toHaveBeenCalled();
        jest.useRealTimers();
    });

    it("subscribes to realtime channel with visibility-aware lifecycle", async () => {
        mockQueryResult = {
            data: {
                total_balance: 100,
                earned_balance: 100,
                purchased_balance: 0,
            },
            error: null,
        };
        mockFrom.mockImplementation(() => createChain(mockQueryResult));

        renderHook(() => usePointsBalance("user-1"));

        await waitFor(() => expect(mockSubscribe).toHaveBeenCalled());

        // Channel should be created and subscribed
        expect(mockSubscribe).toHaveBeenCalledTimes(1);
    });

    it("removes channel on unmount (visibility cleanup)", async () => {
        mockQueryResult = {
            data: {
                total_balance: 100,
                earned_balance: 100,
                purchased_balance: 0,
            },
            error: null,
        };
        mockFrom.mockImplementation(() => createChain(mockQueryResult));

        const { unmount } = renderHook(() => usePointsBalance("user-1"));

        await waitFor(() => expect(mockSubscribe).toHaveBeenCalled());
        unmount();

        // Channel should be removed on cleanup
        expect(mockRemoveChannel).toHaveBeenCalled();
    });
});
