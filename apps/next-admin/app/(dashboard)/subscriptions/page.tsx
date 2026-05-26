'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { YStack, XStack, Text, Button, Input, Select, Adapt, Sheet } from 'tamagui'
import { colors } from '@casagrown/app/design-tokens'
import { CreditCard, Search, ChevronDown, Check, Plus, UserX, UserCheck } from '@tamagui/lucide-icons'
import { AdminDataGrid, ColumnDef } from '../../../../../packages/app/features/admin/components/AdminDataGrid'
import { useAdminQuery } from '../../../../../packages/app/features/admin/hooks/useAdminQuery'
import { adminApi } from '../../../lib/adminApi'

export default function SubscriptionsPage() {
  const { data, loading, page, next, prev, hasMore, hasPrev, refresh } = useAdminQuery({
    table: 'seller_subscriptions',
    select: '*, profiles!inner(full_name, email)',
    defaultSortParams: { column: 'created_at', ascending: false },
  })

  const [stats, setStats] = useState({ active: 0, trialing: 0, canceled: 0, pastDue: 0, mrr: 0 })
  const [grantEmail, setGrantEmail] = useState('')
  const [granting, setGranting] = useState(false)
  const [grantError, setGrantError] = useState('')
  const [showGrant, setShowGrant] = useState(false)

  // Load stats
  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    const { data: subs } = await adminApi.select('seller_subscriptions', '*')
    if (!subs || !Array.isArray(subs)) return

    const active = subs.filter((s: any) => s.status === 'active' && s.plan === 'pro').length
    const trialing = subs.filter((s: any) => s.status === 'trialing').length
    const canceled = subs.filter((s: any) => s.status === 'canceled').length
    const pastDue = subs.filter((s: any) => s.status === 'past_due').length

    setStats({
      active,
      trialing,
      canceled,
      pastDue,
      mrr: active * 10, // $10/month * active subscriptions
    })
  }

  const handleGrantPro = async () => {
    if (!grantEmail.trim()) { setGrantError('Enter an email'); return }
    setGranting(true)
    setGrantError('')

    try {
      // Find user by email
      const { data: profiles } = await adminApi.select('profiles', 'id, email, full_name', {
        eq: { email: grantEmail.trim().toLowerCase() }
      })

      if (!profiles || profiles.length === 0) {
        setGrantError('User not found with that email')
        setGranting(false)
        return
      }

      const userId = profiles[0].id

      // Upsert subscription
      const { error } = await adminApi.upsert('seller_subscriptions', {
        user_id: userId,
        plan: 'pro',
        status: 'active',
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 30 * 86400000).toISOString(),
        updated_at: new Date().toISOString(),
      })

      if (error) throw new Error(error)

      setShowGrant(false)
      setGrantEmail('')
      refresh()
      loadStats()
    } catch (e: any) {
      setGrantError(e.message)
    } finally {
      setGranting(false)
    }
  }

  const handleRevokePro = async (userId: string) => {
    if (!confirm('Revoke Pro for this user? They will lose Pro features.')) return

    const { error } = await adminApi.update('seller_subscriptions', {
      plan: 'free',
      status: 'canceled',
      canceled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { eq: { user_id: userId } })

    if (!error) {
      refresh()
      loadStats()
    }
  }

  const columns: ColumnDef<any>[] = [
    {
      header: 'User',
      accessorKey: 'profiles',
      flex: 2,
      cell: (item) => (
        <YStack>
          <Text fontWeight="600" fontSize="$3">{item.profiles?.full_name || 'Unknown'}</Text>
          <Text fontSize="$2" color={colors.gray[500]}>{item.profiles?.email}</Text>
        </YStack>
      ),
    },
    {
      header: 'Plan',
      accessorKey: 'plan',
      flex: 1,
      cell: (item) => (
        <XStack
          backgroundColor={item.plan === 'pro' ? colors.green[100] : colors.gray[100]}
          paddingHorizontal="$2" paddingVertical="$1" borderRadius="$2"
          alignSelf="flex-start"
        >
          <Text
            fontSize="$2" fontWeight="600"
            color={item.plan === 'pro' ? colors.green[700] : colors.gray[600]}
          >
            {item.plan === 'pro' ? '🚜 Pro' : 'Free'}
          </Text>
        </XStack>
      ),
    },
    {
      header: 'Status',
      accessorKey: 'status',
      flex: 1,
      cell: (item) => {
        const statusColors: Record<string, string> = {
          active: colors.green[600],
          trialing: colors.blue[600],
          past_due: colors.amber[600],
          canceled: colors.red[600],
          inactive: colors.gray[500],
        }
        return (
          <Text fontSize="$3" fontWeight="500" color={statusColors[item.status] as any || colors.gray[500]}>
            {item.status}
          </Text>
        )
      },
    },
    {
      header: 'Period End',
      accessorKey: 'current_period_end',
      flex: 1,
      cell: (item) => (
        <Text fontSize="$2" color={colors.gray[600]}>
          {item.current_period_end ? new Date(item.current_period_end).toLocaleDateString() : '—'}
        </Text>
      ),
    },
    {
      header: 'Stripe ID',
      accessorKey: 'stripe_subscription_id',
      flex: 1.5,
      cell: (item) => (
        <Text fontSize="$2" color={colors.gray[500]} numberOfLines={1}>
          {item.stripe_subscription_id || 'Manual'}
        </Text>
      ),
    },
    {
      header: 'Actions',
      accessorKey: 'id',
      flex: 1,
      cell: (item) => (
        item.plan === 'pro' && ['active', 'trialing'].includes(item.status) ? (
          <Button
            size="$2"
            backgroundColor={colors.red[50]}
            borderColor={colors.red[200]}
            borderWidth={1}
            onPress={() => handleRevokePro(item.user_id)}
          >
            <Text fontSize="$2" color={colors.red[600]}>Revoke</Text>
          </Button>
        ) : null
      ),
    },
  ]

  return (
    <YStack flex={1} padding="$4" gap="$6">
      {/* Header */}
      <XStack justifyContent="space-between" alignItems="center">
        <XStack alignItems="center" gap="$2">
          <CreditCard size={24} color={colors.green[800]} />
          <YStack>
            <Text fontSize="$6" fontWeight="700" color={colors.green[900]}>Pro Subscriptions</Text>
            <Text fontSize="$3" color={colors.gray[600]}>Manage seller Pro plans and billing</Text>
          </YStack>
        </XStack>
        <Button
          backgroundColor={colors.green[600]}
          icon={<Plus size={16} color="white" />}
          onPress={() => setShowGrant(true)}
        >
          <Text color="white" fontWeight="600">Grant Pro</Text>
        </Button>
      </XStack>

      {/* Stats */}
      <XStack gap="$4" flexWrap="wrap">
        <StatCard label="MRR" value={`$${stats.mrr}`} color={colors.green[600]} />
        <StatCard label="Active" value={stats.active.toString()} color={colors.green[600]} />
        <StatCard label="Trialing" value={stats.trialing.toString()} color={colors.blue[600]} />
        <StatCard label="Past Due" value={stats.pastDue.toString()} color={colors.amber[600]} />
        <StatCard label="Canceled" value={stats.canceled.toString()} color={colors.red[600]} />
      </XStack>

      {/* Grant Pro Modal */}
      {showGrant && (
        <YStack borderWidth={1} borderColor={colors.gray[200]} padding="$4" backgroundColor="white" borderRadius="$4" elevation="$1">
          <Text fontSize="$5" fontWeight="600" color={colors.gray[800]} marginBottom="$3">Grant Pro to User</Text>
          {grantError && (
            <YStack backgroundColor={colors.red[50]} padding="$2" borderRadius="$2" borderWidth={1} borderColor={colors.red[200]} marginBottom="$3">
              <Text color={colors.red[800]} fontSize="$3">{grantError}</Text>
            </YStack>
          )}
          <Input
            value={grantEmail}
            onChangeText={setGrantEmail}
            placeholder="user@example.com"
            autoCapitalize="none"
            marginBottom="$3"
          />
          <XStack gap="$3" justifyContent="flex-end">
            <Button chromeless onPress={() => { setShowGrant(false); setGrantEmail(''); setGrantError('') }}>Cancel</Button>
            <Button backgroundColor={colors.green[600]} onPress={handleGrantPro} disabled={granting}>
              <Text color="white" fontWeight="600">{granting ? 'Granting...' : 'Grant Pro'}</Text>
            </Button>
          </XStack>
        </YStack>
      )}

      {/* Subscriptions Table */}
      <AdminDataGrid
        data={data}
        columns={columns}
        isLoading={loading}
        page={page}
        hasMore={hasMore}
        hasPrev={hasPrev}
        onNextPage={next}
        onPrevPage={prev}
        emptyMessage="No subscriptions found."
      />
    </YStack>
  )
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <YStack
      borderWidth={1} borderColor={colors.gray[200]}
      padding="$3" borderRadius="$3" backgroundColor="white"
      minWidth={120} elevation="$1"
    >
      <Text fontSize="$2" color={colors.gray[500]} fontWeight="500">{label}</Text>
      <Text fontSize="$7" fontWeight="800" color={color as any}>{value}</Text>
    </YStack>
  )
}
