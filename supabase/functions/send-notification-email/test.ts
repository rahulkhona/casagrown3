/**
 * Deno Unit Tests — send-notification-email rendering functions
 *
 * Tests that each email type renders the correct subject + HTML.
 * Run with: deno test --allow-env supabase/functions/send-notification-email/test.ts
 */

import {
    assertEquals,
    assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

import {
    type EmailRecipient,
    type EmailType,
    type NotificationPayload,
    renderEmailByType,
} from "./index.ts";

// =============================================================================
// Helpers
// =============================================================================

function makePayload(
    type: EmailType,
    overrides: Partial<NotificationPayload> = {},
): NotificationPayload {
    return {
        type,
        recipients: [],
        ...overrides,
    };
}

function makeRecipient(
    overrides: Partial<EmailRecipient> = {},
): EmailRecipient {
    return {
        email: "test@example.com",
        name: "Test User",
        ...overrides,
    };
}

// =============================================================================
// (a) Order Placed
// =============================================================================

Deno.test("order_placed — buyer gets confirmation email", () => {
    const p = makePayload("order_placed", {
        product: "Tomatoes",
        quantity: 5,
        unit: "lb",
        total: 50,
        buyerName: "Alice",
        buyerEmail: "alice@test.com",
        sellerName: "Bob",
        sellerEmail: "bob@test.com",
    });
    const r = makeRecipient({ email: "alice@test.com", name: "Alice" });
    const result = renderEmailByType(p, r);

    assertEquals(result !== null, true);
    assertStringIncludes(result!.subject, "Order Placed");
    assertStringIncludes(result!.subject, "Tomatoes");
    assertStringIncludes(result!.htmlBody, "Hi Alice,");
    assertStringIncludes(result!.htmlBody, "5 lb of Tomatoes");
    assertStringIncludes(result!.htmlBody, "50 pts");
});

Deno.test("order_placed — seller gets new order alert", () => {
    const p = makePayload("order_placed", {
        product: "Tomatoes",
        quantity: 5,
        unit: "lb",
        total: 50,
        buyerName: "Alice",
        buyerEmail: "alice@test.com",
        sellerName: "Bob",
        sellerEmail: "bob@test.com",
    });
    const r = makeRecipient({ email: "bob@test.com", name: "Bob" });
    const result = renderEmailByType(p, r);

    assertEquals(result !== null, true);
    assertStringIncludes(result!.subject, "New Order");
    assertStringIncludes(result!.htmlBody, "Hi Bob,");
    assertStringIncludes(result!.htmlBody, "Alice");
});

// =============================================================================
// (b) Offer Made
// =============================================================================

Deno.test("offer_made — buyer gets notified of new offer", () => {
    const p = makePayload("offer_made", {
        product: "Strawberries",
        quantity: 3,
        unit: "pint",
        pointsPerUnit: 10,
        sellerName: "Maria",
        deliveryDate: "2026-03-15",
        offerMessage: "Fresh from my garden!",
    });
    const r = makeRecipient({ name: "John" });
    const result = renderEmailByType(p, r);

    assertEquals(result !== null, true);
    assertStringIncludes(result!.subject, "New Offer on Your Post");
    assertStringIncludes(result!.subject, "Strawberries");
    assertStringIncludes(result!.htmlBody, "Maria");
    assertStringIncludes(result!.htmlBody, "10 pts/pint");
    assertStringIncludes(result!.htmlBody, "Fresh from my garden!");
});

// =============================================================================
// (d) Order Disputed
// =============================================================================

Deno.test("order_disputed — both parties get dispute notification", () => {
    const p = makePayload("order_disputed", {
        product: "Lettuce",
        orderId: "abc12345-6789-0123-4567-890123456789",
        disputeReason: "Product was wilted",
    });
    const r = makeRecipient({ name: "Buyer" });
    const result = renderEmailByType(p, r);

    assertEquals(result !== null, true);
    assertStringIncludes(result!.subject, "Order Disputed");
    assertStringIncludes(result!.subject, "Lettuce");
    assertStringIncludes(result!.htmlBody, "Product was wilted");
    assertStringIncludes(result!.htmlBody, "abc12345...");
});

// =============================================================================
// (e) Dispute Resolved
// =============================================================================

Deno.test("dispute_resolved — both parties get resolution email", () => {
    const p = makePayload("dispute_resolved", {
        product: "Peppers",
        orderId: "def12345-6789-0123-4567-890123456789",
        resolutionOutcome: "Buyer resolved without refund",
    });
    const r = makeRecipient({ name: "Seller" });
    const result = renderEmailByType(p, r);

    assertEquals(result !== null, true);
    assertStringIncludes(result!.subject, "Dispute Resolved");
    assertStringIncludes(result!.subject, "Peppers");
    assertStringIncludes(result!.htmlBody, "Buyer resolved without refund");
});

Deno.test("dispute_resolved — shows discount amount when present", () => {
    const p = makePayload("dispute_resolved", {
        product: "Herbs",
        orderId: "ghi12345-6789-0123-4567-890123456789",
        resolutionOutcome: "Seller offered discount",
        refundAmount: 25,
    });
    const r = makeRecipient({});
    const result = renderEmailByType(p, r);

    assertStringIncludes(result!.htmlBody, "25 pts");
    assertStringIncludes(result!.htmlBody, "Discount Applied");
});

// =============================================================================
// (f) Chat Initiated
// =============================================================================

Deno.test("chat_initiated — other party gets message notification", () => {
    const p = makePayload("chat_initiated", {
        senderName: "Maria",
        product: "Avocados",
        messagePreview: "Hi! Are your avocados still available?",
    });
    const r = makeRecipient({ name: "Bob" });
    const result = renderEmailByType(p, r);

    assertEquals(result !== null, true);
    assertStringIncludes(result!.subject, "Maria");
    assertStringIncludes(result!.subject, "Avocados");
    assertStringIncludes(
        result!.htmlBody,
        "Hi! Are your avocados still available?",
    );
});

// =============================================================================
// (g) Points Purchase
// =============================================================================

Deno.test("points_purchase — receipt email with amount and method", () => {
    const p = makePayload("points_purchase", {
        pointsAmount: 500,
        dollarAmount: 5.0,
        paymentMethodLast4: "4242",
    });
    const r = makeRecipient({ name: "Alice" });
    const result = renderEmailByType(p, r);

    assertEquals(result !== null, true);
    assertStringIncludes(result!.subject, "500 Points Purchased");
    assertStringIncludes(result!.htmlBody, "$5.00");
    assertStringIncludes(result!.htmlBody, "4242");
});

// =============================================================================
// (h) Points Redemption
// =============================================================================

Deno.test("points_redemption — gift card email with link", () => {
    const p = makePayload("points_redemption", {
        pointsAmount: 2500,
        dollarAmount: 25.0,
        redemptionMethod: "Amazon Gift Card",
        giftCardBrand: "Amazon",
        giftCardFaceValue: 25,
        giftCardUrl: "https://example.com/gc/ABCD-1234",
    });
    const r = makeRecipient({ name: "Alice" });
    const result = renderEmailByType(p, r);

    assertEquals(result !== null, true);
    assertStringIncludes(result!.subject, "Amazon");
    assertStringIncludes(result!.subject, "$25 Gift Card");
    assertStringIncludes(result!.htmlBody, "2500 pts");
    assertStringIncludes(result!.htmlBody, "View Your Gift Card");
    assertStringIncludes(result!.htmlBody, "https://example.com/gc/ABCD-1234");
    assertStringIncludes(result!.htmlBody, "Transaction History");
});

Deno.test("points_redemption — Venmo cashout email", () => {
    const p = makePayload("points_redemption", {
        pointsAmount: 200,
        dollarAmount: 2.0,
        redemptionMethod: "Venmo",
        redemptionRecipient: "+15551234567",
    });
    const r = makeRecipient({ name: "Bob" });
    const result = renderEmailByType(p, r);

    assertEquals(result !== null, true);
    assertStringIncludes(result!.subject, "Venmo");
    assertStringIncludes(result!.htmlBody, "$2.00");
    assertStringIncludes(result!.htmlBody, "+15551234567");
    assertStringIncludes(result!.htmlBody, "Cashout Receipt");
});

// =============================================================================
// (k) Points Refund
// =============================================================================

Deno.test("points_refund — card refund with last-4 digits", () => {
    const p = makePayload("points_refund", {
        pointsAmount: 500,
        refundUsdAmount: 5.0,
        cardLast4: "4242",
        cardBrand: "Visa",
        refundReason: "Requested refund",
    });
    const r = makeRecipient({ name: "Alice" });
    const result = renderEmailByType(p, r);

    assertEquals(result !== null, true);
    assertStringIncludes(result!.subject, "Visa ending in 4242");
    assertStringIncludes(result!.htmlBody, "$5.00");
    assertStringIncludes(result!.htmlBody, "Visa ending in 4242");
    assertStringIncludes(result!.htmlBody, "Requested refund");
    assertStringIncludes(result!.htmlBody, "5-10 business days");
});

Deno.test("points_refund — generic return without card info", () => {
    const p = makePayload("points_refund", {
        pointsAmount: 100,
        refundReason: "Gift card cancelled",
    });
    const r = makeRecipient({ name: "Bob" });
    const result = renderEmailByType(p, r);

    assertEquals(result !== null, true);
    assertStringIncludes(result!.subject, "100 pts");
    assertStringIncludes(result!.htmlBody, "Points Returned");
    assertStringIncludes(result!.htmlBody, "Gift card cancelled");
});

// =============================================================================
// (l) Tax Threshold Warning
// =============================================================================

Deno.test("tax_threshold_warning — shows state-specific threshold", () => {
    const p = makePayload("tax_threshold_warning", {
        ytdEarnings: 480,
        stateThreshold: 600,
        stateName: "Virginia",
        taxYear: 2026,
    });
    const r = makeRecipient({ name: "Maria" });
    const result = renderEmailByType(p, r);

    assertEquals(result !== null, true);
    assertStringIncludes(result!.subject, "Tax Information");
    assertStringIncludes(result!.htmlBody, "Virginia");
    assertStringIncludes(result!.htmlBody, "$600");
    assertStringIncludes(result!.htmlBody, "2026");
    assertStringIncludes(result!.htmlBody, "1099-K");
});

Deno.test("tax_threshold_warning — shows federal threshold for non-special states", () => {
    const p = makePayload("tax_threshold_warning", {
        ytdEarnings: 15500,
        stateThreshold: 20000,
        stateName: "California",
        taxYear: 2026,
    });
    const r = makeRecipient({ name: "Bob" });
    const result = renderEmailByType(p, r);

    assertStringIncludes(result!.htmlBody, "California");
    assertStringIncludes(result!.htmlBody, "$20,000");
});

// =============================================================================
// (m) Delegation Revoked
// =============================================================================

Deno.test("delegation_revoked — shows delegation details", () => {
    const p = makePayload("delegation_revoked", {
        delegatorName: "Maria",
        delegateName: "Bob",
        revokedBy: "delegator",
    });
    const r = makeRecipient({ name: "Bob", email: "bob@test.com" });
    const result = renderEmailByType(p, r);

    assertEquals(result !== null, true);
    assertStringIncludes(result!.subject, "Delegation Ended");
    assertStringIncludes(result!.htmlBody, "Maria");
    assertStringIncludes(result!.htmlBody, "Delegator");
});

// =============================================================================
// (n) Delegation Accepted
// =============================================================================

Deno.test("delegation_accepted — shows delegate and split info", () => {
    const p = makePayload("delegation_accepted", {
        delegateName: "Bob",
        delegatorName: "Maria",
        delegatePct: 30,
    });
    const r = makeRecipient({ name: "Maria" });
    const result = renderEmailByType(p, r);

    assertEquals(result !== null, true);
    assertStringIncludes(result!.subject, "Bob");
    assertStringIncludes(result!.subject, "now selling for you");
    assertStringIncludes(result!.htmlBody, "30%");
    assertStringIncludes(result!.htmlBody, "70%");
});

// =============================================================================
// Unknown Type
// =============================================================================

Deno.test("unknown type returns null", () => {
    const p = makePayload("order_placed" as EmailType, {});
    (p as any).type = "unknown_type";
    const r = makeRecipient({});
    const result = renderEmailByType(p as NotificationPayload, r);
    assertEquals(result, null);
});

// =============================================================================
// Template Structure
// =============================================================================

Deno.test("all emails contain branded wrapper elements", () => {
    const types: EmailType[] = [
        "order_placed",
        "offer_made",
        "order_disputed",
        "dispute_resolved",
        "chat_initiated",
        "points_purchase",
        "points_redemption",
        "points_refund",
        "tax_threshold_warning",
        "delegation_revoked",
        "delegation_accepted",
    ];

    for (const type of types) {
        const p = makePayload(type, {
            product: "Test",
            senderName: "Test",
            sellerName: "Test",
            buyerName: "Test",
            buyerEmail: "buyer@test.com",
            sellerEmail: "seller@test.com",
            delegatorName: "Test",
            delegateName: "Test",
            revokedBy: "delegator",
        });
        const r = makeRecipient({});
        const result = renderEmailByType(p, r);

        assertEquals(result !== null, true, `Type ${type} returned null`);
        assertStringIncludes(
            result!.htmlBody,
            "CasaGrown",
            `Type ${type} missing CasaGrown branding`,
        );
        assertStringIncludes(
            result!.htmlBody,
            "logo.png",
            `Type ${type} missing logo`,
        );
        assertStringIncludes(
            result!.htmlBody,
            "FRESH",
            `Type ${type} missing tagline`,
        );
        assertStringIncludes(
            result!.htmlBody,
            "automated message",
            `Type ${type} missing footer`,
        );
    }
});
