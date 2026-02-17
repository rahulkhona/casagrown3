/**
 * Order Service Tests
 *
 * Tests all query and mutation functions in order-service.ts.
 * Uses a chainable Supabase mock to verify correct RPC calls and queries.
 */

// ---------------------------------------------------------------------------
// Mock Supabase — chainable builder
// ---------------------------------------------------------------------------

// Holds the last resolved value for select/update chains
let mockQueryResult = { data: null, error: null };
let mockRpcResult = { data: null, error: null };

/** Creates a chainable object that returns itself for any method except terminal ones. */
function createChain(terminal) {
    const result = terminal || mockQueryResult;
    const handler = {
        get(_target, prop) {
            // Make the proxy thenable so `await chain` resolves to the result
            if (prop === "then") {
                return (resolve) => resolve(result);
            }
            // Terminal methods resolve the stored value
            if (prop === "single" || prop === "maybeSingle") {
                return jest.fn().mockResolvedValue(result);
            }
            // everything else returns a new proxy (chainable)
            return jest.fn(function () {
                return new Proxy({}, handler);
            });
        },
    };
    return new Proxy({}, handler);
}

const mockRpc = jest.fn();
const mockFrom = jest.fn();

jest.mock("../auth/auth-hook", () => ({
    supabase: {
        from: function () {
            return mockFrom.apply(this, arguments);
        },
        rpc: function () {
            return mockRpc.apply(this, arguments);
        },
    },
}));

import {
    acceptOrder,
    acceptRefundOffer,
    cancelOrder,
    confirmDelivery,
    disputeOrder,
    escalateDispute,
    getEscalation,
    getOrderByConversation,
    getOrderById,
    getOrders,
    getRefundOffers,
    makeRefundOffer,
    markDelivered,
    modifyOrder,
    rejectOrder,
    rejectRefundOffer,
    resolveDispute,
    submitRating,
    updateOrderStatus,
} from "./order-service";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SAMPLE_ORDER_ROW = {
    id: "order-1",
    offer_id: "offer-1",
    buyer_id: "buyer-1",
    seller_id: "seller-1",
    conversation_id: "conv-1",
    category: "vegetables",
    product: "Tomatoes",
    quantity: 5,
    points_per_unit: 10,
    delivery_date: "2026-03-01",
    delivery_instructions: "123 Main St\nLeave at door",
    delivery_proof_media_id: null,
    status: "pending",
    buyer_rating: null,
    buyer_feedback: null,
    seller_rating: null,
    seller_feedback: null,
    created_at: "2026-02-16T00:00:00Z",
    updated_at: "2026-02-16T00:00:00Z",
    version: 1,
    conversations: {
        posts: {
            id: "post-1",
            want_to_sell_details: [{ unit: "box" }],
        },
    },
};

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

beforeEach(() => {
    jest.clearAllMocks();
    mockQueryResult = { data: null, error: null };
    mockRpcResult = { data: null, error: null };
    mockFrom.mockImplementation(() => createChain(mockQueryResult));
    mockRpc.mockImplementation(() => Promise.resolve(mockRpcResult));
});

// =============================================================================
// Queries
// =============================================================================

describe("getOrders", () => {
    it("returns mapped orders from supabase", async () => {
        mockQueryResult = { data: [SAMPLE_ORDER_ROW], error: null };
        mockFrom.mockImplementation(() => createChain(mockQueryResult));

        const result = await getOrders("buyer-1", { tab: "open", role: "all" });
        expect(mockFrom).toHaveBeenCalledWith("orders");
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe("order-1");
        expect(result[0].total_price).toBe(50); // 5 × 10
        expect(result[0].delivery_address).toBe("123 Main St");
        expect(result[0].delivery_instructions).toBe("Leave at door");
        expect(result[0].unit).toBe("box");
        expect(result[0].post_id).toBe("post-1");
    });

    it("filters open orders on tab=open", async () => {
        const completedRow = {
            ...SAMPLE_ORDER_ROW,
            id: "order-2",
            status: "completed",
        };
        mockQueryResult = {
            data: [SAMPLE_ORDER_ROW, completedRow],
            error: null,
        };
        mockFrom.mockImplementation(() => createChain(mockQueryResult));

        const result = await getOrders("buyer-1", { tab: "open", role: "all" });
        // Only pending should remain (completed is not open)
        expect(result).toHaveLength(1);
        expect(result[0].status).toBe("pending");
    });

    it("filters closed orders on tab=closed", async () => {
        const completedRow = {
            ...SAMPLE_ORDER_ROW,
            id: "order-2",
            status: "completed",
        };
        mockQueryResult = {
            data: [SAMPLE_ORDER_ROW, completedRow],
            error: null,
        };
        mockFrom.mockImplementation(() => createChain(mockQueryResult));

        const result = await getOrders("buyer-1", {
            tab: "closed",
            role: "all",
        });
        expect(result).toHaveLength(1);
        expect(result[0].status).toBe("completed");
    });

    it("throws on supabase error", async () => {
        mockQueryResult = { data: null, error: { message: "DB error" } };
        mockFrom.mockImplementation(() => createChain(mockQueryResult));

        await expect(
            getOrders("user-1", { tab: "open", role: "all" }),
        ).rejects.toThrow("Failed to fetch orders");
    });
});

describe("getOrderById", () => {
    it("returns mapped order when found", async () => {
        mockQueryResult = { data: SAMPLE_ORDER_ROW, error: null };
        mockFrom.mockImplementation(() => createChain(mockQueryResult));

        const result = await getOrderById("order-1");
        expect(result).not.toBeNull();
        expect(result.id).toBe("order-1");
        expect(result.product).toBe("Tomatoes");
    });

    it("returns null when not found", async () => {
        mockQueryResult = { data: null, error: null };
        mockFrom.mockImplementation(() => createChain(mockQueryResult));

        const result = await getOrderById("missing");
        expect(result).toBeNull();
    });

    it("throws on error", async () => {
        mockQueryResult = { data: null, error: { message: "fail" } };
        mockFrom.mockImplementation(() => createChain(mockQueryResult));

        await expect(getOrderById("x")).rejects.toThrow(
            "Failed to fetch order",
        );
    });
});

describe("getOrderByConversation", () => {
    it("returns latest order for conversation", async () => {
        mockQueryResult = { data: SAMPLE_ORDER_ROW, error: null };
        mockFrom.mockImplementation(() => createChain(mockQueryResult));

        const result = await getOrderByConversation("conv-1");
        expect(result).not.toBeNull();
        expect(result.conversation_id).toBe("conv-1");
        expect(mockFrom).toHaveBeenCalledWith("orders");
    });

    it("returns null when no order exists", async () => {
        mockQueryResult = { data: null, error: null };
        mockFrom.mockImplementation(() => createChain(mockQueryResult));

        const result = await getOrderByConversation("conv-x");
        expect(result).toBeNull();
    });
});

describe("getEscalation", () => {
    it("returns escalation with mapped fields", async () => {
        mockQueryResult = {
            data: {
                id: "esc-1",
                order_id: "order-1",
                initiator_id: "buyer-1",
                reason: "Wrong item",
                dispute_proof_media_id: "media-1",
                status: "open",
                resolution_type: null,
                accepted_refund_offer_id: null,
                resolved_at: null,
                created_at: "2026-02-16T00:00:00Z",
            },
            error: null,
        };
        mockFrom.mockImplementation(() => createChain(mockQueryResult));

        const result = await getEscalation("order-1");
        expect(result).not.toBeNull();
        expect(result.id).toBe("esc-1");
        expect(result.reason).toBe("Wrong item");
        expect(result.dispute_proof_url).toBeNull();
        expect(mockFrom).toHaveBeenCalledWith("escalations");
    });

    it("returns null if none found", async () => {
        mockQueryResult = { data: null, error: null };
        mockFrom.mockImplementation(() => createChain(mockQueryResult));

        const result = await getEscalation("order-x");
        expect(result).toBeNull();
    });
});

describe("getRefundOffers", () => {
    it("returns mapped refund offers", async () => {
        mockQueryResult = {
            data: [
                {
                    id: "ro-1",
                    escalation_id: "esc-1",
                    amount: 25,
                    message: "Partial refund",
                    status: "pending",
                    created_at: "2026-02-16",
                },
            ],
            error: null,
        };
        mockFrom.mockImplementation(() => createChain(mockQueryResult));

        const result = await getRefundOffers("esc-1");
        expect(result).toHaveLength(1);
        expect(result[0].amount).toBe(25);
        expect(result[0].message).toBe("Partial refund");
        expect(mockFrom).toHaveBeenCalledWith("refund_offers");
    });
});

// =============================================================================
// Mutations — RPC-based
// =============================================================================

describe("cancelOrder", () => {
    it("calls cancel_order_with_message RPC", async () => {
        mockRpcResult = { data: { success: true }, error: null };
        mockRpc.mockResolvedValue(mockRpcResult);

        const result = await cancelOrder("order-1", "buyer-1");
        expect(mockRpc).toHaveBeenCalledWith("cancel_order_with_message", {
            p_order_id: "order-1",
            p_user_id: "buyer-1",
        });
        expect(result).toEqual({ success: true });
    });

    it("returns error from RPC result", async () => {
        mockRpcResult = { data: { error: "Cannot cancel" }, error: null };
        mockRpc.mockResolvedValue(mockRpcResult);

        const result = await cancelOrder("order-1", "buyer-1");
        expect(result).toEqual({ success: false, error: "Cannot cancel" });
    });

    it("throws on supabase error", async () => {
        mockRpc.mockResolvedValue({
            data: null,
            error: { message: "RPC fail" },
        });
        await expect(cancelOrder("order-1", "user-1")).rejects.toThrow(
            "Failed to cancel order",
        );
    });
});

describe("acceptOrder", () => {
    it("calls accept_order_versioned RPC with version", async () => {
        mockRpc.mockResolvedValue({ data: { success: true }, error: null });
        const result = await acceptOrder("order-1", 3);
        expect(mockRpc).toHaveBeenCalledWith("accept_order_versioned", {
            p_order_id: "order-1",
            p_expected_version: 3,
        });
        expect(result).toEqual({ success: true });
    });

    it("returns version conflict error", async () => {
        mockRpc.mockResolvedValue({
            data: { error: "Version mismatch", code: "VERSION_CONFLICT" },
            error: null,
        });
        const result = await acceptOrder("order-1", 1);
        expect(result).toEqual({
            success: false,
            error: "Version mismatch",
            code: "VERSION_CONFLICT",
        });
    });
});

describe("rejectOrder", () => {
    it("calls reject_order_versioned RPC", async () => {
        mockRpc.mockResolvedValue({ data: { success: true }, error: null });
        const result = await rejectOrder("order-1", 2);
        expect(mockRpc).toHaveBeenCalledWith("reject_order_versioned", {
            p_order_id: "order-1",
            p_expected_version: 2,
        });
        expect(result).toEqual({ success: true });
    });
});

describe("modifyOrder", () => {
    it("calls modify_order RPC with correct parameters", async () => {
        mockRpc.mockResolvedValue({
            data: { success: true, newVersion: 2, newTotal: 100 },
            error: null,
        });
        const result = await modifyOrder("order-1", "buyer-1", {
            quantity: 10,
            deliveryDate: "2026-04-01",
        });
        expect(mockRpc).toHaveBeenCalledWith("modify_order", {
            p_order_id: "order-1",
            p_buyer_id: "buyer-1",
            p_quantity: 10,
            p_delivery_date: "2026-04-01",
            p_points_per_unit: null,
            p_delivery_address: null,
            p_delivery_instructions: null,
        });
        expect(result).toEqual({ success: true, newVersion: 2, newTotal: 100 });
    });

    it("returns error on failure", async () => {
        mockRpc.mockResolvedValue({
            data: {
                error: "Insufficient points",
                code: "INSUFFICIENT_BALANCE",
            },
            error: null,
        });
        const result = await modifyOrder("order-1", "buyer-1", {
            quantity: 999,
        });
        expect(result.success).toBe(false);
        expect(result.error).toBe("Insufficient points");
        expect(result.code).toBe("INSUFFICIENT_BALANCE");
    });
});

describe("markDelivered", () => {
    it("calls mark_order_delivered RPC", async () => {
        mockRpc.mockResolvedValue({ data: { success: true }, error: null });
        const result = await markDelivered("order-1", "seller-1", "media-1");
        expect(mockRpc).toHaveBeenCalledWith("mark_order_delivered", {
            p_order_id: "order-1",
            p_seller_id: "seller-1",
            p_proof_media_id: "media-1",
        });
        expect(result).toEqual({ success: true });
    });
});

describe("confirmDelivery", () => {
    it("calls confirm_order_delivery RPC", async () => {
        mockRpc.mockResolvedValue({ data: { success: true }, error: null });
        const result = await confirmDelivery("order-1", "buyer-1");
        expect(mockRpc).toHaveBeenCalledWith("confirm_order_delivery", {
            p_order_id: "order-1",
            p_buyer_id: "buyer-1",
        });
        expect(result).toEqual({ success: true });
    });
});

describe("disputeOrder", () => {
    it("calls dispute_order_with_message RPC with reason", async () => {
        mockRpc.mockResolvedValue({
            data: { success: true, escalation_id: "esc-1" },
            error: null,
        });
        const result = await disputeOrder(
            "order-1",
            "buyer-1",
            "Wrong product",
        );
        expect(mockRpc).toHaveBeenCalledWith("dispute_order_with_message", {
            p_order_id: "order-1",
            p_buyer_id: "buyer-1",
            p_reason: "Wrong product",
        });
        expect(result).toEqual({ success: true, escalation_id: "esc-1" });
    });

    it("returns error without throwing on supabase error", async () => {
        mockRpc.mockResolvedValue({ data: null, error: { message: "fail" } });
        const result = await disputeOrder("order-1", "buyer-1", "reason");
        expect(result).toEqual({ success: false, error: "fail" });
    });
});

describe("makeRefundOffer", () => {
    it("calls make_refund_offer_with_message RPC", async () => {
        mockRpc.mockResolvedValue({
            data: { success: true, offer_id: "ro-1" },
            error: null,
        });
        const result = await makeRefundOffer(
            "order-1",
            "seller-1",
            25,
            "Partial refund",
        );
        expect(mockRpc).toHaveBeenCalledWith("make_refund_offer_with_message", {
            p_order_id: "order-1",
            p_seller_id: "seller-1",
            p_amount: 25,
            p_message: "Partial refund",
        });
        expect(result).toEqual({ success: true, offer_id: "ro-1" });
    });
});

describe("acceptRefundOffer", () => {
    it("calls accept_refund_offer_with_message RPC", async () => {
        mockRpc.mockResolvedValue({ data: { success: true }, error: null });
        const result = await acceptRefundOffer("order-1", "buyer-1", "ro-1");
        expect(mockRpc).toHaveBeenCalledWith(
            "accept_refund_offer_with_message",
            {
                p_order_id: "order-1",
                p_buyer_id: "buyer-1",
                p_offer_id: "ro-1",
            },
        );
        expect(result).toEqual({ success: true });
    });
});

describe("rejectRefundOffer", () => {
    it("updates refund_offers status to rejected", async () => {
        mockQueryResult = { data: null, error: null };
        mockFrom.mockImplementation(() => createChain(mockQueryResult));

        await rejectRefundOffer("ro-1");
        expect(mockFrom).toHaveBeenCalledWith("refund_offers");
    });

    it("throws on error", async () => {
        mockQueryResult = { data: null, error: { message: "fail" } };
        mockFrom.mockImplementation(() => createChain(mockQueryResult));

        await expect(rejectRefundOffer("ro-1")).rejects.toThrow(
            "Failed to reject refund offer",
        );
    });
});

describe("escalateDispute", () => {
    it("calls escalate_order_with_message RPC", async () => {
        mockRpc.mockResolvedValue({ data: { success: true }, error: null });
        const result = await escalateDispute("order-1", "buyer-1");
        expect(mockRpc).toHaveBeenCalledWith("escalate_order_with_message", {
            p_order_id: "order-1",
            p_user_id: "buyer-1",
        });
        expect(result).toEqual({ success: true });
    });
});

describe("resolveDispute", () => {
    it("calls resolve_dispute_with_message RPC", async () => {
        mockRpc.mockResolvedValue({ data: { success: true }, error: null });
        const result = await resolveDispute("order-1", "buyer-1");
        expect(mockRpc).toHaveBeenCalledWith("resolve_dispute_with_message", {
            p_order_id: "order-1",
            p_user_id: "buyer-1",
        });
        expect(result).toEqual({ success: true });
    });
});

// =============================================================================
// Mutations — Direct table operations
// =============================================================================

describe("updateOrderStatus", () => {
    it("updates status via table update and returns mapped order", async () => {
        const updatedRow = { ...SAMPLE_ORDER_ROW, status: "accepted" };
        mockQueryResult = { data: updatedRow, error: null };
        mockFrom.mockImplementation(() => createChain(mockQueryResult));

        const result = await updateOrderStatus("order-1", "accepted");
        expect(mockFrom).toHaveBeenCalledWith("orders");
        expect(result.status).toBe("accepted");
        expect(result.id).toBe("order-1");
    });

    it("throws on error", async () => {
        mockQueryResult = { data: null, error: { message: "update failed" } };
        mockFrom.mockImplementation(() => createChain(mockQueryResult));

        await expect(updateOrderStatus("order-1", "accepted")).rejects.toThrow(
            "Failed to update order",
        );
    });
});

describe("submitRating", () => {
    it("sets seller_rating when buyer rates", async () => {
        const ratedRow = {
            ...SAMPLE_ORDER_ROW,
            seller_rating: 5,
            seller_feedback: "Great!",
        };
        mockQueryResult = { data: ratedRow, error: null };
        mockFrom.mockImplementation(() => createChain(mockQueryResult));

        const result = await submitRating("order-1", "buyer", 5, "Great!");
        expect(mockFrom).toHaveBeenCalledWith("orders");
        expect(result.seller_rating).toBe(5);
    });

    it("sets buyer_rating when seller rates", async () => {
        const ratedRow = {
            ...SAMPLE_ORDER_ROW,
            buyer_rating: 4,
            buyer_feedback: "Good buyer",
        };
        mockQueryResult = { data: ratedRow, error: null };
        mockFrom.mockImplementation(() => createChain(mockQueryResult));

        const result = await submitRating("order-1", "seller", 4, "Good buyer");
        expect(result.buyer_rating).toBe(4);
    });

    it("throws on error", async () => {
        mockQueryResult = { data: null, error: { message: "fail" } };
        mockFrom.mockImplementation(() => createChain(mockQueryResult));

        await expect(submitRating("order-1", "buyer", 5)).rejects.toThrow(
            "Failed to submit rating",
        );
    });
});
