/**
 * Create Post - Expo route page
 *
 * Thin wrapper that renders CreatePostScreen and handles navigation.
 * Supports edit mode via `editId` and `type` query params,
 * and clone mode via `cloneData` query param.
 */

import { useRouter, useLocalSearchParams } from 'expo-router'
import { CreatePostScreen } from '@casagrown/app/features/create-post/create-post-screen'
import type { PostTypeKey } from '@casagrown/app/features/create-post/create-post-screen'

export default function CreatePostPage() {
  const router = useRouter()
  const params = useLocalSearchParams<{ editId?: string; type?: string; cloneData?: string }>()

  // Extract initialType from either explicit type param or from cloneData JSON
  let initialType: PostTypeKey | undefined
  let cloneDataStr: string | undefined

  if (params.editId && params.type) {
    initialType = params.type as PostTypeKey
  }

  if (params.cloneData) {
    try {
      cloneDataStr = decodeURIComponent(params.cloneData)
      const parsed = JSON.parse(cloneDataStr)
      initialType = parsed.type as PostTypeKey
    } catch {
      // Ignore parse errors — user will see type picker
    }
  }

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back()
    } else {
      router.replace('/(tabs)/feed')
    }
  }

  const handleSuccess = () => {
    if (params.editId || params.cloneData) {
      router.replace('/(tabs)/my-posts')
    } else {
      router.replace('/(tabs)/feed')
    }
  }

  return (
    <CreatePostScreen
      onBack={handleBack}
      onSuccess={handleSuccess}
      editId={params.editId}
      initialType={initialType}
      cloneData={cloneDataStr}
    />
  )
}

