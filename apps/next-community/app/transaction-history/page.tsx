'use client'

import { TransactionHistoryScreen } from '@casagrown/app/features/points/TransactionHistoryScreen'
import { useRouter } from 'next/navigation'

export default function TransactionHistoryPage() {
  const router = useRouter()

  return (
    <TransactionHistoryScreen
      onNavigateToFeed={() => router.push('/feed')}
      onNavigateToChat={(postId, otherUserId) =>
        router.push(`/chat?postId=${postId}&otherUserId=${otherUserId}`)
      }
    />
  )
}
