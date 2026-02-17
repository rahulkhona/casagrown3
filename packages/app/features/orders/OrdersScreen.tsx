/**
 * OrdersScreen — Orders list with Open/Past tabs and role filters
 *
 * Accessible from the hamburger menu. Shows all orders where the
 * current user is buyer or seller.
 */

import React, { useState, useCallback, useMemo } from 'react'
import { YStack, XStack, Text, Spinner } from 'tamagui'
import { Platform, TouchableOpacity, FlatList } from 'react-native'
import {
  ArrowLeft,
  Package,
  Search,
  ShoppingBag,
} from '@tamagui/lucide-icons'
import { colors, borderRadius } from '../../design-tokens'
import { useTranslation } from 'react-i18next'
import { OrderCard } from './OrderCard'
import { OrderSummary } from './OrderSummary'
import { useOrders } from './useOrders'
import { isOpenOrder } from './order-types'
import type { Order, OrderFilter, OrderTab, OrderRoleFilter } from './order-types'

// =============================================================================
// Props
// =============================================================================

interface OrdersScreenProps {
  currentUserId: string
  onClose: () => void
  onOpenChat?: (conversationId: string) => void
}

// =============================================================================
// Component
// =============================================================================

export function OrdersScreen({
  currentUserId,
  onClose,
  onOpenChat,
}: OrdersScreenProps) {
  const { t } = useTranslation()

  // State
  const [activeTab, setActiveTab] = useState<OrderTab>('open')
  const [roleFilter, setRoleFilter] = useState<OrderRoleFilter>('all')
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)

  const filter: OrderFilter = useMemo(
    () => ({ tab: activeTab, role: roleFilter }),
    [activeTab, roleFilter],
  )

  const { orders, loading, error, refresh } = useOrders(currentUserId, filter)

  // ── Handlers ──
  const handleOrderPress = useCallback(
    (order: Order) => {
      if (isOpenOrder(order) && onOpenChat) {
        onOpenChat(order.conversation_id)
      } else {
        setSelectedOrder(order)
      }
    },
    [onOpenChat],
  )

  // ── Show summary if selected ──
  if (selectedOrder) {
    return (
      <OrderSummary
        order={selectedOrder}
        currentUserId={currentUserId}
        onClose={() => setSelectedOrder(null)}
        t={t}
      />
    )
  }

  const tabs: { key: OrderTab; label: string }[] = [
    { key: 'open', label: t('orders.tabs.open') },
    { key: 'past', label: t('orders.tabs.past') },
  ]

  const roleFilters: { key: OrderRoleFilter; label: string }[] = [
    { key: 'all', label: t('orders.filters.all') },
    { key: 'buying', label: t('orders.filters.buying') },
    { key: 'selling', label: t('orders.filters.selling') },
  ]

  return (
    <YStack flex={1} backgroundColor={colors.gray[50]}>
      {/* ── Header ── */}
      <YStack
        backgroundColor="white"
        borderBottomWidth={1}
        borderBottomColor={colors.gray[200]}
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
            accessibilityLabel="Back"
          >
            <ArrowLeft size={22} color={colors.gray[700]} />
          </TouchableOpacity>
          <XStack flex={1} alignItems="center" gap="$2">
            <ShoppingBag size={22} color={colors.green[700]} />
            <Text fontSize={18} fontWeight="700" color={colors.gray[900]}>
              {t('orders.title')}
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
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  alignItems: 'center',
                  borderBottomWidth: 2,
                  borderBottomColor: isActive
                    ? colors.green[600]
                    : 'transparent',
                }}
              >
                <Text
                  fontSize={14}
                  fontWeight={isActive ? '700' : '500'}
                  color={isActive ? colors.green[700] : colors.gray[500]}
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
      >
        {roleFilters.map((rf) => {
          const isActive = roleFilter === rf.key
          return (
            <TouchableOpacity
              key={rf.key}
              onPress={() => setRoleFilter(rf.key)}
              activeOpacity={0.7}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 6,
                borderRadius: 16,
                backgroundColor: isActive
                  ? colors.green[100]
                  : colors.gray[100],
                borderWidth: 1,
                borderColor: isActive
                  ? colors.green[300]
                  : colors.gray[200],
              }}
            >
              <Text
                fontSize={13}
                fontWeight={isActive ? '600' : '500'}
                color={isActive ? colors.green[700] : colors.gray[600]}
              >
                {rf.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </XStack>

      {/* ── Orders List ── */}
      {loading ? (
        <YStack flex={1} alignItems="center" justifyContent="center">
          <Spinner size="large" color={colors.green[600]} />
          <Text marginTop="$3" color={colors.gray[500]}>
            {t('orders.loading')}
          </Text>
        </YStack>
      ) : error ? (
        <YStack flex={1} alignItems="center" justifyContent="center" padding="$6">
          <Text fontSize={15} color={colors.gray[600]} textAlign="center">
            {error}
          </Text>
          <TouchableOpacity
            onPress={refresh}
            style={{ marginTop: 16 }}
            activeOpacity={0.7}
          >
            <Text
              fontSize={14}
              fontWeight="600"
              color={colors.green[600]}
            >
              {t('orders.retry')}
            </Text>
          </TouchableOpacity>
        </YStack>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <YStack paddingHorizontal="$4" paddingVertical="$1.5">
              <OrderCard
                order={item}
                currentUserId={currentUserId}
                onPress={handleOrderPress}
                t={t}
              />
            </YStack>
          )}
          contentContainerStyle={{ paddingVertical: 8, flexGrow: 1 }}
          ListEmptyComponent={
            <YStack
              flex={1}
              alignItems="center"
              justifyContent="center"
              padding="$8"
              gap="$3"
            >
              <Package size={48} color={colors.gray[300]} />
              <Text
                fontSize={16}
                fontWeight="600"
                color={colors.gray[500]}
                textAlign="center"
              >
                {activeTab === 'open'
                  ? t('orders.emptyOpen')
                  : t('orders.emptyPast')}
              </Text>
              <Text
                fontSize={13}
                color={colors.gray[400]}
                textAlign="center"
              >
                {t('orders.emptyHint')}
              </Text>
            </YStack>
          }
        />
      )}
    </YStack>
  )
}
