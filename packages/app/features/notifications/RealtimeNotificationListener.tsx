import { useEffect } from 'react'
import { useToastController } from '@casagrown/ui'
import { useAuth, supabase } from '../auth/auth-hook'
import { useRouter } from 'solito/navigation'

/**
 * RealtimeNotificationListener
 * 
 * Binds to Supabase Realtime to deliver in-app toasts for foregrounded users
 * without requiring OS-level Push Notification permissions.
 * 
 * Listens for:
 * 1. New chat messages (where user is participant)
 * 2. Order updates (completion, dispute, etc.)
 * 3. Delegation updates (accepted, revoked, etc.)
 */
export function RealtimeNotificationListener() {
  const { user } = useAuth()
  const toast = useToastController()
  const router = useRouter()

  useEffect(() => {
    if (!user?.id) return

    // 1. Listen for new chat messages
    const messageSub = supabase
      .channel('realtime-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
        },
        async (payload) => {
          const message = payload.new
          // Don't toast for our own messages
          if (message.sender_id === user.id) return

          // Fetch the conversation briefly to ensure the user is part of it
          // OR rely on RLS (if RLS prevents us from receiving INSERTS we shouldn't see)
          // But RLS on realtime requires the token to be passed, standard behavior intercepts everything if RLS is off for replication
          
          const { data: conv } = await supabase
            .from('conversations')
            .select('participant_1_id, participant_2_id, post_id')
            .eq('id', message.conversation_id)
            .single()

          if (!conv) return
          if (conv.participant_1_id !== user.id && conv.participant_2_id !== user.id) return

          // Determine other user for routing
          const otherUserId = conv.participant_1_id === user.id ? conv.participant_2_id : conv.participant_1_id

          // Ensure system messages match the visible_to metadata
          if (!message.sender_id && message.metadata?.visible_to) {
            if (message.metadata.visible_to !== user.id) return
          }

          const txt = message.content ? String(message.content) : 'Sent an attachment'
          toast.show('New Message', {
            message: txt.length > 50 ? txt.substring(0, 50) + '...' : txt,
            native: false,
            action: {
              altText: 'View',
              label: 'View',
              onPress: () => router.push(`/chat?postId=${conv.post_id}&otherUserId=${otherUserId}`)
            }
          })
        }
      )
      .subscribe()

    // 2. Listen for Order completions
    const orderSub = supabase
      .channel('realtime-orders')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `status=eq.completed`
        },
        async (payload) => {
          const oldOrder = payload.old
          const newOrder = payload.new

          // Only fire when transitioning to completed
          if (oldOrder.status !== 'completed' && newOrder.status === 'completed') {
            // Check if seller or buyer is the user
            if (newOrder.buyer_id === user.id) {
              toast.show('Order Complete', {
                message: 'Your points have been debited.',
                native: false
              })
            } else if (newOrder.seller_id === user.id) {
              toast.show('Payment Received', {
                message: 'Order completed and points credited.',
                native: false
              })
            } else {
              // Check if delegated
              const { data: post } = await supabase.from('posts').select('on_behalf_of').eq('id', newOrder.post_id).single()
              if (post?.on_behalf_of === user.id) {
                 toast.show('Delegated Sale Complete', {
                    message: `An order for your delegated post has been completed.`,
                    native: false,
                    action: {
                      altText: 'History',
                      label: 'History',
                      onPress: () => router.push('/transaction-history')
                    }
                  })
              }
            }
          }
        }
      )
      .subscribe()

    // 3. Listen for Delegation changes
    const delegationSub = supabase
      .channel('realtime-delegations')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'delegations',
        },
        (payload) => {
          const oldDel = payload.old
          const newDel = payload.new

          // Must be involved
          if (newDel.delegator_id !== user.id && newDel.delegatee_id !== user.id) return

          // Acceptance
          if (oldDel.status === 'pending_pairing' && newDel.status === 'active') {
            if (newDel.delegator_id === user.id) {
              toast.show('Delegation Accepted', {
                message: 'Your designated delegate has accepted the request.',
                native: false,
                action: { altText: 'View', label: 'View', onPress: () => router.push('/delegate') }
              })
            }
          }

          // Revocation / Rejection
          if (oldDel.status !== 'revoked' && newDel.status === 'revoked') {
             toast.show('Delegation Revoked', {
                message: 'A delegation request was revoked or rejected.',
                native: false,
                action: { altText: 'View', label: 'View', onPress: () => router.push('/delegate') }
              })
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(messageSub)
      supabase.removeChannel(orderSub)
      supabase.removeChannel(delegationSub)
    }
  }, [user?.id, toast, router])

  return null
}
