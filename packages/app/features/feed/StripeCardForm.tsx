/**
 * StripeCardForm — Web-only component using Stripe Elements
 *
 * Wraps Stripe's CardElement in the Elements provider.
 * Exposes an imperative confirm method via ref.
 *
 * Usage:
 *   <StripeCardForm ref={stripeFormRef} onReady={setCardReady} />
 *   // Later: const result = await stripeFormRef.current.confirmPayment(clientSecret)
 */

'use client'

import React, { forwardRef, useImperativeHandle, useRef, useState, useCallback } from 'react'
import { loadStripe, type Stripe } from '@stripe/stripe-js'
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'

// Lazy-load Stripe instance
const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ''
)

export interface StripeCardFormHandle {
  confirmPayment: (clientSecret: string) => Promise<{
    success: boolean
    error?: string
  }>
}

interface StripeCardFormProps {
  onReady?: (ready: boolean) => void
  onError?: (error: string) => void
}

/** Inner component that has access to Stripe hooks */
const StripeCardInner = forwardRef<StripeCardFormHandle, StripeCardFormProps>(
  function StripeCardInner({ onReady, onError }, ref) {
    const stripe = useStripe()
    const elements = useElements()
    const [cardComplete, setCardComplete] = useState(false)

    useImperativeHandle(ref, () => ({
      async confirmPayment(clientSecret: string) {
        if (!stripe || !elements) {
          return { success: false, error: 'Stripe not loaded' }
        }

        const cardElement = elements.getElement(CardElement)
        if (!cardElement) {
          return { success: false, error: 'Card element not found' }
        }

        const { error, paymentIntent } = await stripe.confirmCardPayment(
          clientSecret,
          { payment_method: { card: cardElement } }
        )

        if (error) {
          return { success: false, error: error.message || 'Payment failed' }
        }

        if (paymentIntent?.status === 'succeeded') {
          return { success: true }
        }

        return {
          success: false,
          error: `Unexpected status: ${paymentIntent?.status}`,
        }
      },
    }), [stripe, elements])

    const handleChange = useCallback((event: any) => {
      setCardComplete(event.complete)
      onReady?.(event.complete)
      if (event.error) {
        onError?.(event.error.message)
      }
    }, [onReady, onError])

    return (
      <div style={{ width: '100%' }}>
        <CardElement
          onChange={handleChange}
          options={{
            style: {
              base: {
                fontSize: '15px',
                fontFamily: 'Inter, system-ui, sans-serif',
                color: '#1f2937',
                '::placeholder': { color: '#9ca3af' },
                iconColor: '#6b7280',
                lineHeight: '24px',
              },
              invalid: {
                color: '#dc2626',
                iconColor: '#dc2626',
              },
            },
            hidePostalCode: true,
          }}
        />
      </div>
    )
  }
)

/** Outer component that provides the Elements context */
export const StripeCardForm = forwardRef<StripeCardFormHandle, StripeCardFormProps>(
  function StripeCardForm(props, ref) {
    return (
      <Elements stripe={stripePromise} options={{
        appearance: {
          theme: 'stripe',
          variables: {
            fontFamily: 'Inter, system-ui, sans-serif',
            borderRadius: '8px',
          },
        },
      }}>
        <StripeCardInner ref={ref} {...props} />
      </Elements>
    )
  }
)
