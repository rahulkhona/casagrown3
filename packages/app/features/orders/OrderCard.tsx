/**
 * OrderCard — Status-only order summary card for the orders list
 *
 * Shows product, other party, status badge, delivery details, and pricing.
 * The entire card is clickable and navigates to the associated chat.
 * All order actions are handled in the chat interface (ChatOrderActions).
 */

import React, { memo } from 'react'
import { YStack, XStack, Text } from 'tamagui'
import { TouchableOpacity, Image } from 'react-native'
import {
  Truck,
  ShieldAlert,
  DollarSign,
  Calendar,
  MapPin,
  MessageCircle,
} from '@tamagui/lucide-icons'
import { colors, borderRadius, shadows } from '../../design-tokens'
import type { Order, UserRole } from './order-types'
import { ORDER_STATUS_CONFIG } from './order-types'
import { normalizeStorageUrl } from '../../utils/normalize-storage-url'

// =============================================================================
// Props
// =============================================================================

interface OrderCardProps {
  order: Order
  currentUserId: string
  onPress: (order: Order) => void
  t: (key: string, opts?: Record<string, unknown>) => string
}

// =============================================================================
// Helpers
// =============================================================================

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } else if (diffDays === 1) {
    return 'Yesterday'
  } else if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'short' })
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function formatDeliveryDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// =============================================================================
// Component
// =============================================================================

function OrderCardInner({
  order,
  currentUserId,
  onPress,
  t,
}: OrderCardProps) {
  const isBuyer = currentUserId === order.buyer_id
  const role: UserRole = isBuyer ? 'buyer' : 'seller'
  const otherName = isBuyer
    ? order.seller_name || t('orders.unknownSeller')
    : order.buyer_name || t('orders.unknownBuyer')
  const otherAvatarUrl = normalizeStorageUrl(
    isBuyer ? order.seller_avatar_url : order.buyer_avatar_url,
  )
  const statusConfig = ORDER_STATUS_CONFIG[order.status]
  const initial = otherName.charAt(0).toUpperCase()

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => onPress(order)}
      testID={`order-card-${order.id}`}
      accessibilityLabel={`${order.product} order - ${statusConfig.label}`}
    >
      <YStack
        backgroundColor="white"
        borderRadius={borderRadius.lg}
        padding="$3.5"
        gap="$2.5"
        shadowColor={shadows.sm.color}
        shadowOffset={shadows.sm.offset}
        shadowOpacity={0.06}
        shadowRadius={shadows.sm.radius}
        elevation={1}
      >
        {/* ── Header: Product + Status + Timestamp ── */}
        <XStack alignItems="center" justifyContent="space-between">
          <XStack alignItems="center" gap="$2" flex={1}>
            <Text
              fontSize={16}
              fontWeight="700"
              color={colors.gray[900]}
              numberOfLines={1}
            >
              {order.product}
            </Text>
            <YStack
              paddingHorizontal="$2"
              paddingVertical={2}
              borderRadius={borderRadius.sm}
              backgroundColor={statusConfig.bgColor as any}
            >
              <Text
                fontSize={10}
                fontWeight="700"
                color={statusConfig.color as any}
                textTransform="uppercase"
                testID={`order-status-${order.id}`}
              >
                {statusConfig.label}
              </Text>
            </YStack>
          </XStack>
          <Text fontSize={11} color={colors.gray[500]}>
            {formatDate(order.updated_at)}
          </Text>
        </XStack>

        {/* ── Other Party Row ── */}
        <XStack alignItems="center" gap="$2.5">
          {otherAvatarUrl ? (
            <Image
              source={{ uri: otherAvatarUrl }}
              style={{ width: 36, height: 36, borderRadius: 18 }}
            />
          ) : (
            <YStack
              width={36}
              height={36}
              borderRadius={18}
              backgroundColor={colors.green[100]}
              alignItems="center"
              justifyContent="center"
            >
              <Text fontSize={14} fontWeight="700" color={colors.green[700]}>
                {initial}
              </Text>
            </YStack>
          )}
          <YStack flex={1}>
            <Text fontSize={13} color={colors.gray[600]}>
              {isBuyer ? t('orders.from') : t('orders.to')}{' '}
              <Text fontWeight="600" color={colors.gray[800]}>
                {otherName}
              </Text>
            </Text>
            <Text fontSize={12} color={colors.gray[500]}>
              {order.quantity} {order.unit || 'units'} × {order.points_per_unit}{' '}
              pts = {order.total_price} pts
            </Text>
          </YStack>
          {/* Chat indicator icon */}
          <MessageCircle size={18} color={colors.gray[400]} />
        </XStack>

        {/* ── Delivery Details ── */}
        {(order.delivery_address || order.delivery_date) && (
          <XStack gap="$3" flexWrap="wrap">
            {order.delivery_address && (
              <XStack alignItems="center" gap="$1" flex={1} minWidth={120}>
                <MapPin size={13} color={colors.gray[500]} />
                <Text
                  fontSize={12}
                  color={colors.gray[600]}
                  numberOfLines={1}
                  flex={1}
                >
                  {order.delivery_address}
                </Text>
              </XStack>
            )}
            {order.delivery_date && (
              <XStack alignItems="center" gap="$1">
                <Calendar size={13} color={colors.gray[500]} />
                <Text fontSize={12} color={colors.gray[600]}>
                  {formatDeliveryDate(order.delivery_date)}
                </Text>
              </XStack>
            )}
          </XStack>
        )}

        {/* ── Delivery Proof (when delivered/disputed) ── */}
        {order.delivery_proof_timestamp && (
          <XStack
            backgroundColor={colors.gray[50]}
            borderRadius={borderRadius.md}
            padding="$2"
            gap="$2"
            alignItems="center"
          >
            <Truck size={14} color={colors.gray[500]} />
            <Text fontSize={11} color={colors.gray[600]} flex={1}>
              Delivered{' '}
              {new Date(order.delivery_proof_timestamp).toLocaleString([], {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
            {order.delivery_proof_url && (
              <Image
                source={{ uri: normalizeStorageUrl(order.delivery_proof_url) || '' }}
                style={{ width: 32, height: 32, borderRadius: 6 }}
              />
            )}
          </XStack>
        )}

        {/* ── Escalated Notice ── */}
        {order.status === 'escalated' && (
          <XStack
            backgroundColor="#f3e8ff"
            borderRadius={borderRadius.md}
            padding="$2"
            gap="$1.5"
            alignItems="center"
          >
            <ShieldAlert size={14} color="#7c3aed" />
            <Text fontSize={11} color="#7c3aed" fontWeight="500">
              Under community review
            </Text>
          </XStack>
        )}
      </YStack>
    </TouchableOpacity>
  )
}

export const OrderCard = memo(OrderCardInner)
