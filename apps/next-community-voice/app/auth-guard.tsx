'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@casagrown/app/features/auth/auth-hook'
import { YStack, Spinner, Text } from 'tamagui'
import { colors } from '@casagrown/app/design-tokens'

/**
 * Routes that do NOT require authentication.
 */
const PUBLIC_ROUTES = ['/', '/login', '/login-success', '/logout', '/staff/login', '/submit', '/board'] // Board is public for reading; write actions check auth themselves
const PUBLIC_PREFIXES = ['/staff/'] // Allow staff/* initially

function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_ROUTES.includes(pathname)) return true
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
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
    if (authLoading) return

    if (isPublicRoute(pathname)) {
      setAuthorized(true)
      return
    }

    if (!user) {
      setAuthorized(false)
      const returnTo = encodeURIComponent(pathname)
      router.replace(`/login?returnTo=${returnTo}`)
      return
    }

    setAuthorized(true)
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


