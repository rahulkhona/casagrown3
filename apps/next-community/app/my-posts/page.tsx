'use client'

import { useRouter } from 'next/navigation'
import { MyPostsScreen } from '@casagrown/app/features/my-posts/my-posts-screen'

export default function MyPostsPage() {
  const router = useRouter()

  return (
    <MyPostsScreen
      onBack={() => router.push('/feed')}
      onCreatePost={() => router.push('/create-post')}
      onViewPost={(postId) => router.push(`/feed?postId=${postId}`)}
      onEditPost={(postId, postType) => router.push(`/create-post?editId=${postId}&type=${postType}`)}
      onClone={(cloneData) => router.push(`/create-post?cloneData=${encodeURIComponent(cloneData)}`)}
    />
  )
}
