/**
 * ChatOfferActions — Contextual offer action bar for chat
 *
 * Renders above the chat input bar when a want_to_buy post has a pending offer.
 * Shows offer details and action buttons based on the current user's role:
 * - Buyer: Accept / Reject
 * - Seller: Modify / Withdraw
 */

import React, { useState, useCallback } from 'react'
import { YStack, XStack, Text, Button, Spinner } from 'tamagui'
import { Alert, Platform, TouchableOpacity, Image } from 'react-native'
import {
  CheckCircle,
  XCircle,
  Edit3,
  MinusCircle,
  Package,
  Calendar,
  Clock,
  Image as ImageIcon,
  Video,
  ShoppingCart,
} from '@tamagui/lucide-icons'
import { colors, borderRadius } from '../../design-tokens'
import { normalizeStorageUrl } from '../../utils/normalize-storage-url'
import type { Offer } from '../offers/offer-types'
import { OFFER_STATUS_CONFIG, getAvailableOfferActions } from '../offers/offer-types'
import { rejectOffer, withdrawOffer } from '../offers/offer-service'

// =============================================================================
// Icon Mapping
// =============================================================================

const ICON_MAP: Record<string, React.ElementType> = {
  CheckCircle,
  XCircle,
  Edit3,
  MinusCircle,
  Clock,
  ShoppingCart,
}

// =============================================================================
// Props
// =============================================================================

interface ChatOfferActionsProps {
  offer: Offer
  currentUserId: string
  buyerId: string
  sellerId: string
  onOfferUpdated: () => void
  onModify: () => void
  onAccept: () => void
  t: (key: string, opts?: Record<string, unknown>) => string
}

// =============================================================================
// Component
// =============================================================================

export function ChatOfferActions({
  offer,
  currentUserId,
  buyerId,
  sellerId,
  onOfferUpdated,
  onModify,
  onAccept,
  t,
}: ChatOfferActionsProps) {
  const [loading, setLoading] = useState(false)

  const statusConfig = OFFER_STATUS_CONFIG[offer.status]
  const actions = getAvailableOfferActions(offer, currentUserId, t)
  const isBuyer = currentUserId === buyerId
  const isSeller = currentUserId === sellerId
  const totalPoints = offer.quantity * offer.points_per_unit

  // ── Action handlers ──

  const handleAction = useCallback(
    async (actionType: string) => {
      setLoading(true)
      try {
        switch (actionType) {
          case 'accept': {
            onAccept()
            setLoading(false)
            break
          }
          case 'reject': {
            const doReject = async () => {
              setLoading(true)
              try {
                const result = await rejectOffer(offer.id, currentUserId)
                if (!result.success) {
                  const errMsg = result.error || t('offers.actions.unknownError')
                  if (Platform.OS === 'web') {
                    window.alert(errMsg)
                  } else {
                    Alert.alert(t('offers.actions.error'), errMsg)
                  }
                }
                onOfferUpdated()
              } finally {
                setLoading(false)
              }
            }

            if (Platform.OS === 'web') {
              // Chrome suppresses window.confirm; execute directly
              doReject()
            } else {
              Alert.alert(
                t('offers.actions.confirmRejectTitle'),
                t('offers.actions.confirmRejectMessage'),
                [
                  { text: t('offers.actions.cancel'), style: 'cancel' },
                  {
                    text: t('offers.actions.confirmReject'),
                    style: 'destructive',
                    onPress: doReject,
                  },
                ],
              )
              setLoading(false)
            }
            return
          }
          case 'withdraw': {
            const doWithdraw = async () => {
              setLoading(true)
              try {
                const result = await withdrawOffer(offer.id, currentUserId)
                if (!result.success) {
                  const errMsg = result.error || t('offers.actions.unknownError')
                  if (Platform.OS === 'web') {
                    window.alert(errMsg)
                  } else {
                    Alert.alert(t('offers.actions.error'), errMsg)
                  }
                }
                onOfferUpdated()
              } finally {
                setLoading(false)
              }
            }

            if (Platform.OS === 'web') {
              doWithdraw()
            } else {
              Alert.alert(
                t('offers.actions.confirmWithdrawTitle'),
                t('offers.actions.confirmWithdrawMessage'),
                [
                  { text: t('offers.actions.cancel'), style: 'cancel' },
                  {
                    text: t('offers.actions.confirmWithdraw'),
                    style: 'destructive',
                    onPress: doWithdraw,
                  },
                ],
              )
              setLoading(false)
            }
            return
          }
          case 'modify': {
            onModify()
            setLoading(false)
            return
          }
        }
        onOfferUpdated()
      } catch (err) {
        const msg = err instanceof Error ? err.message : t('offers.actions.unknownError')
        Alert.alert(t('offers.actions.error'), msg)
      } finally {
        setLoading(false)
      }
    },
    [offer, currentUserId, onOfferUpdated, onModify, t],
  )

  return (
    <YStack
      backgroundColor="white"
      borderTopWidth={1}
      borderTopColor={colors.gray[200]}
      padding="$3"
      gap="$2.5"
    >
      {/* ── Offer Summary ── */}
      <XStack justifyContent="space-between" alignItems="center">
        <XStack alignItems="center" gap="$2">
          <Package size={16} color={colors.gray[600]} />
          <YStack>
            <Text fontSize={14} fontWeight="700" color={colors.gray[800]}>
              {offer.product}
            </Text>
            <Text fontSize={12} color={colors.gray[500]}>
              {offer.quantity} {offer.unit ?? ''} × {offer.points_per_unit} pts = {totalPoints} pts
            </Text>
          </YStack>
        </XStack>

        {/* Status badge */}
        <XStack
          backgroundColor={statusConfig.bgColor as any}
          paddingHorizontal="$2"
          paddingVertical="$1"
          borderRadius={12}
          alignItems="center"
          gap="$1"
        >
          {(() => {
            const IconComp = ICON_MAP[statusConfig.icon] ?? Clock
            return <IconComp size={12} color={statusConfig.color} />
          })()}
          <Text fontSize={11} fontWeight="700" color={statusConfig.color as any}>
            {statusConfig.label}
          </Text>
        </XStack>
      </XStack>

      {/* ── Optional details ── */}
      {(() => {
        const dates = offer.delivery_dates && offer.delivery_dates.length > 0
          ? offer.delivery_dates
          : offer.delivery_date ? [offer.delivery_date] : []
        return (dates.length > 0 || offer.message) ? (
          <YStack gap="$1" paddingLeft="$6">
            {dates.length > 0 && (
              <XStack alignItems="center" gap="$1.5" flexWrap="wrap">
                <Calendar size={12} color={colors.gray[400]} />
                <Text fontSize={12} color={colors.gray[500]}>
                  {dates.map(d => new Date(d + 'T00:00:00').toLocaleDateString(undefined, {
                    month: 'short', day: 'numeric',
                  })).join(', ')}
                </Text>
              </XStack>
            )}
            {offer.message && (
              <Text fontSize={12} color={colors.gray[500]} numberOfLines={2}>
                {offer.message}
              </Text>
            )}
          </YStack>
        ) : null
      })()}

      {/* ── Media ── */}
      {offer.media && offer.media.length > 0 && (
        <XStack gap="$2" paddingLeft="$6" flexWrap="wrap">
          {offer.media.map((item, index) => {
            const url = normalizeStorageUrl(item.storage_path)
            if (!url) return null
            return (
              <YStack
                key={item.storage_path}
                width={40}
                height={40}
                borderRadius={6}
                overflow="hidden"
                backgroundColor={colors.gray[100]}
              >
                <Image
                  source={{ uri: url }}
                  style={{ width: 40, height: 40 }}
                  resizeMode="cover"
                />
                {item.media_type === 'video' && (
                  <YStack
                    position="absolute"
                    top={0}
                    left={0}
                    right={0}
                    bottom={0}
                    alignItems="center"
                    justifyContent="center"
                    backgroundColor="rgba(0,0,0,0.3)"
                  >
                    <Video size={16} color="white" />
                  </YStack>
                )}
              </YStack>
            )
          })}
        </XStack>
      )}

      {/* ── Role description ── */}
      <Text fontSize={12} color={colors.gray[400]}>
        {isBuyer
          ? t('offers.chat.youAreBuyer')
          : isSeller
            ? t('offers.chat.youAreSeller')
            : ''}
      </Text>

      {/* ── Action Buttons ── */}
      {actions.length > 0 && (
        <XStack gap="$2" flexWrap="wrap">
          {loading && <Spinner size="small" color={colors.green[600]} />}
          {!loading &&
            actions.map((action) => {
              const IconComp = ICON_MAP[action.icon] ?? CheckCircle
              return (
                <Button
                  key={action.type}
                  size="$3"
                  backgroundColor={action.bgColor as any}
                  borderRadius={borderRadius.md}
                  paddingHorizontal="$3"
                  paddingVertical="$1.5"
                  gap="$1.5"
                  pressStyle={{ opacity: 0.8 }}
                  onPress={() => handleAction(action.type)}
                  icon={<IconComp size={14} color={action.color} />}
                >
                  <Text fontSize={13} fontWeight="600" color={action.color as any}>
                    {action.label}
                  </Text>
                </Button>
              )
            })}
        </XStack>
      )}
    </YStack>
  )
}
