'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { YStack, XStack, Text, Button, Spinner, TextArea } from 'tamagui'
import { 
  ArrowLeft, AlertTriangle, CheckCircle, Clock, Camera, MessageCircle, 
  FileText, DollarSign, Truck, ShoppingBag, Send, Save, XCircle 
} from '@tamagui/lucide-icons'
import { adminApi } from '../../../../lib/adminApi'
import { colors } from '@casagrown/app/design-tokens'
import { useParams } from 'next/navigation'

interface EvidenceData {
  dispute: {
    id: string
    stripe_dispute_id: string
    amount_usd: number
    fee_usd: number
    reason: string
    status: string
    evidence_due_by: string | null
    evidence_submitted_at: string | null
    market_date: string | null
    admin_notes: string | null
  }
  buyer: {
    name: string | null
    email: string | null
    profile_created: string | null
  }
  opening_balance: {
    amount_usd: number
    source: string
  }
  purchases: Array<{
    order_id: string
    order_number: string | null
    seller_name: string | null
    items: Array<{ name: string; qty: number; price: number; total: number }>
    total: number
    status: string
    fulfillment_method: string | null
    delivery_proof_url: string | null
    delivery_proof_location: { latitude: number; longitude: number } | null
    delivery_proof_timestamp: string | null
  }>
  sales: Array<{
    order_id: string
    order_number: string | null
    buyer_name: string | null
    items: Array<{ name: string; qty: number; price: number; total: number }>
    total: number
    status: string
    fulfillment_method: string | null
    delivery_proof_url: string | null
    delivery_proof_timestamp: string | null
  }>
  net_calculation: {
    opening_balance: number
    purchases_total: number
    sales_total: number
    platform_fee: number
    refunds: number
    net_charged: number
  }
  order_status_logs: Array<{
    order_id: string
    old_status: string | null
    new_status: string
    changed_by_name: string
    changed_at: string
  }>
  chat_logs: Array<{
    from_name: string
    to_name: string
    text: string
    sent_at: string
  }>
  fulfillment_photos: Array<{
    order_id: string
    fulfillment_method: string
    proof_url: string
    proof_location: { latitude: number; longitude: number } | null
    proof_timestamp: string | null
  }>
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDateTime(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
}

function formatCurrency(amount: number) {
  return `$${amount.toFixed(2)}`
}

function fulfillmentIcon(method: string | null) {
  return method === 'delivery' ? '🚗' : '📍'
}

function fulfillmentLabel(method: string | null) {
  return method === 'delivery' ? 'DELIVERY' : 'PICKUP'
}

export default function DisputeEvidencePage() {
  const params = useParams()
  const disputeId = params?.id as string
  const [evidence, setEvidence] = useState<EvidenceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [submitResult, setSubmitResult] = useState<string | null>(null)

  const fetchEvidence = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await adminApi.rpc('get_dispute_evidence', { p_dispute_id: disputeId })
      setEvidence(data)
    } catch (err) {
      console.error('Failed to fetch evidence:', err)
    } finally {
      setLoading(false)
    }
  }, [disputeId])

  useEffect(() => { fetchEvidence() }, [fetchEvidence])

  const handleSubmit = async () => {
    if (!evidence) return
    setSubmitting(true)
    setSubmitResult(null)
    try {
      const { data: result, error } = await adminApi.invokeFunction('submit-dispute-evidence', {
        dispute_id: disputeId,
        evidence: evidence,
      })
      if (error) throw new Error(error)
      setSubmitResult('✅ Evidence submitted to Stripe successfully')
      fetchEvidence()
    } catch (err: any) {
      setSubmitResult(`❌ Submission failed: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  const handleSaveDraft = async () => {
    if (!evidence) return
    setSaving(true)
    try {
      await adminApi.rpc('save_dispute_evidence_draft', {
        p_dispute_id: disputeId,
        p_evidence: evidence,
      })
      setSubmitResult('💾 Draft saved')
      setTimeout(() => setSubmitResult(null), 3000)
    } catch (err: any) {
      setSubmitResult(`❌ Save failed: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center" padding="$6">
        <Spinner size="large" color={colors.green[600]} />
        <Text color="#6B7280" marginTop="$2">Loading evidence...</Text>
      </YStack>
    )
  }

  if (!evidence || !evidence.dispute) {
    return (
      <YStack flex={1} padding="$6" alignItems="center" gap="$3">
        <AlertTriangle size={48} color="#DC2626" />
        <Text fontSize={18} color="#DC2626">Dispute not found</Text>
        <Button onPress={() => window.location.href = '/disputes'} backgroundColor={colors.green[600]}>
          <Text color="white">Back to Disputes</Text>
        </Button>
      </YStack>
    )
  }

  const d = evidence.dispute
  const isUrgent = d.status === 'needs_response' || d.status === 'warning_needs_response'
  const daysLeft = d.evidence_due_by
    ? Math.ceil((new Date(d.evidence_due_by).getTime() - Date.now()) / 86400000)
    : null
  const isResolved = d.status === 'won' || d.status === 'lost'

  // Group status logs by order
  const statusLogsByOrder = (evidence.order_status_logs || []).reduce<Record<string, typeof evidence.order_status_logs>>((acc, log) => {
    if (!acc[log.order_id]) acc[log.order_id] = []
    acc[log.order_id]!.push(log)
    return acc
  }, {})

  return (
      <YStack flex={1} padding="$6" gap="$5" maxWidth={1200}>
        {/* Breadcrumb + Back */}
        <XStack alignItems="center" gap="$2">
          <Button
            size="$2"
            chromeless
            icon={ArrowLeft}
            onPress={() => window.location.href = '/disputes'}
          >
            Disputes
          </Button>
          <Text color="#9CA3AF">/</Text>
          <Text color="#6B7280" fontSize={13}>{d.stripe_dispute_id}</Text>
        </XStack>

        {/* Header */}
        <XStack justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$2">
          <XStack alignItems="center" gap="$3" flexWrap="wrap">
            <Text fontSize={24} fontWeight="800" color={colors.green[800]}>
              Dispute #{d.stripe_dispute_id}
            </Text>
            <Text
              fontSize={12}
              fontWeight="700"
              backgroundColor={isUrgent ? '#FEE2E2' : isResolved ? (d.status === 'won' ? '#D1FAE5' : '#F3F4F6') : '#FEF3C7'}
              color={isUrgent ? '#DC2626' : d.status === 'won' ? '#059669' : d.status === 'lost' ? '#DC2626' : '#D97706'}
              paddingHorizontal="$2"
              paddingVertical="$1"
              borderRadius={4}
            >
              {d.status.toUpperCase().replace(/_/g, ' ')}
            </Text>
          </XStack>
          {daysLeft !== null && isUrgent && (
            <XStack alignItems="center" gap="$1" backgroundColor="#FEE2E2" padding="$2" borderRadius={8}>
              <Clock size={16} color="#DC2626" />
              <Text fontSize={14} color="#DC2626" fontWeight="700">
                {daysLeft} day{daysLeft !== 1 ? 's' : ''} remaining
              </Text>
            </XStack>
          )}
        </XStack>

        {/* Dispute Summary */}
        <YStack backgroundColor="white" borderWidth={1} borderColor="#E5E7EB" borderRadius={12} padding="$4">
          <Text fontSize={16} fontWeight="700" marginBottom="$3">Dispute Summary</Text>
          <XStack flexWrap="wrap" gap="$4">
            <YStack flex={1} minWidth={200} gap="$2">
              <Text fontSize={13} color="#6B7280">Amount</Text>
              <Text fontSize={28} fontWeight="800" color="#DC2626">{formatCurrency(d.amount_usd)}</Text>
              <Text fontSize={13} color="#6B7280">Reason: <Text fontWeight="600">{d.reason?.replace(/_/g, ' ')}</Text></Text>
              <Text fontSize={13} color="#6B7280">Filed: {formatDate(d.evidence_due_by ? new Date(new Date(d.evidence_due_by).getTime() - 7 * 86400000).toISOString() : null)}</Text>
            </YStack>
            <YStack flex={1} minWidth={200} gap="$2">
              <XStack gap="$2"><Text fontSize={13} color="#6B7280" width={120}>Deadline:</Text><Text fontSize={13} fontWeight="600" color={isUrgent ? '#DC2626' : '#374151'}>{formatDate(d.evidence_due_by)}{daysLeft !== null ? ` (${daysLeft}d)` : ''}</Text></XStack>
              <XStack gap="$2"><Text fontSize={13} color="#6B7280" width={120}>Stripe Charge:</Text><Text fontSize={13} color="#374151">{d.stripe_dispute_id?.slice(0, 16)}...</Text></XStack>
              <XStack gap="$2"><Text fontSize={13} color="#6B7280" width={120}>Market Date:</Text><Text fontSize={13} color="#374151">{formatDate(d.market_date)}</Text></XStack>
              <XStack gap="$2"><Text fontSize={13} color="#6B7280" width={120}>Buyer:</Text><Text fontSize={13} color="#374151">{evidence.buyer?.name || 'Unknown'} ({evidence.buyer?.email || ''})</Text></XStack>
            </YStack>
          </XStack>
        </YStack>

        {/* Opening Balance */}
        {evidence.opening_balance && evidence.opening_balance.amount_usd !== 0 && (
          <YStack backgroundColor="white" borderWidth={1} borderColor="#3B82F6" borderLeftWidth={4} borderRadius={12} padding="$4">
            <Text fontSize={14} fontWeight="700" marginBottom="$1">Opening Balance</Text>
            <Text fontSize={13} color="#374151">
              Prior balance from {d.market_date ? `previous settlement` : 'prior days'}: <Text fontWeight="700" color="#3B82F6">{formatCurrency(Math.abs(evidence.opening_balance.amount_usd))}</Text> {evidence.opening_balance.amount_usd < 0 ? '(credit from sales)' : '(debit)'}
            </Text>
            <Text fontSize={12} color="#6B7280">This balance offset the buyer's charge</Text>
          </YStack>
        )}

        {/* Purchases */}
        <YStack backgroundColor="white" borderRadius={12} borderWidth={1} borderColor="#E5E7EB" overflow="hidden">
          <XStack backgroundColor="#059669" padding="$3">
            <ShoppingBag size={16} color="white" />
            <Text fontSize={14} fontWeight="700" color="white" marginLeft="$2">
              Purchases ({evidence.purchases?.length || 0} orders)
            </Text>
          </XStack>
          {(evidence.purchases || []).length === 0 ? (
            <Text padding="$4" color="#6B7280" textAlign="center">No purchases for this market date</Text>
          ) : (
            <>
              <XStack backgroundColor="#F9FAFB" paddingHorizontal="$3" paddingVertical="$2" borderBottomWidth={1} borderBottomColor="#E5E7EB">
                <Text flex={1} fontSize={11} fontWeight="700" color="#6B7280">ORDER</Text>
                <Text flex={1.5} fontSize={11} fontWeight="700" color="#6B7280">SELLER</Text>
                <Text flex={2} fontSize={11} fontWeight="700" color="#6B7280">ITEMS</Text>
                <Text flex={0.8} fontSize={11} fontWeight="700" color="#6B7280">AMOUNT</Text>
                <Text flex={1} fontSize={11} fontWeight="700" color="#6B7280">FULFILLMENT</Text>
                <Text flex={1} fontSize={11} fontWeight="700" color="#6B7280">STATUS</Text>
                <Text flex={0.8} fontSize={11} fontWeight="700" color="#6B7280">PROOF</Text>
              </XStack>
              {evidence.purchases.map((p, i) => (
                <XStack key={p.order_id} paddingHorizontal="$3" paddingVertical="$2" borderBottomWidth={1} borderBottomColor="#F3F4F6" backgroundColor={i % 2 === 0 ? 'white' : '#FAFAFA'} alignItems="center">
                  <Text flex={1} fontSize={12} color="#374151">#{p.order_number || p.order_id.slice(0, 8)}</Text>
                  <Text flex={1.5} fontSize={12} color="#374151">{p.seller_name || 'Unknown'}</Text>
                  <Text flex={2} fontSize={12} color="#374151">{p.items?.map(it => `${it.name}`).join(', ') || '—'}</Text>
                  <Text flex={0.8} fontSize={12} color="#374151" fontWeight="600">{formatCurrency(p.total)}</Text>
                  <Text flex={1} fontSize={11} color="#374151">{fulfillmentIcon(p.fulfillment_method)} {fulfillmentLabel(p.fulfillment_method)}</Text>
                  <XStack flex={1}>
                    <Text fontSize={11} fontWeight="600" backgroundColor="#D1FAE5" color="#059669" paddingHorizontal="$1" borderRadius={3}>
                      {(p.status || '').toUpperCase()} ✓
                    </Text>
                  </XStack>
                  <XStack flex={0.8}>
                    {p.delivery_proof_url ? (
                      <Text fontSize={11} color="#059669" fontWeight="600">📸 Photo ✓</Text>
                    ) : (
                      <Text fontSize={11} color="#9CA3AF">No photo</Text>
                    )}
                  </XStack>
                </XStack>
              ))}
              <XStack padding="$3" justifyContent="flex-end">
                <Text fontSize={13} fontWeight="700" color="#374151">Purchases total: {formatCurrency(evidence.net_calculation?.purchases_total || 0)}</Text>
              </XStack>
            </>
          )}
        </YStack>

        {/* Sales */}
        {(evidence.sales || []).length > 0 && (
          <YStack backgroundColor="white" borderRadius={12} borderWidth={1} borderColor="#E5E7EB" overflow="hidden">
            <XStack backgroundColor="#3B82F6" padding="$3">
              <DollarSign size={16} color="white" />
              <Text fontSize={14} fontWeight="700" color="white" marginLeft="$2">
                Sales ({evidence.sales.length} orders) — offsets charge
              </Text>
            </XStack>
            {evidence.sales.map((s, i) => (
              <XStack key={s.order_id} paddingHorizontal="$3" paddingVertical="$2" borderBottomWidth={1} borderBottomColor="#F3F4F6" alignItems="center">
                <Text flex={1} fontSize={12} color="#374151">#{s.order_number || s.order_id.slice(0, 8)}</Text>
                <Text flex={1.5} fontSize={12} color="#374151">To: {s.buyer_name || 'Unknown'}</Text>
                <Text flex={2} fontSize={12} color="#374151">{s.items?.map(it => it.name).join(', ') || '—'}</Text>
                <Text flex={0.8} fontSize={12} color="#374151" fontWeight="600">{formatCurrency(s.total)}</Text>
                <Text flex={1} fontSize={11} color="#374151">{fulfillmentIcon(s.fulfillment_method)} {fulfillmentLabel(s.fulfillment_method)}</Text>
                <XStack flex={1}>
                  <Text fontSize={11} fontWeight="600" backgroundColor="#D1FAE5" color="#059669" paddingHorizontal="$1" borderRadius={3}>
                    {(s.status || '').toUpperCase()} ✓
                  </Text>
                </XStack>
                <XStack flex={0.8}>
                  {s.delivery_proof_url ? (
                    <Text fontSize={11} color="#059669" fontWeight="600">📸 Photo ✓</Text>
                  ) : (
                    <Text fontSize={11} color="#9CA3AF">No photo</Text>
                  )}
                </XStack>
              </XStack>
            ))}
            <XStack padding="$3" justifyContent="flex-end">
              <Text fontSize={13} fontWeight="700" color="#374151">Sales total: {formatCurrency(evidence.net_calculation?.sales_total || 0)}</Text>
            </XStack>
          </YStack>
        )}

        {/* Net Calculation */}
        <YStack backgroundColor="#F9FAFB" borderRadius={12} borderWidth={2} borderColor="#374151" padding="$4">
          <Text fontSize={16} fontWeight="700" marginBottom="$3">Net Charge Calculation</Text>
          <YStack gap="$2">
            <XStack justifyContent="space-between"><Text fontSize={13} color="#374151">Opening balance (prior credit):</Text><Text fontSize={13} fontWeight="600">{formatCurrency(evidence.net_calculation?.opening_balance || 0)}</Text></XStack>
            <XStack justifyContent="space-between"><Text fontSize={13} color="#374151">+ Purchases ({evidence.purchases?.length || 0} orders):</Text><Text fontSize={13} fontWeight="600">+{formatCurrency(evidence.net_calculation?.purchases_total || 0)}</Text></XStack>
            <XStack justifyContent="space-between"><Text fontSize={13} color="#374151">- Sales ({evidence.sales?.length || 0} orders):</Text><Text fontSize={13} fontWeight="600">-{formatCurrency(evidence.net_calculation?.sales_total || 0)}</Text></XStack>
            <XStack justifyContent="space-between"><Text fontSize={13} color="#374151">+ Platform fee (5%):</Text><Text fontSize={13} fontWeight="600">+{formatCurrency(evidence.net_calculation?.platform_fee || 0)}</Text></XStack>
            <XStack justifyContent="space-between"><Text fontSize={13} color="#374151">- Refunds:</Text><Text fontSize={13} fontWeight="600">-{formatCurrency(evidence.net_calculation?.refunds || 0)}</Text></XStack>
            <YStack height={1} backgroundColor="#374151" marginVertical="$2" />
            <XStack justifyContent="space-between">
              <Text fontSize={15} fontWeight="800" color="#374151">NET CHARGED TO CARD:</Text>
              <Text fontSize={15} fontWeight="800" color="#374151">= {formatCurrency(evidence.net_calculation?.net_charged || 0)}</Text>
            </XStack>
          </YStack>
          {Math.abs(d.amount_usd - (evidence.net_calculation?.net_charged || 0)) > 0.01 && (
            <XStack backgroundColor="#FEF3C7" borderRadius={8} padding="$2" marginTop="$3" alignItems="center" gap="$1">
              <AlertTriangle size={14} color="#D97706" />
              <Text fontSize={12} color="#D97706">
                Disputed amount ({formatCurrency(d.amount_usd)}) ≠ Net charge ({formatCurrency(evidence.net_calculation?.net_charged || 0)}) — buyer may be confused about settlement netting
              </Text>
            </XStack>
          )}
        </YStack>

        {/* Order Fulfillment Timeline */}
        <YStack backgroundColor="white" borderRadius={12} borderWidth={1} borderColor="#E5E7EB" borderLeftWidth={4} borderLeftColor="#7C3AED" padding="$4">
          <XStack alignItems="center" gap="$2" marginBottom="$3">
            <Truck size={18} color="#7C3AED" />
            <Text fontSize={16} fontWeight="700">Order Fulfillment Timeline</Text>
          </XStack>
          {Object.entries(statusLogsByOrder).length === 0 ? (
            <Text color="#6B7280" fontSize={13}>No status logs yet (order_status_log trigger will capture future transitions)</Text>
          ) : (
            Object.entries(statusLogsByOrder).map(([orderId, logs]) => {
              const order = [...(evidence.purchases || []), ...(evidence.sales || [])].find(o => o.order_id === orderId)
              const orderLabel = order ? `${order.items?.[0]?.name || 'Order'} — ${fulfillmentLabel(order?.fulfillment_method)}` : orderId.slice(0, 8)
              return (
                <YStack key={orderId} marginBottom="$3">
                  <Text fontSize={13} fontWeight="700" color="#374151" marginBottom="$1">
                    ORDER #{order?.order_number || orderId.slice(0, 8)} ({orderLabel})
                  </Text>
                  <YStack paddingLeft="$3" borderLeftWidth={2} borderLeftColor="#D1D5DB" gap="$1">
                    {logs.map((log, i) => {
                      const isHandoff = log.new_status === 'picked_up' || log.new_status === 'delivered'
                      return (
                        <XStack key={i} alignItems="center" gap="$2">
                          <YStack width={8} height={8} borderRadius={4} backgroundColor={isHandoff ? '#059669' : '#9CA3AF'} />
                          <Text fontSize={12} color={isHandoff ? '#059669' : '#374151'} fontWeight={isHandoff ? '700' : '400'}>
                            {log.new_status.replace(/_/g, ' ')}: {formatDateTime(log.changed_at)} — by {log.changed_by_name}
                            {isHandoff && ' ✅ CONFIRMED'}
                          </Text>
                        </XStack>
                      )
                    })}
                  </YStack>
                </YStack>
              )
            })
          )}
        </YStack>

        {/* Fulfillment Proof Photos */}
        {(evidence.fulfillment_photos || []).length > 0 && (
          <YStack backgroundColor="white" borderRadius={12} borderWidth={1} borderColor="#E5E7EB" padding="$4">
            <XStack alignItems="center" gap="$2" marginBottom="$3">
              <Camera size={18} color="#059669" />
              <Text fontSize={16} fontWeight="700">Fulfillment Proof Photos</Text>
            </XStack>
            <XStack gap="$3" flexWrap="wrap">
              {evidence.fulfillment_photos.map((photo, i) => {
                const order = [...(evidence.purchases || []), ...(evidence.sales || [])].find(o => o.order_id === photo.order_id)
                return (
                  <YStack key={i} width={200} borderWidth={1} borderColor="#E5E7EB" borderRadius={8} overflow="hidden">
                    {photo.proof_url && (
                      <img
                        src={photo.proof_url}
                        alt={`Proof for order ${photo.order_id.slice(0, 8)}`}
                        style={{ width: '100%', height: 150, objectFit: 'cover' }}
                      />
                    )}
                    <YStack padding="$2" gap="$1">
                      <Text fontSize={11} fontWeight="600" color="#374151">
                        📸 #{order?.order_number || photo.order_id.slice(0, 8)} — {fulfillmentLabel(photo.fulfillment_method)} Proof
                      </Text>
                      <Text fontSize={10} color="#6B7280">{formatDateTime(photo.proof_timestamp)}</Text>
                      {photo.proof_location && (
                        <Text fontSize={10} color="#6B7280">GPS: {photo.proof_location.latitude.toFixed(4)}, {photo.proof_location.longitude.toFixed(4)}</Text>
                      )}
                    </YStack>
                  </YStack>
                )
              })}
            </XStack>
          </YStack>
        )}

        {/* Chat Logs */}
        {(evidence.chat_logs || []).length > 0 && (
          <YStack backgroundColor="white" borderRadius={12} borderWidth={1} borderColor="#E5E7EB" padding="$4">
            <XStack alignItems="center" gap="$2" marginBottom="$3">
              <MessageCircle size={18} color="#3B82F6" />
              <Text fontSize={16} fontWeight="700">Buyer-Seller Chat Logs</Text>
            </XStack>
            <YStack gap="$2">
              {evidence.chat_logs.map((msg, i) => (
                <XStack key={i} gap="$2">
                  <Text fontSize={11} color="#9CA3AF" width={120} flexShrink={0}>{formatDateTime(msg.sent_at)}</Text>
                  <Text fontSize={12} color="#374151">
                    <Text fontWeight="600">{msg.from_name}</Text> → <Text fontWeight="600">{msg.to_name}</Text>: {msg.text}
                  </Text>
                </XStack>
              ))}
            </YStack>
          </YStack>
        )}

        {/* Action Bar */}
        {!isResolved && (
          <YStack backgroundColor="white" borderRadius={12} borderWidth={1} borderColor="#E5E7EB" padding="$4" gap="$3">
            {submitResult && (
              <Text fontSize={13} color={submitResult.startsWith('✅') || submitResult.startsWith('💾') ? '#059669' : '#DC2626'} fontWeight="600">
                {submitResult}
              </Text>
            )}
            <XStack gap="$3" alignItems="center" flexWrap="wrap">
              <Button
                size="$4"
                backgroundColor="#059669"
                icon={Send}
                onPress={handleSubmit}
                disabled={submitting || d.evidence_submitted_at !== null}
                opacity={submitting || d.evidence_submitted_at !== null ? 0.5 : 1}
              >
                <Text color="white">{submitting ? 'Submitting...' : d.evidence_submitted_at ? 'Evidence Already Submitted' : '✅ Submit Evidence to Stripe'}</Text>
              </Button>
              <Button
                size="$4"
                backgroundColor="#F3F4F6"
                icon={Save}
                onPress={handleSaveDraft}
                disabled={saving}
              >
                <Text color="#374151">{saving ? 'Saving...' : '💾 Save Draft'}</Text>
              </Button>
              <Text fontSize={12} color="#DC2626" cursor="pointer" hoverStyle={{ textDecorationLine: 'underline' }}>
                Accept Dispute (forfeit {formatCurrency(d.amount_usd)} + {formatCurrency(d.fee_usd)} fee)
              </Text>
            </XStack>
            <Text fontSize={11} color="#9CA3AF">Once submitted, evidence cannot be modified. Review carefully.</Text>
          </YStack>
        )}
      </YStack>
  )
}
