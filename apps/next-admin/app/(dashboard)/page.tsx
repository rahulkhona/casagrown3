'use client'

import { YStack, Text } from 'tamagui'
import { useAuth } from '@casagrown/app/features/auth/auth-hook'

export default function DashboardHome() {
  const { user } = useAuth()

  return (
    <YStack flex={1} padding="$6" gap="$6" maxWidth={800}>
      <YStack gap="$2">
        <Text fontSize="$8" fontWeight="bold">Global Dashboard</Text>
        <Text color="$gray11">Welcome back, {user?.email}</Text>
        <Text>Select an item from the sidebar to manage platform configuration.</Text>
      </YStack>
    </YStack>
  )
}
