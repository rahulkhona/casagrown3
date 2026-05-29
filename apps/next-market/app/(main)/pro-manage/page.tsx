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
  const { isPro, status, trialEndsAt, currentPeriodEnd, canceledAt, loading: subLoading } = useSubscription()
  const { showSuccess, showError } = useErrorToast()
  const supabase = createClient()
  const proEnabled = useProEnabled()

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

  // ── Feature flag gate ──
  if (!proEnabled && !isPro) {
    router.replace('/profile')
    return <LoadingSpinner message="Redirecting..." />
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
      showSuccess('Your Pro subscription has been scheduled for cancellation.')
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
      showSuccess('Your Pro subscription has been resumed! 🎉')
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

  // ── Non-Pro view — Carousel + interest email ──
  if (!isPro) {
    return (
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '40px 20px' }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 4px', color: '#111827' }}>
            CasaGrown Pro
          </h1>
          <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>
            Grow your sales with powerful tools
          </p>
        </div>

        <ProCarousel compact />

        {/* Interest button — sends Pro details email */}
        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <button
            onClick={async () => {
              setProInterestSending(true)
              try {
                await supabase.functions.invoke('send-pro-interest-email', { body: {} })
                showSuccess('📧 Check your email for details about CasaGrown Pro!')
                setProInterestSent(true)
              } catch {
                // Silently fail
              } finally {
                setProInterestSending(false)
              }
            }}
            disabled={proInterestSent || proInterestSending}
            style={{
              padding: '14px 28px', borderRadius: 12, border: 'none',
              background: proInterestSent
                ? '#059669'
                : 'linear-gradient(135deg, #065f46 0%, #059669 100%)',
              color: 'white', fontWeight: 700, fontSize: 15,
              cursor: proInterestSent || proInterestSending ? 'not-allowed' : 'pointer',
              opacity: proInterestSending ? 0.7 : 1,
              boxShadow: proInterestSent ? 'none' : '0 4px 12px rgba(5, 150, 105, 0.3)',
              transition: 'all 0.2s ease',
              width: '100%', maxWidth: 400,
            }}
          >
            {proInterestSending ? '✉️ Sending...' : proInterestSent ? '✅ Email sent — check your inbox!' : '🌱 I\u2019m interested in CasaGrown Pro'}
          </button>
        </div>


      </div>
    )
  }

  // ── Pro management view ──
  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '40px 20px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 4px', color: '#111827' }}>
          Manage Pro
        </h1>
        <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>
          Your CasaGrown Pro subscription and settings
        </p>
      </div>

      {/* Pro status card */}
      <div style={{
        background: isCancelPending
          ? 'linear-gradient(135deg, #92400e, #b45309)'
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
            <span style={{ fontSize: 18, fontWeight: 700 }}>🚜 CasaGrown Pro</span>
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
                background: 'white', color: '#065f46',
                fontSize: 13, fontWeight: 700,
                cursor: actionLoading ? 'wait' : 'pointer',
                opacity: actionLoading ? 0.7 : 1,
              }}
            >
              {actionLoading ? 'Resuming…' : '↩ Resume Pro'}
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
              Cancel Pro
            </button>
          )}
        </div>

        {/* Cancel pending info */}
        {isCancelPending && currentPeriodEnd && (
          <div style={{
            margin: '16px 0 0', padding: '14px 16px', borderRadius: 12,
            background: 'rgba(255,255,255,0.15)', fontSize: 13,
          }}>
            <div style={{ marginBottom: 8 }}>
              ⚠️ Your Pro subscription will <strong>permanently cancel on{' '}
              {formatDate(currentPeriodEnd)}</strong>
            </div>
            <div style={{ fontSize: 12, opacity: 0.9, marginBottom: 8 }}>
              After that date, Pro features will be disabled and you&apos;ll need to
              sign up again to re-activate.
            </div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              Changed your mind? Click <strong>&quot;↩ Resume Pro&quot;</strong> above
              to keep your subscription going.
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

      {/* ── Facebook Page Connection ── */}
      <div style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px', color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
          📘 Facebook Page
        </h2>
        <FacebookStatus />
      </div>

      {/* ── GrowBot Settings ── */}
      <div style={{ marginTop: 28 }}>
        <GrowBotSettings userId={user.id} isPro={isPro} />
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
              Cancel CasaGrown Pro?
            </h3>
            <div style={{
              textAlign: 'left', fontSize: 13, color: '#6b7280', lineHeight: 1.6,
              margin: '16px 0', padding: '12px 16px',
              background: '#f9fafb', borderRadius: 12,
            }}>
              <div style={{ marginBottom: 6 }}>✓ Pro features stay active until your billing period ends</div>
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
              {actionLoading ? 'Cancelling…' : 'Yes, Cancel Pro'}
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              style={{
                width: '100%', padding: 10, border: 'none', borderRadius: 9999,
                background: 'transparent', color: '#9ca3af', fontSize: 13,
                fontWeight: 500, cursor: 'pointer',
              }}
            >
              Never mind, keep Pro
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
