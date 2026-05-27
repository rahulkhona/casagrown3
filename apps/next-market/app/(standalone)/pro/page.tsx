'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '../../../lib/useAuth'
import { useSubscription } from '../../../lib/useSubscription'
import { createClient } from '../../../lib/supabase'
import { LoadingSpinner } from '../../components/LoadingSpinner'
import { FacebookStatus } from '../../components/FacebookStatus'
import { GrowBotSettings } from '../../components/GrowBotSettings'
import { StripeCheckoutModal } from '../../components/StripeCheckoutModal'
import { useErrorToast } from '../../components/ErrorToast'

/**
 * /pro — Web-only Pro onboarding page (linked from email CTA only).
 * 
 * User already clicked "Activate" in the email — show payment directly.
 * After payment → configure Facebook + GrowBot.
 */
function ProPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading, isAuthenticated } = useAuth()
  const { isPro, loading: subLoading } = useSubscription()
  const { showSuccess } = useErrorToast()
  const supabase = createClient()

  const [showCheckout, setShowCheckout] = useState(false)
  const [pricing, setPricing] = useState({ price: 10, trialDays: 0, proFee: 2 })

  const upgraded = searchParams.get('pro') === 'success' || searchParams.get('upgraded') === 'true'



  // Fetch pricing from platform_settings
  useEffect(() => {
    supabase
      .from('platform_settings')
      .select('pro_monthly_price_usd, pro_free_trial_days, pro_platform_fee')
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data) {
          setPricing({
            price: data.pro_monthly_price_usd ?? 10,
            trialDays: data.pro_free_trial_days ?? 0,
            proFee: ((data.pro_platform_fee ?? 0.02) * 100),
          })
        }
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Confirm checkout when returning from Stripe
  useEffect(() => {
    if (!user || !upgraded) return
    const sessionId = searchParams.get('session_id')
    supabase.functions.invoke('manage-subscription', {
      body: { action: 'confirm', session_id: sessionId },
    }).then(({ data }) => {
      if (data?.isPro) {
        showSuccess('🎉 Pro activated!')
      }
    })
  }, [user, upgraded]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-open checkout when page loads (user is ready to pay)
  useEffect(() => {
    if (user && !upgraded && !isPro && !subLoading) {
      setShowCheckout(true)
    }
  }, [user, upgraded, isPro, subLoading])

  // Redirects
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/login?redirect=/pro')
    }
  }, [authLoading, isAuthenticated, router])

  useEffect(() => {
    if (!subLoading && isPro && !upgraded) {
      router.replace('/pro-manage')
    }
  }, [isPro, subLoading, upgraded, router])

  if (authLoading) {
    return <LoadingSpinner message="Loading..." />
  }

  if (!isAuthenticated || !user) {
    return <LoadingSpinner message="Redirecting to sign in…" />
  }

  if (isPro && !upgraded) {
    return <LoadingSpinner message="Redirecting…" />
  }

  // Post-checkout: configure features
  if (upgraded) {
    return (
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '24px 20px 60px' }}>
        <div style={{
          background: 'linear-gradient(135deg, #065f46, #059669)',
          borderRadius: 16, padding: '20px 24px', color: 'white',
          marginBottom: 24, textAlign: 'center',
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🎉</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>
            Welcome to CasaGrown Pro!
          </h1>
          <p style={{ fontSize: 14, opacity: 0.9, margin: 0 }}>
            Now let&apos;s set up your Pro features
          </p>
        </div>

        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 8px', color: '#111827', display: 'flex', alignItems: 'center', gap: 6 }}>
            📘 Facebook Page Connection
          </h3>
          <FacebookStatus />
        </div>

        <div style={{ marginBottom: 20 }}>
          <GrowBotSettings userId={user.id} isPro={true} />
        </div>

        <button
          onClick={() => router.push('/create-listing')}
          style={{
            width: '100%', padding: 16, borderRadius: 12, border: 'none',
            background: 'linear-gradient(135deg, #065f46, #059669)',
            color: 'white', fontSize: 16, fontWeight: 700, cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(5, 150, 105, 0.3)',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(5, 150, 105, 0.4)' }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(5, 150, 105, 0.3)' }}
        >
          🚀 Start Selling
        </button>
      </div>
    )
  }

  // Payment page — auto-opens StripeCheckoutModal
  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '24px 20px 60px' }}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🚜</div>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 4px', color: '#111827' }}>
          Activate CasaGrown Pro
        </h1>
        <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>
          Complete payment to unlock all Pro features
        </p>
      </div>

      <div style={{
        padding: '14px 18px', background: '#f0fdf4', borderRadius: 12,
        border: '1px solid #bbf7d0', marginBottom: 16,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#065f46' }}>CasaGrown Pro — Monthly</span>
          <div>
            <span style={{ fontSize: 24, fontWeight: 700, color: '#065f46' }}>${pricing.price}</span>
            <span style={{ fontSize: 13, color: '#6b7280' }}>/mo</span>
          </div>
        </div>
        <p style={{ fontSize: 12, color: '#6b7280', margin: '6px 0 0', lineHeight: 1.5 }}>
          {pricing.trialDays > 0 ? `${pricing.trialDays}-day free trial · ` : ''}{pricing.proFee}% platform fee per sale · Cancel anytime
        </p>
      </div>

      <div style={{
        margin: '0 0 16px', padding: '8px 14px', textAlign: 'center',
        borderRadius: 8, border: '1px dashed #22c55e',
      }}>
        <p style={{ margin: 0, fontSize: 12, color: '#22c55e', fontWeight: 600 }}>
          🌱 Early adopters lock in this price forever
        </p>
      </div>

      <p style={{ margin: '0 0 0', fontSize: 12, color: '#9ca3af', textAlign: 'center', lineHeight: 1.6 }}>
        🛡️ Month-to-month · Cancel anytime · Full refund within 7 days
      </p>

      {showCheckout && (
        <StripeCheckoutModal
          onClose={() => setShowCheckout(false)}
          onComplete={() => {
            setShowCheckout(false)
            showSuccess('🎉 Pro activated!')
            router.push('/pro?upgraded=true')
          }}
          returnPath="/pro"
        />
      )}
    </div>
  )
}

export default function ProPage() {
  return (
    <Suspense fallback={<div style={{ padding: 80, textAlign: 'center' }}>Loading...</div>}>
      <ProPageInner />
    </Suspense>
  )
}
