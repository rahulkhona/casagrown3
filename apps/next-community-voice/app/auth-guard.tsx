'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@casagrown/app/features/auth/auth-hook'
import { YStack, Spinner, Text } from 'tamagui'
import { colors } from '@casagrown/app/design-tokens'

/**
 * Routes that do NOT require authentication.
 */
const PUBLIC_ROUTES = ['/', '/login', '/login-success', '/logout', '/board', '/staff/login', '/submit'] // Added /submit as public for Phase 1 mock
const PUBLIC_PREFIXES = ['/board/', '/staff/'] // Allow board/id and staff/* initially

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

  if (authLoading) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" backgroundColor={colors.green[50]} minHeight="100vh">
        <Spinner size="large" color={colors.green[600]} />
        <Text marginTop="$4" color={colors.gray[600]}>Loading...</Text>
      </YStack>
    )
  }

  if (isPublicRoute(pathname) || authorized) {
    return <>{children}</>
  }

  return (
    <YStack flex={1} alignItems="center" justifyContent="center" backgroundColor={colors.green[50]} minHeight="100vh">
      <Spinner size="large" color={colors.green[600]} />
      <Text marginTop="$4" color={colors.gray[600]}>Redirecting...</Text>
    </YStack>
  )
}
