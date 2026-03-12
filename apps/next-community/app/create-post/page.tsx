'use client'

import { CreatePostScreen } from '@casagrown/app/features/create-post/create-post-screen'
import type { PostTypeKey } from '@casagrown/app/features/create-post/create-post-screen'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function CreatePostContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Parse initialType from query params (used by Edit, Clone, and Welcome page prompts)
  const editId = searchParams.get('editId')
  const cloneDataRaw = searchParams.get('cloneData')
  const typeParam = searchParams.get('type')
  let initialType: PostTypeKey | undefined

  if (typeParam) {
    // Direct type param — used by welcome page prompts and edit flows
    initialType = typeParam as PostTypeKey
  } else if (cloneDataRaw) {
    try {
      const parsed = JSON.parse(decodeURIComponent(cloneDataRaw))
      initialType = parsed.type as PostTypeKey
    } catch {
      // Ignore parse errors — user will see type picker
    }
  }

  // Build cloneData string to pass through (if present)
  const cloneDataStr = cloneDataRaw ? decodeURIComponent(cloneDataRaw) : undefined

  return (
    <CreatePostScreen
      onBack={() => router.back()}
      onSuccess={() => router.push(editId || cloneDataRaw ? '/my-posts' : '/feed')}
      initialType={initialType}
      editId={editId ?? undefined}
      cloneData={cloneDataStr}
    />
  )
}

export default function CreatePostPage() {
  return (
    <Suspense fallback={null}>
      <CreatePostContent />
    </Suspense>
  )
}
