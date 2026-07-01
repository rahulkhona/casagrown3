'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@casagrown/app/features/auth/auth-hook'
import { supabase } from '@casagrown/app/utils/supabase'
import { YStack, Spinner, Text } from 'tamagui'
import { colors } from '@casagrown/app/design-tokens'

/**
 * Routes that do NOT require authentication.
 */
const PUBLIC_ROUTES = ['/', '/login', '/login-success', '/logout', '/staff/login', '/submit', '/board'] // Board is public for reading; write actions check auth themselves
const PUBLIC_PREFIXES = ['/staff/'] // Allow staff/* initially

function isPublicRoute(pathname: string): boolean {
  const cleanPath = pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname
  if (PUBLIC_ROUTES.includes(cleanPath)) return true
  return PUBLIC_PREFIXES.some((prefix) => cleanPath.startsWith(prefix))
}

/**
 * Fast check: are there any Supabase session tokens in localStorage?
 * If not, we know the user is unauthenticated and can skip waiting for
 * getSession() to resolve and redirect to login immediately.
 */
function hasSessionTokensInStorage(): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && (key.startsWith('sb-') || key.startsWith('supabase.'))) {
      return true
    }
  }
  return false
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [authorized, setAuthorized] = useState(false)
  const [banned, setBanned] = useState(false)

  // Fast-path: if on a protected route with no session tokens, redirect immediately
  const [fastRedirected, setFastRedirected] = useState(false)
  useEffect(() => {
    if (isPublicRoute(pathname)) return
    if (!hasSessionTokensInStorage() && !fastRedirected) {
      setFastRedirected(true)
      const returnTo = encodeURIComponent(pathname)
      router.replace(`/login?returnTo=${returnTo}`)
    }
  }, [pathname, router, fastRedirected])

  useEffect(() => {
    console.log('[AuthGuard] useEffect: pathname =', pathname, 'authLoading =', authLoading, 'user =', user?.email)
    if (authLoading) return

    if (isPublicRoute(pathname)) {
      console.log('[AuthGuard] isPublicRoute matches:', pathname, '- setting authorized to true')
      setAuthorized(true)
      return
    }

    if (!user) {
      console.log('[AuthGuard] Protected route & no user - redirecting to login. pathname =', pathname)
      setAuthorized(false)
      const returnTo = encodeURIComponent(pathname)
      router.replace(`/login?returnTo=${returnTo}`)
      return
    }

    console.log('[AuthGuard] Protected route & user logged in - checking profiles table for id:', user.id)
    // Check if user is banned
    supabase
      .from('profiles')
      .select('is_banned')
      .eq('id', user.id)
      .single()
      .then(({ data }: { data: { is_banned: boolean } | null }) => {
        console.log('[AuthGuard] profiles fetch success. data:', data)
        if (data?.is_banned) {
          setBanned(true)
          setAuthorized(false)
        } else {
          setBanned(false)
          setAuthorized(true)
        }
      })
      .catch((err) => {
        console.error('[AuthGuard] profiles fetch failed:', err)
        // If profile check fails, allow access (fail-open for auth)
        setAuthorized(true)
      })
  }, [user, authLoading, pathname, router])

  // If we already fast-redirected, show the redirecting state
  if (fastRedirected && !authorized) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" backgroundColor={colors.green[50]} minHeight="100vh">
        <Spinner size="large" color={colors.green[600]} />
        <Text marginTop="$4" color={colors.gray[600]}>Redirecting...</Text>
      </YStack>
    )
  }

  // Public routes should render immediately — don't block on auth loading
  if (isPublicRoute(pathname)) {
    return <>{children}</>
  }

  if (authLoading) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" backgroundColor={colors.green[50]} minHeight="100vh">
        <Spinner size="large" color={colors.green[600]} />
        <Text marginTop="$4" color={colors.gray[600]}>Loading...</Text>
      </YStack>
    )
  }

  if (banned) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" backgroundColor={colors.green[50]} minHeight="100vh" padding="$4">
        <Text fontSize="$7" fontWeight="700" color={colors.red[600]} marginBottom="$3">Account Suspended</Text>
        <Text fontSize="$4" color={colors.gray[600]} textAlign="center" maxWidth={400}>
          Your account has been suspended. If you believe this is an error, please contact support.
        </Text>
      </YStack>
    )
  }

  if (authorized) {
    return <>{children}</>
  }

  return (
    <YStack flex={1} alignItems="center" justifyContent="center" backgroundColor={colors.green[50]} minHeight="100vh">
      <Spinner size="large" color={colors.green[600]} />
      <Text marginTop="$4" color={colors.gray[600]}>Redirecting...</Text>
    </YStack>
  )
}


