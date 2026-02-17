/**
 * usePointsBalance Tests
 *
 * Tests the hook that fetches and streams the user's points balance.
 */

// ---------------------------------------------------------------------------
// Supabase mock
// ---------------------------------------------------------------------------

let mockQueryResult = { data: null, error: null };
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

const mockFrom = jest.fn(() => createChain(mockQueryResult));

jest.mock("../features/auth/auth-hook", () => ({
    supabase: {
        from: (...args: any[]) => mockFrom(...args),
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
        mockQueryResult = { data: { balance_after: 500 }, error: null };
        mockFrom.mockImplementation(() => createChain(mockQueryResult));

        const { result } = renderHook(() => usePointsBalance("user-1"));

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.balance).toBe(500);
        expect(result.current.error).toBeNull();
        expect(mockFrom).toHaveBeenCalledWith("point_ledger");
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
        mockQueryResult = { data: { balance_after: 100 }, error: null };
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
        mockQueryResult = { data: { balance_after: 100 }, error: null };
        mockFrom.mockImplementation(() => createChain(mockQueryResult));

        const { result } = renderHook(() => usePointsBalance("user-1"));

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.balance).toBe(100);

        // Simulate realtime INSERT
        const insertListener = mockChannelOnListeners.find(
            (l) =>
                l.filter.event === "INSERT" &&
                l.filter.table === "point_ledger",
        );
        if (insertListener) {
            act(() => {
                insertListener.callback({
                    new: { balance_after: 250 },
                });
            });
        }

        expect(result.current.balance).toBe(250);
    });

    it("cleans up channel on unmount", async () => {
        mockQueryResult = { data: { balance_after: 100 }, error: null };
        mockFrom.mockImplementation(() => createChain(mockQueryResult));

        const { unmount } = renderHook(() => usePointsBalance("user-1"));

        await waitFor(() => expect(mockSubscribe).toHaveBeenCalled());
        unmount();
        expect(mockRemoveChannel).toHaveBeenCalledWith(mockChannel);
    });

    it("refetch updates balance", async () => {
        mockQueryResult = { data: { balance_after: 100 }, error: null };
        mockFrom.mockImplementation(() => createChain(mockQueryResult));

        const { result } = renderHook(() => usePointsBalance("user-1"));

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.balance).toBe(100);

        // Update mock for refetch
        mockQueryResult = { data: { balance_after: 200 }, error: null };
        mockFrom.mockImplementation(() => createChain(mockQueryResult));

        await act(async () => {
            await result.current.refetch();
        });

        expect(result.current.balance).toBe(200);
    });
});
