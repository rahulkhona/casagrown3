/**
 * Stripe Payment Service — real Stripe integration via Supabase Edge Functions.
 *
 * Flow:
 *  1. createPaymentIntent → calls edge function with provider='stripe'
 *     → creates Stripe PaymentIntent + payment_transactions record
 *  2. confirmPayment → uses Stripe.js to confirm card payment
 *     → Stripe webhook calls confirm-payment to credit points (server-side)
 *     → Frontend also calls confirm-payment for optimistic update
 *
 * The webhook is the source of truth: even if the app is killed after step 2,
 * the webhook will still credit points.
 */

import { Platform } from "react-native";
import type {
    CardDetails,
    CreatePaymentIntentResult,
    PaymentResult,
    PaymentService,
} from "./paymentService";
import { supabase } from "../../utils/supabase";

// Lazy-loaded Stripe instance (web only)
let stripePromise: Promise<any> | null = null;

function getStripe() {
    if (stripePromise) return stripePromise;

    if (Platform.OS === "web") {
        // Dynamic import for web — @stripe/stripe-js is loaded from CDN
        stripePromise = import("@stripe/stripe-js").then(({ loadStripe }) => {
            const key = typeof process !== "undefined"
                ? process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
                : undefined;

            if (!key) {
                console.warn(
                    "[STRIPE] NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY not set",
                );
                return null;
            }
            return loadStripe(key);
        }).catch((err) => {
            console.warn("[STRIPE] Failed to load Stripe.js:", err);
            return null;
        });
    } else {
        // Native: would use @stripe/stripe-react-native
        stripePromise = Promise.resolve(null);
    }

    return stripePromise;
}

export class StripePaymentService implements PaymentService {
    async createPaymentIntent(
        amountCents: number,
        pointsAmount: number,
        serviceFeeCents: number,
    ): Promise<CreatePaymentIntentResult> {
        const { data, error } = await supabase.functions.invoke(
            "create-payment-intent",
            {
                body: {
                    amountCents,
                    pointsAmount,
                    serviceFeeCents,
                    provider: "stripe",
                },
            },
        );

        if (error || !data?.clientSecret) {
            throw new Error(
                error?.message ||
                    "Failed to create payment intent — no client secret returned",
            );
        }

        return {
            clientSecret: data.clientSecret,
            transactionId: data.transactionId,
            provider: "stripe",
        };
    }

    async confirmPayment(
        transactionId: string,
        clientSecret: string,
        cardDetails: CardDetails,
        pointsAmount: number,
    ): Promise<PaymentResult> {
        if (Platform.OS === "web") {
            return this.confirmPaymentWeb(
                transactionId,
                clientSecret,
                cardDetails,
                pointsAmount,
            );
        }

        // Native fallback — Stripe React Native SDK not yet integrated
        console.warn(
            "[STRIPE] Native Stripe SDK not yet integrated. " +
                "Falling back to server-side confirmation.",
        );
        return this.fallbackConfirm(transactionId, pointsAmount);
    }

    /**
     * Web: Use Stripe.js to confirm the PaymentIntent with card details
     */
    private async confirmPaymentWeb(
        transactionId: string,
        clientSecret: string,
        cardDetails: CardDetails,
        pointsAmount: number,
    ): Promise<PaymentResult> {
        const stripe = await getStripe();

        if (!stripe) {
            // Stripe.js not available — fall back to server-side confirm
            console.warn(
                "[STRIPE] Stripe.js not loaded, using server-side confirmation",
            );
            return this.fallbackConfirm(transactionId, pointsAmount);
        }

        try {
            // Parse expiry "MM/YY" → month, year
            const [expMonth, expYear] = cardDetails.expiry
                .split("/")
                .map((s: string) => parseInt(s.trim(), 10));

            // Confirm the PaymentIntent with raw card details
            const { error, paymentIntent } = await stripe.confirmCardPayment(
                clientSecret,
                {
                    payment_method: {
                        card: {
                            number: cardDetails.number.replace(/\s/g, ""),
                            exp_month: expMonth,
                            exp_year: expYear < 100 ? 2000 + expYear : expYear,
                            cvc: cardDetails.cvc,
                        },
                        billing_details: {
                            name: cardDetails.name || undefined,
                        },
                    },
                },
            );

            if (error) {
                console.error("[STRIPE] Payment failed:", error.message);
                return {
                    success: false,
                    pointsAmount: 0,
                    transactionId,
                    error: error.message ||
                        "Payment failed. Please check your card details.",
                };
            }

            if (
                paymentIntent?.status === "succeeded" ||
                paymentIntent?.status === "requires_capture"
            ) {
                // Payment succeeded! The Stripe webhook will credit points server-side.
                // We also call confirm-payment for optimistic balance update.
                const { data: confirmData } = await supabase.functions.invoke(
                    "confirm-payment",
                    { body: { paymentTransactionId: transactionId } },
                );

                return {
                    success: true,
                    pointsAmount: confirmData?.pointsAmount || pointsAmount,
                    newBalance: confirmData?.newBalance,
                    transactionId,
                };
            }

            return {
                success: false,
                pointsAmount: 0,
                transactionId,
                error:
                    `Payment requires additional action (status: ${paymentIntent?.status})`,
            };
        } catch (err) {
            const message = err instanceof Error
                ? err.message
                : "Payment confirmation failed";
            console.error("[STRIPE] Unexpected error:", err);
            return {
                success: false,
                pointsAmount: 0,
                transactionId,
                error: message,
            };
        }
    }

    /**
     * Fallback: call confirm-payment edge function directly
     * (used when Stripe.js is not available or on native)
     */
    private async fallbackConfirm(
        transactionId: string,
        pointsAmount: number,
    ): Promise<PaymentResult> {
        try {
            const { data, error } = await supabase.functions.invoke(
                "confirm-payment",
                { body: { paymentTransactionId: transactionId } },
            );

            if (error) {
                return {
                    success: false,
                    pointsAmount: 0,
                    transactionId,
                    error: error.message || "Payment confirmation failed",
                };
            }

            return {
                success: true,
                pointsAmount: data?.pointsAmount || pointsAmount,
                newBalance: data?.newBalance,
                transactionId,
            };
        } catch (err) {
            const message = err instanceof Error
                ? err.message
                : "Payment confirmation failed";
            return {
                success: false,
                pointsAmount: 0,
                transactionId,
                error: message,
            };
        }
    }
}
