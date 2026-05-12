'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { MarketProvider } from '../../lib/store'
import { CartProvider } from '../../lib/useCart'
import { useAuth } from '../../lib/useAuth'
import { BootstrapProvider } from '../../lib/useBootstrap'
import { Navbar } from '../components/Navbar'
import { BottomNav } from '../components/BottomNav'
import { RatingReminder } from '../components/RatingReminder'
import { AnalyticsTracker } from '../components/AnalyticsTracker'
import { ErrorToastProvider } from '../components/ErrorToast'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { GuidedTour } from '../components/GuidedTour'
import { useReferralCapture } from '../../lib/useReferralCapture'

function BannedOverlay({ reason }: { reason: string | null }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.85)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: 32,
        maxWidth: 420, textAlign: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
      }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🚫</div>
        <h2 style={{ margin: '0 0 12px', fontSize: 22, color: '#dc2626' }}>Account Suspended</h2>
        <p style={{ color: '#374151', fontSize: 15, lineHeight: 1.6, margin: '0 0 16px' }}>
          Your account has been suspended and you cannot access CasaGrown Market at this time.
        </p>
        {reason && (
          <p style={{
            background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
            padding: 12, fontSize: 13, color: '#991b1b', margin: '0 0 16px',
          }}>
            <strong>Reason:</strong> {reason}
          </p>
        )}
        <p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>
          If you believe this is an error, please contact support at{' '}
          <a href="mailto:support@casagrown.com" style={{ color: '#2563eb' }}>support@casagrown.com</a>
        </p>
      </div>
    </div>
  )
}

/** Routes exempt from ALL gates (always accessible) */
const GATE_EXEMPT = ['/terms', '/profile-setup', '/login', '/create-listing']

/** Routes that allow browsing even without profile completion */
const BROWSABLE_ROUTES = ['/', '/market', '/community', '/get-started', '/voice', '/guide']

/**
 * Routes that require full onboarding (ToS + profile).
 * If a logged-in user without a completed profile navigates here,
 * they get redirected to /profile-setup.
 */
const PROTECTED_ROUTES = [
  '/my-booth', '/orders', '/earnings', '/chat', '/helping',
  '/following', '/notifications', '/settings', '/profile', '/cart',
]

function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { user, loading, tosAccepted, profileComplete } = useAuth()
  const pathname = usePathname()
  const router = useRouter()

  const isExempt = GATE_EXEMPT.some(p => pathname.startsWith(p))
  const isBrowsable = BROWSABLE_ROUTES.some(p =>
    p === '/' ? pathname === '/' : pathname.startsWith(p)
  )
  const isProtected = PROTECTED_ROUTES.some(p => pathname.startsWith(p))

  // Determine if the user needs onboarding
  const needsToS = !loading && !!user && tosAccepted === false
  const needsProfile = !loading && !!user && tosAccepted === true && profileComplete === false
  const needsOnboarding = needsToS || needsProfile

  useEffect(() => {
    if (loading || !user || isExempt) return

    // Always enforce ToS first
    if (needsToS) {
      router.replace('/terms')
      return
    }

    // For protected routes, redirect to profile-setup
    if (needsProfile && isProtected) {
      router.replace('/profile-setup')
    }
  }, [loading, user, needsToS, needsProfile, isExempt, isProtected, router])

  // Block content on protected routes when onboarding is needed
  if (needsOnboarding && isProtected && !isExempt) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <LoadingSpinner />
      </div>
    )
  }

  // ToS is always enforced — block everything except exempt routes
  if (needsToS && !isExempt) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <LoadingSpinner />
      </div>
    )
  }

  return <>{children}</>
}

function MainLayoutInner({ children }: { children: React.ReactNode }) {
  const { isBanned, banReason, user } = useAuth()

  // Capture referral/UTM params from URL on every page load
  useReferralCapture()

  return (
    <MarketProvider>
      <CartProvider>
      <ErrorToastProvider userId={user?.id}>
        <AnalyticsTracker />
        <Navbar />
        <main className="page-wrapper">
          <ErrorBoundary>
            <OnboardingGate>
              <GuidedTour />
              {children}
            </OnboardingGate>
          </ErrorBoundary>
        </main>
        <BottomNav />
        <RatingReminder />
        {isBanned && <BannedOverlay reason={banReason} />}
      </ErrorToastProvider>
      </CartProvider>
    </MarketProvider>
  )
}

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <BootstrapProvider>
      <MainLayoutInner>{children}</MainLayoutInner>
    </BootstrapProvider>
  )
}
