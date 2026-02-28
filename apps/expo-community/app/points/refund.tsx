import { RefundPointsScreen } from '@casagrown/app/features/points/RefundPointsScreen'
import { Stack } from 'expo-router'

export default function RefundPointsPage() {
  return (
    <>
      <Stack.Screen options={{ title: 'Refund Points', headerShown: false }} />
      <RefundPointsScreen />
    </>
  )
}
