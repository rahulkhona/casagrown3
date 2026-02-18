/**
 * OrderSummary — Detailed order summary view
 *
 * Shows full order details: product, participants, points breakdown,
 * delivery proof, ratings.
 */

import React from 'react'
import { YStack, XStack, Text, Separator } from 'tamagui'
import { TouchableOpacity, Image, ScrollView } from 'react-native'
import {
  ArrowLeft,
  Package,
  MapPin,
  Clock,
  Star,
  Truck,
  User,
  Calendar,
  DollarSign,
} from '@tamagui/lucide-icons'
import { colors, borderRadius, shadows } from '../../design-tokens'
import type { Order } from './order-types'
import { ORDER_STATUS_CONFIG } from './order-types'

// =============================================================================
// Props
// =============================================================================

interface OrderSummaryProps {
  order: Order
  currentUserId: string
  onClose: () => void
  t: (key: string, opts?: Record<string, unknown>) => string
}

// =============================================================================
// Helpers
// =============================================================================

function RatingStars({ score }: { score: number }) {
  return (
    <XStack gap={2}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          size={16}
          color={s <= score ? colors.amber[500] : colors.gray[300]}
          fill={s <= score ? colors.amber[500] : 'transparent'}
        />
      ))}
    </XStack>
  )
}

function DetailRow({
  icon: Icon,
  label,
  value,
  iconColor,
}: {
  icon: React.ElementType
  label: string
  value: string
  iconColor?: string
}) {
  return (
    <XStack alignItems="center" gap="$2.5" paddingVertical="$1.5">
      <Icon size={16} color={iconColor || colors.gray[500]} />
      <Text fontSize={13} color={colors.gray[600]} flex={1}>
        {label}
      </Text>
      <Text
        fontSize={13}
        fontWeight="600"
        color={colors.gray[800]}
        textAlign="right"
        maxWidth="60%"
      >
        {value}
      </Text>
    </XStack>
  )
}

// =============================================================================
// Component
// =============================================================================

export function OrderSummary({
  order,
  currentUserId,
  onClose,
  t,
}: OrderSummaryProps) {
  const isBuyer = currentUserId === order.buyer_id
  const statusConfig = ORDER_STATUS_CONFIG[order.status]
  const otherName = isBuyer
    ? order.seller_name || t('orders.unknownSeller')
    : order.buyer_name || t('orders.unknownBuyer')
  const myRating = isBuyer ? order.seller_rating : order.buyer_rating
  const myFeedback = isBuyer ? order.seller_feedback : order.buyer_feedback
  const theirRating = isBuyer ? order.buyer_rating : order.seller_rating
  const theirFeedback = isBuyer ? order.buyer_feedback : order.seller_feedback

  return (
    <YStack flex={1} backgroundColor={colors.gray[50]}>
      {/* Header */}
      <XStack
        backgroundColor="white"
        paddingHorizontal="$4"
        height={56}
        alignItems="center"
        gap="$3"
        borderBottomWidth={1}
        borderBottomColor={colors.gray[200]}
      >
        <TouchableOpacity
          onPress={onClose}
          style={{
            padding: 8,
            borderRadius: 20,
            minWidth: 40,
            minHeight: 40,
            alignItems: 'center',
            justifyContent: 'center',
          }}
          activeOpacity={0.6}
          aria-label="Back"
        >
          <ArrowLeft size={22} color={colors.gray[700]} />
        </TouchableOpacity>
        <Text fontSize={17} fontWeight="600" color={colors.gray[900]}>
          {t('orders.summary.title')}
        </Text>
      </XStack>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16 }}>
        {/* Status Card */}
        <YStack
          backgroundColor="white"
          borderRadius={borderRadius.lg}
          padding="$4"
          gap="$3"
          shadowColor={shadows.sm.color}
          shadowOffset={shadows.sm.offset}
          shadowOpacity={0.06}
          shadowRadius={shadows.sm.radius}
        >
          <XStack alignItems="center" justifyContent="space-between">
            <XStack alignItems="center" gap="$2">
              <Package size={20} color={colors.gray[700]} />
              <Text fontSize={18} fontWeight="700" color={colors.gray[900]}>
                {order.product}
              </Text>
            </XStack>
            <YStack
              paddingHorizontal="$2.5"
              paddingVertical="$1"
              borderRadius={borderRadius.sm}
              backgroundColor={statusConfig.bgColor as any}
            >
              <Text
                fontSize={11}
                fontWeight="700"
                color={statusConfig.color as any}
                textTransform="uppercase"
              >
                {statusConfig.label}
              </Text>
            </YStack>
          </XStack>

          <Separator borderColor={colors.gray[200]} />

          <DetailRow
            icon={User}
            label={isBuyer ? t('orders.summary.seller') : t('orders.summary.buyer')}
            value={otherName}
          />
          <DetailRow
            icon={Package}
            label={t('orders.summary.quantity')}
            value={`${order.quantity} × ${order.points_per_unit} pts`}
          />
          <DetailRow
            icon={DollarSign}
            label={t('orders.summary.total')}
            value={`${order.total_price} pts`}
            iconColor={colors.green[600]}
          />
          {order.delivery_date && (
            <DetailRow
              icon={Calendar}
              label={t('orders.summary.deliveryDate')}
              value={new Date(order.delivery_date + 'T00:00:00').toLocaleDateString(
                undefined,
                { month: 'long', day: 'numeric', year: 'numeric' },
              )}
            />
          )}
          {order.delivery_address && (
            <DetailRow
              icon={MapPin}
              label={t('orders.summary.address')}
              value={order.delivery_address}
            />
          )}
          {order.delivery_instructions && (
            <DetailRow
              icon={Package}
              label={t('orders.summary.instructions')}
              value={order.delivery_instructions}
            />
          )}
        </YStack>

        {/* Delivery Proof */}
        {order.delivery_proof_url && (
          <YStack
            backgroundColor="white"
            borderRadius={borderRadius.lg}
            padding="$4"
            gap="$3"
            shadowColor={shadows.sm.color}
            shadowOffset={shadows.sm.offset}
            shadowOpacity={0.06}
            shadowRadius={shadows.sm.radius}
          >
            <XStack alignItems="center" gap="$2">
              <Truck size={18} color="#0369a1" />
              <Text fontSize={15} fontWeight="600" color={colors.gray[900]}>
                {t('orders.summary.deliveryProof')}
              </Text>
            </XStack>

            <Image
              source={{ uri: order.delivery_proof_url }}
              style={{ width: '100%', height: 200, borderRadius: 12 }}
              resizeMode="cover"
            />

            <YStack gap="$1.5">
              {order.delivery_proof_location && (
                <XStack alignItems="center" gap="$1.5">
                  <MapPin size={13} color={colors.gray[500]} />
                  <Text fontSize={12} color={colors.gray[600]}>
                    {order.delivery_proof_location.latitude.toFixed(5)},{' '}
                    {order.delivery_proof_location.longitude.toFixed(5)}
                  </Text>
                </XStack>
              )}
              {order.delivery_proof_timestamp && (
                <XStack alignItems="center" gap="$1.5">
                  <Clock size={13} color={colors.gray[500]} />
                  <Text fontSize={12} color={colors.gray[600]}>
                    {new Date(order.delivery_proof_timestamp).toLocaleString()}
                  </Text>
                </XStack>
              )}
            </YStack>
          </YStack>
        )}

        {/* Ratings */}
        {(myRating || theirRating) && (
          <YStack
            backgroundColor="white"
            borderRadius={borderRadius.lg}
            padding="$4"
            gap="$3"
            shadowColor={shadows.sm.color}
            shadowOffset={shadows.sm.offset}
            shadowOpacity={0.06}
            shadowRadius={shadows.sm.radius}
          >
            <XStack alignItems="center" gap="$2">
              <Star size={18} color={colors.amber[600]} />
              <Text fontSize={15} fontWeight="600" color={colors.gray[900]}>
                {t('orders.summary.ratings')}
              </Text>
            </XStack>

            {/* My rating for them */}
            {myRating && (
              <YStack gap="$1">
                <Text fontSize={13} fontWeight="500" color={colors.gray[600]}>
                  {t('orders.summary.yourRating')}
                </Text>
                <RatingStars score={myRating} />
                {myFeedback && (
                  <Text fontSize={13} color={colors.gray[700]} marginTop="$1">
                    "{myFeedback}"
                  </Text>
                )}
              </YStack>
            )}

            {/* Their rating for me */}
            {theirRating && (
              <YStack gap="$1">
                <Text fontSize={13} fontWeight="500" color={colors.gray[600]}>
                  {t('orders.summary.theirRating', { name: otherName })}
                </Text>
                <RatingStars score={theirRating} />
                {theirFeedback && (
                  <Text fontSize={13} color={colors.gray[700]} marginTop="$1">
                    "{theirFeedback}"
                  </Text>
                )}
              </YStack>
            )}
          </YStack>
        )}

        {/* Bottom spacer */}
        <YStack height={24} />
      </ScrollView>
    </YStack>
  )
}
