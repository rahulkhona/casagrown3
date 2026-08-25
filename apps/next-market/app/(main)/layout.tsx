'use client'

import { useEffect, Suspense } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { MarketProvider } from '../../lib/store'
import { CartProvider } from '../../lib/useCart'
import { useAuth } from '../../lib/useAuth'
import { BootstrapProvider } from '../../lib/useBootstrap'
import { QuickSetupProvider, useQuickSetup } from '../../lib/useQuickSetup'
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
const GATE_EXEMPT = ['/terms', '/profile-setup', '/login', '/create-listing', '/growbot', '/delete-account', '/interest', '/list_bulk', '/list-bulk']

/** Routes that allow browsing even without profile completion */
const BROWSABLE_ROUTES = ['/', '/market', '/community', '/get-started', '/voice', '/guide', '/growbot']

/**
 * Routes that require full onboarding (ToS + profile).
 * Guests and incomplete users see the QuickSetupModal instead of being redirected.
 */
const PROTECTED_ROUTES = [
  '/my-booth', '/my-stands', '/orders', '/earnings', '/chat', '/helping',
  '/following', '/notifications', '/settings', '/profile', '/cart',
  '/messages', '/pro-manage', '/join-booth',
]

function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { user, loading, tosAccepted, profileComplete } = useAuth()
  const { requireAuth } = useQuickSetup()
  const pathname = usePathname()
  const router = useRouter()

  const isExempt = GATE_EXEMPT.some(p => pathname.startsWith(p))
  const isBrowsable = BROWSABLE_ROUTES.some(p =>
    p === '/' ? pathname === '/' : pathname.startsWith(p)
  )
  const isProtected = PROTECTED_ROUTES.some(p => pathname.startsWith(p))

  // Determine gate conditions
  const isGuest = !loading && !user
  const needsToS = !loading && !!user && tosAccepted === false
  const needsProfile = !loading && !!user && tosAccepted === true && profileComplete === false
  const needsOnboarding = isGuest || needsToS || needsProfile

  useEffect(() => {
    if (loading || isExempt) return

    // Auto-open QuickSetupModal if logged in but incomplete, OR if guest on a protected route
    const isUserIncomplete = !!user && (tosAccepted === false || profileComplete === false)
    if (isUserIncomplete || (isGuest && isProtected)) {
      requireAuth({ 
        trigger: user ? 'onboarding_incomplete' : 'protected_route',
        onCancel: () => {
          // Redirect the user back to the browsable market page so they are not stuck on the spinning page
          router.push('/market')
        }
      })
    }
  }, [loading, isExempt, isProtected, isGuest, user, tosAccepted, profileComplete, requireAuth, router])

  // Block content on protected routes when onboarding is needed (show loading while modal is up)
  if (!loading && needsOnboarding && isProtected && !isExempt) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <LoadingSpinner />
      </div>
    )
  }

  return <>{children}</>
}

function FocusLayoutContent({ children }: { children: React.ReactNode }) {
  const { isBanned, banReason, user } = useAuth()
  const { requireAuth } = useQuickSetup()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const isFocusMode = searchParams?.get('focus') === 'true' || searchParams?.get('embed') === 'true'
  const isListBulk = pathname === '/list_bulk' || pathname === '/list-bulk'

  // Capture referral/UTM params from URL on every page load
  useReferralCapture()

  if (isFocusMode) {
    return (
      <MarketProvider>
        <CartProvider>
          <ErrorToastProvider userId={user?.id}>
            <main className="page-wrapper" style={{ padding: 0, margin: 0 }}>
              <ErrorBoundary>
                {children}
              </ErrorBoundary>
            </main>
          </ErrorToastProvider>
        </CartProvider>
      </MarketProvider>
    )
  }

  return (
    <MarketProvider>
      <CartProvider>
      <ErrorToastProvider userId={user?.id}>
        <AnalyticsTracker />
        {!isListBulk && <Navbar />}
        {isListBulk && (
          <header style={{ padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(10,15,9,0.95)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', boxSizing: 'border-box' }}>
            <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
              <img src="/logo.png" alt="CasaGrown" width={36} height={36} style={{ width: 36, height: 36, objectFit: 'contain' }} />
              <span style={{ fontSize: '1.3rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.5px' }}>CasaGrown</span>
              <span style={{ color: '#4ade80', fontSize: '0.9rem', fontWeight: 600, borderLeft: '2px solid rgba(74,222,128,0.4)', paddingLeft: 14, marginLeft: 6 }}>Fresh. Local. Trusted.</span>
            </Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {user ? (
                <Link href="/my-stands" style={{ fontSize: '0.9rem', fontWeight: 600, color: '#4ade80', textDecoration: 'none', padding: '6px 16px', borderRadius: '100px', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  👤 My Stands
                </Link>
              ) : (
                <button
                  onClick={() => requireAuth({ trigger: 'header_login', defaultSignIn: true })}
                  style={{ fontSize: '0.9rem', fontWeight: 600, color: '#4ade80', padding: '6px 16px', borderRadius: '100px', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', cursor: 'pointer' }}
                >
                  Log In
                </button>
              )}
            </div>
          </header>
        )}
        <main className="page-wrapper">
          <ErrorBoundary>
            <OnboardingGate>
              <GuidedTour />
              {children}
            </OnboardingGate>
          </ErrorBoundary>
        </main>
        {!isListBulk && <BottomNav />}
        <RatingReminder />
        {isBanned && <BannedOverlay reason={banReason} />}
      </ErrorToastProvider>
      </CartProvider>
    </MarketProvider>
  )
}


function MainLayoutInner({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <FocusLayoutContent>{children}</FocusLayoutContent>
    </Suspense>
  )
}

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <BootstrapProvider>
      <QuickSetupProvider>
        <MainLayoutInner>{children}</MainLayoutInner>
      </QuickSetupProvider>
    </BootstrapProvider>
  )
}
