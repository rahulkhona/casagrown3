'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { YStack, XStack, Text, Button, Spinner } from 'tamagui'
import { RefreshCw, AlertTriangle, CheckCircle, MessageCircle, User, ChevronRight, Shield, Clock } from '@tamagui/lucide-icons'
import { useRouter } from 'next/navigation'
import { adminApi } from '../../../lib/adminApi'
import { colors } from '@casagrown/app/design-tokens'

interface Escalation {
  dispute_id: string
  order_id: string
  reason: string
  dispute_type: string | null
  dispute_status: string
  staff_decision: string | null
  resolved_at: string | null
  created_at: string
  photos: any[]
  claimed_by: string | null
  claimed_by_name: string | null
  product_name: string
  total_usd: number
  fulfillment_type: string
  order_status: string
  buyer_name: string | null
  buyer_email: string | null
  seller_name: string | null
  seller_email: string | null
  message_count: number
  unread_messages: number
}

interface EscalationStats {
  open: number
  resolved: number
  total: number
  total_disputed_usd: number
  resolved_today: number
}

const STATUS_FILTERS = [
  { key: null, label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'my_claims', label: 'My Claims' },
  { key: 'resolved', label: 'Resolved' },
] as const

function disputeStatusBadge(status: string) {
  switch (status) {
    case 'open':
      return { bg: '#FEE2E2', color: '#DC2626', label: '🔴 OPEN' }
    case 'seller_responded':
      return { bg: '#FEF3C7', color: '#D97706', label: '💬 SELLER RESPONDED' }
    case 'buyer_accepted':
      return { bg: '#D1FAE5', color: '#059669', label: '✅ BUYER ACCEPTED' }
    case 'escalated':
      return { bg: '#FEE2E2', color: '#DC2626', label: '🚨 ESCALATED' }
    case 'staff_resolved':
      return { bg: '#D1FAE5', color: '#059669', label: '✅ RESOLVED' }
    default:
      return { bg: '#F3F4F6', color: '#6B7280', label: status.toUpperCase() }
  }
}

function fulfillmentBadge(type: string) {
  return type === 'delivery'
    ? { bg: '#DBEAFE', color: '#2563EB', label: '🚗 Delivery' }
    : { bg: '#F3E8FF', color: '#7C3AED', label: '📍 Pickup' }
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatCurrency(amount: number) {
  return `$${amount.toFixed(2)}`
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const hours = Math.floor(diff / 3600000)
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function EscalationsPage() {
  const router = useRouter()
  const [escalations, setEscalations] = useState<Escalation[]>([])
  const [stats, setStats] = useState<EscalationStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string | null>(null)
  const [claimingId, setClaimingId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [escalationsRes, statsRes] = await Promise.all([
        adminApi.rpc('get_escalated_orders_admin', { p_status: filter, p_limit: 50 }),
        adminApi.rpc('get_escalation_stats_admin', {}),
      ])
      if (escalationsRes.data) {
        setEscalations(Array.isArray(escalationsRes.data) ? escalationsRes.data : [])
      }
      if (statsRes.data) setStats(statsRes.data)
    } catch (err) {
      console.error('Failed to fetch escalations:', err)
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { fetchData() }, [fetchData])

  const handleClaim = async (disputeId: string) => {
    setClaimingId(disputeId)
    try {
      const res = await adminApi.rpc('admin_claim_escalation', { p_dispute_id: disputeId })
      if (res.data?.error) {
        alert(res.data.error)
      } else {
        fetchData()
      }
    } finally {
      setClaimingId(null)
    }
  }

  const openCount = stats?.open ?? 0

  return (
    <YStack flex={1} padding="$6" gap="$5" maxWidth={1200}>
      {/* Header */}
      <XStack justifyContent="space-between" alignItems="center">
        <YStack>
          <Text fontSize={28} fontWeight="800" color={colors.green[800]}>
            Order Escalations
          </Text>
          <Text fontSize={14} color="#6B7280">
            Manage buyer-seller fulfillment disputes, resolve escalations, and issue credits
          </Text>
        </YStack>
        <Button
          size="$3"
          backgroundColor={colors.green[600]}
          icon={RefreshCw}
          onPress={fetchData}
        >
          <Text color="white">Refresh</Text>
        </Button>
      </XStack>

      {/* Urgent Banner */}
      {openCount > 0 && (
        <XStack
          backgroundColor="#FEF3C7"
          borderColor="#F59E0B"
          borderWidth={1}
          borderRadius={8}
          padding="$3"
          alignItems="center"
          gap="$2"
        >
          <AlertTriangle size={20} color="#D97706" />
          <Text fontSize={14} color="#92400E" fontWeight="600">
            {openCount} escalation{openCount > 1 ? 's' : ''} need attention.
            Review and claim open disputes to begin resolution.
          </Text>
        </XStack>
      )}

      {/* Stats Cards */}
      {stats && (
        <XStack gap="$3" flexWrap="wrap">
          <YStack flex={1} minWidth={160} backgroundColor="white" borderWidth={1}
            borderColor={openCount > 0 ? '#DC2626' : '#E5E7EB'} borderRadius={12} padding="$4">
            <XStack justifyContent="space-between" alignItems="center">
              <Text fontSize={36} fontWeight="800" color={openCount > 0 ? '#DC2626' : '#6B7280'}>
                {stats.open}
              </Text>
              <AlertTriangle size={24} color={openCount > 0 ? '#DC2626' : '#6B7280'} />
            </XStack>
            <Text fontSize={13} color="#6B7280">Open</Text>
          </YStack>

          <YStack flex={1} minWidth={160} backgroundColor="white" borderWidth={1}
            borderColor="#10B981" borderRadius={12} padding="$4">
            <XStack justifyContent="space-between" alignItems="center">
              <Text fontSize={36} fontWeight="800" color="#059669">{stats.resolved}</Text>
              <CheckCircle size={24} color="#059669" />
            </XStack>
            <Text fontSize={13} color="#6B7280">Resolved</Text>
          </YStack>

          <YStack flex={1} minWidth={160} backgroundColor="white" borderWidth={1}
            borderColor="#6366F1" borderRadius={12} padding="$4">
            <XStack justifyContent="space-between" alignItems="center">
              <Text fontSize={36} fontWeight="800" color="#4F46E5">{stats.total}</Text>
              <Shield size={24} color="#4F46E5" />
            </XStack>
            <Text fontSize={13} color="#6B7280">Total</Text>
          </YStack>

          <YStack flex={1} minWidth={160} backgroundColor="white" borderWidth={1}
            borderColor="#E5E7EB" borderRadius={12} padding="$4">
            <XStack justifyContent="space-between" alignItems="center">
              <Text fontSize={36} fontWeight="800" color="#374151">
                {formatCurrency(stats.total_disputed_usd)}
              </Text>
              <Clock size={24} color="#6B7280" />
            </XStack>
            <Text fontSize={13} color="#6B7280">Open Disputed Value</Text>
          </YStack>
        </XStack>
      )}

      {/* Filter Tabs */}
      <XStack gap="$2" flexWrap="wrap">
        {STATUS_FILTERS.map((f) => {
          const isActive = filter === f.key
          const count = f.key === null ? (stats?.total ?? 0) :
            f.key === 'open' ? (stats?.open ?? 0) :
            f.key === 'resolved' ? (stats?.resolved ?? 0) :
            escalations.filter(e => e.claimed_by !== null).length
          return (
            <Button
              key={f.key ?? 'all'}
              size="$2"
              backgroundColor={isActive ? colors.green[800] : 'white'}
              borderWidth={1}
              borderColor={isActive ? 'transparent' : '#D1D5DB'}
              borderRadius={20}
              onPress={() => setFilter(f.key)}
            >
              <Text color={isActive ? 'white' : '#374151'}>{f.label} ({count})</Text>
            </Button>
          )
        })}
      </XStack>

      {/* Escalations List */}
      <YStack backgroundColor="white" borderRadius={12} borderWidth={1} borderColor="#E5E7EB" overflow="hidden">
        {/* Table Header */}
        <XStack backgroundColor="#F9FAFB" padding="$3" borderBottomWidth={1} borderBottomColor="#E5E7EB">
          <Text flex={1.2} fontSize={11} fontWeight="700" color="#6B7280" textTransform="uppercase">Status</Text>
          <Text flex={2} fontSize={11} fontWeight="700" color="#6B7280" textTransform="uppercase">Product</Text>
          <Text flex={1.5} fontSize={11} fontWeight="700" color="#6B7280" textTransform="uppercase">Buyer</Text>
          <Text flex={1.5} fontSize={11} fontWeight="700" color="#6B7280" textTransform="uppercase">Seller</Text>
          <Text flex={0.8} fontSize={11} fontWeight="700" color="#6B7280" textTransform="uppercase">Amount</Text>
          <Text flex={1} fontSize={11} fontWeight="700" color="#6B7280" textTransform="uppercase">Claimed By</Text>
          <Text flex={0.8} fontSize={11} fontWeight="700" color="#6B7280" textTransform="uppercase">Messages</Text>
          <Text flex={1} fontSize={11} fontWeight="700" color="#6B7280" textTransform="uppercase">Action</Text>
        </XStack>

        {loading ? (
          <XStack padding="$6" justifyContent="center">
            <Spinner size="large" color={colors.green[800]} />
          </XStack>
        ) : escalations.length === 0 ? (
          <YStack padding="$6" alignItems="center" gap="$2">
            <Shield size={32} color="#9CA3AF" />
            <Text fontSize={16} color="#6B7280" fontWeight="500">No escalations found</Text>
            <Text fontSize={13} color="#9CA3AF">Escalations appear when buyers or sellers escalate order disputes</Text>
          </YStack>
        ) : (
          escalations.map((e, i) => {
            const badge = disputeStatusBadge(e.dispute_status)
            const fBadge = fulfillmentBadge(e.fulfillment_type)
            const isOpen = !['staff_resolved', 'buyer_accepted'].includes(e.dispute_status)
            const hasUnread = e.unread_messages > 0

            return (
              <XStack
                key={e.dispute_id}
                padding="$3"
                backgroundColor={hasUnread ? '#FFFBEB' : isOpen ? '#FEF2F2' : i % 2 === 0 ? 'white' : '#F9FAFB'}
                borderBottomWidth={1}
                borderBottomColor="#E5E7EB"
                alignItems="center"
                hoverStyle={{ backgroundColor: '#F3F4F6' }}
              >
                {/* Status */}
                <XStack flex={1.2} gap="$1" flexDirection="column">
                  <Text
                    fontSize={10}
                    fontWeight="700"
                    backgroundColor={badge.bg as any}
                    color={badge.color as any}
                    paddingHorizontal="$2"
                    paddingVertical={2}
                    borderRadius={4}
                    alignSelf="flex-start"
                  >
                    {badge.label}
                  </Text>
                  <Text
                    fontSize={10}
                    backgroundColor={fBadge.bg as any}
                    color={fBadge.color as any}
                    paddingHorizontal="$1"
                    paddingVertical={1}
                    borderRadius={3}
                    alignSelf="flex-start"
                  >
                    {fBadge.label}
                  </Text>
                </XStack>

                {/* Product */}
                <YStack flex={2}>
                  <Text fontSize={13} color="#374151" fontWeight="500" numberOfLines={1}>{e.product_name}</Text>
                  <Text fontSize={11} color="#9CA3AF">{timeAgo(e.created_at)}</Text>
                </YStack>

                {/* Buyer */}
                <YStack flex={1.5}>
                  <Text fontSize={13} color="#374151" fontWeight="500">{e.buyer_name || 'Unknown'}</Text>
                  <Text fontSize={11} color="#9CA3AF" numberOfLines={1}>{e.buyer_email || ''}</Text>
                </YStack>

                {/* Seller */}
                <YStack flex={1.5}>
                  <Text fontSize={13} color="#374151" fontWeight="500">{e.seller_name || 'Unknown'}</Text>
                  <Text fontSize={11} color="#9CA3AF" numberOfLines={1}>{e.seller_email || ''}</Text>
                </YStack>

                {/* Amount */}
                <Text flex={0.8} fontSize={13} color="#DC2626" fontWeight="600">
                  {formatCurrency(e.total_usd)}
                </Text>

                {/* Claimed By */}
                <XStack flex={1} alignItems="center" gap="$1">
                  {e.claimed_by ? (
                    <XStack alignItems="center" gap="$1">
                      <User size={14} color="#4F46E5" />
                      <Text fontSize={12} color="#4F46E5" fontWeight="500">{e.claimed_by_name || 'Admin'}</Text>
                    </XStack>
                  ) : (
                    <Button
                      size="$1"
                      backgroundColor="#EEF2FF"
                      borderColor="#C7D2FE"
                      borderWidth={1}
                      borderRadius={6}
                      onPress={() => handleClaim(e.dispute_id)}
                      disabled={claimingId === e.dispute_id}
                    >
                      <Text fontSize={11} color="#4F46E5" fontWeight="600">
                        {claimingId === e.dispute_id ? '...' : 'Claim'}
                      </Text>
                    </Button>
                  )}
                </XStack>

                {/* Messages */}
                <XStack flex={0.8} alignItems="center" gap="$1">
                  <MessageCircle size={14} color={hasUnread ? '#D97706' : '#9CA3AF'} />
                  <Text fontSize={13} color={hasUnread ? '#D97706' : '#6B7280'} fontWeight={hasUnread ? '700' : '400'}>
                    {e.message_count}
                  </Text>
                  {hasUnread && (
                    <XStack
                      backgroundColor="#DC2626"
                      borderRadius={10}
                      paddingHorizontal={6}
                      paddingVertical={1}
                    >
                      <Text fontSize={10} color="white" fontWeight="700">{e.unread_messages}</Text>
                    </XStack>
                  )}
                </XStack>

                {/* Action */}
                <XStack flex={1}>
                  <Button
                    size="$2"
                    backgroundColor={isOpen ? '#2563EB' : '#F3F4F6'}
                    borderRadius={6}
                    iconAfter={ChevronRight}
                    onPress={() => router.push(`/escalations/${e.dispute_id}`)}
                  >
                    <Text color={isOpen ? 'white' : '#374151'}>{isOpen ? 'Review' : 'View'}</Text>
                  </Button>
                </XStack>
              </XStack>
            )
          })
        )}
      </YStack>
    </YStack>
  )
}
