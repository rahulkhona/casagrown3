'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { YStack, XStack, Text, Button, Spinner } from 'tamagui'
import { RefreshCw, DollarSign, TrendingUp, TrendingDown, AlertTriangle, CheckCircle } from '@tamagui/lucide-icons'
import { adminApi } from '../../../lib/adminApi'
import { colors } from '@casagrown/app/design-tokens'

type CashPosition = {
  bank_balance_usd: number
  total_inflows_usd: number
  total_outflows_usd: number
  total_user_available_usd: number
  total_user_pending_usd: number
  outstanding_debts_count: number
  outstanding_debts_usd: number
  is_healthy: boolean
  coverage_ratio: number
}

type BankEntry = {
  id: number
  created_at: string
  event_type: string
  direction: string
  amount_usd: number
  balance_after: number
  provider: string
  reference_type: string | null
  reference_id: string | null
  metadata: Record<string, any>
}

type Reconciliation = {
  healthy: boolean
  checked_at: string
  discrepancies: Array<Record<string, any>>
  summary: Record<string, number>
}

const EVENT_LABELS: Record<string, { label: string; icon: string }> = {
  stripe_payout_received: { label: 'Stripe Payout Received', icon: '💰' },
  balance_applied: { label: 'Balance Applied', icon: '💳' },
  cashout_sent: { label: 'PayPal/Venmo Cashout', icon: '💸' },
  gift_card_purchased: { label: 'Gift Card Purchased', icon: '🎁' },
  donation_sent: { label: 'Donation Sent', icon: '💛' },
  stripe_refund: { label: 'Stripe Refund', icon: '↩️' },
  chargeback_debit: { label: 'Chargeback', icon: '⚠️' },
  stripe_fees: { label: 'Stripe Fees', icon: '🏦' },
  manual_adjustment: { label: 'Manual Adjustment', icon: '🔧' },
}

function StatCard({ label, value, icon: Icon, color, subtext }: {
  label: string; value: string; icon: any; color: string; subtext?: string
}) {
  return (
    <YStack flex={1} backgroundColor="white" borderRadius="$4" padding="$4" borderWidth={1} borderColor={colors.gray[200]}>
      <XStack alignItems="center" gap="$2" marginBottom="$2">
        <Icon size={18} color={color} />
        <Text fontSize={12} fontWeight="600" color={colors.gray[500]} textTransform="uppercase">{label}</Text>
      </XStack>
      <Text fontSize="$7" fontWeight="bold" color={colors.gray[900]}>{value}</Text>
      {subtext && <Text fontSize={12} color={colors.gray[500]} marginTop="$1">{subtext}</Text>}
    </YStack>
  )
}

export default function CashFlowPage() {
  const [position, setPosition] = useState<CashPosition | null>(null)
  const [entries, setEntries] = useState<BankEntry[]>([])
  const [reconciliation, setReconciliation] = useState<Reconciliation | null>(null)
  const [loading, setLoading] = useState(true)
  const [reconcileLoading, setReconcileLoading] = useState(false)
  const [depositLoading, setDepositLoading] = useState(false)
  const [depositResult, setDepositResult] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [posRes, stmtRes] = await Promise.all([
      adminApi.rpc('platform_cash_position'),
      adminApi.rpc('get_platform_bank_statement', { p_limit: 50 }),
    ])
    if (posRes.data) setPosition(posRes.data)
    if (stmtRes.data) setEntries(Array.isArray(stmtRes.data) ? stmtRes.data : [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const runReconciliation = async () => {
    setReconcileLoading(true)
    const { data } = await adminApi.rpc('reconcile_platform_balances')
    if (data) setReconciliation(data)
    setReconcileLoading(false)
  }

  const simulateDeposit = async () => {
    setDepositLoading(true)
    setDepositResult(null)
    const { data, error } = await adminApi.invokeFunction('simulate-bank-deposit', { amount_usd: 1000 })
    if (error) {
      setDepositResult(`Error: ${error}`)
    } else {
      setDepositResult(`Deposited $${data?.amount_usd || 1000} (entry #${data?.entry_id || '?'})`)
      fetchData()
    }
    setDepositLoading(false)
  }

  const fmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  if (loading) {
    return (
      <YStack flex={1} padding="$6" alignItems="center" justifyContent="center">
        <Spinner size="large" color={colors.green[600]} />
      </YStack>
    )
  }

  return (
      <YStack flex={1} padding="$6" gap="$5" maxWidth={1200}>
        {/* Header */}
        <XStack justifyContent="space-between" alignItems="center">
          <YStack>
            <Text fontSize="$8" fontWeight="bold" color={colors.green[900]}>Cash Flow</Text>
            <Text color={colors.gray[600]}>Platform bank ledger, balance coverage, and reconciliation</Text>
          </YStack>
          <XStack gap="$2">
            <Button icon={RefreshCw} backgroundColor={colors.green[600]} onPress={fetchData}>
              <Text color="white">Refresh</Text>
            </Button>
            <Button backgroundColor="#2563eb" onPress={simulateDeposit} disabled={depositLoading}>
              {depositLoading ? <Spinner size="small" color="white" /> : <Text color="white">Simulate Deposit</Text>}
            </Button>
          </XStack>
        </XStack>

        {depositResult && (
          <Text fontSize={13} fontWeight="600" color={depositResult.startsWith('Error') ? '#dc2626' : colors.green[700]}>
            {depositResult}
          </Text>
        )}

        {/* Health Status Banner */}
        {position && (
          <XStack
            backgroundColor={position.is_healthy ? '#f0fdf4' : '#fef2f2'}
            borderWidth={1}
            borderColor={position.is_healthy ? '#86efac' : '#fca5a5'}
            borderRadius="$4"
            padding="$4"
            alignItems="center"
            gap="$3"
          >
            {position.is_healthy
              ? <CheckCircle size={24} color="#16a34a" />
              : <AlertTriangle size={24} color="#dc2626" />
            }
            <YStack flex={1}>
              <Text fontWeight="bold" color={position.is_healthy ? '#166534' : '#991b1b'}>
                {position.is_healthy ? 'Platform is Solvent' : '⚠️ Solvency Warning'}
              </Text>
              <Text fontSize={13} color={position.is_healthy ? '#15803d' : '#b91c1c'}>
                Coverage ratio: {(position.coverage_ratio * 100).toFixed(1)}%
                {!position.is_healthy && ' — Bank balance cannot cover all user available balances'}
              </Text>
            </YStack>
          </XStack>
        )}

        {/* Stats Cards */}
        {position && (
          <XStack gap="$3" flexWrap="wrap">
            <StatCard label="Bank Balance" value={fmt(position.bank_balance_usd)} icon={DollarSign} color={colors.green[700]} />
            <StatCard label="Total Inflows" value={fmt(position.total_inflows_usd)} icon={TrendingUp} color="#2563eb" />
            <StatCard label="Total Outflows" value={fmt(position.total_outflows_usd)} icon={TrendingDown} color="#ea580c" />
            <StatCard label="User Balances" value={fmt(position.total_user_available_usd)} icon={DollarSign} color={colors.gray[700]}
              subtext={`+ ${fmt(position.total_user_pending_usd)} pending`} />
          </XStack>
        )}

        {position && position.outstanding_debts_count > 0 && (
          <XStack backgroundColor="#fff7ed" borderWidth={1} borderColor="#fdba74" borderRadius="$4" padding="$4" alignItems="center" gap="$3">
            <AlertTriangle size={20} color="#ea580c" />
            <Text fontSize={14} color="#9a3412" fontWeight="600">
              {position.outstanding_debts_count} outstanding debt{position.outstanding_debts_count > 1 ? 's' : ''} totaling {fmt(position.outstanding_debts_usd)}
            </Text>
          </XStack>
        )}

        {/* Reconciliation */}
        <YStack backgroundColor="white" borderRadius="$4" borderWidth={1} borderColor={colors.gray[200]} padding="$4" gap="$3">
          <XStack justifyContent="space-between" alignItems="center">
            <Text fontWeight="bold" fontSize="$5" color={colors.gray[900]}>Reconciliation Check</Text>
            <Button size="$3" backgroundColor="#7c3aed" onPress={runReconciliation} disabled={reconcileLoading}>
              {reconcileLoading ? <Spinner size="small" color="white" /> : <Text color="white" fontSize={13}>Run Check</Text>}
            </Button>
          </XStack>
          {reconciliation && (
            <YStack gap="$2">
              <XStack alignItems="center" gap="$2">
                {reconciliation.healthy
                  ? <CheckCircle size={18} color="#16a34a" />
                  : <AlertTriangle size={18} color="#dc2626" />
                }
                <Text fontWeight="600" color={reconciliation.healthy ? '#166534' : '#991b1b'}>
                  {reconciliation.healthy ? 'All checks passed' : `${reconciliation.discrepancies.length} issue(s) found`}
                </Text>
                <Text fontSize={12} color={colors.gray[400]}>
                  — {new Date(reconciliation.checked_at).toLocaleString()}
                </Text>
              </XStack>
              {reconciliation.discrepancies.length > 0 && reconciliation.discrepancies.map((d, i) => (
                <YStack key={i} backgroundColor="#fef2f2" padding="$3" borderRadius="$3">
                  <Text fontSize={13} fontWeight="600" color="#991b1b">{d.check}</Text>
                  <Text fontSize={12} color="#b91c1c">{JSON.stringify(d, null, 2)}</Text>
                </YStack>
              ))}
            </YStack>
          )}
        </YStack>

        {/* Bank Statement */}
        <YStack backgroundColor="white" borderRadius="$4" borderWidth={1} borderColor={colors.gray[200]} overflow="hidden">
          <XStack padding="$4" borderBottomWidth={1} borderColor={colors.gray[100]}>
            <Text fontWeight="bold" fontSize="$5" color={colors.gray[900]}>Bank Statement (Last 50)</Text>
          </XStack>

          {/* Header Row */}
          <XStack paddingHorizontal="$4" paddingVertical="$2" borderBottomWidth={1} borderColor={colors.gray[100]} backgroundColor={colors.gray[50]}>
            <Text width={50} fontSize={11} fontWeight="600" color={colors.gray[400]}>#</Text>
            <Text width={140} fontSize={11} fontWeight="600" color={colors.gray[400]}>DATE</Text>
            <Text flex={1} fontSize={11} fontWeight="600" color={colors.gray[400]}>EVENT</Text>
            <Text width={80} fontSize={11} fontWeight="600" color={colors.gray[400]} textAlign="center">DIRECTION</Text>
            <Text width={100} fontSize={11} fontWeight="600" color={colors.gray[400]} textAlign="right">AMOUNT</Text>
            <Text width={100} fontSize={11} fontWeight="600" color={colors.gray[400]} textAlign="right">BALANCE</Text>
            <Text width={90} fontSize={11} fontWeight="600" color={colors.gray[400]} textAlign="center">PROVIDER</Text>
          </XStack>

          {entries.map((entry, idx) => {
            const ev = EVENT_LABELS[entry.event_type] || { label: entry.event_type, icon: '📋' }
            const isInflow = entry.direction === 'inflow'
            return (
              <XStack
                key={entry.id}
                paddingHorizontal="$4"
                paddingVertical="$3"
                alignItems="center"
                borderBottomWidth={idx < entries.length - 1 ? 1 : 0}
                borderColor={colors.gray[50]}
                hoverStyle={{ backgroundColor: colors.gray[50] }}
              >
                <Text width={50} fontSize={12} color={colors.gray[400]}>{entry.id}</Text>
                <Text width={140} fontSize={12} color={colors.gray[600]}>
                  {new Date(entry.created_at).toLocaleDateString()} {new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
                <XStack flex={1} alignItems="center" gap="$1">
                  <Text fontSize={14}>{ev.icon}</Text>
                  <Text fontSize={13} color={colors.gray[800]}>{ev.label}</Text>
                </XStack>
                <Text width={80} fontSize={12} fontWeight="600" textAlign="center"
                  color={isInflow ? '#16a34a' : '#dc2626'}
                >
                  {isInflow ? '↑ IN' : '↓ OUT'}
                </Text>
                <Text width={100} fontSize={13} fontWeight="600" textAlign="right"
                  color={isInflow ? '#16a34a' : '#dc2626'}
                >
                  {isInflow ? '+' : '-'}{fmt(entry.amount_usd)}
                </Text>
                <Text width={100} fontSize={13} textAlign="right" color={colors.gray[700]}>
                  {fmt(entry.balance_after)}
                </Text>
                <Text width={90} fontSize={12} textAlign="center" color={colors.gray[500]}>
                  {entry.provider}
                </Text>
              </XStack>
            )
          })}

          {entries.length === 0 && (
            <YStack padding="$6" alignItems="center">
              <Text color={colors.gray[400]}>No bank ledger entries yet</Text>
            </YStack>
          )}
        </YStack>
      </YStack>
  )
}
