/**
 * Stripe Payment Service — real Stripe integration via Supabase Edge Functions.
 *
 * Flow:
 *  1. createPaymentIntent → calls edge function with provider='stripe'
 *     → creates Stripe PaymentIntent + payment_transactions record
 *  2. confirmPayment → uses Stripe SDK to confirm card payment
 *     → Stripe webhook calls confirm-payment to credit points (server-side)
 *     → Frontend also calls confirm-payment for optimistic update
 *
 * The webhook is the source of truth: even if the app is killed after step 2,
 * the webhook will still credit points.
 */

import type {
    CardDetails,
    CreatePaymentIntentResult,
    PaymentResult,
    PaymentService,
} from "./paymentService";
import { supabase } from "../../utils/supabase";

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
        _cardDetails: CardDetails,
        pointsAmount: number,
    ): Promise<PaymentResult> {
        // TODO: When Stripe Elements are integrated, this will use:
        //
        // Web:
        //   const stripe = await loadStripe(STRIPE_PUBLISHABLE_KEY)
        //   const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        //     payment_method: { card: cardElement }
        //   })
        //
        // Native (React Native):
        //   const { error, paymentIntent } = await confirmPayment(clientSecret, {
        //     paymentMethodType: 'Card',
        //   })
        //
        // After Stripe confirms, the webhook will credit points server-side.
        // The frontend also calls confirm-payment for optimistic balance update:
        //
        //   const { data } = await supabase.functions.invoke('confirm-payment', {
        //     body: { paymentTransactionId: transactionId },
        //   })

        console.warn(
            "[STRIPE] confirmPayment called but Stripe Elements are not yet integrated. " +
                "Set PAYMENT_MODE=mock for testing.",
        );

        return {
            success: false,
            pointsAmount: 0,
            transactionId,
            error:
                "Stripe payment confirmation is not yet implemented. Use mock mode for testing.",
        };
    }
}
