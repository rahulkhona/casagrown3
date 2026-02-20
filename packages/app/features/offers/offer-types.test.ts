/**
 * Offer Types Tests
 *
 * Tests the offer state-machine helpers:
 * - canOfferTransition
 * - getAvailableOfferActions
 * - isOpenOffer
 * - OFFER_STATUS_CONFIG completeness
 * - OFFER_TRANSITIONS completeness
 */

import {
    canOfferTransition,
    getAvailableOfferActions,
    isOpenOffer,
    OFFER_STATUS_CONFIG,
    OFFER_TRANSITIONS,
} from "./offer-types";
import type { Offer, OfferStatus } from "./offer-types";

// =============================================================================
// Helpers
// =============================================================================

const t = (key: string) => key;

function makeOffer(overrides: Partial<Offer> = {}): Offer {
    return {
        id: "offer-1",
        conversation_id: "conv-1",
        post_id: "post-1",
        created_by: "seller-1", // the offer maker
        quantity: 5,
        points_per_unit: 10,
        category: "vegetables",
        product: "Tomatoes",
        unit: "lbs",
        delivery_date: "2026-03-01",
        delivery_dates: ["2026-03-01"],
        message: null,
        seller_post_id: null,
        status: "pending" as OfferStatus,
        version: 1,
        created_at: "2026-02-19T00:00:00Z",
        updated_at: null,
        buyer_name: "Test Buyer",
        buyer_avatar_url: null,
        seller_name: "Test Seller",
        seller_avatar_url: null,
        buyer_id: "buyer-1",
        seller_id: "seller-1",
        ...overrides,
    };
}

// =============================================================================
// canOfferTransition
// =============================================================================

describe("canOfferTransition", () => {
    // ── Pending ──
    it("allows buyer to accept when pending", () => {
        const offer = makeOffer({ status: "pending" });
        expect(canOfferTransition(offer, "buyer-1", "accept")).toBe(true);
    });

    it("allows buyer to reject when pending", () => {
        const offer = makeOffer({ status: "pending" });
        expect(canOfferTransition(offer, "buyer-1", "reject")).toBe(true);
    });

    it("allows seller to modify when pending", () => {
        const offer = makeOffer({ status: "pending" });
        expect(canOfferTransition(offer, "seller-1", "modify")).toBe(true);
    });

    it("allows seller to withdraw when pending", () => {
        const offer = makeOffer({ status: "pending" });
        expect(canOfferTransition(offer, "seller-1", "withdraw")).toBe(true);
    });

    it("does NOT allow buyer to modify when pending", () => {
        const offer = makeOffer({ status: "pending" });
        expect(canOfferTransition(offer, "buyer-1", "modify")).toBe(false);
    });

    it("does NOT allow seller to accept when pending", () => {
        const offer = makeOffer({ status: "pending" });
        expect(canOfferTransition(offer, "seller-1", "accept")).toBe(false);
    });

    // ── Terminal states ──
    it("does NOT allow any transitions when accepted", () => {
        const offer = makeOffer({ status: "accepted" });
        expect(canOfferTransition(offer, "buyer-1", "accept")).toBe(false);
        expect(canOfferTransition(offer, "seller-1", "modify")).toBe(false);
    });

    it("does NOT allow any transitions when rejected", () => {
        const offer = makeOffer({ status: "rejected" });
        expect(canOfferTransition(offer, "buyer-1", "accept")).toBe(false);
        expect(canOfferTransition(offer, "seller-1", "withdraw")).toBe(false);
    });

    it("does NOT allow any transitions when withdrawn", () => {
        const offer = makeOffer({ status: "withdrawn" });
        expect(canOfferTransition(offer, "buyer-1", "reject")).toBe(false);
        expect(canOfferTransition(offer, "seller-1", "modify")).toBe(false);
    });
});

// =============================================================================
// getAvailableOfferActions
// =============================================================================

describe("getAvailableOfferActions", () => {
    it("returns accept and reject for buyer on pending offer", () => {
        const offer = makeOffer({ status: "pending" });
        const actions = getAvailableOfferActions(offer, "buyer-1", t);
        const types = actions.map((a) => a.type);
        expect(types).toEqual(["accept", "reject"]);
    });

    it("returns modify and withdraw for seller on pending offer", () => {
        const offer = makeOffer({ status: "pending" });
        const actions = getAvailableOfferActions(offer, "seller-1", t);
        const types = actions.map((a) => a.type);
        expect(types).toEqual(["modify", "withdraw"]);
    });

    it("returns empty for both roles on accepted offer", () => {
        const offer = makeOffer({ status: "accepted" });
        expect(getAvailableOfferActions(offer, "buyer-1", t)).toHaveLength(0);
        expect(getAvailableOfferActions(offer, "seller-1", t)).toHaveLength(0);
    });

    it("returns empty for both roles on rejected offer", () => {
        const offer = makeOffer({ status: "rejected" });
        expect(getAvailableOfferActions(offer, "buyer-1", t)).toHaveLength(0);
        expect(getAvailableOfferActions(offer, "seller-1", t)).toHaveLength(0);
    });

    it("returns empty for both roles on withdrawn offer", () => {
        const offer = makeOffer({ status: "withdrawn" });
        expect(getAvailableOfferActions(offer, "buyer-1", t)).toHaveLength(0);
        expect(getAvailableOfferActions(offer, "seller-1", t)).toHaveLength(0);
    });

    it("each action has label, icon, color, bgColor, type", () => {
        const offer = makeOffer({ status: "pending" });
        const actions = getAvailableOfferActions(offer, "seller-1", t);
        for (const action of actions) {
            expect(action).toHaveProperty("label");
            expect(action).toHaveProperty("icon");
            expect(action).toHaveProperty("color");
            expect(action).toHaveProperty("bgColor");
            expect(action).toHaveProperty("type");
        }
    });

    it("reject and withdraw are marked as destructive", () => {
        const offer = makeOffer({ status: "pending" });
        const buyerActions = getAvailableOfferActions(offer, "buyer-1", t);
        const sellerActions = getAvailableOfferActions(offer, "seller-1", t);
        const reject = buyerActions.find((a) => a.type === "reject");
        const withdraw = sellerActions.find((a) => a.type === "withdraw");
        expect(reject?.destructive).toBe(true);
        expect(withdraw?.destructive).toBe(true);
    });
});

// =============================================================================
// isOpenOffer
// =============================================================================

describe("isOpenOffer", () => {
    it.each<[OfferStatus, boolean]>([
        ["pending", true],
        ["accepted", false],
        ["rejected", false],
        ["withdrawn", false],
    ])("returns %s for status '%s'", (status, expected) => {
        const offer = makeOffer({ status });
        expect(isOpenOffer(offer)).toBe(expected);
    });
});

// =============================================================================
// OFFER_STATUS_CONFIG
// =============================================================================

describe("OFFER_STATUS_CONFIG", () => {
    const allStatuses: OfferStatus[] = [
        "pending",
        "accepted",
        "rejected",
        "withdrawn",
    ];

    it("has config for every OfferStatus", () => {
        for (const status of allStatuses) {
            expect(OFFER_STATUS_CONFIG[status]).toBeDefined();
        }
    });

    it("each config has label, color, bgColor, icon", () => {
        for (const status of allStatuses) {
            const config = OFFER_STATUS_CONFIG[status];
            expect(config.label).toBeTruthy();
            expect(config.color).toBeTruthy();
            expect(config.bgColor).toBeTruthy();
            expect(config.icon).toBeTruthy();
        }
    });
});

// =============================================================================
// OFFER_TRANSITIONS
// =============================================================================

describe("OFFER_TRANSITIONS", () => {
    const allStatuses: OfferStatus[] = [
        "pending",
        "accepted",
        "rejected",
        "withdrawn",
    ];

    it("has transitions for every OfferStatus", () => {
        for (const status of allStatuses) {
            expect(OFFER_TRANSITIONS[status]).toBeDefined();
            expect(OFFER_TRANSITIONS[status]).toHaveProperty("buyer");
            expect(OFFER_TRANSITIONS[status]).toHaveProperty("seller");
        }
    });

    it("only pending has non-empty transitions", () => {
        expect(OFFER_TRANSITIONS.pending.buyer.length).toBeGreaterThan(0);
        expect(OFFER_TRANSITIONS.pending.seller.length).toBeGreaterThan(0);
    });

    it("terminal statuses have empty action arrays", () => {
        for (
            const st of ["accepted", "rejected", "withdrawn"] as OfferStatus[]
        ) {
            expect(OFFER_TRANSITIONS[st].buyer).toHaveLength(0);
            expect(OFFER_TRANSITIONS[st].seller).toHaveLength(0);
        }
    });
});
