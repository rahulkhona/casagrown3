'use client'

import { useState, useEffect } from 'react'
import { FeedScreen } from '@casagrown/app/features/feed/feed-screen'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth, supabase } from '@casagrown/app/features/auth/auth-hook'

// Types for campaign rewards
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

  // Fetch invite reward points from campaign rewards
  useEffect(() => {
    const fetchInviteRewards = async () => {
      try {
        const now = new Date().toISOString()
        const { data, error } = await supabase
          .from('campaign_rewards')
          .select(`
            behavior,
            points,
            incentive_campaigns!inner (
              is_active,
              starts_at,
              ends_at
            )
          `)
          .eq('incentive_campaigns.is_active', true)
          .lte('incentive_campaigns.starts_at', now)
          .gte('incentive_campaigns.ends_at', now)
          .in('behavior', ['per_referral', 'first_purchase_by_referee'])
        
        if (!error && data) {
          const referralRule = data.find((r: any) => r.behavior === 'per_referral')
          const transactionRule = data.find((r: any) => r.behavior === 'first_purchase_by_referee')
          
          setInviteRewards({
            signupPoints: referralRule?.points || 50,
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

  const handleNavigateToAcceptDelegation = () => {
    router.push('/accept-delegation')
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
      onNavigateToAcceptDelegation={handleNavigateToAcceptDelegation}
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
