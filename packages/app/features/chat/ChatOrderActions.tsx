/**
 * ChatOrderActions — Contextual order action bar for chat
 *
 * Renders above the chat input bar when the conversation has an active order.
 * Shows the order status badge and action buttons based on the current user's
 * role (buyer/seller) and the order's lifecycle state.
 */

import React, { useState, useCallback } from 'react'
import { YStack, XStack, Text, Button, Spinner } from 'tamagui'
import { Platform, Alert, TouchableOpacity } from 'react-native'
import {
  CheckCircle,
  XCircle,
  Truck,
  AlertTriangle,
  Star,
  ShieldAlert,
  DollarSign,
  Package,
  Calendar,
} from '@tamagui/lucide-icons'
import { colors, borderRadius } from '../../design-tokens'
import type { Order, OrderAction, Escalation, RefundOffer } from '../orders/order-types'
import { ORDER_STATUS_CONFIG, getAvailableActions } from '../orders/order-types'
import {
  cancelOrder,
  acceptOrder,
  rejectOrder,
  confirmDelivery,
  escalateDispute,
  acceptRefundOffer,
  rejectRefundOffer as rejectRefundOfferService,
  resolveDispute,
} from '../orders/order-service'

// =============================================================================
// Icon Mapping
// =============================================================================

const ICON_MAP: Record<string, React.ElementType> = {
  CheckCircle,
  CheckCircle2: CheckCircle,
  XCircle,
  Truck,
  AlertTriangle,
  Star,
  ShieldAlert,
  DollarSign,
  Edit3: Package,
  Calendar,
  Package,
}

// =============================================================================
// Props
// =============================================================================

interface ChatOrderActionsProps {
  order: Order
  currentUserId: string
  escalation: Escalation | null
  refundOffers: RefundOffer[]
  onOrderUpdated: () => void
  onDeliveryProof: () => void
  onDispute: () => void
  onMakeOffer: () => void
  onRate: () => void
  onSuggestDate: () => void
  onSuggestQty: () => void
  onModify: () => void
  t: (key: string, opts?: Record<string, unknown>) => string
}

// =============================================================================
// Component
// =============================================================================

export function ChatOrderActions({
  order,
  currentUserId,
  escalation,
  refundOffers,
  onOrderUpdated,
  onDeliveryProof,
  onDispute,
  onMakeOffer,
  onRate,
  onSuggestDate,
  onSuggestQty,
  onModify,
  t,
}: ChatOrderActionsProps) {
  const [loading, setLoading] = useState(false)

  const statusConfig = ORDER_STATUS_CONFIG[order.status]
  const actions = getAvailableActions(order, currentUserId, t)
  const isBuyer = currentUserId === order.buyer_id
  const pendingOffer = refundOffers.find((r) => r.status === 'pending')

  // ── Action handlers ──
  const confirmAction = useCallback(
    (title: string, message: string, onConfirm: () => Promise<void>) => {
      if (Platform.OS === 'web') {
        // Chrome aggressively suppresses window.confirm() dialogs.
        // Execute immediately — the button tap itself is the user's intent.
        console.log(`[OrderAction] Executing: ${title}`)
        onConfirm().catch((err) => {
          console.error('Action failed:', err)
          window.alert(err?.message || 'Action failed')
        })
      } else {
        Alert.alert(title, message, [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.confirm'),
            onPress: () => onConfirm().catch((err) => {
              console.error('Action failed:', err)
              Alert.alert('Error', err?.message || 'Action failed')
            }),
            style: 'destructive',
          },
        ])
      }
    },
    [t],
  )

  const handleAction = useCallback(
    async (action: OrderAction) => {
      switch (action.type) {
        case 'cancel':
          confirmAction(
            t('orders.confirmCancel'),
            t('orders.confirmCancelMessage'),
            async () => {
              setLoading(true)
              try {
                await cancelOrder(order.id, currentUserId)
                onOrderUpdated()
              } finally {
                setLoading(false)
              }
            },
          )
          break

        case 'accept':
          setLoading(true)
          try {
            const acceptResult = await acceptOrder(order.id, order.version)
            if (!acceptResult.success) {
              if (acceptResult.code === 'VERSION_MISMATCH') {
                if (Platform.OS === 'web') {
                  window.alert('Order was modified by the buyer. Please review the updated terms and try again.')
                } else {
                  Alert.alert('Order Modified', 'Order was modified by the buyer. Please review the updated terms and try again.')
                }
              } else {
                if (Platform.OS === 'web') {
                  window.alert(acceptResult.error || 'Failed to accept order')
                } else {
                  Alert.alert('Error', acceptResult.error || 'Failed to accept order')
                }
              }
            }
            onOrderUpdated()
          } finally {
            setLoading(false)
          }
          break

        case 'reject':
          confirmAction(
            t('orders.confirmReject'),
            t('orders.confirmRejectMessage'),
            async () => {
              setLoading(true)
              try {
                const rejectResult = await rejectOrder(order.id, order.version)
                if (!rejectResult.success) {
                  if (rejectResult.code === 'VERSION_MISMATCH') {
                    if (Platform.OS === 'web') {
                      window.alert('Order was modified by the buyer. Please review the updated terms before rejecting.')
                    } else {
                      Alert.alert('Order Modified', 'Order was modified by the buyer. Please review the updated terms before rejecting.')
                    }
                  } else {
                    if (Platform.OS === 'web') {
                      window.alert(rejectResult.error || 'Failed to reject order')
                    } else {
                      Alert.alert('Error', rejectResult.error || 'Failed to reject order')
                    }
                  }
                }
                onOrderUpdated()
              } finally {
                setLoading(false)
              }
            },
          )
          break

        case 'modify':
          onModify()
          break

        case 'suggest_date':
          onSuggestDate()
          break

        case 'suggest_qty':
          onSuggestQty()
          break

        case 'mark_delivered':
          onDeliveryProof()
          break

        case 'confirm_delivery':
          confirmAction(
            t('orders.confirmDelivery'),
            t('orders.confirmDeliveryMessage'),
            async () => {
              setLoading(true)
              try {
                await confirmDelivery(order.id, currentUserId)
                onOrderUpdated()
              } finally {
                setLoading(false)
              }
            },
          )
          break

        case 'dispute':
          onDispute()
          break

        case 'make_offer':
          onMakeOffer()
          break

        case 'accept_offer': {
          // Try to find pending offer — fetch on demand if not loaded
          let offerToAccept = pendingOffer
          if (!offerToAccept) {
            try {
              const { getEscalation, getRefundOffers } = require('../orders/order-service')
              const esc = await getEscalation(order.id)
              if (esc) {
                const offers = await getRefundOffers(esc.id)
                offerToAccept = offers.find((r: { status: string }) => r.status === 'pending')
              }
            } catch (e) {
              console.error('Failed to fetch pending offer:', e)
            }
          }
          if (offerToAccept) {
            confirmAction(
              t('orders.confirmAcceptOffer'),
              t('orders.confirmAcceptOfferMessage', { amount: offerToAccept.amount }),
              async () => {
                setLoading(true)
                try {
                  await acceptRefundOffer(order.id, currentUserId, offerToAccept!.id)
                  onOrderUpdated()
                } finally {
                  setLoading(false)
                }
              },
            )
          } else {
            if (Platform.OS === 'web') {
              window.alert('No pending refund offer to accept. The seller needs to make an offer first.')
            } else {
              Alert.alert('No Offer', 'No pending refund offer to accept. The seller needs to make an offer first.')
            }
          }
          break
        }

        case 'reject_offer':
          if (pendingOffer) {
            setLoading(true)
            try {
              await rejectRefundOfferService(pendingOffer.id)
              onOrderUpdated()
            } finally {
              setLoading(false)
            }
          }
          break

        case 'escalate':
          confirmAction(
            t('orders.confirmEscalate'),
            t('orders.confirmEscalateMessage'),
            async () => {
              setLoading(true)
              try {
                await escalateDispute(order.id, currentUserId)
                onOrderUpdated()
              } finally {
                setLoading(false)
              }
            },
          )
          break

        case 'resolve':
          confirmAction(
            'Resolve Dispute',
            'Are you sure you want to resolve this dispute without a refund?',
            async () => {
              setLoading(true)
              try {
                await resolveDispute(order.id, currentUserId)
                onOrderUpdated()
              } finally {
                setLoading(false)
              }
            },
          )
          break

        case 'rate':
          onRate()
          break

        default:
          break
      }
    },
    [order, currentUserId, pendingOffer, onOrderUpdated, onDeliveryProof, onDispute, onMakeOffer, onRate, t, confirmAction],
  )

  return (
    <YStack
      backgroundColor="white"
      borderTopWidth={1}
      borderBottomWidth={1}
      borderColor={colors.gray[200]}
      paddingHorizontal="$3"
      paddingVertical="$2.5"
      gap="$2"
    >
      {/* Status + Order Info Row */}
      <XStack alignItems="center" justifyContent="space-between">
        <XStack alignItems="center" gap="$2">
          <YStack
            paddingHorizontal="$2"
            paddingVertical="$1"
            borderRadius={borderRadius.sm}
            backgroundColor={statusConfig.bgColor as any}
          >
            <Text fontSize={11} fontWeight="700" color={statusConfig.color as any}>
              {statusConfig.label.toUpperCase()}
            </Text>
          </YStack>
          <Text fontSize={13} color={colors.gray[700]} fontWeight="500">
            {order.product} x{order.quantity}{order.unit ? ` ${order.unit}` : ''}
          </Text>
        </XStack>
        <Text fontSize={12} color={colors.gray[500]}>
          {order.points_per_unit} pts{order.unit && order.unit !== 'piece' ? `/${order.unit}` : ''}
        </Text>
      </XStack>

      {/* Delivery proof display (if delivered/disputed) */}
      {order.delivery_proof_timestamp && (
        <XStack
          backgroundColor={colors.gray[50]}
          borderRadius={borderRadius.md}
          padding="$2"
          gap="$1.5"
          alignItems="center"
        >
          <Truck size={14} color={colors.gray[500]} />
          <Text fontSize={11} color={colors.gray[600]}>
            {t('orders.deliveredAt', {
              date: new Date(order.delivery_proof_timestamp).toLocaleString(),
            })}
          </Text>
        </XStack>
      )}

      {/* Pending refund offer display (for buyer) */}
      {pendingOffer && isBuyer && (
        <XStack
          backgroundColor={colors.amber[100]}
          borderRadius={borderRadius.md}
          padding="$2.5"
          gap="$2"
          alignItems="center"
        >
          <DollarSign size={16} color={colors.amber[700]} />
          <YStack flex={1}>
            <Text fontSize={12} fontWeight="600" color={colors.amber[800]}>
              {t('orders.refundOffer', { amount: pendingOffer.amount })}
            </Text>
            {!!pendingOffer.message && (
              <Text fontSize={11} color={colors.amber[700]}>
                &quot;{pendingOffer.message}&quot;
              </Text>
            )}
          </YStack>
        </XStack>
      )}

      {/* Action Buttons — split into primary (left) and suggestions (right) */}
      {actions.length > 0 && (() => {
        const suggestionTypes = new Set(['suggest_date', 'suggest_qty'])
        const primaryActions = actions.filter(a => !suggestionTypes.has(a.type))
        const suggestionActions = actions.filter(a => suggestionTypes.has(a.type))

        const renderButton = (action: OrderAction) => {
          const IconComp = ICON_MAP[action.icon] ?? Package
          return (
            <TouchableOpacity
              key={action.type}
              activeOpacity={0.7}
              disabled={loading}
              onPress={() => handleAction(action)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 6,
                backgroundColor: action.bgColor,
                opacity: loading ? 0.5 : 1,
              }}
            >
              <IconComp size={13} color={action.color} />
              <Text fontSize={11} fontWeight="600" color={action.color as any}>
                {action.label}
              </Text>
            </TouchableOpacity>
          )
        }

        return (
          <XStack justifyContent="space-between" alignItems="center">
            <XStack gap="$2" flexWrap="wrap">
              {primaryActions.map(renderButton)}
              {loading && <Spinner size="small" color={colors.green[600]} />}
            </XStack>
            {suggestionActions.length > 0 && (
              <XStack gap="$2" flexWrap="wrap">
                {suggestionActions.map(renderButton)}
              </XStack>
            )}
          </XStack>
        )
      })()}

      {/* Escalated notice */}
      {order.status === 'escalated' && (
        <XStack
          backgroundColor="#f3e8ff"
          borderRadius={borderRadius.md}
          padding="$2.5"
          gap="$2"
          alignItems="center"
        >
          <ShieldAlert size={16} color="#7c3aed" />
          <Text fontSize={12} color="#7c3aed" fontWeight="500">
            {t('orders.escalatedNotice')}
          </Text>
        </XStack>
      )}
    </YStack>
  )
}
