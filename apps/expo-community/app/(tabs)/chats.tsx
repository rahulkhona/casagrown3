import { useEffect, useState } from 'react'
import { useRouter } from 'expo-router'
import { useAuth, supabase } from '@casagrown/app/features/auth/auth-hook'
import { ChatInboxScreen } from '@casagrown/app/features/chat/ChatInboxScreen'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { YStack } from 'tamagui'

export default function ChatsTab() {
  const router = useRouter()
  const { user } = useAuth()
  const insets = useSafeAreaInsets()

  if (!user) {
    return null
  }

  return (
    <YStack flex={1} paddingTop={insets.top}>
      <ChatInboxScreen
        currentUserId={user.id}
        onOpenChat={(postId, otherUserId) => {
          router.push(`/(tabs)/chat?postId=${postId}&otherUserId=${otherUserId}`)
        }}
        onClose={() => router.back()}
      />
    </YStack>
  )
}
