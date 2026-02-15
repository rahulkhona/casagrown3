/**
 * Payment Service — Provider-agnostic abstraction for payment processing.
 *
 * The active provider is controlled by env var:
 *   NEXT_PUBLIC_PAYMENT_MODE / EXPO_PUBLIC_PAYMENT_MODE
 *   Values: 'mock' (default) | 'stripe'
 *
 * Architecture:
 *   Frontend calls createPaymentIntent → backend creates payment_transactions record
 *   Frontend calls confirmPayment → backend credits points via confirm-payment
 *   For Stripe: webhook also calls confirm-payment (handles app-kill scenario)
 *
 * Points are ALWAYS credited server-side, never on the frontend.
 */

// =============================================================================
// Types
// =============================================================================

export interface CardDetails {
    number: string;
    expiry: string;
    cvc: string;
    name: string;
}

export interface PaymentResult {
    success: boolean;
    pointsAmount: number;
    newBalance?: number;
    /** Server-side transaction ID */
    transactionId: string | null;
    error?: string;
}

export interface CreatePaymentIntentResult {
    clientSecret: string;
    transactionId: string;
    provider: "mock" | "stripe";
}

export interface PaymentService {
    /**
     * Create a payment intent on the server.
     * This creates a payment_transactions record and (for Stripe) a PaymentIntent.
     */
    createPaymentIntent(
        amountCents: number,
        pointsAmount: number,
        serviceFeeCents: number,
    ): Promise<CreatePaymentIntentResult>;

    /**
     * Confirm the payment.
     * For mock: calls confirm-payment edge function directly.
     * For Stripe: uses Stripe SDK, then webhook handles server-side confirmation.
     */
    confirmPayment(
        transactionId: string,
        clientSecret: string,
        cardDetails: CardDetails,
        pointsAmount: number,
    ): Promise<PaymentResult>;
}

// =============================================================================
// Factory
// =============================================================================

export type PaymentMode = "mock" | "stripe";

export function getPaymentMode(): PaymentMode {
    const mode = (typeof process !== "undefined" &&
        (process.env.NEXT_PUBLIC_PAYMENT_MODE ||
            process.env.EXPO_PUBLIC_PAYMENT_MODE)) ||
        "mock";
    return mode as PaymentMode;
}

// Static imports — dynamic import() with webpack code-splitting hints
// doesn't work on React Native's Metro bundler (causes "Could not load bundle")
import { MockPaymentService } from "./mockPaymentService";
import { StripePaymentService } from "./stripePaymentService";

let cachedService: PaymentService | null = null;

/**
 * Returns the active payment service instance (singleton).
 */
export function getPaymentService(): PaymentService {
    if (cachedService) return cachedService;

    const mode = getPaymentMode();

    if (mode === "stripe") {
        cachedService = new StripePaymentService();
    } else {
        cachedService = new MockPaymentService();
    }

    return cachedService;
}

/**
 * Synchronous check for whether we're in mock mode.
 */
export function isMockPaymentMode(): boolean {
    return getPaymentMode() === "mock";
}
