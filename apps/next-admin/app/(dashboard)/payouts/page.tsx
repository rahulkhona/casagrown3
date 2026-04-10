'use client'

import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { YStack, XStack, Text, Button, Spinner, Input, Switch, Checkbox, ScrollView } from 'tamagui'
import { RefreshCw, Play, Search, AlertCircle, Calendar } from '@tamagui/lucide-icons'
import { adminApi } from '../../../lib/adminApi'
import { colors } from '@casagrown/app/design-tokens'

type QueuedPayout = {
  id: string
  user_id: string
  full_name: string
  email: string
  provider: string
  status: string
  point_cost: number
  metadata: any
  created_at: string
  failed_reason: string
}

export default function PayoutsPage() {
  const [payouts, setPayouts] = useState<QueuedPayout[]>([])
  const [loading, setLoading] = useState(true)
  
  // Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [autoBatchLimitUsd, setAutoBatchLimitUsd] = useState<string>('1000')

  // Execution State
  const [processing, setProcessing] = useState(false)
  const [processResult, setProcessResult] = useState<{ success: number; failed: number } | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setProcessResult(null)
    const res = await adminApi.rpc<QueuedPayout[]>('get_pending_payouts_admin', { p_limit: 500, p_offset: 0 })
    if (res.data) setPayouts(res.data)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === payouts.length && payouts.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(payouts.map(p => p.id)))
    }
  }

  const selectOldestUpToLimit = () => {
    const limit = parseFloat(autoBatchLimitUsd) || 0
    let currentTotal = 0
    const newSelection = new Set<string>()

    for (const p of payouts) {
      const usdValue = p.point_cost / 100
      if (currentTotal + usdValue <= limit) {
        currentTotal += usdValue
        newSelection.add(p.id)
      } else {
        // Stop once we hit the cap to maintain strict FIFO
        break
      }
    }
    
    setSelectedIds(newSelection)
  }

  const executeSelectedPayouts = async () => {
    if (selectedIds.size === 0) return
    if (!confirm(`Are you sure you want to process ${selectedIds.size} selected payout(s)? Corporate cash will be deducted.`)) return
    
    setProcessing(true)
    setProcessResult(null)

    const idsArray = Array.from(selectedIds)
    
    try {
      const { data, error } = await adminApi.invokeFunction('process-selected-payouts', { redemption_ids: idsArray })
      if (error) throw new Error(error)
      if (data && data.success) {
        setProcessResult({ success: data.processed, failed: data.failed })
        setSelectedIds(new Set())
        await fetchData()
      } else {
        alert(data?.error || 'Execution failed')
      }
    } catch (err: any) {
      alert('Error during execution: ' + err.message)
    } finally {
      setProcessing(false)
    }
  }

  const fmt = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  // Metrics
  const totalQueueUsd = payouts.reduce((acc, p) => acc + (p.point_cost / 100), 0)
  const selectedUsd = Array.from(selectedIds).reduce((acc, id) => {
    const p = payouts.find(x => x.id === id)
    return acc + (p ? p.point_cost / 100 : 0)
  }, 0)

  if (loading) {
    return (
      <YStack flex={1} padding="$4" alignItems="center" justifyContent="center">
        <Spinner size="large" color={colors.green[600]} />
      </YStack>
    )
  }

  return (
    <YStack flex={1} padding="$6" gap="$5">
      {/* Header */}
      <XStack justifyContent="space-between" alignItems="center">
        <YStack>
          <Text fontSize="$8" fontWeight="bold" color={colors.green[900]}>Payout Queue</Text>
          <Text color={colors.gray[600]}>Manual human-review for corporate cashouts</Text>
        </YStack>
        <Button icon={RefreshCw} backgroundColor={colors.white} color={colors.gray[800]} borderWidth={1} borderColor={colors.gray[300]} onPress={fetchData}>
          Refresh Queue
        </Button>
      </XStack>

      {/* Metrics Banner */}
      <XStack gap="$4">
        <YStack flex={1} backgroundColor="white" padding="$4" borderRadius="$4" borderWidth={1} borderColor={colors.gray[200]}>
          <Text fontSize={12} color={colors.gray[500]} fontWeight="600" textTransform="uppercase">Total Pending Limit</Text>
          <Text fontSize="$8" fontWeight="bold" color={colors.gray[900]}>{fmt(totalQueueUsd * 100)}</Text>
          <Text fontSize={13} color={colors.gray[500]}>{payouts.length} items waiting in queue</Text>
        </YStack>
        <YStack flex={1} backgroundColor={colors.green[50]} padding="$4" borderRadius="$4" borderWidth={1} borderColor={colors.green[200]}>
          <Text fontSize={12} color={colors.green[700]} fontWeight="600" textTransform="uppercase">Selected for Execution</Text>
          <Text fontSize="$8" fontWeight="bold" color={colors.green[800]}>{fmt(selectedUsd * 100)}</Text>
          <Text fontSize={13} color={colors.green[600]}>{selectedIds.size} items selected</Text>
        </YStack>
      </XStack>

      {/* Execution Controls */}
      <YStack backgroundColor="white" borderRadius="$4" borderWidth={1} borderColor={colors.gray[200]} padding="$4" gap="$4">
        <XStack justifyContent="space-between" alignItems="flex-end" flexWrap="wrap" gap="$4">
          
          <YStack gap="$2" flex={1} minWidth={300}>
            <Text fontSize={14} fontWeight="600" color={colors.gray[800]}>Fast Selection (Strict FIFO)</Text>
            <XStack gap="$2" alignItems="center">
              <Text fontSize={14} color={colors.gray[600]}>Select Oldest up to: $</Text>
              <Input 
                width={120} 
                height="$3"
                value={autoBatchLimitUsd} 
                onChangeText={setAutoBatchLimitUsd} 
                placeholder="1000" 
                keyboardType="numeric" 
              />
              <Button size="$3" backgroundColor={colors.gray[100]} color={colors.gray[800]} onPress={selectOldestUpToLimit}>
                Auto-Select
              </Button>
            </XStack>
          </YStack>

          <Button 
            size="$4" 
            backgroundColor={selectedIds.size > 0 ? colors.green[600] : colors.gray[300]} 
            disabled={selectedIds.size === 0 || processing}
            icon={processing ? <Spinner color="white" /> : Play}
            onPress={executeSelectedPayouts}
          >
            <Text color="white" fontWeight="bold">
              {processing ? 'Processing...' : `Execute Selected (${fmt(selectedUsd * 100)})`}
            </Text>
          </Button>

        </XStack>

        {processResult && (
          <XStack backgroundColor={processResult.failed > 0 ? '#fffbeb' : colors.green[50]} padding="$3" borderRadius="$2" alignItems="center" gap="$2">
            <AlertCircle size={16} color={processResult.failed > 0 ? '#d97706' : colors.green[600]} />
            <Text color={processResult.failed > 0 ? '#92400e' : colors.green[800]} fontWeight="600">
              Execution Complete: {processResult.success} succeeded, {processResult.failed} failed.
            </Text>
          </XStack>
        )}
      </YStack>

      {/* Queue Table */}
      <YStack backgroundColor="white" borderRadius="$4" borderWidth={1} borderColor={colors.gray[200]} overflow="hidden">
        <ScrollView horizontal showsHorizontalScrollIndicator={true}>
          <YStack minWidth={1400}>
            
            {/* Header Row */}
          <XStack paddingHorizontal="$4" paddingVertical="$3" borderBottomWidth={1} borderColor={colors.gray[200]} backgroundColor={colors.gray[50]} alignItems="center">
            <XStack width={40} justifyContent="center">
              <Checkbox 
                checked={selectedIds.size > 0 && selectedIds.size === payouts.length} 
                onCheckedChange={toggleSelectAll}
                size="$3"
              >
                <Checkbox.Indicator><Text>✓</Text></Checkbox.Indicator>
              </Checkbox>
            </XStack>
            <Text width={120} fontSize={12} fontWeight="600" color={colors.gray[500]}>DATE</Text>
            <Text width={160} fontSize={12} fontWeight="600" color={colors.gray[500]}>USER</Text>
            <Text width={90} fontSize={12} fontWeight="600" color={colors.gray[500]}>PROVIDER</Text>
            <Text width={150} fontSize={12} fontWeight="600" color={colors.gray[500]}>DESTINATION</Text>
            <Text width={150} fontSize={12} fontWeight="600" color={colors.gray[500]}>SETTLEMENT ID</Text>
            <Text width={100} fontSize={12} fontWeight="600" color={colors.gray[500]}>SETTLEMENT DT</Text>
            <Text width={150} fontSize={12} fontWeight="600" color={colors.gray[500]}>PAYMENT ID</Text>
            <Text width={100} fontSize={12} fontWeight="600" color={colors.gray[500]}>PAYMENT DT</Text>
            <Text flex={1} fontSize={12} fontWeight="600" color={colors.gray[500]} textAlign="right">AMOUNT</Text>
            <Text width={90} fontSize={12} fontWeight="600" color={colors.gray[500]} textAlign="center">STATUS</Text>
          </XStack>

        {payouts.length === 0 ? (
          <YStack padding="$8" alignItems="center">
            <Text color={colors.gray[400]}>The queue is empty.</Text>
          </YStack>
        ) : (
          payouts.map((p, idx) => {
            const isSelected = selectedIds.has(p.id)
            return (
              <YStack key={p.id}>
                <XStack
                  paddingHorizontal="$4"
                  paddingVertical="$3"
                  alignItems="center"
                  borderBottomWidth={1}
                  borderColor={colors.gray[100]}
                  backgroundColor={isSelected ? colors.green[50] : 'transparent'}
                  onPress={() => toggleSelect(p.id)}
                  cursor="pointer"
                  hoverStyle={{ backgroundColor: isSelected ? colors.green[100] : colors.gray[50] }}
                >
                  <XStack width={40} justifyContent="center" onPress={(e) => { e.stopPropagation(); toggleSelect(p.id); }}>
                    <Checkbox checked={isSelected} size="$3">
                      <Checkbox.Indicator><Text>✓</Text></Checkbox.Indicator>
                    </Checkbox>
                  </XStack>
                  <Text width={120} fontSize={13} color={colors.gray[600]}>
                    {new Date(p.created_at).toLocaleDateString()} {new Date(p.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  <YStack width={160}>
                    <Text fontSize={13} fontWeight="600" color={colors.gray[900]} numberOfLines={1}>{p.full_name || 'Anonymous'}</Text>
                    <Text fontSize={12} color={colors.gray[500]} numberOfLines={1}>{p.email}</Text>
                  </YStack>
                  <Text width={90} fontSize={13} color={colors.gray[800]} textTransform="capitalize">{p.provider}</Text>

                  <YStack width={150}>
                    {p.metadata?.brand_name ? (
                      <Text fontSize={12} color={colors.blue[600]} numberOfLines={2}>Giftcard: {p.metadata.brand_name}</Text>
                    ) : p.metadata?.organization ? (
                      <Text fontSize={12} color={colors.purple[600]} numberOfLines={2}>Charity: {p.metadata.organization}</Text>
                    ) : (
                      <Text fontSize={12} color={colors.gray[400]}>Standard Cashout</Text>
                    )}
                  </YStack>

                  <Text width={150} fontSize={12} color={colors.gray[700]} numberOfLines={1}>{p.metadata?.settlement_id || 'N/A'}</Text>
                  <Text width={100} fontSize={12} color={colors.gray[700]}>{p.metadata?.settlement_date || 'N/A'}</Text>

                  <Text width={150} fontSize={12} color={colors.gray[700]} numberOfLines={1}>{p.metadata?.payment_id || 'N/A'}</Text>
                  <Text width={100} fontSize={12} color={colors.gray[700]}>{p.metadata?.payment_received_date || 'N/A'}</Text>

                  <Text flex={1} fontSize={13} fontWeight="700" textAlign="right" color={colors.gray[900]}>{fmt(p.point_cost)}</Text>
                  <XStack width={90} justifyContent="center" marginLeft="$4">
                    <Text fontSize={11} fontWeight="700" paddingHorizontal="$2" paddingVertical={2} borderRadius="$2" backgroundColor={p.status === 'failed' ? '#fef2f2' : '#fefce8'} color={p.status === 'failed' ? '#991b1b' : '#a16207'} borderWidth={1} borderColor={p.status === 'failed' ? '#fca5a5' : '#fde047'}>
                      {p.status.toUpperCase()}
                    </Text>
                  </XStack>
                </XStack>
                
                {p.failed_reason && (
                  <XStack backgroundColor="#fef2f2" padding="$3" paddingLeft={40}>
                    <AlertCircle size={14} color="#dc2626" />
                    <Text fontSize={12} color="#991b1b" marginLeft="$2">Failure Reason: {p.failed_reason}</Text>
                  </XStack>
                )}
              </YStack>
            )
          })
        )}
          </YStack>
        </ScrollView>
      </YStack>
    </YStack>
  )
}
