'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '../../../lib/useAuth'
import { createClient } from '../../../lib/supabase'
import { useSubscription } from '../../../lib/useSubscription'
import { LoadingSpinner } from '../../components/LoadingSpinner'
import { useErrorToast } from '../../components/ErrorToast'
import { ProCarousel } from '../../components/ProCarousel'
import { FacebookStatus } from '../../components/FacebookStatus'
import { GrowBotSettings } from '../../components/GrowBotSettings'
import { useProEnabled } from '../../../lib/useProEnabled'

function ProManagePageInner() {
  const router = useRouter()
  const { user, loading: authLoading, isAuthenticated } = useAuth()
  const { isPro, plan, status, trialEndsAt, currentPeriodEnd, canceledAt, loading: subLoading } = useSubscription()
  const { showSuccess, showError } = useErrorToast()
  const supabase = createClient()

  const [actionLoading, setActionLoading] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [proInterestSending, setProInterestSending] = useState(false)
  const [proInterestSent, setProInterestSent] = useState(false)

  // ── Auth guard ──
  if (authLoading || subLoading) {
    return <LoadingSpinner message="Loading subscription…" />
  }

  if (!isAuthenticated || !user) {
    router.replace('/login?redirect=/pro-manage')
    return <LoadingSpinner message="Redirecting to sign in…" />
  }

  // ── Helpers ──
  const isCancelPending = isPro && !!canceledAt

  const handleCancel = async () => {
    setActionLoading(true)
    try {
      const { error } = await supabase.functions.invoke('manage-subscription', {
        body: { action: 'cancel' },
      })
      if (error) throw error
      setShowConfirm(false)
      showSuccess(`Your ${plan === 'elite' ? 'Elite' : 'Pro'} subscription has been scheduled for cancellation.`)
      setTimeout(() => window.location.reload(), 1200)
    } catch (err: any) {
      console.error('Cancel failed:', err)
      showError('Failed to cancel subscription. Please try again.')
      setActionLoading(false)
      setShowConfirm(false)
    }
  }

  const handleResume = async () => {
    setActionLoading(true)
    try {
      const { error } = await supabase.functions.invoke('manage-subscription', {
        body: { action: 'resume' },
      })
      if (error) throw error
      showSuccess(`Your ${plan === 'elite' ? 'Elite' : 'Pro'} subscription has been resumed! 🎉`)
      setTimeout(() => window.location.reload(), 1200)
    } catch (err: any) {
      console.error('Resume failed:', err)
      showError('Failed to resume subscription. Please try again.')
      setActionLoading(false)
    }
  }

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })

  // ── 1. Lite (Non-Pro) view ──
  if (!isPro) {
    return (
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '40px 20px' }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 4px', color: '#111827', letterSpacing: '-0.5px' }}>
            Subscription Settings
          </h1>
          <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>
            Manage your packages and subscription settings
          </p>
        </div>

        {/* Current Plan Card */}
        <div style={{
          background: 'rgba(255,255,255,0.6)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(229, 231, 235, 0.5)',
          borderRadius: 20,
          padding: 24,
          marginBottom: 28,
          boxShadow: '0 10px 30px rgba(0,0,0,0.04)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#047857', background: '#ecfdf5', padding: '4px 12px', borderRadius: 9999 }}>
              🚜 Active Plan
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#6b7280' }}>$0/mo</span>
          </div>
          <h3 style={{ fontSize: 20, fontWeight: 800, color: '#111827', margin: '0 0 8px' }}>Lite Base Plan</h3>
          <p style={{ fontSize: 14, color: '#4b5563', margin: '0 0 16px', lineHeight: 1.5 }}>
            Includes 1 active produce stand with standard checkout and a 10% platform sales fee. Upgrade anytime to unlock advanced features!
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: '#4b5563', borderTop: '1px dashed #e5e7eb', paddingTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Sales Platform Fee:</span>
              <strong style={{ color: '#111827' }}>10%</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Active Stands Limit:</span>
              <strong style={{ color: '#111827' }}>1 Stand</strong>
            </div>
          </div>
        </div>

        {/* Upgrade Call to Action */}
        <div style={{
          background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
          borderRadius: 20,
          padding: 24,
          border: '1px solid #a7f3d0',
          boxShadow: '0 10px 30px rgba(4, 120, 87, 0.08)',
          marginBottom: 28
        }}>
          <h3 style={{ fontSize: 18, fontWeight: 800, color: '#065f46', margin: '0 0 8px' }}>⚡ Upgrade to Pro or Elite</h3>
          <p style={{ fontSize: 14, color: '#047857', margin: '0 0 20px', lineHeight: 1.5 }}>
            Unlock multiple stands (up to Unlimited!), dynamic platform fee reductions down to **2%**, GrowBot AI Sales Copilot, and automated Facebook marketplace catalog syncing!
          </p>
          <button
            onClick={() => router.push('/pro?ref=pro-manage')}
            style={{
              padding: '14px 28px', borderRadius: 14, border: 'none',
              background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
              color: 'white', fontWeight: 800, fontSize: 15,
              cursor: 'pointer',
              boxShadow: '0 8px 20px rgba(5, 150, 105, 0.3)',
              transition: 'all 0.2s ease',
              width: '100%',
            }}
          >
            Explore Premium Tiers →
          </button>
        </div>

        {/* Carousel features summary */}
        <ProCarousel compact />

        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <button
            onClick={async () => {
              setProInterestSending(true)
              try {
                await supabase.functions.invoke('send-pro-interest-email', { body: {} })
                showSuccess('📧 Details sent — check your inbox!')
                setProInterestSent(true)
              } catch {
                // Silently fail
              } finally {
                setProInterestSending(false)
              }
            }}
            disabled={proInterestSent || proInterestSending}
            style={{
              background: 'none', border: 'none', color: '#059669', fontWeight: 600, fontSize: 13,
              cursor: proInterestSent || proInterestSending ? 'not-allowed' : 'pointer',
              textDecoration: 'underline'
            }}
          >
            {proInterestSending ? 'Sending features guide...' : proInterestSent ? 'Guide sent — check your inbox!' : 'Send me the features guide via email'}
          </button>
        </div>
      </div>
    )
  }

  // ── 2. Paid (Pro/Elite) view ──
  const isElitePlan = plan === 'elite'
  const planDisplayName = isElitePlan ? 'Elite grower' : 'Pro grower'
  const planHeaderTitle = isElitePlan ? '🚜 CasaGrown Elite' : '🚜 CasaGrown Pro'
  const planFeeLabel = isElitePlan ? '2%' : '5%'
  const planStandsLimitLabel = isElitePlan ? 'Unlimited Stands' : '3 Stands'
  const planPriceLabel = isElitePlan ? '$29/mo' : '$10/mo'

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '40px 20px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 4px', color: '#111827' }}>
          Manage Subscription
        </h1>
        <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>
          Your CasaGrown subscription and premium settings
        </p>
      </div>

      {/* Subscription status card */}
      <div style={{
        background: isCancelPending
          ? 'linear-gradient(135deg, #92400e, #b45309)'
          : isElitePlan
            ? 'linear-gradient(135deg, #1e3a8a, #3b82f6)'
            : 'linear-gradient(135deg, #065f46, #059669)',
        borderRadius: 16, padding: 20, color: 'white',
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
      }}>
        {/* Badge + action row */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexWrap: 'wrap', gap: 12,
        }}>
          <div>
            <span style={{ fontSize: 18, fontWeight: 700 }}>{planHeaderTitle}</span>
            <span style={{
              marginLeft: 8, fontSize: 11, padding: '2px 8px', borderRadius: 6,
              background: 'rgba(255,255,255,0.2)',
            }}>
              {isCancelPending
                ? '⏳ Cancels soon'
                : status === 'trialing' ? '🎉 Trial' : '✓ Active'}
            </span>
          </div>

          {isCancelPending ? (
            <button
              onClick={handleResume}
              disabled={actionLoading}
              style={{
                padding: '8px 18px', borderRadius: 8, border: 'none',
                background: 'white', color: isElitePlan ? '#1e3a8a' : '#065f46',
                fontSize: 13, fontWeight: 700,
                cursor: actionLoading ? 'wait' : 'pointer',
                opacity: actionLoading ? 0.7 : 1,
              }}
            >
              {actionLoading ? 'Resuming…' : `↩ Resume ${isElitePlan ? 'Elite' : 'Pro'}`}
            </button>
          ) : (
            <button
              onClick={() => setShowConfirm(true)}
              disabled={actionLoading}
              style={{
                padding: '8px 18px', borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.3)',
                background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)',
                fontSize: 13, cursor: actionLoading ? 'wait' : 'pointer',
              }}
            >
              Cancel Subscription
            </button>
          )}
        </div>

        {/* Plan configuration info */}
        <div style={{
          margin: '16px 0 0', padding: '12px 14px', borderRadius: 12,
          background: 'rgba(255,255,255,0.12)', fontSize: 13,
          display: 'flex', flexDirection: 'column', gap: 8
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Monthly Subscription Fee:</span>
            <strong style={{ fontWeight: 700 }}>{planPriceLabel}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Sales Platform Fee:</span>
            <strong style={{ fontWeight: 700 }}>{planFeeLabel}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Active Stands Limit:</span>
            <strong style={{ fontWeight: 700 }}>{planStandsLimitLabel}</strong>
          </div>
        </div>

        {/* Cancel pending info */}
        {isCancelPending && currentPeriodEnd && (
          <div style={{
            margin: '16px 0 0', padding: '14px 16px', borderRadius: 12,
            background: 'rgba(255,255,255,0.15)', fontSize: 13,
          }}>
            <div style={{ marginBottom: 8 }}>
              ⚠️ Your premium subscription will <strong>permanently cancel on{' '}
              {formatDate(currentPeriodEnd)}</strong>
            </div>
            <div style={{ fontSize: 12, opacity: 0.9, marginBottom: 8 }}>
              After that date, premium features will be disabled and your booth creation limit will revert to 1.
            </div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              Changed your mind? Click <strong>&quot;↩ Resume&quot;</strong> above
              to keep your premium subscription active.
            </div>
          </div>
        )}

        {/* Trial info */}
        {!isCancelPending && status === 'trialing' && trialEndsAt && (
          <div style={{
            margin: '12px 0 0', padding: '10px 14px', borderRadius: 10,
            background: 'rgba(255,255,255,0.12)', fontSize: 13,
          }}>
            🎉 Your trial ends on <strong>{formatDate(trialEndsAt)}</strong>
          </div>
        )}

        {/* Active billing info */}
        {!isCancelPending && currentPeriodEnd && status === 'active' && (
          <div style={{
            margin: '12px 0 0', padding: '10px 14px', borderRadius: 10,
            background: 'rgba(255,255,255,0.12)', fontSize: 13,
          }}>
            Next billing date: <strong>{formatDate(currentPeriodEnd)}</strong>
          </div>
        )}
      </div>

      {/* Elite Upgrade pitch if they are currently on Pro */}
      {plan === 'pro' && !isCancelPending && (
        <div style={{
          background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
          borderRadius: 16,
          padding: 20,
          border: '1px solid #bfdbfe',
          boxShadow: '0 4px 16px rgba(30, 58, 138, 0.05)',
          marginTop: 24,
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, color: '#1e3a8a', margin: '0 0 6px' }}>👑 Upgrade to Elite Package</h3>
          <p style={{ fontSize: 13, color: '#2563eb', margin: '0 0 14px', lineHeight: 1.4 }}>
            Reduce your transaction sales fee from 5% to just **2%**, unlock **Unlimited stands/booths**, and enable custom store branding!
          </p>
          <button
            onClick={() => router.push('/pro?ref=pro-manage')}
            style={{
              padding: '10px 20px', borderRadius: 10, border: 'none',
              background: '#2563eb', color: 'white', fontWeight: 700, fontSize: 13,
              cursor: 'pointer', transition: 'all 0.2s ease', width: '100%'
            }}
          >
            Upgrade to Elite for $29/mo →
          </button>
        </div>
      )}

      {/* ── Facebook Page Connection ── */}
      <div style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px', color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
          📘 Facebook Page
        </h2>
        <FacebookStatus />
      </div>

      {/* ── GrowBot Settings ── */}
      <div style={{ marginTop: 28 }}>
        <GrowBotSettings userId={user.id} isPro={isPro} plan={plan} />
      </div>


      {/* ── Cancel confirmation modal ── */}
      {showConfirm && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
            padding: 16, animation: 'fadeIn 0.2s ease',
          }}
          onClick={() => setShowConfirm(false)}
        >
          <div
            style={{
              background: 'white', borderRadius: 20, padding: '28px 24px',
              maxWidth: 360, width: '100%', textAlign: 'center',
              boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
              animation: 'slideUp 0.3s ease',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              width: 64, height: 64, borderRadius: '50%', margin: '0 auto 16px',
              background: '#fef2f2', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 28,
            }}>
              😢
            </div>
            <h3 style={{
              fontSize: 18, fontWeight: 700, margin: '0 0 8px', color: '#111827',
            }}>
              Cancel Subscription?
            </h3>
            <div style={{
              textAlign: 'left', fontSize: 13, color: '#6b7280', lineHeight: 1.6,
              margin: '16px 0', padding: '12px 16px',
              background: '#f9fafb', borderRadius: 12,
            }}>
              <div style={{ marginBottom: 6 }}>✓ Premium features stay active until your billing period ends</div>
              <div style={{ marginBottom: 6 }}>✓ You can resume anytime before the period ends</div>
              <div>✓ Full refund available within the first 7 days</div>
            </div>
            <button
              onClick={handleCancel}
              disabled={actionLoading}
              style={{
                width: '100%', padding: 14, border: 'none', borderRadius: 9999,
                background: '#dc2626', color: 'white', fontSize: 15, fontWeight: 600,
                cursor: actionLoading ? 'wait' : 'pointer',
                opacity: actionLoading ? 0.7 : 1,
                marginBottom: 8,
              }}
            >
              {actionLoading ? 'Cancelling…' : 'Yes, Cancel Premium'}
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              style={{
                width: '100%', padding: 10, border: 'none', borderRadius: 9999,
                background: 'transparent', color: '#9ca3af', fontSize: 13,
                fontWeight: 500, cursor: 'pointer',
              }}
            >
              Never mind, keep active
            </button>
          </div>
        </div>
      )}

      {/* ── Animations ── */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  )
}

export default function ProManagePage() {
  return (
    <Suspense fallback={<div style={{ padding: 80, textAlign: 'center' }}>Loading...</div>}>
      <ProManagePageInner />
    </Suspense>
  )
}
