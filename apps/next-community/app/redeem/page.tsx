'use client'

import { RedemptionStore } from '@casagrown/app/features/redeem/RedemptionStore'
import { useRouter } from 'next/navigation'

export default function RedeemPage() {
  const router = useRouter()

  return (
    <RedemptionStore
      onNavigateToFeed={() => router.push('/feed')}
    />
  )
}
