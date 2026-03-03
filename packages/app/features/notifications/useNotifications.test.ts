/**
 * Tests for useNotifications hook
 */

// Mock supabase
jest.mock("../auth/auth-hook", () => {
    // Build a flexible mock where each method returns itself for chaining
    const createChain = () => {
        const chain: any = {};
        const fns = [
            "select",
            "eq",
            "is",
            "order",
            "limit",
            "update",
            "delete",
        ];
        fns.forEach((name) => {
            chain[name] = jest.fn().mockReturnValue(chain);
        });
        return chain;
    };

    const mockChain = createChain();
    // Default: limit resolves with empty data
    mockChain.limit.mockResolvedValue({ data: [], error: null });

    const mockChannelObj = {
        on: jest.fn().mockReturnThis(),
        subscribe: jest.fn().mockReturnThis(),
    };

    return {
        supabase: {
            from: jest.fn(() => mockChain),
            channel: jest.fn(() => mockChannelObj),
            removeChannel: jest.fn(),
            __mockChain: mockChain,
            __mockChannelObj: mockChannelObj,
        },
    };
});

import { act, renderHook, waitFor } from "@testing-library/react-native";
import { useNotifications } from "./useNotifications";
import { supabase } from "../auth/auth-hook";

const mockChain = (supabase as any).__mockChain;
const mockChannelObj = (supabase as any).__mockChannelObj;

function resetChain() {
    const fns = ["select", "eq", "is", "order", "limit", "update", "delete"];
    fns.forEach((name) => {
        mockChain[name].mockReturnValue(mockChain);
    });
    mockChain.limit.mockResolvedValue({ data: [], error: null });
}

beforeEach(() => {
    jest.clearAllMocks();
    resetChain();
    mockChannelObj.on.mockReturnThis();
    mockChannelObj.subscribe.mockReturnThis();
    (supabase.from as jest.Mock).mockReturnValue(mockChain);
    (supabase.channel as jest.Mock).mockReturnValue(mockChannelObj);
});

const MOCK_NOTIFS = [
    {
        id: "n1",
        user_id: "user-123",
        content: "Your gift card has been delivered!",
        link_url: "/transaction-history",
        read_at: null,
        created_at: "2026-03-03T01:00:00Z",
    },
    {
        id: "n2",
        user_id: "user-123",
        content: "Cashout of $20 completed.",
        link_url: "/transaction-history",
        read_at: "2026-03-03T00:30:00Z",
        created_at: "2026-03-02T23:00:00Z",
    },
    {
        id: "n3",
        user_id: "user-123",
        content: "Your post was flagged by community members.",
        link_url: "/my-posts",
        read_at: null,
        created_at: "2026-03-02T22:00:00Z",
    },
];

describe("useNotifications", () => {
    it("returns empty state when userId is undefined", () => {
        const { result } = renderHook(() => useNotifications(undefined));
        expect(result.current.notifications).toEqual([]);
        expect(result.current.unreadCount).toBe(0);
        expect(result.current.loading).toBe(false);
    });

    it("fetches notifications on mount", async () => {
        mockChain.limit.mockResolvedValue({ data: MOCK_NOTIFS, error: null });

        const { result } = renderHook(() => useNotifications("user-123"));

        await waitFor(() => {
            expect(result.current.notifications).toHaveLength(3);
        });

        expect(result.current.unreadCount).toBe(2); // n1 and n3 are unread
        expect(result.current.loading).toBe(false);
    });

    it("sets up realtime subscription for the user", () => {
        renderHook(() => useNotifications("user-123"));

        expect(supabase.channel).toHaveBeenCalledWith("notifications:user-123");
        expect(mockChannelObj.on).toHaveBeenCalledWith(
            "postgres_changes",
            expect.objectContaining({
                event: "INSERT",
                schema: "public",
                table: "notifications",
                filter: "user_id=eq.user-123",
            }),
            expect.any(Function),
        );
        expect(mockChannelObj.subscribe).toHaveBeenCalled();
    });

    it("cleans up realtime subscription on unmount", () => {
        const { unmount } = renderHook(() => useNotifications("user-123"));
        unmount();
        expect(supabase.removeChannel).toHaveBeenCalled();
    });

    it("markAsRead optimistically updates notification state", async () => {
        mockChain.limit.mockResolvedValue({
            data: [...MOCK_NOTIFS],
            error: null,
        });

        const { result } = renderHook(() => useNotifications("user-123"));

        await waitFor(() => {
            expect(result.current.notifications).toHaveLength(3);
        });

        // For the update call, supabase.from() returns a fresh chain
        const updateChain: any = {};
        ["update", "eq"].forEach((name) => {
            updateChain[name] = jest.fn().mockReturnValue(updateChain);
        });
        updateChain.eq.mockResolvedValue({ error: null });
        (supabase.from as jest.Mock).mockReturnValue(updateChain);

        await act(async () => {
            await result.current.markAsRead("n1");
        });

        const n1 = result.current.notifications.find((n) => n.id === "n1");
        expect(n1?.read_at).toBeTruthy();
        expect(result.current.unreadCount).toBe(1); // only n3 unread
    });

    it("markAllAsRead optimistically marks all as read", async () => {
        mockChain.limit.mockResolvedValue({
            data: [...MOCK_NOTIFS],
            error: null,
        });

        const { result } = renderHook(() => useNotifications("user-123"));

        await waitFor(() => {
            expect(result.current.notifications).toHaveLength(3);
        });

        const updateChain: any = {};
        ["update", "eq", "is"].forEach((name) => {
            updateChain[name] = jest.fn().mockReturnValue(updateChain);
        });
        updateChain.is.mockResolvedValue({ error: null });
        (supabase.from as jest.Mock).mockReturnValue(updateChain);

        await act(async () => {
            await result.current.markAllAsRead();
        });

        expect(result.current.unreadCount).toBe(0);
        result.current.notifications.forEach((n) => {
            expect(n.read_at).toBeTruthy();
        });
    });

    it("clearAll optimistically empties the list", async () => {
        mockChain.limit.mockResolvedValue({
            data: [...MOCK_NOTIFS],
            error: null,
        });

        const { result } = renderHook(() => useNotifications("user-123"));

        await waitFor(() => {
            expect(result.current.notifications).toHaveLength(3);
        });

        const deleteChain: any = {};
        ["delete", "eq"].forEach((name) => {
            deleteChain[name] = jest.fn().mockReturnValue(deleteChain);
        });
        deleteChain.eq.mockResolvedValue({ error: null });
        (supabase.from as jest.Mock).mockReturnValue(deleteChain);

        await act(async () => {
            await result.current.clearAll();
        });

        expect(result.current.notifications).toHaveLength(0);
        expect(result.current.unreadCount).toBe(0);
    });

    it("derives unreadCount from notifications with null read_at", async () => {
        const mixedNotifs = [
            { ...MOCK_NOTIFS[0], read_at: null },
            { ...MOCK_NOTIFS[1], read_at: "2026-03-01T00:00:00Z" },
            { ...MOCK_NOTIFS[2], read_at: null },
        ];
        mockChain.limit.mockResolvedValue({ data: mixedNotifs, error: null });

        const { result } = renderHook(() => useNotifications("user-123"));

        await waitFor(() => {
            expect(result.current.unreadCount).toBe(2);
        });
    });
});
