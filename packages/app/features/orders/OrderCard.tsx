/**
 * OrderCard — Compact order card for the orders list
 *
 * Shows product name, other party, status badge, price, and date.
 */

import React, { memo } from 'react'
import { YStack, XStack, Text } from 'tamagui'
import { TouchableOpacity, Image } from 'react-native'
import { ChevronRight } from '@tamagui/lucide-icons'
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
      style={{
        backgroundColor: 'white',
        borderRadius: 12,
        padding: 14,
        shadowColor: shadows.sm.color,
        shadowOffset: shadows.sm.offset,
        shadowOpacity: 0.06,
        shadowRadius: shadows.sm.radius,
        elevation: 1,
      }}
    >
      <XStack alignItems="center" gap="$3">
        {/* Avatar */}
        {otherAvatarUrl ? (
          <Image
            source={{ uri: otherAvatarUrl }}
            style={{ width: 44, height: 44, borderRadius: 22 }}
          />
        ) : (
          <YStack
            width={44}
            height={44}
            borderRadius={22}
            backgroundColor={colors.green[100]}
            alignItems="center"
            justifyContent="center"
          >
            <Text fontSize={16} fontWeight="700" color={colors.green[700]}>
              {initial}
            </Text>
          </YStack>
        )}

        {/* Content */}
        <YStack flex={1} gap={2}>
          <XStack alignItems="center" justifyContent="space-between">
            <Text
              fontSize={15}
              fontWeight="600"
              color={colors.gray[900]}
              numberOfLines={1}
            >
              {order.product}
            </Text>
            <Text fontSize={12} color={colors.gray[500]}>
              {formatDate(order.updated_at)}
            </Text>
          </XStack>

          <XStack alignItems="center" gap="$2">
            <Text fontSize={13} color={colors.gray[600]} numberOfLines={1}>
              {isBuyer ? t('orders.from') : t('orders.to')} {otherName}
            </Text>
          </XStack>

          <XStack
            alignItems="center"
            justifyContent="space-between"
            marginTop={2}
          >
            {/* Status badge */}
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
              >
                {statusConfig.label}
              </Text>
            </YStack>

            {/* Price + Role */}
            <XStack alignItems="center" gap="$1.5">
              <Text
                fontSize={11}
                fontWeight="500"
                color={colors.gray[500]}
                textTransform="uppercase"
              >
                {role === 'buyer'
                  ? t('orders.buying')
                  : t('orders.selling')}
              </Text>
              <Text fontSize={13} fontWeight="700" color={colors.gray[800]}>
                {order.total_price} pts
              </Text>
            </XStack>
          </XStack>
        </YStack>

        <ChevronRight size={18} color={colors.gray[400]} />
      </XStack>
    </TouchableOpacity>
  )
}

export const OrderCard = memo(OrderCardInner)
