'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { LoginSuccessScreen } from '@casagrown/app/features/auth/login-success-screen'
import { useAuth, supabase } from '@casagrown/app/features/auth/auth-hook'

export default function LoginSuccessPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  useEffect(() => {
    if (authLoading || !user) return

    const handleRedirect = async () => {
      // Check if profile is complete (wizard done)
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, home_community_h3_index')
        .eq('id', user.id)
        .single()

      const wizardComplete = profile?.full_name && profile?.home_community_h3_index

      if (!wizardComplete) {
        // Keep returnTo in sessionStorage so the wizard can use it after completion
        // (it's already there from the login page — don't remove it)
        router.replace('/profile-wizard')
      } else if (typeof window !== 'undefined') {
        const returnTo = sessionStorage.getItem('casagrown_returnTo')
        if (returnTo) {
          sessionStorage.removeItem('casagrown_returnTo')
          router.replace(returnTo)
        } else {
          router.replace('/feed')
        }
      }
    }

    handleRedirect()
  }, [user, authLoading, router])

  return <LoginSuccessScreen />
}
