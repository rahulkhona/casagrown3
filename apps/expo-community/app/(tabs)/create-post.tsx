/**
 * Create Post - Expo route page
 *
 * Thin wrapper that renders CreatePostScreen and handles navigation
 */

import { useRouter } from 'expo-router'
import { CreatePostScreen } from '@casagrown/app/features/create-post/create-post-screen'

export default function CreatePostPage() {
  const router = useRouter()

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back()
    } else {
      router.replace('/(tabs)/feed')
    }
  }

  const handleSuccess = () => {
    // Navigate back to feed after successful post creation
    router.replace('/(tabs)/feed')
  }

  return (
    <CreatePostScreen
      onBack={handleBack}
      onSuccess={handleSuccess}
    />
  )
}
