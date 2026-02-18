'use client'

import { useRouter } from 'next/navigation'
import { OrdersScreen } from '@casagrown/app/features/orders'
import { useAuth } from '@casagrown/app/features/auth/auth-hook'

export default function OrdersPage() {
  const router = useRouter()
  const { user } = useAuth()

  if (!user) return null

  return (
    <OrdersScreen
      currentUserId={user.id}
      onClose={() => router.push('/feed')}
      onOpenChat={(postId, otherUserId) =>
        router.push(`/chat?postId=${postId}&otherUserId=${otherUserId}&from=orders`)
      }
    />
  )
}
