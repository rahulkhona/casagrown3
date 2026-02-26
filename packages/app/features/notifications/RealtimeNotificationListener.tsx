import { useEffect, useRef } from 'react'
import { AppState, Platform } from 'react-native'
import { useToastController } from '@casagrown/ui'
import { useAuth, supabase } from '../auth/auth-hook'
import { useRouter } from 'solito/navigation'
import type { RealtimeChannel } from '@supabase/supabase-js'

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

  useEffect(() => {
    if (!user?.id) return

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
        }
      )

      // 2. Listen for Order completions
      channel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `status=eq.completed`,
        },
        async (payload) => {
          if (!mountedRef.current) return
          const oldOrder = payload.old
          const newOrder = payload.new

          if (oldOrder.status !== 'completed' && newOrder.status === 'completed') {
            if (newOrder.buyer_id === user.id) {
              toast.show('Order Complete', {
                message: 'Your points have been debited.',
                native: false,
              })
            } else if (newOrder.seller_id === user.id) {
              toast.show('Payment Received', {
                message: 'Order completed and points credited.',
                native: false,
              })
            } else {
              const { data: post } = await supabase
                .from('posts')
                .select('on_behalf_of')
                .eq('id', newOrder.post_id)
                .single()
              if (post?.on_behalf_of === user.id) {
                toast.show('Delegated Sale Complete', {
                  message: `An order for your delegated post has been completed.`,
                  native: false,
                  action: {
                    altText: 'History',
                    label: 'History',
                    onPress: () => router.push('/transaction-history'),
                  },
                })
              }
            }
          }
        }
      )

      // 3. Listen for Delegation changes
      // NOTE: RLS prevents listening on rows the user isn't involved in
      channel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'delegations',
        },
        async (payload) => {
          if (!mountedRef.current) return
          const oldDel = payload.old
          const newDel = payload.new

          console.log('[SystemChannel] Delegation update received:', { oldStatus: oldDel.status, newStatus: newDel.status, newDel })

          if (newDel.delegator_id !== user.id && newDel.delegatee_id !== user.id) {
            console.log('[SystemChannel] Delegation ignored, user not involved')
            return
          }

          // Acceptance
          if (oldDel.status === 'pending_pairing' && newDel.status === 'active') {
            if (newDel.delegator_id === user.id) {
              let delegateName = 'Someone'
              if (newDel.delegatee_id) {
                const { data: profile } = await supabase
                  .from('profiles')
                  .select('full_name')
                  .eq('id', newDel.delegatee_id)
                  .single()
                if (profile?.full_name) delegateName = profile.full_name
              }

              toast.show('Delegation Accepted', {
                message: `${delegateName} has accepted your request.`,
                native: false,
                action: { altText: 'View', label: 'View', onPress: () => router.push('/delegate') },
              })
            }
          }

          // Revocation / Rejection
          if (oldDel.status !== 'revoked' && newDel.status === 'revoked') {
            // Determine who we need to notify and who did the revoking
            // If the current user is the delegator, the delegatee revoked it (or rejected it).
            // If the current user is the delegatee, the delegator revoked it.
            const isDelegator = newDel.delegator_id === user.id
            const otherUserId = isDelegator ? newDel.delegatee_id : newDel.delegator_id
            
            let otherUserName = 'Someone'
            if (otherUserId) {
              const { data: profile } = await supabase
                .from('profiles')
                .select('full_name')
                .eq('id', otherUserId)
                .single()
              if (profile?.full_name) otherUserName = profile.full_name
            }

            let message = `${otherUserName} has revoked the delegation.`
            if (oldDel.status === 'pending' || oldDel.status === 'pending_pairing') {
              message = `${otherUserName} has declined the delegation request.`
            }

            toast.show('Delegation Revoked', {
              message,
              native: false,
              action: { altText: 'View', label: 'View', onPress: () => router.push('/delegate') },
            })
          }
        }
      )

      // 4. Listen for Redemptions
      channel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'redemptions',
          filter: `status=eq.completed`,
        },
        (payload) => {
          if (!mountedRef.current) return
          const oldRed = payload.old
          const newRed = payload.new
          
          if (newRed.user_id !== user.id) return

          // Only toast if it was explicitly queued and is now completed (background fulfillment).
          // Immediate successes shouldn't toast, because the user is actively on the redeem screen seeing the gift card.
          if (oldRed.status === 'queued' && newRed.status === 'completed') {
            toast.show('Redemption Complete', {
              message: `Your ${newRed.cash_value_cents / 100} cash redemption has been processed.`,
              native: false,
              action: {
                altText: 'History',
                label: 'History',
                onPress: () => router.push('/transaction-history')
              }
            })
          }
        }
      )

      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          isSubscribedRef.current = true
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
