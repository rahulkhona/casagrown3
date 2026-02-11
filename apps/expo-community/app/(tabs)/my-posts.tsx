import { useRouter } from 'expo-router'
import { MyPostsScreen } from '@casagrown/app/features/my-posts/my-posts-screen'

export default function MyPostsTab() {
  const router = useRouter()

  return (
    <MyPostsScreen
      onBack={() => router.push('/(tabs)/feed')}
      onCreatePost={() => router.push('/(tabs)/create-post')}
      onViewPost={(postId) => router.push(`/(tabs)/feed?postId=${postId}`)}
      onEditPost={(postId, postType) => router.push(`/(tabs)/create-post?editId=${postId}&type=${postType}`)}
      onClone={(cloneData) => router.push(`/(tabs)/create-post?cloneData=${encodeURIComponent(cloneData)}`)}
    />
  )
}
