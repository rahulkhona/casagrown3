/**
 * OffersScreen — Offers list with Open/Past tabs and role filters
 *
 * Accessible from the hamburger menu. Shows all offers where the
 * current user is buyer or seller, displayed as offer cards.
 * Tapping any card opens the associated chat conversation.
 * Mirrors OrdersScreen layout and interaction patterns.
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react'
import { YStack, XStack, Text, Spinner } from 'tamagui'
import { TouchableOpacity, FlatList } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  ArrowLeft,
  ThumbsUp,
  Package,
  Clock,
  CheckCircle,
  XCircle,
  MinusCircle,
  Calendar,
} from '@tamagui/lucide-icons'
import { colors, borderRadius } from '../../design-tokens'
import { useTranslation } from 'react-i18next'
import { getOffers } from './offer-service'
import { OFFER_STATUS_CONFIG } from './offer-types'
import type { Offer, OfferFilter, OfferTab, OfferRoleFilter } from './offer-types'

// =============================================================================
// Icon Mapping
// =============================================================================

const STATUS_ICON_MAP: Record<string, React.ElementType> = {
  Clock,
  CheckCircle,
  XCircle,
  MinusCircle,
}

// =============================================================================
// Props
// =============================================================================

interface OffersScreenProps {
  currentUserId: string
  onClose: () => void
  onOpenChat?: (postId: string, otherUserId: string) => void
}

// =============================================================================
// Component
// =============================================================================

export function OffersScreen({
  currentUserId,
  onClose,
  onOpenChat,
}: OffersScreenProps) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()

  // State
  const [activeTab, setActiveTab] = useState<OfferTab>('open')
  const [roleFilter, setRoleFilter] = useState<OfferRoleFilter>('all')
  const [offers, setOffers] = useState<Offer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const filter: OfferFilter = useMemo(
    () => ({ tab: activeTab, role: roleFilter }),
    [activeTab, roleFilter],
  )

  // Load offers
  const loadOffers = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await getOffers(currentUserId, filter)
      setOffers(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load offers')
    } finally {
      setLoading(false)
    }
  }, [currentUserId, filter])

  useEffect(() => {
    loadOffers()
  }, [loadOffers])

  // ── Handlers ──
  const handleOfferPress = useCallback(
    (offer: Offer) => {
      if (onOpenChat && offer.post_id) {
        const otherUserId =
          offer.created_by === currentUserId
            ? offer.buyer_id ?? ''
            : offer.seller_id ?? ''
        onOpenChat(offer.post_id, otherUserId)
      }
    },
    [currentUserId, onOpenChat],
  )

  const tabs: { key: OfferTab; label: string }[] = [
    { key: 'open', label: t('offers.tabs.open') },
    { key: 'past', label: t('offers.tabs.past') },
  ]

  const roleFilters: { key: OfferRoleFilter; label: string }[] = [
    { key: 'all', label: t('offers.filters.all') },
    { key: 'buying', label: t('offers.filters.buying') },
    { key: 'selling', label: t('offers.filters.selling') },
  ]

  const renderOfferCard = useCallback(
    ({ item }: { item: Offer }) => {
      const statusConfig = OFFER_STATUS_CONFIG[item.status]
      const isSeller = item.created_by === currentUserId
      const otherPartyName = isSeller
        ? item.buyer_name ?? t('offers.unknownBuyer')
        : item.seller_name ?? t('offers.unknownSeller')
      const totalPoints = item.quantity * item.points_per_unit
      const StatusIcon = STATUS_ICON_MAP[statusConfig.icon] ?? Clock

      return (
        <YStack paddingHorizontal="$4" paddingVertical="$1.5">
          <TouchableOpacity
            onPress={() => handleOfferPress(item)}
            activeOpacity={0.7}
            testID={`offer-card-${item.id}`}
            style={{
              backgroundColor: 'white',
              borderRadius: 12,
              padding: 16,
              borderWidth: 1,
              borderColor: colors.gray[200],
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.05,
              shadowRadius: 3,
              elevation: 1,
            }}
          >
            {/* Top row: product + status */}
            <XStack justifyContent="space-between" alignItems="center">
              <XStack alignItems="center" gap="$2" flex={1}>
                <Package size={18} color={colors.gray[600]} />
                <YStack flex={1}>
                  <Text fontSize={15} fontWeight="700" color={colors.gray[800]} numberOfLines={1}>
                    {item.product ?? t('offers.unknownProduct')}
                  </Text>
                  <Text fontSize={12} color={colors.gray[500]}>
                    {isSeller ? t('offers.card.to') : t('offers.card.from')} {otherPartyName}
                  </Text>
                </YStack>
              </XStack>

              {/* Status badge */}
              <XStack
                testID={`offer-status-${item.id}`}
                backgroundColor={statusConfig.bgColor as any}
                paddingHorizontal="$2"
                paddingVertical="$1"
                borderRadius={12}
                alignItems="center"
                gap="$1"
              >
                <StatusIcon size={12} color={statusConfig.color} />
                <Text fontSize={11} fontWeight="700" color={statusConfig.color as any}>
                  {statusConfig.label}
                </Text>
              </XStack>
            </XStack>

            {/* Details row */}
            <XStack marginTop="$2" gap="$4" alignItems="center" flexWrap="wrap">
              <Text fontSize={13} color={colors.gray[600]}>
                {item.quantity} {item.unit ?? ''} × {item.points_per_unit} pts = {totalPoints} pts
              </Text>
              {item.delivery_date && (
                <XStack alignItems="center" gap="$1">
                  <Calendar size={12} color={colors.gray[400]} />
                  <Text fontSize={12} color={colors.gray[500]}>
                    {new Date(item.delivery_date + 'T00:00:00').toLocaleDateString()}
                  </Text>
                </XStack>
              )}
            </XStack>

            {/* Category row */}
            {item.category && (
              <XStack marginTop="$1.5">
                <Text
                  fontSize={11}
                  color={colors.gray[500]}
                  backgroundColor={colors.gray[100]}
                  paddingHorizontal="$2"
                  paddingVertical={2}
                  borderRadius={4}
                >
                  {item.category}
                </Text>
              </XStack>
            )}
          </TouchableOpacity>
        </YStack>
      )
    },
    [currentUserId, handleOfferPress, t],
  )

  return (
    <YStack flex={1} backgroundColor={colors.gray[50]} alignItems="center">
      {/* ── Header ── */}
      <YStack
        backgroundColor="white"
        borderBottomWidth={1}
        borderBottomColor={colors.gray[200]}
        paddingTop={insets.top}
        width="100%"
        maxWidth={896}
      >
        <XStack
          paddingHorizontal="$4"
          height={56}
          alignItems="center"
          gap="$3"
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
          <XStack flex={1} alignItems="center" gap="$2">
            <ThumbsUp size={22} color="#2563eb" />
            <Text fontSize={18} fontWeight="700" color={colors.gray[900]}>
              {t('offers.title')}
            </Text>
          </XStack>
        </XStack>

        {/* ── Tabs ── */}
        <XStack paddingHorizontal="$4" gap="$1">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key
            return (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                activeOpacity={0.7}
                testID={`offers-tab-${tab.key}`}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  alignItems: 'center',
                  borderBottomWidth: 2,
                  borderBottomColor: isActive ? '#2563eb' : 'transparent',
                }}
              >
                <Text
                  fontSize={14}
                  fontWeight={isActive ? '700' : '500'}
                  color={isActive ? '#2563eb' : colors.gray[500]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            )
          })}
        </XStack>
      </YStack>

      {/* ── Role Filters ── */}
      <XStack
        paddingHorizontal="$4"
        paddingVertical="$2.5"
        gap="$2"
        width="100%"
        maxWidth={896}
      >
        {roleFilters.map((rf) => {
          const isActive = roleFilter === rf.key
          return (
            <TouchableOpacity
              key={rf.key}
              onPress={() => setRoleFilter(rf.key)}
              activeOpacity={0.7}
              testID={`offers-filter-${rf.key}`}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 6,
                borderRadius: 16,
                backgroundColor: isActive ? '#dbeafe' : colors.gray[100],
                borderWidth: 1,
                borderColor: isActive ? '#93c5fd' : colors.gray[200],
              }}
            >
              <Text
                fontSize={13}
                fontWeight={isActive ? '600' : '500'}
                color={isActive ? '#2563eb' : colors.gray[600]}
              >
                {rf.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </XStack>

      {/* ── Offers List ── */}
      {loading ? (
        <YStack flex={1} alignItems="center" justifyContent="center">
          <Spinner size="large" color="#2563eb" />
          <Text marginTop="$3" color={colors.gray[500]}>
            {t('offers.loading')}
          </Text>
        </YStack>
      ) : error ? (
        <YStack flex={1} alignItems="center" justifyContent="center" padding="$6">
          <Text fontSize={15} color={colors.gray[600]} textAlign="center">
            {error}
          </Text>
          <TouchableOpacity
            onPress={loadOffers}
            style={{ marginTop: 16 }}
            activeOpacity={0.7}
          >
            <Text fontSize={14} fontWeight="600" color="#2563eb">
              {t('offers.retry')}
            </Text>
          </TouchableOpacity>
        </YStack>
      ) : (
        <FlatList
          style={{ width: '100%', maxWidth: 896, alignSelf: 'center' as const }}
          data={offers}
          keyExtractor={(item) => item.id}
          renderItem={renderOfferCard}
          contentContainerStyle={{ paddingVertical: 8, flexGrow: 1 }}
          ListEmptyComponent={
            <YStack
              flex={1}
              alignItems="center"
              justifyContent="center"
              padding="$8"
              gap="$3"
            >
              <ThumbsUp size={48} color={colors.gray[300]} />
              <Text
                fontSize={16}
                fontWeight="600"
                color={colors.gray[500]}
                textAlign="center"
              >
                {activeTab === 'open'
                  ? t('offers.emptyOpen')
                  : t('offers.emptyPast')}
              </Text>
              <Text
                fontSize={13}
                color={colors.gray[400]}
                textAlign="center"
              >
                {t('offers.emptyHint')}
              </Text>
            </YStack>
          }
        />
      )}
    </YStack>
  )
}
