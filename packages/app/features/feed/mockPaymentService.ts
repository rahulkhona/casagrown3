/**
 * Mock Payment Service — uses the SAME server-side flow as Stripe.
 *
 * Instead of hitting Stripe, it:
 *  1. createPaymentIntent → calls the edge function with provider='mock'
 *     (this creates a payment_transactions record)
 *  2. confirmPayment → simulates 2s delay, then calls confirm-payment edge function
 *     (this credits points via point_ledger — same as webhook would)
 *
 * This ensures the mock exercises the exact same backend path as production.
 */

import type {
    CardDetails,
    CreatePaymentIntentResult,
    PaymentResult,
    PaymentService,
} from "./paymentService";
import { supabase } from "../../features/auth/auth-hook";

export class MockPaymentService implements PaymentService {
    async createPaymentIntent(
        amountCents: number,
        pointsAmount: number,
        serviceFeeCents: number,
    ): Promise<CreatePaymentIntentResult> {
        console.log(
            `[MOCK PAYMENT] createPaymentIntent: $${
                (amountCents / 100).toFixed(2)
            }, ` +
                `points=${pointsAmount}, fee=$${
                    (serviceFeeCents / 100).toFixed(2)
                }`,
        );

        const { data, error } = await supabase.functions.invoke(
            "create-payment-intent",
            {
                body: {
                    amountCents,
                    pointsAmount,
                    serviceFeeCents,
                    provider: "mock",
                },
            },
        );

        if (error || !data?.clientSecret) {
            // Log detailed error info to help debug Android issues
            console.error("[MOCK PAYMENT] ❌ createPaymentIntent error:", {
                errorName: error?.name,
                errorMessage: error?.message,
                hasContext: !!error?.context,
                contextStatus: error?.context?.status,
                data,
            });
            // Try to read the response body for relay errors
            let bodyText = "";
            try {
                if (
                    error?.context && typeof error.context.text === "function"
                ) {
                    bodyText = await error.context.text();
                    console.error(
                        "[MOCK PAYMENT] Error response body:",
                        bodyText,
                    );
                }
            } catch { /* ignore */ }
            throw new Error(
                bodyText || error?.message ||
                    "Failed to create mock payment intent",
            );
        }

        console.log(
            `[MOCK PAYMENT] Transaction created: ${data.transactionId}, secret: ${data.clientSecret}`,
        );

        return {
            clientSecret: data.clientSecret,
            transactionId: data.transactionId,
            provider: "mock",
        };
    }

    async confirmPayment(
        transactionId: string,
        _clientSecret: string,
        cardDetails: CardDetails,
        pointsAmount: number,
    ): Promise<PaymentResult> {
        console.log(
            `[MOCK PAYMENT] confirmPayment: txn=${transactionId}, card=****${
                cardDetails.number.slice(-4)
            }, points=${pointsAmount}`,
        );

        // Simulate processing delay (2 seconds)
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Call confirm-payment edge function — same as webhook would
        const { data, error } = await supabase.functions.invoke(
            "confirm-payment",
            {
                body: { paymentTransactionId: transactionId },
            },
        );

        if (error || !data?.success) {
            console.error(
                "[MOCK PAYMENT] ❌ Server-side confirmation failed:",
                { errorName: error?.name, errorMessage: error?.message, data },
            );
            // Try to read the response body for relay errors
            let bodyText = "";
            try {
                if (
                    error?.context && typeof error.context.text === "function"
                ) {
                    bodyText = await error.context.text();
                    console.error(
                        "[MOCK PAYMENT] Confirm error response body:",
                        bodyText,
                    );
                }
            } catch { /* ignore */ }
            return {
                success: false,
                pointsAmount: 0,
                transactionId,
                error: bodyText || error?.message || data?.error ||
                    "Server-side confirmation failed",
            };
        }

        console.log(
            `[MOCK PAYMENT] ✅ Points credited: +${data.pointsAmount}, newBalance: ${data.newBalance}`,
        );

        return {
            success: true,
            pointsAmount: data.pointsAmount,
            newBalance: data.newBalance,
            transactionId,
        };
    }
}
