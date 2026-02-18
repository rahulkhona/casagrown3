import { useRouter } from 'expo-router'
import { OrdersScreen } from '@casagrown/app/features/orders'
import { useAuth } from '@casagrown/app/features/auth/auth-hook'

export default function OrdersTab() {
  const router = useRouter()
  const { user } = useAuth()

  if (!user) return null

  return (
    <OrdersScreen
      currentUserId={user.id}
      onClose={() => router.push('/(tabs)/feed')}
      onOpenChat={(postId, otherUserId) =>
        router.push(`/(tabs)/chat?postId=${postId}&otherUserId=${otherUserId}&from=orders`)
      }
    />
  )
}
