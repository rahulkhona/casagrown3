import { RedemptionStore } from '@casagrown/app/features/redeem/RedemptionStore'
import { useRouter } from 'expo-router'

export default function RedeemTab() {
  const router = useRouter()

  return (
    <RedemptionStore
      onNavigateToFeed={() => router.push('/(tabs)/feed')}
    />
  )
}
