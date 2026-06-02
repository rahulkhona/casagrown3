'use client'

import { useState, useEffect } from 'react'
import { ENABLE_PRO, ENABLE_ELITE } from './featureFlags'
import { useBootstrap } from './useBootstrap'
import { createClient } from './supabase'

/**
 * useProEnabled — returns true if Pro marketing UI should be visible.
 *
 * Pro is visible when:
 *   1. The global flag NEXT_PUBLIC_ENABLE_PRO=true, OR
 *   2. The current user's email exists in the `pro_testers` table
 *      (narrow-scope override for Facebook/Apple app review).
 *
 * Usage: replace static `ENABLE_PRO` checks in UI components with
 *        `const proEnabled = useProEnabled()`.
 */
export function useProEnabled(): boolean {
  const { user } = useBootstrap()
  const [isProTester, setIsProTester] = useState(false)

  useEffect(() => {
    // If the global flag is on, no need to check the DB
    if (ENABLE_PRO || !user?.email) return

    const supabase = createClient()
    supabase
      .from('pro_testers')
      .select('email')
      .eq('email', user.email)
      .maybeSingle()
      .then(({ data }: { data: any }) => {
        if (data) setIsProTester(true)
      })
  }, [user?.email])

  return ENABLE_PRO || isProTester
}

/**
 * useEliteEnabled — returns true if Elite tier UI should be visible.
 *
 * Elite is visible when:
 *   1. The global flag NEXT_PUBLIC_ENABLE_ELITE=true, OR
 *   2. The current user's email exists in the `pro_testers` table
 *      (pro_testers see ALL features regardless of flags).
 *
 * Usage: `const eliteEnabled = useEliteEnabled()`
 */
export function useEliteEnabled(): boolean {
  const { user } = useBootstrap()
  const [isProTester, setIsProTester] = useState(false)

  useEffect(() => {
    // If the global flag is on, no need to check the DB
    if (ENABLE_ELITE || !user?.email) return

    const supabase = createClient()
    supabase
      .from('pro_testers')
      .select('email')
      .eq('email', user.email)
      .maybeSingle()
      .then(({ data }: { data: any }) => {
        if (data) setIsProTester(true)
      })
  }, [user?.email])

  return ENABLE_ELITE || isProTester
}
