'use client'

import { useRouter } from 'next/navigation'
import { ChatInboxScreen } from '@casagrown/app/features/chat/ChatInboxScreen'
import { useAuth } from '@casagrown/app/features/auth/auth-hook'

export default function ChatsPage() {
  const router = useRouter()
  const { user } = useAuth()

  if (!user) {
    return null
  }

  return (
    <ChatInboxScreen
      currentUserId={user.id}
      onOpenChat={(postId, otherUserId) => {
        router.push(`/chat?postId=${postId}&otherUserId=${otherUserId}`)
      }}
      onClose={() => router.push('/feed')}
    />
  )
}
