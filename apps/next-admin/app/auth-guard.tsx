'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@casagrown/app/features/auth/auth-hook'
import { YStack, Spinner, Text } from 'tamagui'
import { colors } from '@casagrown/app/design-tokens'
import { checkIsStaffByEmail } from '@casagrown/app/features/feedback/feedback-service'

const PUBLIC_ROUTES = ['/login', '/unauthorized']

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.includes(pathname)
}

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
  const [fastRedirected, setFastRedirected] = useState(false)
  const [adminChecked, setAdminChecked] = useState(false)

  // Fast-path for unauthenticated
  useEffect(() => {
    if (isPublicRoute(pathname)) return
    if (!hasSessionTokensInStorage() && !fastRedirected) {
      setFastRedirected(true)
      const returnTo = encodeURIComponent(pathname)
      router.replace(`/login?returnTo=${returnTo}`)
    }
  }, [pathname, router, fastRedirected])

  // Real auth logic
  useEffect(() => {
    if (authLoading) return

    if (isPublicRoute(pathname)) {
      setAuthorized(true)
      setAdminChecked(true)
      return
    }

    if (!user) {
      setAuthorized(false)
      const returnTo = encodeURIComponent(pathname)
      router.replace(`/login?returnTo=${returnTo}`)
      return
    }

    // Determine if they are an admin
    const checkAdmin = async () => {
      try {
        if (user.email) {
          const res = await checkIsStaffByEmail(user.email)
          if (res.isStaff && res.roles.includes('admin')) {
            setAuthorized(true)
          } else {
            setAuthorized(false)
            router.replace('/unauthorized')
          }
        } else {
          setAuthorized(false)
          router.replace('/unauthorized')
        }
      } catch (e) {
        setAuthorized(false)
        router.replace('/unauthorized')
      } finally {
        setAdminChecked(true)
      }
    }

    checkAdmin()
  }, [user, authLoading, pathname, router])

  if (fastRedirected && !authorized) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" backgroundColor={colors.green[50]} minHeight="100vh">
        <Spinner size="large" color={colors.green[600]} />
        <Text marginTop="$4" color={colors.gray[600]}>Redirecting...</Text>
      </YStack>
    )
  }

  if (authLoading || !adminChecked) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" backgroundColor={colors.green[50]} minHeight="100vh">
        <Spinner size="large" color={colors.green[600]} />
        <Text marginTop="$4" color={colors.gray[600]}>Verifying Identity...</Text>
      </YStack>
    )
  }

  if (isPublicRoute(pathname) || authorized) {
    return <>{children}</>
  }

  return null
}
