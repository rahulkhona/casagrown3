import { useEffect, useRef } from 'react'
import { AppState, Platform, DeviceEventEmitter } from 'react-native'
import { useToastController } from '@casagrown/ui'
import { useAuth, supabase } from '../auth/auth-hook'
import { useRouter } from 'solito/navigation'
import type { RealtimeChannel } from '@supabase/supabase-js'

/** Emit a badge refresh event so tab layouts can update counts */
export function emitBadgeRefresh() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.dispatchEvent(new Event('casagrown:badge-refresh'))
  } else {
    DeviceEventEmitter.emit('casagrown:badge-refresh')
  }
}

/**
 * RealtimeNotificationListener (System Channel)
 *
 * Binds to a single `system:[userId]` Supabase Realtime channel to deliver in-app toasts
 * for foregrounded users without requiring OS-level Push Notification SDKs.
 * 
 * Visibility-aware: Connects when active/visible, disconnects when backgrounded/hidden
 * to avoid idle WebSocket connection limits.
 */
export function RealtimeNotificationListener() {
  const { user } = useAuth()
  const toast = useToastController()
  const router = useRouter()
  
  const channelRef = useRef<RealtimeChannel | null>(null)
  const isSubscribedRef = useRef(false)
  const mountedRef = useRef(true)
  const hasShownLaunchToastRef = useRef(false)
  const lastResumeCheckRef = useRef<number>(0)

  useEffect(() => {
    if (!user?.id) return

    // Check for accumulated unread notifications and show a summary toast
    const checkUnreadOnLaunch = async () => {
      if (!user?.id || !mountedRef.current) return
      try {
        const { count, error } = await supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .is('read_at', null)

        if (error || !count || count === 0) return

        toast.show(`You have ${count} unread notification${count > 1 ? 's' : ''}`, {
          message: 'Tap to view your notifications',
          native: false,
          action: {
            altText: 'View',
            label: 'View',
            onPress: () => {
              // Emit badge refresh to ensure counts are current
              emitBadgeRefresh()
            },
          },
        })
      } catch (err) {
        console.warn('[SystemChannel] Failed to check unread notifications:', err)
      }
    }

    const subscribe = () => {
      if (isSubscribedRef.current || !user?.id) return

      // Use a single user-scoped channel to multiplex all background events
      const channel = supabase.channel(`system:${user.id}`)

      // 1. Listen for new chat messages
      channel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
        },
        async (payload) => {
          if (!mountedRef.current) return
          const message = payload.new
          console.log('[SystemChannel] New message payload received:', message)
          // Don't toast for our own messages
          if (message.sender_id === user.id) return

          const { data: conv } = await supabase
            .from('conversations')
            .select('buyer_id, seller_id, post_id')
            .eq('id', message.conversation_id)
            .single()

          if (!conv) return
          if (conv.buyer_id !== user.id && conv.seller_id !== user.id) return

          const otherUserId =
            conv.buyer_id === user.id ? conv.seller_id : conv.buyer_id

          // Ensure system messages match the visible_to metadata
          if (!message.sender_id && message.metadata?.visible_to) {
            if (message.metadata.visible_to !== user.id) {
              console.log('[SystemChannel] Dropped due to visible_to mismatch')
              return
            }
          }

          console.log('[SystemChannel] Triggering toast for msg:', message.id)

          const txt = message.content ? String(message.content) : 'Sent an attachment'
          let senderName = 'Someone'
          if (message.sender_id) {
            const { data: senderData } = await supabase
              .from('profiles')
              .select('full_name')
              .eq('id', message.sender_id)
              .single()
            if (senderData?.full_name) senderName = senderData.full_name
          }

          toast.show(`New Message from ${senderName}`, {
            message: txt.length > 50 ? txt.substring(0, 50) + '...' : txt,
            native: false,
            action: {
              altText: 'View',
              label: 'View',
              onPress: () => router.push(`/chat?postId=${conv.post_id}&otherUserId=${otherUserId}`),
            },
          })

          // Trigger badge count refresh in tab layout
          emitBadgeRefresh()
        }
      )

      // 2. Listen for ALL notifications (unified toast for orders, cashouts, bans, etc.)
      channel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (!mountedRef.current) return
          const notif = payload.new

          const content = String(notif.content || '')
          const linkUrl = notif.link_url

          toast.show('Notification', {
            message: content.length > 80 ? content.substring(0, 80) + '...' : content,
            native: false,
            ...(linkUrl ? {
              action: {
                altText: 'View',
                label: 'View',
                onPress: () => router.push(linkUrl),
              },
            } : {}),
          })

          // Trigger badge count refresh in tab layout
          emitBadgeRefresh()
        }
      )

      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          isSubscribedRef.current = true
          // Show accumulated unreads on first subscribe (app launch)
          if (!hasShownLaunchToastRef.current) {
            hasShownLaunchToastRef.current = true
            checkUnreadOnLaunch()
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          isSubscribedRef.current = false
        }
      })

      channelRef.current = channel
    }

    const unsubscribe = () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
        isSubscribedRef.current = false
      }
    }

    // Subscribe immediately
    subscribe()

    // Native: AppState listener
    let appStateSub: ReturnType<typeof AppState.addEventListener> | null = null;
    if (Platform.OS !== 'web') {
      appStateSub = AppState.addEventListener('change', (state) => {
        if (state === 'active') {
          subscribe()
          // Re-check unreads on resume (throttled to once per 30s)
          const now = Date.now()
          if (now - lastResumeCheckRef.current > 30_000) {
            lastResumeCheckRef.current = now
            checkUnreadOnLaunch()
          }
          emitBadgeRefresh()
        } else if (state === 'background' || state === 'inactive') {
          unsubscribe()
        }
      })
    }

    // Web: visibilitychange listener
    let handleVisibility: (() => void) | null = null;
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      handleVisibility = () => {
        if (document.visibilityState === 'visible') {
          subscribe()
          // Re-check unreads when tab becomes visible (throttled)
          const now = Date.now()
          if (now - lastResumeCheckRef.current > 30_000) {
            lastResumeCheckRef.current = now
            checkUnreadOnLaunch()
          }
          emitBadgeRefresh()
        } else {
          unsubscribe()
        }
      }
      document.addEventListener('visibilitychange', handleVisibility)
    }

    return () => {
      unsubscribe()
      appStateSub?.remove()
      if (handleVisibility && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility)
      }
    }
  }, [user?.id, toast, router])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  return null
}
