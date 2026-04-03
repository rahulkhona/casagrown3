'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { YStack, XStack, Text, Button, Spinner } from 'tamagui'
import { RefreshCw, AlertTriangle, CheckCircle, ChevronDown, ChevronUp, ExternalLink } from '@tamagui/lucide-icons'
import { adminApi } from '../../../lib/adminApi'
import { colors } from '@casagrown/app/design-tokens'

type Settlement = {
  settlement_id: string
  market_date: string
  status: string
  total_orders: number
  total_captured_usd: number
  total_released_usd: number
  total_payouts_usd: number
  total_fees_usd: number
  total_refunds_usd: number
  stripe_payout_id: string | null
  stripe_payout_amount_usd: number | null
  created_at: string
  captures_succeeded: number
  captures_failed: number
  captures_pending: number
  outstanding_debts_usd: number
}

type FailedCapture = {
  capture_id: string
  buyer_id: string
  buyer_email: string
  buyer_name: string
  stripe_payment_intent_id: string
  hold_amount_usd: number
  capture_amount_usd: number
  capture_status: string
  error_message: string | null
  debt_status: string | null
  debt_amount_usd: number | null
  created_at: string
}

type PayoutEvent = {
  id: string
  stripe_payout_id: string
  event_type: 'paid' | 'failed'
  amount_usd: number
  failure_code: string | null
  failure_message: string | null
  matched_settlement_ids: string[]
  affected_user_ids: string[]
  created_at: string
  settlement_count: number
  affected_user_count: number
}

type PayoutEventDetail = {
  event: PayoutEvent
  settlements: {
    id: string
    market_date: string
    status: string
    total_captured_usd: number
    total_payouts_usd: number
    total_orders: number
  }[]
  affected_users: {
    user_id: string
    full_name: string
    email: string
    pending_usd: number
    available_usd: number
  }[]
}

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  captures_sent: { bg: '#eff6ff', text: '#1d4ed8', border: '#93c5fd' },
  funds_pending: { bg: '#fefce8', text: '#a16207', border: '#fde047' },
  funds_received: { bg: '#f0fdf4', text: '#166534', border: '#86efac' },
  cleared: { bg: '#f0fdf4', text: '#166534', border: '#86efac' },
  reconciliation_failed: { bg: '#fef2f2', text: '#991b1b', border: '#fca5a5' },
}

const PAYOUT_STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  paid: { bg: '#f0fdf4', text: '#166534', border: '#86efac' },
  failed: { bg: '#fef2f2', text: '#991b1b', border: '#fca5a5' },
}

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_COLORS[status] || { bg: colors.gray[100], text: colors.gray[700], border: colors.gray[300] }
  return (
    <Text
      fontSize={12}
      fontWeight="700"
      paddingHorizontal="$2"
      paddingVertical={2}
      borderRadius="$2"
      backgroundColor={style.bg}
      color={style.text}
      borderWidth={1}
      borderColor={style.border}
    >
      {status.replace(/_/g, ' ').toUpperCase()}
    </Text>
  )
}

function PayoutStatusBadge({ status }: { status: string }) {
  const style = PAYOUT_STATUS_COLORS[status] || { bg: colors.gray[100], text: colors.gray[700], border: colors.gray[300] }
  return (
    <Text
      fontSize={12}
      fontWeight="700"
      paddingHorizontal="$2"
      paddingVertical={2}
      borderRadius="$2"
      backgroundColor={style.bg}
      color={style.text}
      borderWidth={1}
      borderColor={style.border}
    >
      {status === 'paid' ? '✅ PAID' : '🚨 FAILED'}
    </Text>
  )
}

export default function SettlementsPage() {
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [failedCaptures, setFailedCaptures] = useState<FailedCapture[]>([])
  const [capturesLoading, setCapturesLoading] = useState(false)
  const [debts, setDebts] = useState<any[]>([])
  const [debtsLoading, setDebtsLoading] = useState(true)
  const [payoutEvents, setPayoutEvents] = useState<PayoutEvent[]>([])
  const [expandedPayoutId, setExpandedPayoutId] = useState<string | null>(null)
  const [payoutDetail, setPayoutDetail] = useState<PayoutEventDetail | null>(null)
  const [payoutDetailLoading, setPayoutDetailLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [settRes, debtsRes, payoutRes] = await Promise.all([
      adminApi.rpc('get_settlements_admin', { p_limit: 30 }),
      adminApi.select('buyer_debts', '*', { eq: { status: 'outstanding' } }, { order: { column: 'created_at', ascending: false } }),
      adminApi.rpc('get_payout_events_admin', { p_limit: 50, p_offset: 0 }),
    ])
    if (settRes.data) setSettlements(Array.isArray(settRes.data) ? settRes.data : [])
    if (debtsRes.data) setDebts(Array.isArray(debtsRes.data) ? debtsRes.data : [])
    if (payoutRes.data) setPayoutEvents(Array.isArray(payoutRes.data) ? payoutRes.data : [])
    setDebtsLoading(false)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const expandSettlement = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null)
      return
    }
    setExpandedId(id)
    setCapturesLoading(true)
    const { data } = await adminApi.rpc('get_failed_captures_admin', { p_settlement_id: id })
    setFailedCaptures(Array.isArray(data) ? data : [])
    setCapturesLoading(false)
  }

  const writeOffDebt = async (debtId: string) => {
    await adminApi.update('buyer_debts', { status: 'written_off', updated_at: new Date().toISOString() }, { eq: { id: debtId } })
    fetchData()
  }

  const expandPayoutEvent = async (id: string) => {
    if (expandedPayoutId === id) {
      setExpandedPayoutId(null)
      return
    }
    setExpandedPayoutId(id)
    setPayoutDetailLoading(true)
    const { data } = await adminApi.rpc('get_payout_event_details', { p_event_id: id })
    setPayoutDetail(data as PayoutEventDetail || null)
    setPayoutDetailLoading(false)
  }

  const fmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  if (loading) {
    return (
      <YStack flex={1} padding="$6" alignItems="center" justifyContent="center">
        <Spinner size="large" color={colors.green[600]} />
      </YStack>
    )
  }

  const failedSettlements = settlements.filter(s => s.status === 'reconciliation_failed' || s.captures_failed > 0)

  return (
      <YStack flex={1} padding="$6" gap="$5" maxWidth={1200}>
        {/* Header */}
        <XStack justifyContent="space-between" alignItems="center">
          <YStack>
            <Text fontSize="$8" fontWeight="bold" color={colors.green[900]}>Settlements & Stripe</Text>
            <Text color={colors.gray[600]}>Daily settlement status, capture failures, and buyer debts</Text>
          </YStack>
          <Button icon={RefreshCw} backgroundColor={colors.green[600]} onPress={fetchData}>
            <Text color="white">Refresh</Text>
          </Button>
        </XStack>

        {/* Alert Banner for Failed Settlements */}
        {failedSettlements.length > 0 && (
          <XStack backgroundColor="#fef2f2" borderWidth={1} borderColor="#fca5a5" borderRadius="$4" padding="$4" alignItems="center" gap="$3">
            <AlertTriangle size={24} color="#dc2626" />
            <YStack flex={1}>
              <Text fontWeight="bold" color="#991b1b">
                {failedSettlements.length} settlement{failedSettlements.length > 1 ? 's' : ''} need attention
              </Text>
              <Text fontSize={13} color="#b91c1c">
                {failedSettlements.filter(s => s.captures_failed > 0).length} with failed captures,{' '}
                {failedSettlements.filter(s => s.status === 'reconciliation_failed').length} reconciliation failures
              </Text>
            </YStack>
          </XStack>
        )}

        {/* Outstanding Debts Section */}
        {debts.length > 0 && (
          <YStack backgroundColor="white" borderRadius="$4" borderWidth={1} borderColor={colors.gray[200]} overflow="hidden">
            <XStack padding="$4" borderBottomWidth={1} borderColor={colors.gray[100]} alignItems="center" gap="$2">
              <AlertTriangle size={18} color="#ea580c" />
              <Text fontWeight="bold" fontSize="$5" color="#9a3412">
                Outstanding Buyer Debts ({debts.length})
              </Text>
            </XStack>

            <XStack paddingHorizontal="$4" paddingVertical="$2" borderBottomWidth={1} borderColor={colors.gray[100]} backgroundColor={colors.gray[50]}>
              <Text flex={1} fontSize={11} fontWeight="600" color={colors.gray[400]}>BUYER</Text>
              <Text width={100} fontSize={11} fontWeight="600" color={colors.gray[400]} textAlign="right">AMOUNT</Text>
              <Text width={120} fontSize={11} fontWeight="600" color={colors.gray[400]} textAlign="center">REASON</Text>
              <Text width={120} fontSize={11} fontWeight="600" color={colors.gray[400]} textAlign="center">DATE</Text>
              <Text width={100} fontSize={11} fontWeight="600" color={colors.gray[400]} textAlign="center">ACTION</Text>
            </XStack>

            {debts.map((debt: any) => (
              <XStack key={debt.id} paddingHorizontal="$4" paddingVertical="$3" alignItems="center" borderBottomWidth={1} borderColor={colors.gray[50]}>
                <Text flex={1} fontSize={13} color={colors.gray[800]}>{debt.buyer_id?.substring(0, 8)}...</Text>
                <Text width={100} fontSize={13} fontWeight="600" textAlign="right" color="#dc2626">{fmt(debt.amount_usd)}</Text>
                <Text width={120} fontSize={12} textAlign="center" color={colors.gray[600]}>{debt.reason?.replace(/_/g, ' ')}</Text>
                <Text width={120} fontSize={12} textAlign="center" color={colors.gray[500]}>
                  {new Date(debt.created_at).toLocaleDateString()}
                </Text>
                <XStack width={100} justifyContent="center">
                  <Button size="$2" backgroundColor="#f59e0b" onPress={() => writeOffDebt(debt.id)}>
                    <Text fontSize={11} color="white">Write Off</Text>
                  </Button>
                </XStack>
              </XStack>
            ))}
          </YStack>
        )}

        {/* Settlements Table */}
        <YStack backgroundColor="white" borderRadius="$4" borderWidth={1} borderColor={colors.gray[200]} overflow="hidden">
          <XStack padding="$4" borderBottomWidth={1} borderColor={colors.gray[100]}>
            <Text fontWeight="bold" fontSize="$5" color={colors.gray[900]}>Settlements</Text>
          </XStack>

          {/* Header Row */}
          <XStack paddingHorizontal="$4" paddingVertical="$2" borderBottomWidth={1} borderColor={colors.gray[100]} backgroundColor={colors.gray[50]}>
            <Text width={100} fontSize={11} fontWeight="600" color={colors.gray[400]}>DATE</Text>
            <Text width={140} fontSize={11} fontWeight="600" color={colors.gray[400]}>STATUS</Text>
            <Text width={60} fontSize={11} fontWeight="600" color={colors.gray[400]} textAlign="center">ORDERS</Text>
            <Text width={90} fontSize={11} fontWeight="600" color={colors.gray[400]} textAlign="right">CAPTURED</Text>
            <Text width={90} fontSize={11} fontWeight="600" color={colors.gray[400]} textAlign="right">PAYOUTS</Text>
            <Text width={80} fontSize={11} fontWeight="600" color={colors.gray[400]} textAlign="right">FEES</Text>
            <Text width={80} fontSize={11} fontWeight="600" color={colors.gray[400]} textAlign="center">CAPTURES</Text>
            <Text width={90} fontSize={11} fontWeight="600" color={colors.gray[400]} textAlign="right">STRIPE</Text>
            <Text width={40} fontSize={11} fontWeight="600" color={colors.gray[400]}></Text>
          </XStack>

          {settlements.map((s) => {
            const hasIssues = s.captures_failed > 0 || s.status === 'reconciliation_failed'
            const isExpanded = expandedId === s.settlement_id
            return (
              <YStack key={s.settlement_id}>
                <XStack
                  paddingHorizontal="$4"
                  paddingVertical="$3"
                  alignItems="center"
                  borderBottomWidth={1}
                  borderColor={colors.gray[50]}
                  backgroundColor={hasIssues ? '#fef2f2' : undefined}
                  hoverStyle={{ backgroundColor: hasIssues ? '#fee2e2' : colors.gray[50] }}
                  cursor="pointer"
                  onPress={() => hasIssues ? expandSettlement(s.settlement_id) : null}
                >
                  <Text width={100} fontSize={13} color={colors.gray[800]}>{s.market_date}</Text>
                  <XStack width={140}><StatusBadge status={s.status} /></XStack>
                  <Text width={60} fontSize={13} textAlign="center" color={colors.gray[700]}>{s.total_orders}</Text>
                  <Text width={90} fontSize={13} textAlign="right" color={colors.gray[700]}>{fmt(s.total_captured_usd)}</Text>
                  <Text width={90} fontSize={13} textAlign="right" color={colors.green[700]}>{fmt(s.total_payouts_usd)}</Text>
                  <Text width={80} fontSize={13} textAlign="right" color={colors.gray[500]}>{fmt(s.total_fees_usd)}</Text>
                  <XStack width={80} justifyContent="center" gap="$1">
                    <Text fontSize={12} color="#16a34a" fontWeight="600">{s.captures_succeeded}✓</Text>
                    {s.captures_failed > 0 && <Text fontSize={12} color="#dc2626" fontWeight="600">{s.captures_failed}✗</Text>}
                    {s.captures_pending > 0 && <Text fontSize={12} color="#a16207" fontWeight="600">{s.captures_pending}⏳</Text>}
                  </XStack>
                  <Text width={90} fontSize={12} textAlign="right" color={colors.gray[500]}>
                    {s.stripe_payout_id ? `${fmt(s.stripe_payout_amount_usd || 0)}` : '—'}
                  </Text>
                  <XStack width={40} justifyContent="center">
                    {hasIssues && (isExpanded ? <ChevronUp size={16} color={colors.gray[400]} /> : <ChevronDown size={16} color={colors.gray[400]} />)}
                  </XStack>
                </XStack>

                {/* Expanded: Failed Captures Detail */}
                {isExpanded && (
                  <YStack backgroundColor="#fef2f2" padding="$4" borderBottomWidth={1} borderColor="#fca5a5">
                    <Text fontWeight="bold" fontSize={14} color="#991b1b" marginBottom="$3">
                      Failed/Pending Captures for {s.market_date}
                    </Text>
                    {capturesLoading ? (
                      <Spinner size="small" color="#dc2626" />
                    ) : failedCaptures.length === 0 ? (
                      <Text fontSize={13} color="#b91c1c">No failed capture details available</Text>
                    ) : (
                      <YStack gap="$2">
                        {failedCaptures.map((fc) => (
                          <XStack key={fc.capture_id} backgroundColor="white" padding="$3" borderRadius="$3" alignItems="center" gap="$3" borderWidth={1} borderColor="#fca5a5">
                            <YStack flex={1}>
                              <Text fontSize={13} fontWeight="600" color={colors.gray[900]}>
                                {fc.buyer_name || 'Unknown'} ({fc.buyer_email || fc.buyer_id?.substring(0, 8)})
                              </Text>
                              <Text fontSize={12} color={colors.gray[500]}>PI: {fc.stripe_payment_intent_id}</Text>
                              {fc.error_message && (
                                <Text fontSize={11} color="#dc2626" marginTop="$1">Error: {fc.error_message}</Text>
                              )}
                            </YStack>
                            <YStack alignItems="flex-end">
                              <Text fontSize={14} fontWeight="bold" color="#dc2626">{fmt(fc.hold_amount_usd)}</Text>
                              <Text fontSize={11} color={colors.gray[500]}>Status: {fc.capture_status}</Text>
                              {fc.debt_status && (
                                <Text fontSize={11} color={fc.debt_status === 'recovered' ? '#16a34a' : '#ea580c'}>
                                  Debt: {fc.debt_status} {fc.debt_amount_usd ? `(${fmt(fc.debt_amount_usd)})` : ''}
                                </Text>
                              )}
                            </YStack>
                          </XStack>
                        ))}
                      </YStack>
                    )}
                  </YStack>
                )}
              </YStack>
            )
          })}

          {settlements.length === 0 && (
            <YStack padding="$6" alignItems="center">
              <Text color={colors.gray[400]}>No settlements yet</Text>
            </YStack>
          )}
        </YStack>

        {/* ════════════════════════════════════════════════ */}
        {/* Stripe Payout Events Section                    */}
        {/* ════════════════════════════════════════════════ */}
        <YStack backgroundColor="white" borderRadius="$4" borderWidth={1} borderColor={colors.gray[200]} overflow="hidden">
          <XStack padding="$4" borderBottomWidth={1} borderColor={colors.gray[100]} justifyContent="space-between" alignItems="center">
            <YStack>
              <Text fontWeight="bold" fontSize="$5" color={colors.gray[900]}>Stripe Payout Events</Text>
              <Text fontSize={12} color={colors.gray[500]}>Tracks every payout.paid and payout.failed from Stripe</Text>
            </YStack>
            <XStack gap="$2">
              <Text
                fontSize={12} fontWeight="600" paddingHorizontal="$2" paddingVertical={2}
                borderRadius="$2" backgroundColor="#f0fdf4" color="#166534" borderWidth={1} borderColor="#86efac"
              >
                {payoutEvents.filter(e => e.event_type === 'paid').length} Paid
              </Text>
              <Text
                fontSize={12} fontWeight="600" paddingHorizontal="$2" paddingVertical={2}
                borderRadius="$2" backgroundColor={payoutEvents.some(e => e.event_type === 'failed') ? '#fef2f2' : colors.gray[50]}
                color={payoutEvents.some(e => e.event_type === 'failed') ? '#991b1b' : colors.gray[500]}
                borderWidth={1} borderColor={payoutEvents.some(e => e.event_type === 'failed') ? '#fca5a5' : colors.gray[200]}
              >
                {payoutEvents.filter(e => e.event_type === 'failed').length} Failed
              </Text>
            </XStack>
          </XStack>

          {/* Failed Payout Alert */}
          {payoutEvents.some(e => e.event_type === 'failed') && (
            <XStack backgroundColor="#fef2f2" padding="$4" gap="$3" alignItems="center" borderBottomWidth={1} borderColor="#fca5a5">
              <AlertTriangle size={20} color="#dc2626" />
              <YStack flex={1}>
                <Text fontWeight="bold" fontSize={14} color="#991b1b">
                  {payoutEvents.filter(e => e.event_type === 'failed').length} payout failure(s) detected
                </Text>
                <Text fontSize={12} color="#b91c1c">
                  Seller funds are stuck in pending status. Fix bank routing in Stripe Dashboard, then trigger a new payout.
                </Text>
              </YStack>
              <Button
                size="$3"
                backgroundColor="#dc2626"
                onPress={() => {
                  if (typeof window !== 'undefined') window.open('https://dashboard.stripe.com/payouts', '_blank')
                }}
                icon={ExternalLink}
              >
                <Text color="white" fontSize={12} fontWeight="600">Stripe Dashboard</Text>
              </Button>
            </XStack>
          )}

          {/* Payout Events Header */}
          <XStack paddingHorizontal="$4" paddingVertical="$2" borderBottomWidth={1} borderColor={colors.gray[100]} backgroundColor={colors.gray[50]}>
            <Text width={100} fontSize={11} fontWeight="600" color={colors.gray[400]}>DATE</Text>
            <Text width={120} fontSize={11} fontWeight="600" color={colors.gray[400]}>STATUS</Text>
            <Text width={100} fontSize={11} fontWeight="600" color={colors.gray[400]} textAlign="right">AMOUNT</Text>
            <Text flex={1} fontSize={11} fontWeight="600" color={colors.gray[400]} textAlign="center">PAYOUT ID</Text>
            <Text width={90} fontSize={11} fontWeight="600" color={colors.gray[400]} textAlign="center">SETTLEMENTS</Text>
            <Text width={80} fontSize={11} fontWeight="600" color={colors.gray[400]} textAlign="center">USERS</Text>
            <Text width={40} fontSize={11} fontWeight="600" color={colors.gray[400]}></Text>
          </XStack>

          {payoutEvents.map((pe) => {
            const isFailed = pe.event_type === 'failed'
            const isExpanded = expandedPayoutId === pe.id
            return (
              <YStack key={pe.id}>
                <XStack
                  paddingHorizontal="$4"
                  paddingVertical="$3"
                  alignItems="center"
                  borderBottomWidth={1}
                  borderColor={colors.gray[50]}
                  backgroundColor={isFailed ? '#fef2f2' : undefined}
                  hoverStyle={{ backgroundColor: isFailed ? '#fee2e2' : colors.gray[50] }}
                  cursor="pointer"
                  onPress={() => expandPayoutEvent(pe.id)}
                >
                  <Text width={100} fontSize={13} color={colors.gray[800]}>
                    {new Date(pe.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                  </Text>
                  <XStack width={120}><PayoutStatusBadge status={pe.event_type} /></XStack>
                  <Text width={100} fontSize={13} textAlign="right" fontWeight="600" color={isFailed ? '#dc2626' : colors.green[700]}>
                    {fmt(pe.amount_usd)}
                  </Text>
                  <Text flex={1} fontSize={11} textAlign="center" color={colors.gray[500]} numberOfLines={1}>
                    {pe.stripe_payout_id}
                  </Text>
                  <Text width={90} fontSize={13} textAlign="center" color={colors.gray[700]}>
                    {pe.settlement_count}
                  </Text>
                  <Text width={80} fontSize={13} textAlign="center" color={colors.gray[700]}>
                    {pe.affected_user_count}
                  </Text>
                  <XStack width={40} justifyContent="center">
                    {isExpanded ? <ChevronUp size={16} color={colors.gray[400]} /> : <ChevronDown size={16} color={colors.gray[400]} />}
                  </XStack>
                </XStack>

                {/* Expanded Detail */}
                {isExpanded && (
                  <YStack backgroundColor={isFailed ? '#fef2f2' : '#f0fdf4'} padding="$4" borderBottomWidth={1} borderColor={isFailed ? '#fca5a5' : '#86efac'} gap="$3">
                    {payoutDetailLoading ? (
                      <Spinner size="small" color={isFailed ? '#dc2626' : colors.green[600]} />
                    ) : payoutDetail ? (
                      <>
                        {/* Failure Info */}
                        {isFailed && pe.failure_message && (
                          <YStack backgroundColor="white" padding="$3" borderRadius="$3" borderWidth={1} borderColor="#fca5a5">
                            <Text fontSize={12} fontWeight="600" color="#991b1b" marginBottom="$1">Failure Details</Text>
                            <Text fontSize={13} color="#b91c1c">Code: {pe.failure_code || 'unknown'}</Text>
                            <Text fontSize={13} color="#b91c1c">Reason: {pe.failure_message}</Text>
                            <Text fontSize={12} color="#dc2626" marginTop="$2" fontWeight="600">
                              ⚠️ Stripe does NOT auto-retry. Fix the issue and trigger a new payout from Stripe Dashboard.
                            </Text>
                          </YStack>
                        )}

                        {/* Affected Settlements */}
                        {payoutDetail.settlements && payoutDetail.settlements.length > 0 && (
                          <YStack>
                            <Text fontSize={13} fontWeight="bold" color={colors.gray[800]} marginBottom="$2">
                              {isFailed ? 'Affected' : 'Matched'} Settlements ({payoutDetail.settlements.length})
                            </Text>
                            {payoutDetail.settlements.map((s) => (
                              <XStack key={s.id} backgroundColor="white" padding="$3" borderRadius="$3" marginBottom="$1" alignItems="center" gap="$3" borderWidth={1} borderColor={colors.gray[200]}>
                                <YStack flex={1}>
                                  <Text fontSize={13} fontWeight="600" color={colors.gray[900]}>Market Date: {s.market_date}</Text>
                                  <Text fontSize={12} color={colors.gray[500]}>{s.total_orders} orders • Captured: {fmt(s.total_captured_usd)} • Payouts: {fmt(s.total_payouts_usd)}</Text>
                                </YStack>
                                <StatusBadge status={s.status} />
                              </XStack>
                            ))}
                          </YStack>
                        )}

                        {/* Affected Users */}
                        {payoutDetail.affected_users && payoutDetail.affected_users.length > 0 && (
                          <YStack>
                            <Text fontSize={13} fontWeight="bold" color={colors.gray[800]} marginBottom="$2">
                              Affected Users ({payoutDetail.affected_users.length})
                            </Text>
                            {payoutDetail.affected_users.map((u) => (
                              <XStack key={u.user_id} backgroundColor="white" padding="$3" borderRadius="$3" marginBottom="$1" alignItems="center" gap="$3" borderWidth={1} borderColor={colors.gray[200]}>
                                <YStack flex={1}>
                                  <Text fontSize={13} fontWeight="600" color={colors.gray[900]}>{u.full_name || 'Unknown'}</Text>
                                  <Text fontSize={12} color={colors.gray[500]}>{u.email}</Text>
                                </YStack>
                                <YStack alignItems="flex-end">
                                  <Text fontSize={12} color="#a16207">Pending: {fmt(u.pending_usd)}</Text>
                                  <Text fontSize={12} color="#166534">Available: {fmt(u.available_usd)}</Text>
                                </YStack>
                              </XStack>
                            ))}
                          </YStack>
                        )}
                      </>
                    ) : (
                      <Text fontSize={13} color={colors.gray[500]}>No details available</Text>
                    )}
                  </YStack>
                )}
              </YStack>
            )
          })}

          {payoutEvents.length === 0 && (
            <YStack padding="$6" alignItems="center">
              <CheckCircle size={24} color={colors.gray[300]} />
              <Text color={colors.gray[400]} marginTop="$2">No payout events recorded yet</Text>
              <Text fontSize={12} color={colors.gray[300]} marginTop="$1">Events appear when Stripe sends payout.paid or payout.failed webhooks</Text>
            </YStack>
          )}
        </YStack>
      </YStack>
  )
}
