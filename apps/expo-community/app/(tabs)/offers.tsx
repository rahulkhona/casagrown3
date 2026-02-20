import { useRouter } from 'expo-router'
import { OffersScreen } from '@casagrown/app/features/offers'
import { useAuth } from '@casagrown/app/features/auth/auth-hook'

export default function OffersTab() {
  const router = useRouter()
  const { user } = useAuth()

  if (!user) return null

  return (
    <OffersScreen
      currentUserId={user.id}
      onClose={() => router.back()}
      onOpenChat={(postId, otherUserId) =>
        router.push(`/(tabs)/chat?postId=${postId}&otherUserId=${otherUserId}&from=offers`)
      }
    />
  )
}
