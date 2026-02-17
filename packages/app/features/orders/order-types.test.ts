/**
 * Order Types Tests
 *
 * Tests the order state-machine helpers:
 * - canTransition
 * - getAvailableActions
 * - isOpenOrder
 * - ORDER_STATUS_CONFIG completeness
 * - ORDER_TRANSITIONS completeness
 */

import {
    canTransition,
    getAvailableActions,
    isOpenOrder,
    ORDER_STATUS_CONFIG,
    ORDER_TRANSITIONS,
} from "./order-types";

// =============================================================================
// Helpers
// =============================================================================

const t = (key: string) => key;

function makeOrder(overrides: Partial<Order> = {}): Order {
    return {
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
        delivery_time: null,
        delivery_instructions: null,
        delivery_address: null,
        delivery_proof_media_id: null,
        delivery_proof_url: null,
        status: "pending" as OrderStatus,
        buyer_rating: null,
        buyer_feedback: null,
        seller_rating: null,
        seller_feedback: null,
        created_at: "2026-02-16T00:00:00Z",
        updated_at: "2026-02-16T00:00:00Z",
        version: 1,
        buyer_name: "Test Buyer",
        buyer_avatar_url: null,
        seller_name: "Test Seller",
        seller_avatar_url: null,
        post_id: "post-1",
        unit: "box",
        ...overrides,
    };
}

// =============================================================================
// canTransition
// =============================================================================

describe("canTransition", () => {
    // ── Pending ──
    it("allows buyer to modify when pending", () => {
        const order = makeOrder({ status: "pending" });
        expect(canTransition(order, "buyer-1", "modify")).toBe(true);
    });

    it("allows buyer to cancel when pending", () => {
        const order = makeOrder({ status: "pending" });
        expect(canTransition(order, "buyer-1", "cancel")).toBe(true);
    });

    it("allows seller to accept when pending", () => {
        const order = makeOrder({ status: "pending" });
        expect(canTransition(order, "seller-1", "accept")).toBe(true);
    });

    it("allows seller to reject when pending", () => {
        const order = makeOrder({ status: "pending" });
        expect(canTransition(order, "seller-1", "reject")).toBe(true);
    });

    it("allows seller to suggest_date when pending", () => {
        const order = makeOrder({ status: "pending" });
        expect(canTransition(order, "seller-1", "suggest_date")).toBe(true);
    });

    it("allows seller to suggest_qty when pending", () => {
        const order = makeOrder({ status: "pending" });
        expect(canTransition(order, "seller-1", "suggest_qty")).toBe(true);
    });

    it("does NOT allow buyer to accept when pending", () => {
        const order = makeOrder({ status: "pending" });
        expect(canTransition(order, "buyer-1", "accept")).toBe(false);
    });

    it("does NOT allow seller to modify when pending", () => {
        const order = makeOrder({ status: "pending" });
        expect(canTransition(order, "seller-1", "modify")).toBe(false);
    });

    // ── Accepted ──
    it("allows seller to cancel when accepted", () => {
        const order = makeOrder({ status: "accepted" });
        expect(canTransition(order, "seller-1", "cancel")).toBe(true);
    });

    it("allows seller to mark_delivered when accepted", () => {
        const order = makeOrder({ status: "accepted" });
        expect(canTransition(order, "seller-1", "mark_delivered")).toBe(true);
    });

    it("does NOT allow buyer any actions when accepted", () => {
        const order = makeOrder({ status: "accepted" });
        expect(canTransition(order, "buyer-1", "cancel")).toBe(false);
        expect(canTransition(order, "buyer-1", "modify")).toBe(false);
    });

    // ── Delivered ──
    it("allows buyer to confirm_delivery when delivered", () => {
        const order = makeOrder({ status: "delivered" });
        expect(canTransition(order, "buyer-1", "confirm_delivery")).toBe(true);
    });

    it("allows buyer to dispute when delivered", () => {
        const order = makeOrder({ status: "delivered" });
        expect(canTransition(order, "buyer-1", "dispute")).toBe(true);
    });

    it("does NOT allow seller any actions when delivered", () => {
        const order = makeOrder({ status: "delivered" });
        expect(canTransition(order, "seller-1", "confirm_delivery")).toBe(
            false,
        );
    });

    // ── Completed ──
    it("allows both buyer and seller to rate when completed", () => {
        const order = makeOrder({ status: "completed" });
        expect(canTransition(order, "buyer-1", "rate")).toBe(true);
        expect(canTransition(order, "seller-1", "rate")).toBe(true);
    });

    // ── Disputed ──
    it("allows buyer to accept_offer/resolve/escalate when disputed", () => {
        const order = makeOrder({ status: "disputed" });
        expect(canTransition(order, "buyer-1", "accept_offer")).toBe(true);
        expect(canTransition(order, "buyer-1", "resolve")).toBe(true);
        expect(canTransition(order, "buyer-1", "escalate")).toBe(true);
    });

    it("allows seller to make_offer/escalate when disputed", () => {
        const order = makeOrder({ status: "disputed" });
        expect(canTransition(order, "seller-1", "make_offer")).toBe(true);
        expect(canTransition(order, "seller-1", "escalate")).toBe(true);
    });

    // ── Escalated ──
    it("allows buyer to accept_offer/resolve when escalated", () => {
        const order = makeOrder({ status: "escalated" });
        expect(canTransition(order, "buyer-1", "accept_offer")).toBe(true);
        expect(canTransition(order, "buyer-1", "resolve")).toBe(true);
    });

    it("allows seller to make_offer/resolve when escalated", () => {
        const order = makeOrder({ status: "escalated" });
        expect(canTransition(order, "seller-1", "make_offer")).toBe(true);
        expect(canTransition(order, "seller-1", "resolve")).toBe(true);
    });

    // ── Cancelled ──
    it("does NOT allow any transitions when cancelled", () => {
        const order = makeOrder({ status: "cancelled" });
        expect(canTransition(order, "buyer-1", "modify")).toBe(false);
        expect(canTransition(order, "seller-1", "accept")).toBe(false);
    });
});

// =============================================================================
// getAvailableActions
// =============================================================================

describe("getAvailableActions", () => {
    it("returns modify and cancel for buyer on pending order", () => {
        const order = makeOrder({ status: "pending" });
        const actions = getAvailableActions(order, "buyer-1", t);
        const types = actions.map((a) => a.type);
        expect(types).toEqual(["modify", "cancel"]);
    });

    it("returns accept, reject, suggest_date, suggest_qty for seller on pending", () => {
        const order = makeOrder({ status: "pending" });
        const actions = getAvailableActions(order, "seller-1", t);
        const types = actions.map((a) => a.type);
        expect(types).toEqual([
            "accept",
            "reject",
            "suggest_date",
            "suggest_qty",
        ]);
    });

    it("returns empty array for buyer on accepted order", () => {
        const order = makeOrder({ status: "accepted" });
        const actions = getAvailableActions(order, "buyer-1", t);
        expect(actions).toHaveLength(0);
    });

    it("returns cancel and mark_delivered for seller on accepted order", () => {
        const order = makeOrder({ status: "accepted" });
        const actions = getAvailableActions(order, "seller-1", t);
        const types = actions.map((a) => a.type);
        expect(types).toEqual(["cancel", "mark_delivered"]);
    });

    it("returns rate for both roles on completed order", () => {
        const order = makeOrder({ status: "completed" });
        expect(getAvailableActions(order, "buyer-1", t).map((a) => a.type))
            .toEqual(["rate"]);
        expect(getAvailableActions(order, "seller-1", t).map((a) => a.type))
            .toEqual(["rate"]);
    });

    it("returns empty arrays for both roles on cancelled order", () => {
        const order = makeOrder({ status: "cancelled" });
        expect(getAvailableActions(order, "buyer-1", t)).toHaveLength(0);
        expect(getAvailableActions(order, "seller-1", t)).toHaveLength(0);
    });

    it("each action has label, icon, color, bgColor", () => {
        const order = makeOrder({ status: "pending" });
        const actions = getAvailableActions(order, "seller-1", t);
        for (const action of actions) {
            expect(action).toHaveProperty("label");
            expect(action).toHaveProperty("icon");
            expect(action).toHaveProperty("color");
            expect(action).toHaveProperty("bgColor");
            expect(action).toHaveProperty("type");
        }
    });
});

// =============================================================================
// isOpenOrder
// =============================================================================

describe("isOpenOrder", () => {
    it.each<[OrderStatus, boolean]>([
        ["pending", true],
        ["accepted", true],
        ["delivered", true],
        ["disputed", true],
        ["escalated", true],
        ["completed", false],
        ["cancelled", false],
    ])("returns %s for status '%s'", (status, expected) => {
        const order = makeOrder({ status });
        expect(isOpenOrder(order)).toBe(expected);
    });
});

// =============================================================================
// ORDER_STATUS_CONFIG
// =============================================================================

describe("ORDER_STATUS_CONFIG", () => {
    const allStatuses: OrderStatus[] = [
        "pending",
        "accepted",
        "delivered",
        "completed",
        "disputed",
        "escalated",
        "cancelled",
    ];

    it("has config for every OrderStatus", () => {
        for (const status of allStatuses) {
            expect(ORDER_STATUS_CONFIG[status]).toBeDefined();
        }
    });

    it("each config has label, color, bgColor, icon", () => {
        for (const status of allStatuses) {
            const config = ORDER_STATUS_CONFIG[status];
            expect(config.label).toBeTruthy();
            expect(config.color).toBeTruthy();
            expect(config.bgColor).toBeTruthy();
            expect(config.icon).toBeTruthy();
        }
    });
});

// =============================================================================
// ORDER_TRANSITIONS
// =============================================================================

describe("ORDER_TRANSITIONS", () => {
    const allStatuses: OrderStatus[] = [
        "pending",
        "accepted",
        "delivered",
        "completed",
        "disputed",
        "escalated",
        "cancelled",
    ];

    it("has transitions for every OrderStatus", () => {
        for (const status of allStatuses) {
            expect(ORDER_TRANSITIONS[status]).toBeDefined();
            expect(ORDER_TRANSITIONS[status]).toHaveProperty("buyer");
            expect(ORDER_TRANSITIONS[status]).toHaveProperty("seller");
        }
    });

    it("terminal statuses (cancelled) have empty action arrays", () => {
        expect(ORDER_TRANSITIONS.cancelled.buyer).toHaveLength(0);
        expect(ORDER_TRANSITIONS.cancelled.seller).toHaveLength(0);
    });
});
