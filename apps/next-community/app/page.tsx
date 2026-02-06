'use client'

import { useEffect, useState } from 'react'
import { HomeScreen } from '@casagrown/app/features/home/screen'
import { useRouter } from 'next/navigation'
import { useAuth, supabase } from '@casagrown/app/features/auth/auth-hook'
import { YStack, Text, Spinner } from 'tamagui'
import { colors } from '@casagrown/app/design-tokens'

/**
 * Root Page - Landing / Auth Guard
 * 
 * Flow:
 * - New user → Show Home screen → Login → Wizard → Feed
 * - Logged-in user without community → Redirect to Wizard
 * - Logged-in user with community → Redirect to Feed
 */
export default function Page() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [isChecking, setIsChecking] = useState(true)
  const [showHome, setShowHome] = useState(false)

  useEffect(() => {
    const checkAuthAndRedirect = async () => {
      // Wait for auth to finish loading
      if (authLoading) return
      
      // Not logged in → show home page
      if (!user) {
        setShowHome(true)
        setIsChecking(false)
        return
      }
      
      // User is logged in, check profile completeness
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, home_community_h3_index')
          .eq('id', user.id)
          .single()
        
        // Complete profile → Feed
        if (profile?.full_name && profile?.home_community_h3_index) {
          router.replace('/feed')
        } else {
          // Incomplete profile → Profile Wizard
          router.replace('/profile-wizard')
        }
      } catch (err) {
        console.error('Error checking profile:', err)
        // On error, go to wizard for safety
        router.replace('/profile-wizard')
      }
    }
    
    checkAuthAndRedirect()
  }, [user, authLoading, router])

  // Show loading spinner while checking auth
  if (isChecking && !showHome) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" backgroundColor={colors.green[50]} minHeight="100vh">
        <Spinner size="large" color={colors.green[600]} />
        <Text marginTop="$4" color={colors.gray[600]}>Loading...</Text>
      </YStack>
    )
  }

  // Show home/landing page for new users
  return <HomeScreen onLinkPress={() => router.push('/login')} heroImageSrc="/hero.jpg" logoSrc="/logo.png" />
}
