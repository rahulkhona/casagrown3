import { TransactionHistoryScreen } from '@casagrown/app/features/points/TransactionHistoryScreen'
import { useRouter } from 'expo-router'

export default function TransactionHistoryTab() {
  const router = useRouter()

  return (
    <TransactionHistoryScreen
      onNavigateToFeed={() => router.push('/(tabs)/feed')}
      onNavigateToChat={(postId, otherUserId) =>
        router.push(`/(tabs)/chat?postId=${postId}&otherUserId=${otherUserId}`)
      }
    />
  )
}
