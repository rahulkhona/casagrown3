'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@casagrown/app/features/auth/auth-hook'
import { YStack, Spinner, Text } from 'tamagui'
import { colors } from '@casagrown/app/design-tokens'

/**
 * Routes that do NOT require authentication.
 * All other routes redirect to /login if the user is not logged in.
 */
const PUBLIC_ROUTES = ['/', '/login', '/login-success', '/logout', '/buy-points-mockup']

/** Route prefixes that are public (for dynamic routes like /invite/[code]) */
const PUBLIC_PREFIXES = ['/invite/', '/delegate-invite/', '/post/']

function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_ROUTES.includes(pathname)) return true
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [authorized, setAuthorized] = useState(false)

  useEffect(() => {
    // Wait for auth to finish loading
    if (authLoading) return

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

    // Logged in on a protected route → allowed
    setAuthorized(true)
  }, [user, authLoading, pathname, router])

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
    return <>{children}</>
  }

  // Redirecting — show loading
  return (
    <YStack flex={1} alignItems="center" justifyContent="center" backgroundColor={colors.green[50]} minHeight="100vh">
      <Spinner size="large" color={colors.green[600]} />
      <Text marginTop="$4" color={colors.gray[600]}>Redirecting...</Text>
    </YStack>
  )
}
