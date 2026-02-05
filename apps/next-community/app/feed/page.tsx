'use client'

import { FeedScreen } from '@casagrown/app/features/feed/feed-screen'
import { useRouter } from 'next/navigation'

export default function FeedPage() {
  const router = useRouter()

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
    />
  )
}
