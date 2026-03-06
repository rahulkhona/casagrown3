'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { AppHeader } from '@casagrown/app/features/common/AppHeader'
import { useAuth, supabase } from '@casagrown/app/features/auth/auth-hook'
import { YStack, Spinner, Text } from 'tamagui'
import { colors } from '@casagrown/app/design-tokens'

/**
 * Routes that do NOT require authentication.
 * All other routes redirect to /login if the user is not logged in.
 */
const PUBLIC_ROUTES = ['/', '/login', '/login-success', '/logout', '/buy-points-mockup', '/terms', '/privacy', '/guidelines', '/sellers-handbook']

/** Route prefixes that are public (for dynamic routes like /invite/[code]) */
const PUBLIC_PREFIXES = ['/invite/', '/delegate-invite/', '/post/']

/**
 * Routes where a logged-in user WITHOUT ToS may remain authenticated.
 * On all other routes, users without ToS get signed out to clear tokens.
 */
const TOS_FLOW_ROUTES = ['/login', '/login-success', '/terms', '/privacy', '/guidelines', '/profile-wizard']

function isPublicRoute(pathname: string): boolean {
  // Allow Playwright E2E testing to bypass auth redirects
  if (typeof window !== 'undefined' && window.localStorage.getItem('E2E_BYPASS_AUTH') === 'true') {
    return true;
  }
  if (PUBLIC_ROUTES.includes(pathname)) return true
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, loading: authLoading, tosAccepted } = useAuth()
  const [authorized, setAuthorized] = useState(false)

  useEffect(() => {
    // Wait for auth to finish loading
    if (authLoading) return

    // If user is logged in but hasn't accepted ToS, and is NOT on a ToS flow route,
    // sign them out so tokens are cleared. They'll need to login again.
    // Skip this check for E2E tests (test users have ToS accepted in seed, but this is a safety net).
    const isE2E = typeof window !== 'undefined' && window.localStorage.getItem('E2E_BYPASS_AUTH') === 'true'
    if (user && !tosAccepted && !isE2E && !TOS_FLOW_ROUTES.includes(pathname)) {
      console.log('🔒 AuthGuard: ToS not accepted on non-flow route, signing out')
      supabase.auth.signOut().then(() => {
        // After sign-out, user becomes null → effect re-runs → normal unauthenticated flow
      })
      return
    }

    if (isPublicRoute(pathname)) {
      // Public route — always allowed
      setAuthorized(true)
      return
    }

    if (!user) {
      // Not logged in on a protected route → redirect to login with returnTo
      setAuthorized(false)
      const returnTo = encodeURIComponent(pathname)
      router.replace(`/login?returnTo=${returnTo}`)
      return
    }

    // Logged in with ToS → allowed
    setAuthorized(true)
  }, [user, authLoading, tosAccepted, pathname, router])

  // Still loading auth
  if (authLoading) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" backgroundColor={colors.green[50]} minHeight="100vh">
        <Spinner size="large" color={colors.green[600]} />
        <Text marginTop="$4" color={colors.gray[600]}>Loading...</Text>
      </YStack>
    )
  }

  // Public route or authorized → render children
  if (isPublicRoute(pathname) || authorized) {
    const showHeader = !!user && authorized && !['/login', '/login-success', '/logout', '/profile-wizard', '/terms', '/privacy'].includes(pathname)
    let activeKey = 'feed'
    if (pathname.startsWith('/offers')) activeKey = 'offers'
    else if (pathname.startsWith('/orders')) activeKey = 'orders'
    else if (pathname.startsWith('/my-posts')) activeKey = 'myPosts'
    else if (pathname.startsWith('/chats')) activeKey = 'chats'
    else if (pathname.startsWith('/buy-points')) activeKey = 'buyPoints'
    else if (pathname.startsWith('/delegate')) activeKey = 'delegateSales'
    else if (pathname.startsWith('/redeem')) activeKey = 'redeem'
    else if (pathname.startsWith('/transaction-history')) activeKey = 'transactionHistory'

    return (
      <>
        {showHeader && <AppHeader activeKey={activeKey} />}
        {children}
      </>
    )
  }

  // Redirecting — show loading
  return (
    <YStack flex={1} alignItems="center" justifyContent="center" backgroundColor={colors.green[50]} minHeight="100vh">
      <Spinner size="large" color={colors.green[600]} />
      <Text marginTop="$4" color={colors.gray[600]}>Redirecting...</Text>
    </YStack>
  )
}
