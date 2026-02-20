'use client'

import { useRouter } from 'next/navigation'
import { OffersScreen } from '@casagrown/app/features/offers'
import { useAuth } from '@casagrown/app/features/auth/auth-hook'

export default function OffersPage() {
  const router = useRouter()
  const { user } = useAuth()

  if (!user) return null

  return (
    <OffersScreen
      currentUserId={user.id}
      onClose={() => router.push('/feed')}
      onOpenChat={(postId, otherUserId) =>
        router.push(`/chat?postId=${postId}&otherUserId=${otherUserId}&from=offers`)
      }
    />
  )
}
