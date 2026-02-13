import { useEffect, useState } from 'react'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useAuth, supabase } from '@casagrown/app/features/auth/auth-hook'
import { ChatScreen } from '@casagrown/app/features/chat/ChatScreen'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { YStack } from 'tamagui'

export default function ChatTab() {
  const router = useRouter()
  const { user } = useAuth()
  const params = useLocalSearchParams<{ postId: string; otherUserId: string }>()
  const insets = useSafeAreaInsets()
  const [userDisplayName, setUserDisplayName] = useState<string | undefined>()

  useEffect(() => {
    if (!user) return
    const fetchName = async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .single()
        if (data?.full_name) setUserDisplayName(data.full_name)
      } catch {
        // Non-critical
      }
    }
    fetchName()
  }, [user])

  if (!user || !params.postId || !params.otherUserId) {
    return null
  }

  return (
    <YStack flex={1} paddingTop={insets.top}>
      <ChatScreen
        postId={params.postId}
        otherUserId={params.otherUserId}
        currentUserId={user.id}
        currentUserName={userDisplayName}
        onClose={() => router.back()}
      />
    </YStack>
  )
}
