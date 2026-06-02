'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../../lib/supabase'
import { ENABLE_ELITE } from '../../../lib/featureFlags'
import { useErrorToast } from '../../components/ErrorToast'
import { LoadingSpinner } from '../../components/LoadingSpinner'
import { StripeCheckoutModal } from '../../components/StripeCheckoutModal'

function ManagePlanPageInner() {
  const router = useRouter()
  const supabase = createClient()
  const { showSuccess, showError } = useErrorToast()

  // ── State ──
  const [step, setStep] = useState<'loading' | 'email' | 'otp' | 'manage'>('loading')
  const [email, setEmail] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // Check if user is already logged in on mount
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setEmail(user.email || '')
        setUserId(user.id)

        // Load subscription data
        const { data: sub } = await supabase
          .from('seller_subscriptions')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle()

        if (sub) {
          setPlan(sub.plan || 'lite')
          setStatus(sub.status || '')
          setCanceledAt(sub.canceled_at || null)
          setCurrentPeriodEnd(sub.current_period_end || null)
          setTrialEndsAt(sub.trial_ends_at || null)
          if (sub.downgrade_to_plan) {
            // Legacy: clear any pending downgrade state
          }
        }

        // Load booths
        const { data: userBooths } = await supabase
          .from('market_booths')
          .select('id, name')
          .eq('owner_id', user.id)
          .eq('is_open', true)
        if (userBooths) setBooths(userBooths)

        setStep('manage')
      } else {
        setStep('email')
      }
    }
    checkAuth()
  }, [])

  // Plan management state
  const [userId, setUserId] = useState('')
  const [plan, setPlan] = useState<string>('lite')
  const [status, setStatus] = useState<string>('')
  const [canceledAt, setCanceledAt] = useState<string | null>(null)
  const [currentPeriodEnd, setCurrentPeriodEnd] = useState<string | null>(null)
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  // Upgrade state
  const [showCheckoutModal, setShowCheckoutModal] = useState(false)
  const [upgradeTarget, setUpgradeTarget] = useState<'pro' | 'elite'>('pro')

  // Booth & downgrade state
  interface BoothInfo { id: string; name: string }
  const [booths, setBooths] = useState<BoothInfo[]>([])
  const [showDowngradeModal, setShowDowngradeModal] = useState(false)
  const [downgradeTarget, setDowngradeTarget] = useState<'lite' | 'pro'>('lite')
  const [selectedBooths, setSelectedBooths] = useState<Set<string>>(new Set())

  const isCancelPending = !!canceledAt
  const isElitePlan = plan === 'elite'
  const isPro = plan === 'pro' || plan === 'elite'
  const planName = isElitePlan ? 'Elite' : plan === 'pro' ? 'Pro' : 'Lite'

  // Check if Elite tier should be visible
  const [isProTester, setIsProTester] = useState(false)
  useEffect(() => {
    if (ENABLE_ELITE) return
    const checkTester = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.email) {
        const { data } = await supabase
          .from('pro_testers')
          .select('email')
          .eq('email', user.email)
          .maybeSingle()
        if (data) setIsProTester(true)
      }
    }
    checkTester()
  }, [])
  // Show Elite if: flag is on, user is pro_tester, or user is already on Elite
  const showElite = ENABLE_ELITE || isProTester || isElitePlan

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    })

  // ── Step 1: Send OTP ──
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setSubmitting(true)
    setErrorMsg('')
    try {
      const { error } = await supabase.auth.signInWithOtp({ email: email.trim() })
      if (error) throw error
      setStep('otp')
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to send verification code.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Step 2: Verify OTP & load plan ──
  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!otpCode.trim()) return
    setSubmitting(true)
    setErrorMsg('')
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otpCode.trim(),
        type: 'email',
      })
      if (error) throw error
      if (!data.user) throw new Error('Verification failed')

      setUserId(data.user.id)

      // Load subscription data
      const { data: sub } = await supabase
        .from('seller_subscriptions')
        .select('*')
        .eq('user_id', data.user.id)
        .maybeSingle()

      if (sub) {
        setPlan(sub.plan || 'lite')
        setStatus(sub.status || '')
        setCanceledAt(sub.canceled_at || null)
        setCurrentPeriodEnd(sub.current_period_end || null)
        setTrialEndsAt(sub.trial_ends_at || null)
      }

      setStep('manage')
    } catch (err: any) {
      setErrorMsg(err.message || 'Invalid code. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Actions ──
  const handleCancel = async () => {
    setActionLoading(true)
    try {
      const { error } = await supabase.functions.invoke('manage-subscription', {
        body: { action: 'cancel' },
      })
      if (error) throw error
      setShowConfirm(false)
      showSuccess(`Your ${planName} plan has been scheduled for cancellation.`)
      setTimeout(() => window.location.reload(), 1200)
    } catch (err: any) {
      showError('Failed to cancel. Please try again.')
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
      showSuccess(`Your ${planName} plan has been resumed! 🎉`)
      setTimeout(() => window.location.reload(), 1200)
    } catch (err: any) {
      showError('Failed to resume. Please try again.')
      setActionLoading(false)
    }
  }

  const handleUpgrade = (targetPlan: 'pro' | 'elite') => {
    setUpgradeTarget(targetPlan)
    setShowCheckoutModal(true)
  }

  const handleCheckoutComplete = async (sessionId: string) => {
    // Confirm the checkout
    try {
      await supabase.functions.invoke('manage-subscription', {
        body: { action: 'confirm', session_id: sessionId, plan: upgradeTarget },
      })
    } catch (err) {
      console.error('Confirm error:', err)
    }
    setShowCheckoutModal(false)
    showSuccess(`Upgraded to ${upgradeTarget === 'elite' ? 'Elite' : 'Pro'}! 🎉`)
    setTimeout(() => window.location.reload(), 1200)
  }

  const startDowngrade = (targetPlan: 'lite' | 'pro') => {
    const boothLimits: Record<string, number> = { lite: 1, pro: 3 }
    const maxBooths = boothLimits[targetPlan]

    if (booths.length > maxBooths) {
      // Need booth selection
      setDowngradeTarget(targetPlan)
      setSelectedBooths(new Set())
      setShowDowngradeModal(true)
    } else {
      // No booth selection needed — confirm directly
      setDowngradeTarget(targetPlan)
      setSelectedBooths(new Set(booths.map(b => b.id)))
      setShowDowngradeModal(true)
    }
  }

  const confirmDowngrade = async () => {
    setActionLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('manage-subscription', {
        body: {
          action: 'downgrade',
          plan: downgradeTarget,
          keep_booth_ids: Array.from(selectedBooths),
        },
      })
      if (error) throw error
      if (data?.success) {
        setShowDowngradeModal(false)
        const archivedMsg = data.archived_booths?.length > 0
          ? ` ${data.archived_booths.length} booth(s) archived: ${data.archived_booths.join(', ')}.`
          : ''
        showSuccess(`${data.message || 'Plan changed.'}${archivedMsg}`)
        setTimeout(() => window.location.reload(), 1500)
      } else if (data?.needs_booth_selection) {
        setShowDowngradeModal(true)
      } else {
        showError(data?.error || 'Failed to downgrade')
      }
    } catch (err: any) {
      showError('Failed to change plan. Please try again.')
    } finally {
      setActionLoading(false)
    }
  }

  const toggleBoothSelection = (boothId: string) => {
    const boothLimits: Record<string, number> = { lite: 1, pro: 3 }
    const maxBooths = boothLimits[downgradeTarget]
    setSelectedBooths(prev => {
      const next = new Set(prev)
      if (next.has(boothId)) {
        next.delete(boothId)
      } else if (next.size < maxBooths) {
        next.add(boothId)
      }
      return next
    })
  }

  // ── Renders ──

  // Loading: checking if user is already logged in
  if (step === 'loading') {
    return <LoadingSpinner message="Loading…" />
  }

  // Step 1: Email entry
  if (step === 'email') {
    return (
      <div style={{ maxWidth: 420, margin: '0 auto', padding: '60px 20px' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔐</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: '0 0 6px' }}>
            Manage Your Plan
          </h1>
          <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>
            Enter your email to verify your identity
          </p>
        </div>

        <form onSubmit={handleEmailSubmit}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoFocus
            style={{
              width: '100%', padding: '14px 16px', borderRadius: 12,
              border: '1px solid #d1d5db', fontSize: 15, marginBottom: 12,
              boxSizing: 'border-box', background: '#f9fafb',
            }}
          />
          {errorMsg && (
            <div style={{
              padding: '10px 14px', borderRadius: 10, marginBottom: 12,
              background: '#fef2f2', color: '#dc2626', fontSize: 13,
              border: '1px solid #fecaca',
            }}>
              {errorMsg}
            </div>
          )}
          <button
            type="submit"
            disabled={submitting}
            style={{
              width: '100%', padding: 14, borderRadius: 12, border: 'none',
              background: 'linear-gradient(135deg, #065f46, #059669)',
              color: 'white', fontSize: 15, fontWeight: 700,
              cursor: submitting ? 'wait' : 'pointer',
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? 'Sending code...' : 'Send Verification Code'}
          </button>
        </form>
      </div>
    )
  }

  // Step 2: OTP verification
  if (step === 'otp') {
    return (
      <div style={{ maxWidth: 420, margin: '0 auto', padding: '60px 20px' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📧</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: '0 0 6px' }}>
            Check Your Email
          </h1>
          <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>
            We sent a 6-digit code to <strong>{email}</strong>
          </p>
        </div>

        <form onSubmit={handleOtpSubmit}>
          <input
            type="text"
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="Enter 6-digit code"
            required
            autoFocus
            maxLength={6}
            style={{
              width: '100%', padding: '14px 16px', borderRadius: 12,
              border: '1px solid #d1d5db', fontSize: 24, marginBottom: 12,
              boxSizing: 'border-box', textAlign: 'center', letterSpacing: 8,
              fontWeight: 700, background: '#f9fafb',
            }}
          />
          {errorMsg && (
            <div style={{
              padding: '10px 14px', borderRadius: 10, marginBottom: 12,
              background: '#fef2f2', color: '#dc2626', fontSize: 13,
              border: '1px solid #fecaca',
            }}>
              {errorMsg}
            </div>
          )}
          <button
            type="submit"
            disabled={submitting || otpCode.length < 6}
            style={{
              width: '100%', padding: 14, borderRadius: 12, border: 'none',
              background: 'linear-gradient(135deg, #065f46, #059669)',
              color: 'white', fontSize: 15, fontWeight: 700,
              cursor: submitting ? 'wait' : 'pointer',
              opacity: submitting || otpCode.length < 6 ? 0.6 : 1,
            }}
          >
            {submitting ? 'Verifying...' : 'Verify & Continue'}
          </button>
          <button
            type="button"
            onClick={() => { setStep('email'); setOtpCode(''); setErrorMsg('') }}
            style={{
              width: '100%', padding: 10, border: 'none', borderRadius: 12,
              background: 'transparent', color: '#6b7280', fontSize: 13,
              marginTop: 8, cursor: 'pointer',
            }}
          >
            ← Use a different email
          </button>
        </form>
      </div>
    )
  }

  // Step 3: Plan management
  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '40px 20px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 4px', color: '#111827' }}>
          Manage Plan
        </h1>
        <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>
          Signed in as <strong>{email}</strong>
        </p>
      </div>

      {/* Current plan card */}
      <div style={{
        background: isCancelPending
          ? 'linear-gradient(135deg, #92400e, #b45309)'
          : isElitePlan
            ? 'linear-gradient(135deg, #1e3a8a, #3b82f6)'
            : isPro
              ? 'linear-gradient(135deg, #065f46, #059669)'
              : 'linear-gradient(135deg, #374151, #6b7280)',
        borderRadius: 16, padding: 20, color: 'white',
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexWrap: 'wrap', gap: 12,
        }}>
          <div>
            <span style={{ fontSize: 18, fontWeight: 700 }}>
              🚜 CasaGrown {planName}
            </span>
            <span style={{
              marginLeft: 8, fontSize: 11, padding: '2px 8px', borderRadius: 6,
              background: 'rgba(255,255,255,0.2)',
            }}>
              {isCancelPending
                ? '⏳ Cancels soon'
                : status === 'trialing' ? '🎉 Trial' : isPro ? '✓ Active' : 'Free'}
            </span>
          </div>

          {/* Cancel / Resume — only for paid plans */}
          {isPro && (
            isCancelPending ? (
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
                {actionLoading ? 'Resuming…' : `↩ Resume ${planName}`}
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
                Cancel
              </button>
            )
          )}
        </div>

        {/* Plan details */}
        {isPro && (
          <div style={{
            margin: '16px 0 0', padding: '12px 14px', borderRadius: 12,
            background: 'rgba(255,255,255,0.12)', fontSize: 13,
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Stands Limit:</span>
              <strong>{isElitePlan ? 'Unlimited' : '3 Stands'}</strong>
            </div>
            {currentPeriodEnd && !isCancelPending && status === 'active' && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Next billing:</span>
                <strong>{formatDate(currentPeriodEnd)}</strong>
              </div>
            )}
            {status === 'trialing' && trialEndsAt && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Trial ends:</span>
                <strong>{formatDate(trialEndsAt)}</strong>
              </div>
            )}
          </div>
        )}

        {/* Cancel pending warning */}
        {isCancelPending && currentPeriodEnd && (
          <div style={{
            margin: '16px 0 0', padding: '14px 16px', borderRadius: 12,
            background: 'rgba(255,255,255,0.15)', fontSize: 13,
          }}>
            <div style={{ marginBottom: 8 }}>
              ⚠️ Your {planName} plan will <strong>cancel on {formatDate(currentPeriodEnd)}</strong>
            </div>
            <div style={{ fontSize: 12, opacity: 0.9 }}>
              After that date, your {planName} features will no longer be available.
              Click "↩ Resume" above to keep your plan active.
            </div>
          </div>
        )}
      </div>

      {/* ── Plan options ── */}
      <div style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px', color: '#111827' }}>
          Available Plans
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Lite */}
          <div style={{
            borderRadius: 12, padding: 16,
            border: !isPro ? '2px solid #059669' : '1px solid #e5e7eb',
            background: !isPro ? '#f0fdf4' : '#fff',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>Lite</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>1 stand, basic features</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#111827' }}>Free</div>
                {!isPro ? (
                  <span style={{ fontSize: 10, color: '#059669', fontWeight: 600 }}>Current Plan</span>
                ) : (
                  <button
                    onClick={() => startDowngrade('lite')}
                    disabled={actionLoading}
                    style={{
                      fontSize: 11, fontWeight: 700, color: '#6b7280',
                      background: '#f3f4f6', border: '1px solid #d1d5db',
                      padding: '4px 12px', borderRadius: 8, cursor: 'pointer',
                      marginTop: 4,
                    }}
                  >
                    Downgrade to Free
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Pro */}
          <div style={{
            borderRadius: 12, padding: 16,
            border: plan === 'pro' ? '2px solid #059669' : '1px solid #e5e7eb',
            background: plan === 'pro' ? '#f0fdf4' : '#fff',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>Pro</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>3 stands, GrowBot, Facebook sync</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#111827' }}>$10<span style={{ fontSize: 12, fontWeight: 500, color: '#6b7280' }}>/mo</span></div>
                {plan === 'pro' ? (
                  <span style={{ fontSize: 10, color: '#059669', fontWeight: 600 }}>Current Plan</span>
                ) : (
                  <button
                    onClick={() => isElitePlan ? startDowngrade('pro') : handleUpgrade('pro')}
                    disabled={actionLoading}
                    style={{
                      fontSize: 11, fontWeight: 700, color: 'white',
                      background: isElitePlan ? '#6b7280' : '#059669', border: 'none',
                      padding: '4px 12px', borderRadius: 8, cursor: 'pointer',
                      marginTop: 4,
                    }}
                  >
                    {isElitePlan ? 'Downgrade to Pro' : 'Get Pro'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Elite — only visible when enabled or for pro_testers */}
          {showElite && (
          <div style={{
            borderRadius: 12, padding: 16,
            border: isElitePlan ? '2px solid #3b82f6' : '1px solid #e5e7eb',
            background: isElitePlan ? '#eff6ff' : '#fff',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>Elite</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>Unlimited stands, WhatsApp, Instagram, custom branding</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#111827' }}>$29<span style={{ fontSize: 12, fontWeight: 500, color: '#6b7280' }}>/mo</span></div>
                {isElitePlan ? (
                  <span style={{ fontSize: 10, color: '#3b82f6', fontWeight: 600 }}>Current Plan</span>
                ) : (
                  <button
                    onClick={() => handleUpgrade('elite')}
                    disabled={actionLoading}
                    style={{
                      fontSize: 11, fontWeight: 700, color: 'white',
                      background: '#2563eb', border: 'none',
                      padding: '4px 12px', borderRadius: 8, cursor: 'pointer',
                      marginTop: 4,
                    }}
                  >
                    {plan === 'pro' ? 'Switch to Elite' : 'Get Elite'}
                  </button>
                )}
              </div>
            </div>
          </div>
          )}
        </div>
      </div>

      {/* Back to features */}
      <button
        className="btn btn-primary"
        onClick={() => router.push('/pro-manage')}
        style={{ marginTop: 24, width: '100%' }}
      >
        ⚙️ Back to Manage Features
      </button>

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
              Cancel {planName}?
            </h3>
            <div style={{
              textAlign: 'left', fontSize: 13, color: '#6b7280', lineHeight: 1.6,
              margin: '16px 0', padding: '12px 16px',
              background: '#f9fafb', borderRadius: 12,
            }}>
              <div style={{ marginBottom: 6 }}>✓ Your features stay active until the end of the current period</div>
              <div>✓ You can resume anytime before the period ends</div>
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
              {actionLoading ? 'Cancelling…' : `Yes, Cancel ${planName}`}
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

      {/* ── Downgrade confirmation modal with booth picker ── */}
      {showDowngradeModal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
            padding: 16, animation: 'fadeIn 0.2s ease',
          }}
          onClick={() => setShowDowngradeModal(false)}
        >
          <div
            style={{
              background: 'white', borderRadius: 20, padding: '28px 24px',
              maxWidth: 420, width: '100%',
              boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
              animation: 'slideUp 0.3s ease',
              maxHeight: '80vh', overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              width: 64, height: 64, borderRadius: '50%', margin: '0 auto 16px',
              background: '#fffbeb', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 28,
            }}>
              ⬇️
            </div>
            <h3 style={{
              fontSize: 18, fontWeight: 700, margin: '0 0 4px', color: '#111827', textAlign: 'center',
            }}>
              Downgrade to {downgradeTarget === 'lite' ? 'Free' : 'Pro'}?
            </h3>
            <p style={{ fontSize: 13, color: '#6b7280', textAlign: 'center', margin: '0 0 16px' }}>
              {downgradeTarget === 'lite' ? 'Free plan includes 1 booth.' : 'Pro plan includes up to 3 booths.'}
            </p>

            {/* Booth picker — only if they have more than the limit */}
            {(() => {
              const maxBooths = downgradeTarget === 'lite' ? 1 : 3
              if (booths.length > maxBooths) {
                return (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 600, color: '#dc2626', marginBottom: 8,
                      padding: '8px 12px', background: '#fef2f2', borderRadius: 10,
                      border: '1px solid #fecaca',
                    }}>
                      ⚠️ You have {booths.length} active booths. Select {maxBooths} to keep — the rest will be archived.
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {booths.map(booth => {
                        const isSelected = selectedBooths.has(booth.id)
                        const isDisabled = !isSelected && selectedBooths.size >= maxBooths
                        return (
                          <button
                            key={booth.id}
                            type="button"
                            onClick={() => toggleBoothSelection(booth.id)}
                            disabled={isDisabled}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 10,
                              padding: '12px 14px', borderRadius: 12,
                              border: isSelected ? '2px solid #059669' : '1px solid #e5e7eb',
                              background: isSelected ? '#f0fdf4' : isDisabled ? '#f9fafb' : '#fff',
                              cursor: isDisabled ? 'not-allowed' : 'pointer',
                              opacity: isDisabled ? 0.5 : 1,
                              textAlign: 'left', width: '100%',
                              transition: 'all 0.15s',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              readOnly
                              style={{ width: 18, height: 18, accentColor: '#16a34a', pointerEvents: 'none' }}
                            />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{booth.name}</div>
                              <div style={{ fontSize: 11, color: isSelected ? '#059669' : '#9ca3af' }}>
                                {isSelected ? '✓ Keeping' : 'Will be archived'}
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 8, textAlign: 'center' }}>
                      {selectedBooths.size}/{maxBooths} selected
                    </div>
                  </div>
                )
              } else {
                return (
                  <div style={{
                    padding: '12px 16px', borderRadius: 12, marginBottom: 16,
                    background: '#f0fdf4', border: '1px solid #bbf7d0',
                    fontSize: 13, color: '#065f46',
                  }}>
                    ✓ All your {booths.length} booth(s) fit within the {downgradeTarget === 'lite' ? 'Free' : 'Pro'} plan limit.
                  </div>
                )
              }
            })()}

            {/* What you'll lose */}
            <div style={{
              padding: '12px 16px', borderRadius: 12, marginBottom: 16,
              background: '#f9fafb', fontSize: 13, color: '#6b7280', lineHeight: 1.6,
            }}>
              <div style={{ fontWeight: 600, color: '#374151', marginBottom: 6 }}>You&apos;ll lose access to:</div>
              {downgradeTarget === 'lite' ? (
                <>
                  <div>• GrowBot auto-replies</div>
                  <div>• Facebook & Instagram sync</div>
                  <div>• WhatsApp integration</div>
                  <div>• Google Business sync</div>
                  <div>• Multiple booths (limited to 1)</div>
                </>
              ) : (
                <>
                  <div>• WhatsApp integration & number</div>
                  <div>• Instagram sync & posting</div>
                  <div>• Google Business sync</div>
                  <div>• Unlimited booths (limited to 3)</div>
                </>
              )}
              <div style={{ marginTop: 8, fontSize: 12, color: '#059669' }}>
                💰 Unused time will be credited to your account.
              </div>
            </div>

            <button
              onClick={confirmDowngrade}
              disabled={actionLoading || (booths.length > (downgradeTarget === 'lite' ? 1 : 3) && selectedBooths.size < 1)}
              style={{
                width: '100%', padding: 14, border: 'none', borderRadius: 9999,
                background: actionLoading ? '#9ca3af' : '#dc2626', color: 'white',
                fontSize: 15, fontWeight: 600,
                cursor: actionLoading ? 'wait' : 'pointer',
                opacity: actionLoading || (booths.length > (downgradeTarget === 'lite' ? 1 : 3) && selectedBooths.size === 0) ? 0.6 : 1,
                marginBottom: 8,
              }}
            >
              {actionLoading ? 'Processing…' : `Confirm Downgrade to ${downgradeTarget === 'lite' ? 'Free' : 'Pro'}`}
            </button>
            <button
              onClick={() => setShowDowngradeModal(false)}
              style={{
                width: '100%', padding: 10, border: 'none', borderRadius: 9999,
                background: 'transparent', color: '#9ca3af', fontSize: 13,
                fontWeight: 500, cursor: 'pointer',
              }}
            >
              Never mind, keep {planName}
            </button>
          </div>
        </div>
      )}

      {/* ── Stripe Checkout Modal for upgrades ── */}
      {showCheckoutModal && (
        <StripeCheckoutModal
          plan={upgradeTarget}
          returnPath="/manage-plan"
          onClose={() => setShowCheckoutModal(false)}
          onComplete={handleCheckoutComplete}
        />
      )}

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

export default function ManagePlanPage() {
  return (
    <Suspense fallback={<div style={{ padding: 80, textAlign: 'center' }}>Loading...</div>}>
      <ManagePlanPageInner />
    </Suspense>
  )
}
