'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useAuth } from '@casagrown/app/features/auth/auth-hook'
import { ChatScreen } from '@casagrown/app/features/chat/ChatScreen'
import { useEffect, useState } from 'react'
import { supabase } from '@casagrown/app/features/auth/auth-hook'

export default function ChatPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { user } = useAuth()
  const [userDisplayName, setUserDisplayName] = useState<string | undefined>()

  const postId = searchParams.get('postId')
  const otherUserId = searchParams.get('otherUserId')

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

  if (!user || !postId || !otherUserId) {
    return null
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <ChatScreen
        postId={postId}
        otherUserId={otherUserId}
        currentUserId={user.id}
        currentUserName={userDisplayName}
        onClose={() => router.back()}
      />
    </div>
  )
}
