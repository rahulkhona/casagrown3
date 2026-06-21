'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [authorized, setAuthorized] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    // Login page is always accessible
    if (pathname === '/login') {
      setAuthorized(true)
      setChecking(false)
      return
    }

    let cancelled = false

    async function check() {
      const { data: { session } } = await supabase.auth.getSession()

      if (cancelled) return

      if (!session?.user?.email) {
        router.replace('/login')
        return
      }

      // Verify staff role
      let { data: isStaff, error } = await supabase
        .rpc('is_staff_email', { check_email: session.user.email.toLowerCase() })

      if (error) {
        console.warn('[AUTH] is_staff_email failed (possibly DB load), retrying once in 1.5s...', error.message)
        await new Promise(r => setTimeout(r, 1500))
        const retryResult = await supabase
          .rpc('is_staff_email', { check_email: session.user.email.toLowerCase() })
        isStaff = retryResult.data
        error = retryResult.error
      }

      if (cancelled) return

      if (error || !isStaff) {
        console.error('[AUTH] Authorization check failed. isStaff:', isStaff, 'error:', error?.message)
        // Only signOut if it was a successful query verifying they are NOT staff
        if (!isStaff && !error) {
          await supabase.auth.signOut()
        }
        router.replace('/login')
        return
      }

      setAuthorized(true)
      setChecking(false)
    }

    check()

    return () => { cancelled = true }
  }, [pathname, router])

  if (pathname === '/login') {
    return <>{children}</>
  }

  if (checking) {
    return (
      <div className="loading-container" style={{ minHeight: '100vh' }}>
        <div className="spinner" />
        <span>Verifying access...</span>
      </div>
    )
  }

  if (!authorized) return null

  return <>{children}</>
}
