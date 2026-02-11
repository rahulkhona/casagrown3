'use client'

import { CreatePostScreen } from '@casagrown/app/features/create-post/create-post-screen'
import type { PostTypeKey } from '@casagrown/app/features/create-post/create-post-screen'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function CreatePostContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Parse initialType from query params (used by Edit and Clone from My Posts)
  const editId = searchParams.get('editId')
  const cloneDataRaw = searchParams.get('cloneData')
  let initialType: PostTypeKey | undefined

  if (editId) {
    // editId carries the post type as query param
    const typeParam = searchParams.get('type')
    if (typeParam) {
      initialType = typeParam as PostTypeKey
    }
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
