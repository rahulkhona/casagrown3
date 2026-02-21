'use client'

import { useState, useEffect } from 'react'
import { FeedScreen } from '@casagrown/app/features/feed/feed-screen'
import { useRouter, useSearchParams } from 'next/navigation'
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
  const [communityH3Index, setCommunityH3Index] = useState<string | undefined>(undefined)
  const searchParams = useSearchParams()
  const highlightPostId = searchParams.get('postId') || undefined

  // Fetch user's profile data (referral code, avatar, name)
  useEffect(() => {
    if (user?.id) {
      const fetchUserProfile = async () => {
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('referral_code, avatar_url, full_name, home_community_h3_index')
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
            if (data.home_community_h3_index) {
              setCommunityH3Index(data.home_community_h3_index)
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
    router.push('/create-post')
  }

  const handleNavigateToProfile = () => {
    router.push('/profile')
  }

  const handleNavigateToDelegate = () => {
    router.push('/delegate')
  }

  const handleNavigateToMyPosts = () => {
    router.push('/my-posts')
  }

  const handleNavigateToChat = (postId: string, authorId: string) => {
    router.push(`/chat?postId=${postId}&otherUserId=${authorId}`)
  }

  const handleNavigateToChats = () => {
    router.push('/chats')
  }

  const handleNavigateToOrders = () => {
    router.push('/orders')
  }

  const handleNavigateToOffers = () => {
    router.push('/offers')
  }


  const handleNavigateToBuyPoints = () => {
    router.push('/buy-points')
  }

  return (
    <FeedScreen
      onCreatePost={handleCreatePost}
      onNavigateToProfile={handleNavigateToProfile}
      onNavigateToDelegate={handleNavigateToDelegate}
      onNavigateToMyPosts={handleNavigateToMyPosts}
      referralCode={referralCode}
      inviteRewards={inviteRewards}
      userAvatarUrl={userAvatarUrl}
      userDisplayName={userDisplayName}
      communityH3Index={communityH3Index}
      userId={user?.id}
      highlightPostId={highlightPostId}
      onNavigateToChat={handleNavigateToChat}
      onNavigateToChats={handleNavigateToChats}
      onNavigateToOrders={handleNavigateToOrders}
      onNavigateToOffers={handleNavigateToOffers}
      onNavigateToBuyPoints={handleNavigateToBuyPoints}
    />
  )
}
