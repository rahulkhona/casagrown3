'use client'

import { useState, useEffect } from 'react'
import { FeedScreen } from '@casagrown/app/features/feed/feed-screen'
import { useRouter } from 'next/navigation'
import { useAuth, supabase } from '@casagrown/app/features/auth/auth-hook'

// Types for incentive rules
interface InviteRewards {
  signupPoints: number
  transactionPoints: number
}

export default function FeedPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [referralCode, setReferralCode] = useState<string | undefined>(undefined)
  const [inviteRewards, setInviteRewards] = useState<InviteRewards | undefined>(undefined)
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | undefined>(undefined)
  const [userDisplayName, setUserDisplayName] = useState<string | undefined>(undefined)

  // Fetch user's profile data (referral code, avatar, name)
  useEffect(() => {
    if (user?.id) {
      const fetchUserProfile = async () => {
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('referral_code, avatar_url, full_name')
            .eq('id', user.id)
            .single()
          
          if (!error && data) {
            if (data.referral_code) {
              setReferralCode(data.referral_code)
            }
            if (data.avatar_url) {
              setUserAvatarUrl(data.avatar_url)
            }
            if (data.full_name) {
              setUserDisplayName(data.full_name)
            }
          }
        } catch (err) {
          console.error('Error fetching user profile:', err)
        }
      }
      fetchUserProfile()
    }
  }, [user?.id])

  // Fetch invite reward points from incentive rules
  useEffect(() => {
    const fetchInviteRewards = async () => {
      try {
        const { data, error } = await supabase
          .from('incentive_rules')
          .select('action_type, points')
          .in('action_type', ['invitee_signing_up', 'invitee_making_first_transaction'])
          .eq('scope', 'global')
        
        if (!error && data) {
          const signupRule = data.find(r => r.action_type === 'invitee_signing_up')
          const transactionRule = data.find(r => r.action_type === 'invitee_making_first_transaction')
          
          setInviteRewards({
            signupPoints: signupRule?.points || 0,
            transactionPoints: transactionRule?.points || 0
          })
        }
      } catch (err) {
        console.error('Error fetching invite rewards:', err)
      }
    }
    fetchInviteRewards()
  }, [])

  const handleCreatePost = () => {
    // TODO: Navigate to create post page when implemented
    console.log('Create post pressed')
  }

  const handleNavigateToProfile = () => {
    router.push('/profile')
  }

  return (
    <FeedScreen
      onCreatePost={handleCreatePost}
      onNavigateToProfile={handleNavigateToProfile}
      referralCode={referralCode}
      inviteRewards={inviteRewards}
      userAvatarUrl={userAvatarUrl}
      userDisplayName={userDisplayName}
    />
  )
}
