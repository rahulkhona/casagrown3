/**
 * usePaymentService — React hook for processing payments.
 *
 * Wraps the PaymentService abstraction with React state management.
 * Points are credited SERVER-SIDE (via edge functions), not on the frontend.
 *
 * Usage:
 *   const { processPayment, isProcessing, error, isMock } = usePaymentService()
 *   const result = await processPayment(totalCents, pointsAmount, serviceFeeCents, cardDetails)
 */

import { useCallback, useRef, useState } from "react";
import {
    type CardDetails,
    getPaymentService,
    isMockPaymentMode,
    type PaymentResult,
} from "../features/feed/paymentService";

export type PaymentStatus =
    | "idle"
    | "creating"
    | "confirming"
    | "success"
    | "error";

interface UsePaymentServiceReturn {
    /** Process a payment end-to-end (create intent → confirm → server credits points) */
    processPayment: (
        totalCents: number,
        pointsAmount: number,
        serviceFeeCents: number,
        cardDetails: CardDetails,
    ) => Promise<PaymentResult>;
    /** Current payment status */
    status: PaymentStatus;
    /** Convenience: true when status is 'creating' or 'confirming' */
    isProcessing: boolean;
    /** Error message if payment failed */
    error: string | null;
    /** Whether we're running in mock mode */
    isMock: boolean;
    /** Reset state back to idle */
    reset: () => void;
}

export function usePaymentService(): UsePaymentServiceReturn {
    const [status, setStatus] = useState<PaymentStatus>("idle");
    const [error, setError] = useState<string | null>(null);
    const isMock = isMockPaymentMode();
    const processingRef = useRef(false);

    const reset = useCallback(() => {
        setStatus("idle");
        setError(null);
        processingRef.current = false;
    }, []);

    const processPayment = useCallback(
        async (
            totalCents: number,
            pointsAmount: number,
            serviceFeeCents: number,
            cardDetails: CardDetails,
        ): Promise<PaymentResult> => {
            // Prevent double-submission
            if (processingRef.current) {
                return {
                    success: false,
                    pointsAmount: 0,
                    transactionId: null,
                    error: "Payment already in progress",
                };
            }

            processingRef.current = true;
            setError(null);

            try {
                // Step 1: Create payment intent + server-side transaction record
                setStatus("creating");
                const service = getPaymentService();
                const { clientSecret, transactionId } = await service
                    .createPaymentIntent(
                        totalCents,
                        pointsAmount,
                        serviceFeeCents,
                    );

                // Step 2: Confirm payment (mock: calls confirm-payment, stripe: Stripe SDK + webhook)
                setStatus("confirming");
                const result = await service.confirmPayment(
                    transactionId,
                    clientSecret,
                    cardDetails,
                    pointsAmount,
                );

                if (result.success) {
                    setStatus("success");
                } else {
                    setStatus("error");
                    setError(result.error || "Payment failed");
                }

                return result;
            } catch (err: unknown) {
                const message = err instanceof Error
                    ? err.message
                    : "An unexpected error occurred";
                setStatus("error");
                setError(message);
                return {
                    success: false,
                    pointsAmount: 0,
                    transactionId: null,
                    error: message,
                };
            } finally {
                processingRef.current = false;
            }
        },
        [],
    );

    return {
        processPayment,
        status,
        isProcessing: status === "creating" || status === "confirming",
        error,
        isMock,
        reset,
    };
}
