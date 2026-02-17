/**
 * useOrders / useConversationOrder Tests
 *
 * Tests the hooks wrapping order-service with loading/error/refresh state
 * and realtime Supabase subscriptions.
 */

// ---------------------------------------------------------------------------
// Mock order-service
// ---------------------------------------------------------------------------

const mockGetOrders = jest.fn();
const mockGetOrderByConversation = jest.fn();
const mockGetEscalation = jest.fn();
const mockGetRefundOffers = jest.fn();

jest.mock("./order-service", () => ({
    getOrders: (...args: any[]) => mockGetOrders(...args),
    getOrderByConversation: (...args: any[]) =>
        mockGetOrderByConversation(...args),
    getEscalation: (...args: any[]) => mockGetEscalation(...args),
    getRefundOffers: (...args: any[]) => mockGetRefundOffers(...args),
}));

// ---------------------------------------------------------------------------
// Mock Supabase (for realtime channels)
// ---------------------------------------------------------------------------

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

jest.mock("../auth/auth-hook", () => ({
    supabase: {
        channel: () => mockChannel,
        removeChannel: (...args: any[]) => mockRemoveChannel(...args),
    },
}));

import { act, renderHook, waitFor } from "@testing-library/react-native";
import { useConversationOrder, useOrders } from "./useOrders";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_ORDER = {
    id: "order-1",
    offer_id: "offer-1",
    buyer_id: "buyer-1",
    seller_id: "seller-1",
    conversation_id: "conv-1",
    category: "vegetables",
    product: "Tomatoes",
    quantity: 5,
    points_per_unit: 10,
    total_price: 50,
    delivery_date: "2026-03-01",
    delivery_instructions: "Leave at door",
    delivery_address: "123 Main St",
    delivery_proof_media_id: null,
    delivery_proof_url: null,
    delivery_proof_location: null,
    delivery_proof_timestamp: null,
    dispute_proof_media_id: null,
    dispute_proof_url: null,
    status: "pending",
    buyer_rating: null,
    buyer_feedback: null,
    seller_rating: null,
    seller_feedback: null,
    created_at: "2026-02-16T00:00:00Z",
    updated_at: "2026-02-16T00:00:00Z",
    version: 1,
    buyer_name: null,
    buyer_avatar_url: null,
    seller_name: null,
    seller_avatar_url: null,
    post_id: null,
    unit: null,
};

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

beforeEach(() => {
    jest.clearAllMocks();
    mockChannelOnListeners = [];
    mockGetOrders.mockResolvedValue([]);
    mockGetOrderByConversation.mockResolvedValue(null);
    mockGetEscalation.mockResolvedValue(null);
    mockGetRefundOffers.mockResolvedValue([]);
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
// useOrders
// =============================================================================

describe("useOrders", () => {
    it("fetches orders on mount", async () => {
        mockGetOrders.mockResolvedValue([MOCK_ORDER]);

        const { result } = renderHook(() =>
            useOrders("buyer-1", { tab: "open", role: "all" })
        );

        expect(result.current.loading).toBe(true);
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.orders).toHaveLength(1);
        expect(result.current.orders[0].id).toBe("order-1");
        expect(result.current.error).toBeNull();
    });

    it("returns empty orders when none found", async () => {
        mockGetOrders.mockResolvedValue([]);

        const { result } = renderHook(() =>
            useOrders("buyer-1", { tab: "open", role: "all" })
        );

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.orders).toHaveLength(0);
    });

    it("sets error on fetch failure", async () => {
        mockGetOrders.mockRejectedValue(new Error("Query failed"));

        const { result } = renderHook(() =>
            useOrders("buyer-1", { tab: "open", role: "all" })
        );

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.error).toBe("Query failed");
        expect(result.current.orders).toHaveLength(0);
    });

    it("refresh refetches orders", async () => {
        mockGetOrders.mockResolvedValue([MOCK_ORDER]);

        const { result } = renderHook(() =>
            useOrders("buyer-1", { tab: "open", role: "all" })
        );

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(mockGetOrders).toHaveBeenCalledTimes(1);

        // Change mock for refresh
        const updatedOrder = { ...MOCK_ORDER, status: "accepted" };
        mockGetOrders.mockResolvedValue([updatedOrder]);

        act(() => {
            result.current.refresh();
        });

        await waitFor(() =>
            expect(result.current.orders[0].status).toBe("accepted")
        );
        expect(mockGetOrders).toHaveBeenCalledTimes(2);
    });
});

// =============================================================================
// useConversationOrder
// =============================================================================

describe("useConversationOrder", () => {
    it("returns null order when no conversation", async () => {
        const { result } = renderHook(() => useConversationOrder(null));

        // Should not start loading when conversationId is null
        expect(result.current.loading).toBe(false);
        expect(result.current.order).toBeNull();
    });

    it("fetches order for conversation", async () => {
        mockGetOrderByConversation.mockResolvedValue(MOCK_ORDER);

        const { result } = renderHook(() => useConversationOrder("conv-1"));

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.order).not.toBeNull();
        expect(result.current.order!.id).toBe("order-1");
        expect(result.current.escalation).toBeNull();
        expect(result.current.refundOffers).toHaveLength(0);
    });

    it("returns null when no order for conversation", async () => {
        mockGetOrderByConversation.mockResolvedValue(null);

        const { result } = renderHook(() => useConversationOrder("conv-1"));

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.order).toBeNull();
    });

    it("fetches escalation and refund offers for disputed orders", async () => {
        const disputedOrder = { ...MOCK_ORDER, status: "disputed" };
        const mockEscalation = {
            id: "esc-1",
            order_id: "order-1",
            initiator_id: "buyer-1",
            reason: "Wrong item",
            dispute_proof_media_id: null,
            dispute_proof_url: null,
            status: "open",
            resolution_type: null,
            accepted_refund_offer_id: null,
            resolved_at: null,
            created_at: "2026-02-16T00:00:00Z",
        };
        const mockOffers = [
            {
                id: "ro-1",
                escalation_id: "esc-1",
                offered_by: "seller-1",
                amount: 25,
                message: null,
                status: "pending",
                created_at: "2026-02-16",
            },
        ];

        mockGetOrderByConversation.mockResolvedValue(disputedOrder);
        mockGetEscalation.mockResolvedValue(mockEscalation);
        mockGetRefundOffers.mockResolvedValue(mockOffers);

        const { result } = renderHook(() => useConversationOrder("conv-1"));

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.order!.status).toBe("disputed");
        expect(result.current.escalation).not.toBeNull();
        expect(result.current.escalation!.id).toBe("esc-1");
        expect(result.current.refundOffers).toHaveLength(1);
        expect(result.current.refundOffers[0].amount).toBe(25);
    });

    it("sets error on fetch failure", async () => {
        mockGetOrderByConversation.mockRejectedValue(new Error("Load failed"));

        const { result } = renderHook(() => useConversationOrder("conv-1"));

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.error).toBe("Load failed");
    });

    it("subscribes to realtime order updates", async () => {
        mockGetOrderByConversation.mockResolvedValue(MOCK_ORDER);

        renderHook(() => useConversationOrder("conv-1"));

        await waitFor(() => expect(mockSubscribe).toHaveBeenCalled());

        // Should have 2 listeners: UPDATE and INSERT on orders table
        const orderListeners = mockChannelOnListeners.filter(
            (l) => l.filter.table === "orders",
        );
        expect(orderListeners.length).toBe(2);
        expect(orderListeners.some((l) => l.filter.event === "UPDATE")).toBe(
            true,
        );
        expect(orderListeners.some((l) => l.filter.event === "INSERT")).toBe(
            true,
        );
    });

    it("cleans up channel on unmount", async () => {
        mockGetOrderByConversation.mockResolvedValue(MOCK_ORDER);

        const { unmount } = renderHook(() => useConversationOrder("conv-1"));

        await waitFor(() => expect(mockSubscribe).toHaveBeenCalled());
        unmount();
        expect(mockRemoveChannel).toHaveBeenCalledWith(mockChannel);
    });

    it("refresh refetches order data", async () => {
        mockGetOrderByConversation.mockResolvedValue(MOCK_ORDER);

        const { result } = renderHook(() => useConversationOrder("conv-1"));

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(mockGetOrderByConversation).toHaveBeenCalledTimes(1);

        // Change mock for refresh
        const updatedOrder = { ...MOCK_ORDER, status: "accepted" };
        mockGetOrderByConversation.mockResolvedValue(updatedOrder);

        act(() => {
            result.current.refresh();
        });

        await waitFor(() =>
            expect(result.current.order!.status).toBe("accepted")
        );
        expect(mockGetOrderByConversation).toHaveBeenCalledTimes(2);
    });
});
