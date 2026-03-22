'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { YStack, XStack, Text, Button, Card, Input, Spinner, Separator } from 'tamagui'
import { colors } from '@casagrown/app/design-tokens'
import { Search, CheckCircle, XCircle, Clock, Mail, Phone, MapPin, School, Tag } from '@tamagui/lucide-icons'
import { adminApi } from '../../../lib/adminApi'

type BetaTester = {
  id: string
  full_name: string
  email: string
  phone_number: string | null
  nearest_highschool: string
  zip_code: string
  campaign_code: string | null
  referral_source: string | null
  referral_url: string | null
  signed_up_at: string
  notes: string | null
  status: 'pending' | 'contacted' | 'active' | 'declined'
}

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: colors.amber[100], text: colors.amber[700], label: '⏳ Pending' },
  contacted: { bg: colors.blue[100], text: colors.blue[700], label: '📧 Contacted' },
  active: { bg: colors.green[100], text: colors.green[700], label: '✅ Active' },
  declined: { bg: colors.red[100], text: colors.red[700], label: '❌ Declined' },
}

export default function BetaTestersPage() {
  const [testers, setTesters] = useState<BetaTester[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const fetchTesters = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const filters: any = {}
      if (filterStatus !== 'all') {
        filters.eq = { status: filterStatus }
      }

      const { data, error: fetchErr } = await adminApi.select(
        'beta_testers',
        '*',
        Object.keys(filters).length ? filters : undefined,
        { order: { column: 'signed_up_at', ascending: false } }
      )

      if (fetchErr) throw new Error(String(fetchErr))
      setTesters((data || []) as BetaTester[])
    } catch (err: any) {
      setError(err.message || 'Failed to load testers')
    } finally {
      setLoading(false)
    }
  }, [filterStatus])

  useEffect(() => { fetchTesters() }, [fetchTesters])

  const updateStatus = async (id: string, newStatus: string) => {
    setUpdatingId(id)
    try {
      const { error: updateErr } = await adminApi.update(
        'beta_testers',
        { status: newStatus },
        { eq: { id } }
      )
      if (updateErr) throw new Error(String(updateErr))
      setTesters(prev => prev.map(t => t.id === id ? { ...t, status: newStatus as any } : t))
    } catch (err: any) {
      setError(err.message || 'Failed to update status')
    } finally {
      setUpdatingId(null)
    }
  }

  const filtered = testers.filter(t => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      t.full_name.toLowerCase().includes(q) ||
      t.email.toLowerCase().includes(q) ||
      t.nearest_highschool.toLowerCase().includes(q) ||
      t.zip_code.includes(q) ||
      (t.campaign_code || '').toLowerCase().includes(q)
    )
  })

  const stats = {
    total: testers.length,
    pending: testers.filter(t => t.status === 'pending').length,
    active: testers.filter(t => t.status === 'active').length,
    declined: testers.filter(t => t.status === 'declined').length,
  }

  return (
    <YStack gap="$6" maxWidth={1000} width="100%">
      {/* Header */}
      <YStack gap="$2">
        <Text fontSize="$8" fontWeight="700" color={colors.gray[900]}>
          Beta Testers
        </Text>
        <Text fontSize="$4" color={colors.gray[500]}>
          Manage beta tester signups. Accept testers to grant access, or decline applications.
        </Text>
      </YStack>

      {/* Stats Row */}
      <XStack gap="$3" flexWrap="wrap">
        {[
          { label: 'Total', value: stats.total, bg: colors.gray[100], color: colors.gray[700] },
          { label: 'Pending', value: stats.pending, bg: colors.amber[100], color: colors.amber[700] },
          { label: 'Active', value: stats.active, bg: colors.green[100], color: colors.green[700] },
          { label: 'Declined', value: stats.declined, bg: colors.red[100], color: colors.red[700] },
        ].map(s => (
          <Card key={s.label} borderWidth={1} padding="$3" backgroundColor={s.bg} minWidth={120} flex={1}>
            <Text fontSize="$2" fontWeight="600" color={s.color}>{s.label}</Text>
            <Text fontSize="$7" fontWeight="700" color={s.color}>{s.value}</Text>
          </Card>
        ))}
      </XStack>

      {/* Filters */}
      <Card borderWidth={1} padding="$4" backgroundColor="white">
        <XStack gap="$3" alignItems="center" flexWrap="wrap">
          <XStack alignItems="center" gap="$2" flex={1} minWidth={200}>
            <Search size={16} color={colors.gray[500]} />
            <Input
              flex={1}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search by name, email, school, zip, campaign..."
              size="$4"
              borderWidth={1}
              borderColor={colors.gray[300]}
            />
          </XStack>
          <XStack gap="$2" flexWrap="wrap">
            {['all', 'pending', 'contacted', 'active', 'declined'].map(status => (
              <Button
                key={status}
                size="$3"
                backgroundColor={filterStatus === status ? colors.green[600] : colors.gray[100]}
                onPress={() => setFilterStatus(status)}
                borderRadius="$4"
              >
                <Text
                  color={filterStatus === status ? 'white' : colors.gray[700]}
                  fontWeight="600"
                  fontSize="$2"
                  textTransform="capitalize"
                >
                  {status}
                </Text>
              </Button>
            ))}
          </XStack>
        </XStack>
      </Card>

      {/* Error */}
      {error && (
        <Card borderWidth={1} padding="$3" backgroundColor={colors.red[50]} borderColor={colors.red[200]}>
          <Text color={colors.red[600]}>{error}</Text>
        </Card>
      )}

      {/* List */}
      {loading ? (
        <YStack alignItems="center" padding="$8">
          <Spinner size="large" color={colors.green[600]} />
          <Text color={colors.gray[500]} marginTop="$2">Loading testers...</Text>
        </YStack>
      ) : filtered.length === 0 ? (
        <Card borderWidth={1} padding="$6" backgroundColor="white">
          <YStack alignItems="center" gap="$2">
            <Text fontSize={32}>📋</Text>
            <Text fontWeight="600" color={colors.gray[700]}>No testers found</Text>
            <Text color={colors.gray[500]} fontSize="$3">
              {searchQuery ? 'Try a different search query' : 'No signups yet. Share the /testers link to collect signups!'}
            </Text>
          </YStack>
        </Card>
      ) : (
        <YStack gap="$3">
          <Text fontWeight="600" color={colors.gray[600]} fontSize="$3">
            Showing {filtered.length} tester{filtered.length !== 1 ? 's' : ''}
          </Text>

          {filtered.map(tester => {
            const statusInfo = STATUS_COLORS[tester.status]
            return (
              <Card
                key={tester.id}
                borderWidth={1}
                padding="$4"
                backgroundColor="white"
                borderColor={tester.status === 'pending' ? colors.amber[200] : colors.gray[200]}
              >
                <YStack gap="$3">
                  {/* Top: Name + Status */}
                  <XStack justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$2">
                    <YStack gap="$1">
                      <Text fontWeight="700" fontSize="$5" color={colors.gray[900]}>
                        {tester.full_name}
                      </Text>
                      <Text fontSize="$2" color={colors.gray[400]}>
                        Signed up {new Date(tester.signed_up_at).toLocaleString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
                        })}
                      </Text>
                    </YStack>
                    <XStack
                      paddingHorizontal="$3"
                      paddingVertical="$1"
                      borderRadius={999}
                      backgroundColor={statusInfo.bg as any}
                    >
                      <Text fontSize="$2" fontWeight="600" color={statusInfo.text as any}>
                        {statusInfo.label}
                      </Text>
                    </XStack>
                  </XStack>

                  <Separator />

                  {/* Details Grid */}
                  <XStack flexWrap="wrap" gap="$4">
                    <XStack alignItems="center" gap="$2" minWidth={200}>
                      <Mail size={14} color={colors.gray[400]} />
                      <Text fontSize="$3" color={colors.gray[600]}>{tester.email}</Text>
                    </XStack>
                    {tester.phone_number && (
                      <XStack alignItems="center" gap="$2" minWidth={140}>
                        <Phone size={14} color={colors.gray[400]} />
                        <Text fontSize="$3" color={colors.gray[600]}>{tester.phone_number}</Text>
                      </XStack>
                    )}
                    <XStack alignItems="center" gap="$2" minWidth={160}>
                      <School size={14} color={colors.gray[400]} />
                      <Text fontSize="$3" color={colors.gray[600]}>{tester.nearest_highschool}</Text>
                    </XStack>
                    <XStack alignItems="center" gap="$2">
                      <MapPin size={14} color={colors.gray[400]} />
                      <Text fontSize="$3" color={colors.gray[600]}>{tester.zip_code}</Text>
                    </XStack>
                    {tester.campaign_code && (
                      <XStack alignItems="center" gap="$2">
                        <Tag size={14} color={colors.gray[400]} />
                        <Text fontSize="$3" color={colors.gray[600]}>Campaign: {tester.campaign_code}</Text>
                      </XStack>
                    )}
                    {tester.referral_source && (
                      <XStack alignItems="center" gap="$2">
                        <Text fontSize="$2" color={colors.gray[400]}>via</Text>
                        <Text fontSize="$3" color={colors.blue[600]} fontWeight="500">{tester.referral_source}</Text>
                      </XStack>
                    )}
                  </XStack>

                  {/* Action Buttons */}
                  <XStack gap="$2" justifyContent="flex-end" flexWrap="wrap">
                    {tester.status !== 'active' && (
                      <Button
                        size="$3"
                        backgroundColor={colors.green[600]}
                        onPress={() => updateStatus(tester.id, 'active')}
                        disabled={updatingId === tester.id}
                        hoverStyle={{ backgroundColor: colors.green[700] }}
                        icon={updatingId === tester.id ? <Spinner size="small" color="white" /> : <CheckCircle size={14} color="white" />}
                      >
                        <Text color="white" fontWeight="600" fontSize="$2">Accept</Text>
                      </Button>
                    )}
                    {tester.status !== 'contacted' && tester.status !== 'active' && (
                      <Button
                        size="$3"
                        backgroundColor={colors.blue[100]}
                        borderWidth={1}
                        borderColor={'#bfdbfe' as any}
                        onPress={() => updateStatus(tester.id, 'contacted')}
                        disabled={updatingId === tester.id}
                        hoverStyle={{ backgroundColor: '#bfdbfe' as any }}
                        icon={<Clock size={14} color={colors.blue[600]} />}
                      >
                        <Text color={colors.blue[700]} fontWeight="600" fontSize="$2">Mark Contacted</Text>
                      </Button>
                    )}
                    {tester.status !== 'declined' && (
                      <Button
                        size="$3"
                        backgroundColor={colors.red[50]}
                        borderWidth={1}
                        borderColor={colors.red[200]}
                        onPress={() => updateStatus(tester.id, 'declined')}
                        disabled={updatingId === tester.id}
                        hoverStyle={{ backgroundColor: colors.red[100] }}
                        icon={<XCircle size={14} color={colors.red[600]} />}
                      >
                        <Text color={colors.red[600]} fontWeight="600" fontSize="$2">Decline</Text>
                      </Button>
                    )}
                    {(tester.status === 'active' || tester.status === 'declined') && (
                      <Button
                        size="$3"
                        backgroundColor={colors.gray[100]}
                        borderWidth={1}
                        borderColor={colors.gray[200]}
                        onPress={() => updateStatus(tester.id, 'pending')}
                        disabled={updatingId === tester.id}
                        hoverStyle={{ backgroundColor: colors.gray[200] }}
                      >
                        <Text color={colors.gray[600]} fontWeight="600" fontSize="$2">Reset to Pending</Text>
                      </Button>
                    )}
                  </XStack>
                </YStack>
              </Card>
            )
          })}
        </YStack>
      )}
    </YStack>
  )
}
