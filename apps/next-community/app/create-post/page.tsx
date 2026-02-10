'use client'

import { CreatePostScreen } from '@casagrown/app/features/create-post/create-post-screen'
import { useRouter } from 'next/navigation'

export default function CreatePostPage() {
  const router = useRouter()

  return (
    <CreatePostScreen
      onBack={() => router.back()}
      onSuccess={() => router.push('/feed')}
    />
  )
}
