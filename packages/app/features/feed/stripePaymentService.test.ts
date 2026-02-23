/**
 * StripePaymentService Tests
 *
 * Tests the Stripe payment service that integrates with Supabase edge functions
 * and Stripe.js for web-based card payments.
 */

import { Platform } from "react-native";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockInvoke = jest.fn();

jest.mock("../../utils/supabase", () => ({
    supabase: {
        functions: { invoke: (...args: any[]) => mockInvoke(...args) },
    },
}));

// Mock @stripe/stripe-js dynamic import
let mockStripeInstance: any = null;

jest.mock("@stripe/stripe-js", () => ({
    loadStripe: jest.fn(() => Promise.resolve(mockStripeInstance)),
}), { virtual: true });

import { StripePaymentService } from "./stripePaymentService";

// Reset the module-level stripePromise cache between tests
beforeEach(() => {
    jest.clearAllMocks();
    mockStripeInstance = null;
    // Reset the cached stripePromise by re-importing
    jest.resetModules();
});

// =============================================================================
// Tests
// =============================================================================

describe("StripePaymentService", () => {
    let service: StripePaymentService;

    beforeEach(() => {
        service = new StripePaymentService();
    });

    // ── createPaymentIntent ──────────────────────────────────────────────

    describe("createPaymentIntent", () => {
        it("returns clientSecret and transactionId on success", async () => {
            mockInvoke.mockResolvedValue({
                data: { clientSecret: "pi_secret_123", transactionId: "txn-1" },
                error: null,
            });

            const result = await service.createPaymentIntent(1000, 100, 60);

            expect(mockInvoke).toHaveBeenCalledWith("create-payment-intent", {
                body: {
                    amountCents: 1000,
                    pointsAmount: 100,
                    serviceFeeCents: 60,
                    provider: "stripe",
                },
            });
            expect(result).toEqual({
                clientSecret: "pi_secret_123",
                transactionId: "txn-1",
                provider: "stripe",
            });
        });

        it("throws when edge function returns error", async () => {
            mockInvoke.mockResolvedValue({
                data: null,
                error: { message: "Edge function failed" },
            });

            await expect(service.createPaymentIntent(1000, 100, 60))
                .rejects.toThrow("Edge function failed");
        });

        it("throws when no clientSecret is returned", async () => {
            mockInvoke.mockResolvedValue({
                data: { transactionId: "txn-1" },
                error: null,
            });

            await expect(service.createPaymentIntent(1000, 100, 60))
                .rejects.toThrow("no client secret returned");
        });
    });

    // ── confirmPayment ───────────────────────────────────────────────────

    describe("confirmPayment", () => {
        it("uses fallbackConfirm on native (non-web)", async () => {
            const originalOS = Platform.OS;
            Platform.OS = "ios" as any;

            mockInvoke.mockResolvedValue({
                data: { pointsAmount: 500, newBalance: 1500 },
                error: null,
            });

            const result = await service.confirmPayment(
                "txn-1",
                "pi_secret",
                { number: "4242", expiry: "12/26", cvc: "123", name: "Test" },
                500,
            );

            expect(result.success).toBe(true);
            expect(result.pointsAmount).toBe(500);
            expect(mockInvoke).toHaveBeenCalledWith("confirm-payment", {
                body: { paymentTransactionId: "txn-1" },
            });

            Platform.OS = originalOS;
        });
    });

    // ── fallbackConfirm (via confirmPayment on native) ───────────────────

    describe("fallbackConfirm", () => {
        beforeEach(() => {
            Platform.OS = "ios" as any;
        });

        afterEach(() => {
            Platform.OS = "web" as any;
        });

        it("returns success with points data from edge function", async () => {
            mockInvoke.mockResolvedValue({
                data: { pointsAmount: 1000, newBalance: 2000 },
                error: null,
            });

            const result = await service.confirmPayment(
                "txn-2",
                "secret",
                { number: "4242", expiry: "12/26", cvc: "123", name: "" },
                1000,
            );

            expect(result).toEqual({
                success: true,
                pointsAmount: 1000,
                newBalance: 2000,
                transactionId: "txn-2",
            });
        });

        it("returns failure when edge function errors", async () => {
            mockInvoke.mockResolvedValue({
                data: null,
                error: { message: "Confirm failed" },
            });

            const result = await service.confirmPayment(
                "txn-3",
                "secret",
                { number: "4242", expiry: "12/26", cvc: "123", name: "" },
                500,
            );

            expect(result.success).toBe(false);
            expect(result.error).toBe("Confirm failed");
        });

        it("returns failure when edge function throws", async () => {
            mockInvoke.mockRejectedValue(new Error("Network error"));

            const result = await service.confirmPayment(
                "txn-4",
                "secret",
                { number: "4242", expiry: "12/26", cvc: "123", name: "" },
                500,
            );

            expect(result.success).toBe(false);
            expect(result.error).toBe("Network error");
        });

        it("uses default pointsAmount when edge function data lacks it", async () => {
            mockInvoke.mockResolvedValue({
                data: { newBalance: 3000 },
                error: null,
            });

            const result = await service.confirmPayment(
                "txn-5",
                "secret",
                { number: "4242", expiry: "12/26", cvc: "123", name: "" },
                750,
            );

            expect(result.success).toBe(true);
            expect(result.pointsAmount).toBe(750);
        });
    });
});
