import { useState, useEffect } from 'react'
import { FeedScreen } from '@casagrown/app/features/feed/feed-screen'
import { useRouter } from 'expo-router'
import { useAuth, supabase } from '@casagrown/app/features/auth/auth-hook'

// Import the logo asset for mobile
const logoSrc = require('../../assets/logo.png')

export default function FeedTab() {
  const router = useRouter()
  const { user } = useAuth()
  const [referralCode, setReferralCode] = useState<string | undefined>()

  // Fetch referral code from user profile
  useEffect(() => {
    if (!user) return
    const fetchReferralCode = async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('referral_code')
          .eq('id', user.id)
          .single()
        if (data?.referral_code) {
          setReferralCode(data.referral_code)
        }
      } catch (err) {
        console.warn('Could not fetch referral code:', err)
      }
    }
    fetchReferralCode()
  }, [user])

  const handleCreatePost = () => {
    // TODO: Navigate to create post screen when implemented
    console.log('Create post pressed')
  }

  const handleNavigateToProfile = () => {
    router.push('/(tabs)/profile')
  }

  const handleNavigateToDelegate = () => {
    router.push('/(tabs)/delegate')
  }

  return (
    <FeedScreen
      onCreatePost={handleCreatePost}
      onNavigateToProfile={handleNavigateToProfile}
      onNavigateToDelegate={handleNavigateToDelegate}
      logoSrc={logoSrc}
      referralCode={referralCode}
    />
  )
}
