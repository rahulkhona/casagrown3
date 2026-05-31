'use client'

import { useEffect, useRef, useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { createClient } from '../../lib/supabase'

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ''
)

interface StripeCheckoutModalProps {
  onClose: () => void
  onComplete?: (sessionId: string) => void
  returnPath?: string
  plan?: 'pro' | 'elite'
}

/**
 * StripeCheckoutModal — Renders Stripe Embedded Checkout as a full-screen
 * modal overlay. The app's navigation stays visible underneath.
 */
export function StripeCheckoutModal({ onClose, onComplete, returnPath, plan }: StripeCheckoutModalProps) {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)
  const checkoutRef = useRef<any>(null)

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      try {
        const supabase = createClient()
        const { data, error: fnError } = await supabase.functions.invoke('manage-subscription', {
          body: { action: 'checkout', plan: plan || 'pro', return_path: returnPath || '/profile' },
        })

        if (cancelled) return

        if (fnError || !data?.clientSecret) {
          setError(data?.error || fnError?.message || 'Failed to start checkout')
          setLoading(false)
          return
        }

        const stripe = await stripePromise
        if (!stripe || cancelled) {
          if (!cancelled) {
            setError('Failed to load Stripe')
            setLoading(false)
          }
          return
        }

        const checkoutOptions: any = {
          clientSecret: data.clientSecret,
        }
        if (onComplete) {
          checkoutOptions.onComplete = onComplete
        }

        const checkout = await stripe.createEmbeddedCheckoutPage(checkoutOptions)

        if (cancelled) {
          checkout.destroy()
          return
        }

        checkoutRef.current = checkout

        if (containerRef.current) {
          checkout.mount(containerRef.current)
        }
        setLoading(false)
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'Something went wrong')
          setLoading(false)
        }
      }
    }

    init()

    return () => {
      cancelled = true
      if (checkoutRef.current) {
        checkoutRef.current.destroy()
        checkoutRef.current = null
      }
    }
  }, [returnPath])

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff', borderRadius: 20,
          maxWidth: 480, width: '100%', maxHeight: '90vh',
          overflow: 'auto', position: 'relative',
          boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
          animation: 'slideUp 0.3s ease',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '16px 20px',
          borderBottom: '1px solid #e5e7eb',
          background: 'linear-gradient(135deg, #065f46, #059669)',
          borderRadius: '20px 20px 0 0',
          color: 'white',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>🚜</span>
            <span style={{ fontSize: 16, fontWeight: 700 }}>CasaGrown Pro</span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%',
              width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'white', fontSize: 18,
            }}
          >
            ✕
          </button>
        </div>

        {/* Stripe Embedded Checkout */}
        <div style={{ minHeight: 300 }}>
          {process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith('pk_test') && (
            <div style={{
              margin: '12px 16px 0', padding: '8px 12px', borderRadius: 8,
              background: '#fef3c7', border: '1px solid #f59e0b',
              fontSize: 12, color: '#92400e', lineHeight: 1.5,
            }}>
              🧪 <strong>Test mode</strong> — Use card <code style={{ background: '#fff', padding: '1px 4px', borderRadius: 3, fontWeight: 700 }}>4242 4242 4242 4242</code>, any future expiry, any CVC
            </div>
          )}
          {loading && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 40, color: '#6b7280', fontSize: 14,
            }}>
              Loading checkout...
            </div>
          )}
          {error && (
            <div style={{
              padding: 20, textAlign: 'center', color: '#dc2626', fontSize: 14,
            }}>
              ⚠️ {error}
            </div>
          )}
          <div ref={containerRef} />
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(30px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
