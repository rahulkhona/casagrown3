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
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | undefined>()
  const [userDisplayName, setUserDisplayName] = useState<string | undefined>()
  const [communityH3Index, setCommunityH3Index] = useState<string | undefined>()

  // Fetch user profile data (referral code, avatar, name)
  useEffect(() => {
    if (!user) return
    const fetchUserProfile = async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('referral_code, avatar_url, full_name, home_community_h3_index')
          .eq('id', user.id)
          .single()
        if (data) {
          if (data.referral_code) setReferralCode(data.referral_code)
          if (data.avatar_url) setUserAvatarUrl(data.avatar_url)
          if (data.full_name) setUserDisplayName(data.full_name)
          if (data.home_community_h3_index) setCommunityH3Index(data.home_community_h3_index)
        }
      } catch (err) {
        console.warn('Could not fetch user profile:', err)
      }
    }
    fetchUserProfile()
  }, [user])

  const handleCreatePost = () => {
    router.push('/(tabs)/create-post')
  }

  const handleNavigateToProfile = () => {
    router.push('/(tabs)/profile')
  }

  const handleNavigateToDelegate = () => {
    router.push('/(tabs)/delegate')
  }

  const handleNavigateToMyPosts = () => {
    router.push('/(tabs)/my-posts')
  }

  const handleNavigateToChat = (postId: string, authorId: string) => {
    router.push(`/(tabs)/chat?postId=${postId}&otherUserId=${authorId}`)
  }

  const handleNavigateToChats = () => {
    router.push('/(tabs)/chats')
  }


  return (
    <FeedScreen
      onCreatePost={handleCreatePost}
      onNavigateToProfile={handleNavigateToProfile}
      onNavigateToDelegate={handleNavigateToDelegate}
      onNavigateToMyPosts={handleNavigateToMyPosts}
      logoSrc={logoSrc}
      referralCode={referralCode}
      userAvatarUrl={userAvatarUrl}
      userDisplayName={userDisplayName}
      communityH3Index={communityH3Index}
      onNavigateToChat={handleNavigateToChat}
      onNavigateToChats={handleNavigateToChats}
      userId={user?.id}
    />
  )
}
