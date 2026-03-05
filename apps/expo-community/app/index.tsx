/**
 * Root Index - App Entry Point with Auth Guard
 * 
 * This screen acts as the initial auth check:
 * - If user is logged in with complete profile → redirect to Feed
 * - If user is logged in but incomplete profile → redirect to Profile Wizard
 * - If user is not logged in → show Home screen (landing page)
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'expo-router'
import { YStack, Text, Spinner } from 'tamagui'
import { HomeScreen } from '@casagrown/app/features/home/screen'
import { useAuth, supabase } from '@casagrown/app/features/auth/auth-hook'
import { colors } from '@casagrown/app/design-tokens'

export default function Index() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [isChecking, setIsChecking] = useState(true)
  const [showHome, setShowHome] = useState(false)

  useEffect(() => {
    const checkAuthAndRedirect = async () => {
      console.log('🟡 INDEX: checkAuthAndRedirect', { authLoading, user: user?.email ?? null })
      // Wait for auth to finish loading
      if (authLoading) return
      
      // Not logged in → show home page
      if (!user) {
        console.log('🟡 INDEX: No user, showing home page')
        setShowHome(true)
        setIsChecking(false)
        return
      }
      
      // User is logged in, check profile completeness
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, home_community_h3_index, tos_accepted_at')
          .eq('id', user.id)
          .single()
        
        // Must accept ToS first — redirect to login which handles ToS flow
        if (!profile?.tos_accepted_at) {
          console.log('🟡 INDEX: ToS not accepted, redirecting to /login')
          router.replace('/login')
          return
        }

        // Complete profile → Feed
        if (profile?.full_name && profile?.home_community_h3_index) {
          console.log('🟡 INDEX: Complete profile, redirecting to /feed')
          router.replace('/feed')
        } else {
          // Incomplete profile → Profile Wizard
          console.log('🟡 INDEX: Incomplete profile, redirecting to /profile-wizard')
          router.replace('/profile-wizard')
        }
      } catch (err) {
        console.error('Error checking profile:', err)
        // On error, go to login which handles ToS safely
        router.replace('/login')
      }
    }
    
    checkAuthAndRedirect()
  }, [user, authLoading, router])

  // Show loading spinner while checking auth
  if (isChecking && !showHome) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" backgroundColor={colors.green[50]}>
        <Spinner size="large" color={colors.green[600]} />
        <Text marginTop="$4" color={colors.gray[600]}>Loading...</Text>
      </YStack>
    )
  }

  // Show home/landing page for new users
  return (
    <HomeScreen 
      onLinkPress={() => router.push('/login')} 
      heroImageSrc={require('../assets/hero.jpg')}
      logoSrc={require('../assets/logo.png')}
    />
  )
}
