'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { YStack, XStack, Text, Button, Spinner } from 'tamagui'
import { RefreshCw, AlertTriangle, CheckCircle, Clock, Shield, ChevronRight } from '@tamagui/lucide-icons'
import { adminApi } from '../../../lib/adminApi'
import { colors } from '@casagrown/app/design-tokens'

interface Dispute {
  id: string
  stripe_dispute_id: string
  stripe_payment_intent_id: string
  amount_usd: number
  fee_usd: number
  reason: string
  status: string
  evidence_due_by: string | null
  evidence_submitted_at: string | null
  market_date: string | null
  resolved_at: string | null
  created_at: string
  admin_notes: string | null
  buyer_name: string | null
  buyer_email: string | null
  days_remaining: number | null
}

interface DisputeStats {
  needs_response: number
  under_review: number
  won: number
  lost: number
  total: number
  total_disputed_usd: number
  total_won_usd: number
  total_lost_usd: number
  total_fees_usd: number
  nearest_deadline: string | null
}

const STATUS_FILTERS = [
  { key: null, label: 'All' },
  { key: 'needs_response', label: 'Needs Response' },
  { key: 'under_review', label: 'Under Review' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
] as const

function statusBadge(status: string) {
  switch (status) {
    case 'needs_response':
    case 'warning_needs_response':
      return { bg: '#FEE2E2', color: '#DC2626', icon: '🚨', label: 'NEEDS RESPONSE' }
    case 'under_review':
    case 'warning_under_review':
      return { bg: '#FEF3C7', color: '#D97706', icon: '⏳', label: 'UNDER REVIEW' }
    case 'won':
      return { bg: '#D1FAE5', color: '#059669', icon: '✅', label: 'WON' }
    case 'lost':
      return { bg: '#F3F4F6', color: '#DC2626', icon: '❌', label: 'LOST' }
    default:
      return { bg: '#F3F4F6', color: '#6B7280', icon: '—', label: status.toUpperCase() }
  }
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatCurrency(amount: number) {
  return `$${amount.toFixed(2)}`
}

export default function DisputesPage() {
  const [disputes, setDisputes] = useState<Dispute[]>([])
  const [stats, setStats] = useState<DisputeStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [disputesRes, statsRes] = await Promise.all([
        adminApi.rpc('get_disputes_admin', { p_status: filter, p_limit: 50 }),
        adminApi.rpc('get_dispute_stats', {}),
      ])
      if (disputesRes.data) setDisputes(Array.isArray(disputesRes.data) ? disputesRes.data : [])
      if (statsRes.data) setStats(statsRes.data)
    } catch (err) {
      console.error('Failed to fetch disputes:', err)
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { fetchData() }, [fetchData])

  const needsResponseCount = stats?.needs_response ?? 0
  const hasUrgent = needsResponseCount > 0
  const nearestDeadline = stats?.nearest_deadline
    ? new Date(stats.nearest_deadline)
    : null
  const daysToDeadline = nearestDeadline
    ? Math.ceil((nearestDeadline.getTime() - Date.now()) / 86400000)
    : null

  return (
      <YStack flex={1} padding="$6" gap="$5" maxWidth={1200}>
        {/* Header */}
        <XStack justifyContent="space-between" alignItems="center">
          <YStack>
            <Text fontSize={28} fontWeight="800" color={colors.green[800]}>
              Chargeback Disputes
            </Text>
            <Text fontSize={14} color="#6B7280">
              Manage Stripe disputes, review evidence, and submit responses
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

        {/* Urgent Alert Banner */}
        {hasUrgent && (
          <XStack
            backgroundColor="#FEE2E2"
            borderColor="#DC2626"
            borderWidth={1}
            borderRadius={8}
            padding="$3"
            alignItems="center"
            gap="$2"
          >
            <AlertTriangle size={20} color="#DC2626" />
            <Text fontSize={14} color="#DC2626" fontWeight="600">
              {needsResponseCount} dispute{needsResponseCount > 1 ? 's' : ''} need response
              {daysToDeadline !== null && ` — Nearest deadline: ${daysToDeadline} day${daysToDeadline !== 1 ? 's' : ''}`}.
              Submit evidence to avoid automatic loss.
            </Text>
          </XStack>
        )}

        {/* Stats Cards */}
        {stats && (
          <YStack gap="$3">
            <XStack gap="$3" flexWrap="wrap">
              <YStack
                flex={1}
                minWidth={180}
                backgroundColor="white"
                borderWidth={1}
                borderColor={needsResponseCount > 0 ? '#DC2626' : '#E5E7EB'}
                borderRadius={12}
                padding="$4"
              >
                <XStack justifyContent="space-between" alignItems="center">
                  <Text fontSize={36} fontWeight="800" color={needsResponseCount > 0 ? '#DC2626' : '#6B7280'}>
                    {stats.needs_response}
                  </Text>
                  <AlertTriangle size={24} color={needsResponseCount > 0 ? '#DC2626' : '#6B7280'} />
                </XStack>
                <Text fontSize={13} color="#6B7280">Needs Response</Text>
              </YStack>

              <YStack flex={1} minWidth={180} backgroundColor="white" borderWidth={1} borderColor="#F59E0B" borderRadius={12} padding="$4">
                <XStack justifyContent="space-between" alignItems="center">
                  <Text fontSize={36} fontWeight="800" color="#D97706">{stats.under_review}</Text>
                  <Clock size={24} color="#D97706" />
                </XStack>
                <Text fontSize={13} color="#6B7280">Under Review</Text>
              </YStack>

              <YStack flex={1} minWidth={180} backgroundColor="white" borderWidth={1} borderColor="#10B981" borderRadius={12} padding="$4">
                <XStack justifyContent="space-between" alignItems="center">
                  <Text fontSize={36} fontWeight="800" color="#059669">{stats.won + stats.lost}</Text>
                  <CheckCircle size={24} color="#059669" />
                </XStack>
                <Text fontSize={13} color="#6B7280">Resolved</Text>
              </YStack>
            </XStack>

            <Text fontSize={13} color="#6B7280">
              Total disputed: {formatCurrency(stats.total_disputed_usd)} | Won: {formatCurrency(stats.total_won_usd)} ({stats.won}) | Lost: {formatCurrency(stats.total_lost_usd)} ({stats.lost}) | Dispute fees: {formatCurrency(stats.total_fees_usd)}
            </Text>
          </YStack>
        )}

        {/* Filter Tabs */}
        <XStack gap="$2" flexWrap="wrap">
          {STATUS_FILTERS.map((f) => {
            const isActive = filter === f.key
            const count = f.key === null ? (stats?.total ?? 0) :
              f.key === 'needs_response' ? (stats?.needs_response ?? 0) :
              f.key === 'under_review' ? (stats?.under_review ?? 0) :
              f.key === 'won' ? (stats?.won ?? 0) :
              (stats?.lost ?? 0)
            return (
              <Button
                key={f.key ?? 'all'}
                size="$2"
                backgroundColor={isActive ? (f.key === 'needs_response' ? '#DC2626' : colors.green[800]) : 'white'}
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

        {/* Disputes Table */}
        <YStack backgroundColor="white" borderRadius={12} borderWidth={1} borderColor="#E5E7EB" overflow="hidden">
          {/* Table Header */}
          <XStack backgroundColor="#F9FAFB" padding="$3" borderBottomWidth={1} borderBottomColor="#E5E7EB">
            <Text flex={1.5} fontSize={11} fontWeight="700" color="#6B7280" textTransform="uppercase">Status</Text>
            <Text flex={1} fontSize={11} fontWeight="700" color="#6B7280" textTransform="uppercase">Date</Text>
            <Text flex={2} fontSize={11} fontWeight="700" color="#6B7280" textTransform="uppercase">Buyer</Text>
            <Text flex={1} fontSize={11} fontWeight="700" color="#6B7280" textTransform="uppercase">Amount</Text>
            <Text flex={1.5} fontSize={11} fontWeight="700" color="#6B7280" textTransform="uppercase">Reason</Text>
            <Text flex={1} fontSize={11} fontWeight="700" color="#6B7280" textTransform="uppercase">Settlement</Text>
            <Text flex={1.5} fontSize={11} fontWeight="700" color="#6B7280" textTransform="uppercase">Deadline</Text>
            <Text flex={1.5} fontSize={11} fontWeight="700" color="#6B7280" textTransform="uppercase">Action</Text>
          </XStack>

          {loading ? (
            <XStack padding="$6" justifyContent="center">
              <Spinner size="large" color={colors.green[800]} />
            </XStack>
          ) : disputes.length === 0 ? (
            <YStack padding="$6" alignItems="center" gap="$2">
              <Shield size={32} color="#9CA3AF" />
              <Text fontSize={16} color="#6B7280" fontWeight="500">No disputes found</Text>
              <Text fontSize={13} color="#9CA3AF">Disputes appear when buyers file chargebacks with their bank</Text>
            </YStack>
          ) : (
            disputes.map((d, i) => {
              const badge = statusBadge(d.status)
              const isUrgent = d.status === 'needs_response' || d.status === 'warning_needs_response'
              const deadlineStr = d.days_remaining !== null
                ? `${formatDate(d.evidence_due_by)} (${Math.ceil(d.days_remaining)}d)`
                : d.evidence_submitted_at
                ? `Submitted ${formatDate(d.evidence_submitted_at)}`
                : d.resolved_at
                ? `${d.status === 'won' ? 'Won' : 'Lost'} ${formatDate(d.resolved_at)}`
                : '—'

              return (
                <XStack
                  key={d.id}
                  padding="$3"
                  backgroundColor={isUrgent ? '#FEF2F2' : d.status === 'under_review' ? '#FFFBEB' : d.status === 'won' ? '#F0FDF4' : i % 2 === 0 ? 'white' : '#F9FAFB'}
                  borderBottomWidth={1}
                  borderBottomColor="#E5E7EB"
                  alignItems="center"
                  hoverStyle={{ backgroundColor: '#F3F4F6' }}
                >
                  <XStack flex={1.5}>
                    <Text
                      fontSize={11}
                      fontWeight="700"
                      backgroundColor={badge.bg as any}
                      color={badge.color as any}
                      paddingHorizontal="$2"
                      paddingVertical="$1"
                      borderRadius={4}
                    >
                      {badge.icon} {badge.label}
                    </Text>
                  </XStack>
                  <Text flex={1} fontSize={13} color="#374151">{formatDate(d.created_at)}</Text>
                  <YStack flex={2}>
                    <Text fontSize={13} color="#374151" fontWeight="500">{d.buyer_name || 'Unknown'}</Text>
                    <Text fontSize={11} color="#9CA3AF">{d.buyer_email || ''}</Text>
                  </YStack>
                  <Text flex={1} fontSize={13} color="#DC2626" fontWeight="600">{formatCurrency(d.amount_usd)}</Text>
                  <Text flex={1.5} fontSize={12} color="#6B7280">{d.reason?.replace(/_/g, ' ')}</Text>
                  <Text flex={1} fontSize={13} color="#374151">{formatDate(d.market_date)}</Text>
                  <Text flex={1.5} fontSize={12} color={isUrgent ? '#DC2626' : '#6B7280'} fontWeight={isUrgent ? '700' : '400'}>
                    {deadlineStr}
                  </Text>
                  <XStack flex={1.5}>
                    <Button
                      size="$2"
                      backgroundColor={isUrgent ? '#2563EB' : '#F3F4F6'}
                      borderRadius={6}
                      iconAfter={ChevronRight}
                      onPress={() => {
                        window.location.href = `/disputes/${d.id}`
                      }}
                    >
                      <Text color={isUrgent ? 'white' : '#374151'}>{isUrgent ? 'Review' : 'View'}</Text>
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
