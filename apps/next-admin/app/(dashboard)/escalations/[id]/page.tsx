'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { YStack, XStack, Text, Button, Spinner, TextArea, Input, Separator, ScrollView } from 'tamagui'
import {
  ArrowLeft, RefreshCw, MapPin, Clock, Camera, MessageCircle,
  CheckCircle, XCircle, DollarSign, User, Shield, Send, AlertTriangle
} from '@tamagui/lucide-icons'
import { useParams, useRouter } from 'next/navigation'
import { adminApi } from '../../../../lib/adminApi'
import { colors } from '@casagrown/app/design-tokens'

// Matches the nested structure returned by get_escalation_detail_admin RPC
interface EscalationRpcResponse {
  dispute: {
    id: string
    order_id: string
    initiated_by: string
    reason: string
    dispute_type: string | null
    photos: string[]
    status: string
    staff_decision: string | null
    staff_notes: string | null
    resolved_by: string | null
    resolved_by_name: string | null
    resolved_at: string | null
    created_at: string
  }
  order: {
    id: string
    product_name: string
    product_id: string
    quantity: number
    unit_price_usd: number
    subtotal_usd: number
    tax_amount_usd: number
    platform_fee_usd: number
    total_usd: number
    fulfillment_type: string
    status: string
    delivery_proof: any
    delivered_at: string | null
    delivery_address: any
    created_at: string
    credit_applied_usd: number
  }
  buyer: {
    id: string
    name: string | null
    email: string | null
    created_at: string
  }
  seller: {
    id: string
    name: string | null
    email: string | null
    created_at: string
  }
  messages: Array<{
    id: string
    sender_id: string
    sender_name: string
    is_staff: boolean
    is_buyer: boolean
    is_seller: boolean
    body: string
    photos: string[]
    created_at: string
  }>
  credits_issued: Array<{
    id: string
    user_id: string
    recipient_name: string | null
    amount_usd: number
    remaining_usd: number
    credit_type: string
    max_pct_per_txn: number
    reason: string
    created_at: string
  }>
  fulfillment_verification: {
    fulfillment_type: string
    proof_geotag: { latitude: number; longitude: number } | null
    proof_timestamp: string | null
    delivered_at: string | null
    window_end: string | null
    proof_within_window: boolean | null
    delivery_address: any
    delivery_windows: any
    ready_for_pickup_at: string | null
    seller_marked_ready: boolean | null
    seller_marked_ready_within_window: boolean | null
    pickup_windows: any
    pickup_address: string | null
    booth_location: { latitude: number; longitude: number } | null
    proof_distance_from_pickup_miles: number | null
    proof_distance_ok: boolean | null
  } | null
  error?: string
}

type ResolutionType = 'refund_full' | 'refund_partial' | 'credit_buyer' | 'credit_seller' | 'no_action' | 'refund_full_credit_seller' | 'refund_partial_credit_seller' | 'credit_both'

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

function formatCurrency(amount: number | null | undefined) {
  if (amount == null) return '$0.00'
  return `$${amount.toFixed(2)}`
}

export default function EscalationDetailPage() {
  const params = useParams()
  const router = useRouter()
  const disputeId = params.id as string

  const [detail, setDetail] = useState<EscalationRpcResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sellerIsPro, setSellerIsPro] = useState(false)

  // Resolution form state
  const [resolutionType, setResolutionType] = useState<ResolutionType>('no_action')
  const [refundAmount, setRefundAmount] = useState('')
  const [creditAmount, setCreditAmount] = useState('')
  const [creditType, setCreditType] = useState<'purchase' | 'platform_fee'>('purchase')
  const [creditMaxPct, setCreditMaxPct] = useState('20')
  // Secondary credit (for combo resolutions)
  const [secondaryCreditAmount, setSecondaryCreditAmount] = useState('')
  const [secondaryCreditType, setSecondaryCreditType] = useState<'purchase' | 'platform_fee'>('purchase')
  const [secondaryCreditMaxPct, setSecondaryCreditMaxPct] = useState('20')
  const [reason, setReason] = useState('')
  const [resolving, setResolving] = useState(false)

  // Comment form
  const [comment, setComment] = useState('')
  const [requestFrom, setRequestFrom] = useState<string | null>(null)
  const [posting, setPosting] = useState(false)

  const fetchDetail = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminApi.rpc('get_escalation_detail_admin', { p_dispute_id: disputeId })
      if (res.data?.error) {
        setError(res.data.error)
      } else if (res.data) {
        const detail = res.data as EscalationRpcResponse
        setDetail(detail)
        // Mark as viewed
        adminApi.rpc('admin_view_escalation', { p_dispute_id: disputeId })

        // Check if seller is a Pro subscriber
        if (detail.seller?.id) {
          const subRes = await adminApi.select(
            'seller_subscriptions',
            'plan, status',
            { eq: { seller_id: detail.seller.id }, in: { status: ['active', 'trialing'] } },
            { limit: 1, single: true }
          )
          const isPro = !!(subRes.data && (subRes.data as any).plan === 'pro')
          setSellerIsPro(isPro)
          // Auto-default to purchase credits for Pro sellers
          if (isPro) {
            setCreditType('purchase')
            setSecondaryCreditType('purchase')
          }
        }
      }
    } catch (err) {
      setError('Failed to load escalation details')
    } finally {
      setLoading(false)
    }
  }, [disputeId])

  useEffect(() => { fetchDetail() }, [fetchDetail])

  const handleResolve = async () => {
    if (!reason.trim()) {
      alert('Please provide a resolution reason')
      return
    }
    setResolving(true)
    try {
      const rpcParams: any = {
        p_order_id: detail!.order.id,
        p_resolution_type: resolutionType,
        p_reason: reason,
      }
      // Refund amount for partial refund types
      if (['refund_partial', 'refund_partial_credit_seller'].includes(resolutionType)) {
        rpcParams.p_refund_amount_usd = parseFloat(refundAmount || '0')
      }
      // Primary credit (buyer or seller)
      if (['credit_buyer', 'credit_seller', 'credit_both'].includes(resolutionType)) {
        rpcParams.p_credit_amount_usd = parseFloat(creditAmount || '0')
        rpcParams.p_credit_type = creditType
        rpcParams.p_credit_max_pct = parseFloat(creditMaxPct || '20')
      }
      // Secondary credit (for combo: the OTHER party)
      if (['refund_full_credit_seller', 'refund_partial_credit_seller', 'credit_both'].includes(resolutionType)) {
        rpcParams.p_secondary_credit_usd = parseFloat(secondaryCreditAmount || '0')
        rpcParams.p_secondary_credit_type = secondaryCreditType
        rpcParams.p_secondary_credit_max_pct = parseFloat(secondaryCreditMaxPct || '20')
      }
      const res = await adminApi.rpc('admin_resolve_escalation', rpcParams)
      if (res.data?.error) {
        alert('Error: ' + res.data.error)
      } else {
        fetchDetail()
      }
    } finally {
      setResolving(false)
    }
  }

  const handlePostComment = async () => {
    if (!comment.trim()) return
    setPosting(true)
    try {
      const res = await adminApi.rpc('admin_add_dispute_comment', {
        p_dispute_id: disputeId,
        p_body: comment,
        p_request_info_from: requestFrom,
      })
      if (res.data?.error) {
        alert('Error: ' + res.data.error)
      } else {
        setComment('')
        setRequestFrom(null)
        fetchDetail()
      }
    } finally {
      setPosting(false)
    }
  }

  const handleClaim = async () => {
    const res = await adminApi.rpc('admin_claim_escalation', { p_dispute_id: disputeId })
    if (res.data?.error) alert(res.data.error)
    else fetchDetail()
  }

  const handleRelinquish = async () => {
    const res = await adminApi.rpc('admin_relinquish_escalation', { p_dispute_id: disputeId })
    if (res.data?.error) alert(res.data.error)
    else fetchDetail()
  }

  if (loading) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center" padding="$6">
        <Spinner size="large" color={colors.green[800]} />
      </YStack>
    )
  }

  if (error || !detail) {
    return (
      <YStack flex={1} padding="$6" gap="$4">
        <Button size="$3" icon={ArrowLeft} chromeless onPress={() => router.push('/escalations')}>
          <Text>Back to Escalations</Text>
        </Button>
        <Text color="#DC2626">{error || 'Escalation not found'}</Text>
      </YStack>
    )
  }

  const { dispute, order, buyer, seller, messages, credits_issued, fulfillment_verification: fv } = detail
  const isResolved = ['staff_resolved', 'buyer_accepted'].includes(dispute.status)

  return (
    <YStack flex={1} padding="$6" gap="$5" maxWidth={1200}>
      {/* Back Button */}
      <Button size="$3" icon={ArrowLeft} chromeless onPress={() => router.push('/escalations')} alignSelf="flex-start">
        <Text color={colors.green[700]} fontWeight="600">Back to Escalations</Text>
      </Button>

      {/* Header */}
      <XStack justifyContent="space-between" alignItems="flex-start">
        <YStack gap="$1">
          <Text fontSize={24} fontWeight="800" color={colors.green[800]}>
            Escalation: {order.product_name}
          </Text>
          <Text fontSize={14} color="#6B7280">
            Order #{order.id.substring(0, 8)} • {formatCurrency(order.total_usd)} • {order.fulfillment_type === 'delivery' ? '🚗 Delivery' : '📍 Pickup'}
          </Text>
        </YStack>
        <XStack gap="$2">
          <Button size="$3" icon={RefreshCw} backgroundColor={colors.green[600]} onPress={fetchDetail}>
            <Text color="white">Refresh</Text>
          </Button>
        </XStack>
      </XStack>

      {/* Claim Banner */}
      {!isResolved && (
        <XStack
          backgroundColor={dispute.resolved_by ? '#EEF2FF' : '#FEF3C7'}
          borderWidth={1}
          borderColor={dispute.resolved_by ? '#C7D2FE' : '#F59E0B'}
          borderRadius={8}
          padding="$3"
          alignItems="center"
          justifyContent="space-between"
        >
          <XStack alignItems="center" gap="$2">
            <User size={18} color={dispute.resolved_by ? '#4F46E5' : '#D97706'} />
            <Text fontSize={14} fontWeight="600" color={dispute.resolved_by ? '#4338CA' : '#92400E'}>
              {dispute.resolved_by
                ? `Claimed by ${dispute.resolved_by_name || 'Admin'}`
                : 'Unclaimed — Claim this escalation to begin working on it'}
            </Text>
          </XStack>
          {dispute.resolved_by ? (
            <Button size="$2" backgroundColor="#FEE2E2" borderRadius={6} onPress={handleRelinquish}>
              <Text fontSize={12} color="#DC2626" fontWeight="600">Relinquish</Text>
            </Button>
          ) : (
            <Button size="$2" backgroundColor="#4F46E5" borderRadius={6} onPress={handleClaim}>
              <Text fontSize={12} color="white" fontWeight="600">Claim</Text>
            </Button>
          )}
        </XStack>
      )}

      {/* Resolution Banner (if resolved) */}
      {isResolved && (
        <XStack
          backgroundColor="#D1FAE5"
          borderWidth={1}
          borderColor="#10B981"
          borderRadius={8}
          padding="$4"
          gap="$3"
          alignItems="flex-start"
        >
          <CheckCircle size={24} color="#059669" />
          <YStack flex={1}>
            <Text fontSize={16} fontWeight="700" color="#065F46">Resolved</Text>
            <Text fontSize={13} color="#047857">
              Decision: {dispute.staff_decision?.replace(/_/g, ' ') || '—'}
            </Text>
            {dispute.staff_notes && (
              <Text fontSize={13} color="#047857" marginTop="$1">
                Reason: {dispute.staff_notes}
              </Text>
            )}
            <Text fontSize={12} color="#6B7280" marginTop="$1">
              Resolved by {dispute.resolved_by_name || 'Admin'} on {formatDate(dispute.resolved_at)}
            </Text>
          </YStack>
        </XStack>
      )}

      {/* Credits Issued Banner */}
      {credits_issued && credits_issued.length > 0 && (
        <YStack backgroundColor="#F0FDF4" borderWidth={1} borderColor="#86EFAC" borderRadius={8} padding="$3" gap="$2">
          <Text fontSize={14} fontWeight="700" color="#166534">💰 Credits Issued</Text>
          {credits_issued.map((c) => (
            <XStack key={c.id} justifyContent="space-between" alignItems="center" padding="$1">
              <Text fontSize={13} color="#15803D">
                {formatCurrency(c.amount_usd)} {c.credit_type} credit → {c.recipient_name || 'Unknown'}
              </Text>
              <Text fontSize={11} color="#6B7280">
                {formatCurrency(c.remaining_usd)} remaining • max {c.max_pct_per_txn}%/txn
              </Text>
            </XStack>
          ))}
        </YStack>
      )}

      {/* Two Column Layout */}
      <XStack gap="$4" flexWrap="wrap">
        {/* Left Column: Order Info + Verification */}
        <YStack flex={1} minWidth={400} gap="$4">
          {/* Parties */}
          <YStack backgroundColor="white" borderWidth={1} borderColor="#E5E7EB" borderRadius={12} padding="$4" gap="$3">
            <Text fontSize={16} fontWeight="700" color="#374151">📋 Order Details</Text>
            <Separator />
            <XStack gap="$6">
              <YStack flex={1} gap="$1">
                <Text fontSize={12} color="#6B7280" fontWeight="600">BUYER</Text>
                <Text fontSize={14} fontWeight="500" color="#374151">{buyer?.name || 'Unknown'}</Text>
                <Text fontSize={12} color="#9CA3AF">{buyer?.email}</Text>
              </YStack>
              <YStack flex={1} gap="$1">
                <Text fontSize={12} color="#6B7280" fontWeight="600">SELLER</Text>
                <Text fontSize={14} fontWeight="500" color="#374151">{seller?.name || 'Unknown'}</Text>
                <Text fontSize={12} color="#9CA3AF">{seller?.email}</Text>
              </YStack>
            </XStack>
            <Separator />
            {/* Order financial breakdown */}
            <YStack gap="$1">
              <Text fontSize={12} color="#6B7280" fontWeight="600">ORDER BREAKDOWN</Text>
              <XStack justifyContent="space-between">
                <Text fontSize={13} color="#6B7280">Qty × Unit Price</Text>
                <Text fontSize={13} color="#374151">{order.quantity} × {formatCurrency(order.unit_price_usd)}</Text>
              </XStack>
              <XStack justifyContent="space-between">
                <Text fontSize={13} color="#6B7280">Subtotal</Text>
                <Text fontSize={13} color="#374151">{formatCurrency(order.subtotal_usd)}</Text>
              </XStack>
              <XStack justifyContent="space-between">
                <Text fontSize={13} color="#6B7280">Tax</Text>
                <Text fontSize={13} color="#374151">{formatCurrency(order.tax_amount_usd)}</Text>
              </XStack>
              <XStack justifyContent="space-between">
                <Text fontSize={13} color="#6B7280">Platform Fee</Text>
                <Text fontSize={13} color="#374151">{formatCurrency(order.platform_fee_usd)}</Text>
              </XStack>
              {order.credit_applied_usd > 0 && (
                <XStack justifyContent="space-between">
                  <Text fontSize={13} color="#059669">Credits Applied</Text>
                  <Text fontSize={13} color="#059669" fontWeight="600">-{formatCurrency(order.credit_applied_usd)}</Text>
                </XStack>
              )}
              <Separator />
              <XStack justifyContent="space-between">
                <Text fontSize={14} fontWeight="700" color="#374151">Total</Text>
                <Text fontSize={14} fontWeight="700" color="#DC2626">{formatCurrency(order.total_usd)}</Text>
              </XStack>
            </YStack>
            <Separator />
            <YStack gap="$1">
              <Text fontSize={12} color="#6B7280" fontWeight="600">DISPUTE REASON</Text>
              <Text fontSize={14} color="#374151">{dispute.reason}</Text>
              {dispute.dispute_type && (
                <Text fontSize={12} color="#9CA3AF" marginTop="$1">Type: {dispute.dispute_type}</Text>
              )}
            </YStack>
            {dispute.photos && dispute.photos.length > 0 && (
              <>
                <Separator />
                <YStack gap="$1">
                  <Text fontSize={12} color="#6B7280" fontWeight="600">BUYER EVIDENCE PHOTOS</Text>
                  <XStack gap="$2" flexWrap="wrap">
                    {dispute.photos.map((url: string, i: number) => (
                      <img
                        key={i}
                        src={url}
                        alt={`Evidence ${i + 1}`}
                        style={{ width: 100, height: 100, borderRadius: 8, objectFit: 'cover', border: '1px solid #E5E7EB', cursor: 'pointer' }}
                        onClick={() => window.open(url, '_blank')}
                      />
                    ))}
                  </XStack>
                </YStack>
              </>
            )}
          </YStack>

          {/* Delivery Proof Photos */}
          {order.delivery_proof && Array.isArray(order.delivery_proof) && order.delivery_proof.length > 0 && (
            <YStack backgroundColor="white" borderWidth={1} borderColor="#E5E7EB" borderRadius={12} padding="$4" gap="$3">
              <Text fontSize={16} fontWeight="700" color="#374151">📸 Seller Delivery Proof</Text>
              <Separator />
              <XStack gap="$2" flexWrap="wrap">
                {order.delivery_proof.map((proof: any, i: number) => (
                  <YStack key={i} gap="$1">
                    {proof.url && (
                      <img
                        src={proof.url}
                        alt={`Delivery proof ${i + 1}`}
                        style={{ width: 120, height: 120, borderRadius: 8, objectFit: 'cover', border: '1px solid #E5E7EB', cursor: 'pointer' }}
                        onClick={() => window.open(proof.url, '_blank')}
                      />
                    )}
                    {proof.timestamp && (
                      <Text fontSize={10} color="#9CA3AF">{formatDate(proof.timestamp)}</Text>
                    )}
                  </YStack>
                ))}
              </XStack>
            </YStack>
          )}

          {/* Fulfillment Verification */}
          {fv && (
            <YStack backgroundColor="white" borderWidth={1} borderColor="#E5E7EB" borderRadius={12} padding="$4" gap="$3">
              <Text fontSize={16} fontWeight="700" color="#374151">
                {fv.fulfillment_type === 'delivery' ? '🚗 Delivery Verification' : '📍 Pickup Verification'}
              </Text>
              <Separator />

              {fv.fulfillment_type === 'delivery' ? (
                <YStack gap="$3">
                  {/* Timing */}
                  <XStack gap="$2" alignItems="center">
                    <Clock size={16} color={fv.proof_within_window ? '#059669' : '#DC2626'} />
                    <YStack>
                      <Text fontSize={13} color="#374151">
                        Delivered: {formatDate(fv.delivered_at)}
                      </Text>
                      <Text fontSize={13} color="#374151">
                        Window end: {formatDate(fv.window_end)}
                      </Text>
                      <Text
                        fontSize={12}
                        fontWeight="700"
                        color={fv.proof_within_window ? '#059669' : fv.proof_within_window === false ? '#DC2626' : '#6B7280'}
                      >
                        {fv.proof_within_window === true
                          ? '✅ Within delivery window'
                          : fv.proof_within_window === false
                            ? '❌ Outside delivery window'
                            : '⚠️ Window data unavailable'}
                      </Text>
                    </YStack>
                  </XStack>

                  {/* Location */}
                  {fv.proof_geotag && (
                    <XStack gap="$2" alignItems="center">
                      <MapPin size={16} color="#6366F1" />
                      <YStack>
                        <Text fontSize={13} color="#374151">
                          Proof location: {fv.proof_geotag.latitude.toFixed(4)}, {fv.proof_geotag.longitude.toFixed(4)}
                        </Text>
                        {fv.delivery_address && (
                          <Text fontSize={12} color="#9CA3AF">
                            Address: {typeof fv.delivery_address === 'string' ? fv.delivery_address : JSON.stringify(fv.delivery_address)}
                          </Text>
                        )}
                      </YStack>
                    </XStack>
                  )}
                </YStack>
              ) : (
                <YStack gap="$3">
                  {/* Ready for Pickup Signal */}
                  <XStack gap="$2" alignItems="center">
                    <Clock size={16} color={fv.seller_marked_ready ? '#4F46E5' : '#9CA3AF'} />
                    <YStack>
                      <Text fontSize={13} fontWeight="600" color="#374151">
                        Seller Marked Ready: {fv.seller_marked_ready ? '✅ Yes' : '❌ No'}
                      </Text>
                      {fv.ready_for_pickup_at && (
                        <Text fontSize={13} color="#374151">
                          Ready at: {formatDate(fv.ready_for_pickup_at)}
                        </Text>
                      )}
                      {fv.seller_marked_ready_within_window != null && (
                        <Text
                          fontSize={12}
                          fontWeight="700"
                          color={fv.seller_marked_ready_within_window ? '#059669' : '#DC2626'}
                        >
                          {fv.seller_marked_ready_within_window
                            ? '✅ Marked ready within pickup window'
                            : '❌ Marked ready outside pickup window'}
                        </Text>
                      )}
                    </YStack>
                  </XStack>

                  {/* Actual Handoff / Delivery */}
                  <XStack gap="$2" alignItems="center">
                    <Clock size={16} color={fv.delivered_at ? '#059669' : '#9CA3AF'} />
                    <YStack>
                      <Text fontSize={13} color="#374151">
                        Buyer Picked Up: {fv.delivered_at ? formatDate(fv.delivered_at) : '— Not yet'}
                      </Text>
                      <Text fontSize={13} color="#374151">
                        Pickup window end: {formatDate(fv.window_end)}
                      </Text>
                      <Text
                        fontSize={12}
                        fontWeight="700"
                        color={fv.proof_within_window ? '#059669' : fv.proof_within_window === false ? '#DC2626' : '#6B7280'}
                      >
                        {fv.proof_within_window === true
                          ? '✅ Within pickup window'
                          : fv.proof_within_window === false
                            ? '❌ Outside pickup window'
                            : '⚠️ Window data unavailable'}
                      </Text>
                    </YStack>
                  </XStack>

                  {/* Booth Location */}
                  {(fv.proof_geotag || fv.booth_location) && (
                    <XStack gap="$2" alignItems="center">
                      <MapPin size={16} color={fv.proof_distance_ok ? '#059669' : fv.proof_distance_ok === false ? '#DC2626' : '#6B7280'} />
                      <YStack>
                        {fv.proof_geotag && (
                          <Text fontSize={13} color="#374151">
                            Pickup geotag: {fv.proof_geotag.latitude.toFixed(4)}, {fv.proof_geotag.longitude.toFixed(4)}
                          </Text>
                        )}
                        {fv.booth_location && (
                          <Text fontSize={13} color="#374151">
                            Booth location: {fv.booth_location.latitude.toFixed(4)}, {fv.booth_location.longitude.toFixed(4)}
                          </Text>
                        )}
                        {fv.pickup_address && (
                          <Text fontSize={12} color="#9CA3AF">Address: {fv.pickup_address}</Text>
                        )}
                        <Text
                          fontSize={12}
                          fontWeight="700"
                          color={fv.proof_distance_ok ? '#059669' : fv.proof_distance_ok === false ? '#DC2626' : '#6B7280'}
                        >
                          {fv.proof_distance_from_pickup_miles != null
                            ? `${fv.proof_distance_from_pickup_miles.toFixed(2)} miles apart — ${fv.proof_distance_ok ? '✅ Close enough' : '❌ Too far (>0.5 mi)'}`
                            : 'Distance data unavailable'}
                        </Text>
                      </YStack>
                    </XStack>
                  )}
                </YStack>
              )}
            </YStack>
          )}
        </YStack>

        {/* Right Column: Messages + Resolution */}
        <YStack flex={1} minWidth={400} gap="$4">
          {/* Message Thread */}
          <YStack backgroundColor="white" borderWidth={1} borderColor="#E5E7EB" borderRadius={12} padding="$4" gap="$3">
            <XStack justifyContent="space-between" alignItems="center">
              <Text fontSize={16} fontWeight="700" color="#374151">💬 Dispute Thread</Text>
              <Text fontSize={12} color="#6B7280">{messages?.length || 0} messages</Text>
            </XStack>
            <Separator />

            {/* Messages */}
            <YStack gap="$3" maxHeight={400} overflow="scroll">
              {(!messages || messages.length === 0) ? (
                <Text fontSize={13} color="#9CA3AF" textAlign="center" padding="$4">
                  No messages yet
                </Text>
              ) : (
                messages.map((msg) => (
                  <YStack
                    key={msg.id}
                    backgroundColor={msg.is_staff ? '#EEF2FF' : msg.is_buyer ? '#EFF6FF' : '#F0FDF4'}
                    borderRadius={8}
                    padding="$3"
                    borderLeftWidth={3}
                    borderLeftColor={msg.is_staff ? '#4F46E5' : msg.is_buyer ? '#2563EB' : '#059669'}
                  >
                    <XStack justifyContent="space-between" alignItems="center">
                      <XStack gap="$1" alignItems="center">
                        {msg.is_staff && <Shield size={12} color="#4F46E5" />}
                        <Text fontSize={12} fontWeight="600" color={msg.is_staff ? '#4F46E5' : msg.is_buyer ? '#2563EB' : '#059669'}>
                          {msg.sender_name || 'Unknown'}
                          {msg.is_staff ? ' (Staff)' : msg.is_buyer ? ' (Buyer)' : ' (Seller)'}
                        </Text>
                      </XStack>
                      <Text fontSize={11} color="#9CA3AF">{formatDate(msg.created_at)}</Text>
                    </XStack>
                    <Text fontSize={13} color="#374151" marginTop="$1">{msg.body}</Text>
                    {msg.photos && msg.photos.length > 0 && (
                      <XStack gap="$1" marginTop="$2" flexWrap="wrap">
                        {msg.photos.map((url: string, i: number) => (
                          <img
                            key={i}
                            src={url}
                            alt={`Photo ${i + 1}`}
                            style={{ width: 60, height: 60, borderRadius: 6, objectFit: 'cover', cursor: 'pointer' }}
                            onClick={() => window.open(url, '_blank')}
                          />
                        ))}
                      </XStack>
                    )}
                  </YStack>
                ))
              )}
            </YStack>

            {/* Post Comment */}
            <Separator />
            <YStack gap="$2">
              <TextArea
                placeholder="Add a note to the dispute thread..."
                value={comment}
                onChangeText={setComment}
                minHeight={80}
                borderColor="#D1D5DB"
                borderWidth={1}
                borderRadius={8}
              />
              <XStack justifyContent="space-between" alignItems="center">
                <XStack gap="$2">
                  <Button
                    size="$2"
                    backgroundColor={requestFrom === 'buyer' ? '#DBEAFE' : '#F3F4F6'}
                    borderWidth={1}
                    borderColor={requestFrom === 'buyer' ? '#2563EB' : '#D1D5DB'}
                    borderRadius={6}
                    onPress={() => setRequestFrom(requestFrom === 'buyer' ? null : 'buyer')}
                  >
                    <Text fontSize={11} color={requestFrom === 'buyer' ? '#2563EB' : '#6B7280'}>
                      📌 Request info from Buyer
                    </Text>
                  </Button>
                  <Button
                    size="$2"
                    backgroundColor={requestFrom === 'seller' ? '#D1FAE5' : '#F3F4F6'}
                    borderWidth={1}
                    borderColor={requestFrom === 'seller' ? '#059669' : '#D1D5DB'}
                    borderRadius={6}
                    onPress={() => setRequestFrom(requestFrom === 'seller' ? null : 'seller')}
                  >
                    <Text fontSize={11} color={requestFrom === 'seller' ? '#059669' : '#6B7280'}>
                      📌 Request info from Seller
                    </Text>
                  </Button>
                </XStack>
                <Button
                  size="$2"
                  backgroundColor="#2563EB"
                  borderRadius={6}
                  icon={Send}
                  onPress={handlePostComment}
                  disabled={posting || !comment.trim()}
                >
                  <Text color="white" fontSize={12}>Post</Text>
                </Button>
              </XStack>
            </YStack>
          </YStack>

          {/* Resolution Panel (only if not resolved) */}
          {!isResolved && (
            <YStack backgroundColor="white" borderWidth={1} borderColor="#E5E7EB" borderRadius={12} padding="$4" gap="$3">
              <Text fontSize={16} fontWeight="700" color="#374151">⚖️ Resolution</Text>
              <Separator />

              {/* Pro Seller Banner */}
              {sellerIsPro && (
                <XStack
                  backgroundColor="#FEF3C7"
                  borderWidth={1}
                  borderColor="#F59E0B"
                  borderRadius={8}
                  padding="$3"
                  gap="$2"
                  alignItems="flex-start"
                >
                  <Text fontSize={18}>⭐</Text>
                  <YStack flex={1}>
                    <Text fontSize={13} fontWeight="700" color="#92400E">
                      Pro Seller — Reduced Platform Fees
                    </Text>
                    <Text fontSize={12} color="#A16207" marginTop="$1">
                      This seller has reduced platform fees. Purchase credits are recommended
                      over platform fee credits so they can use the credit faster.
                    </Text>
                  </YStack>
                </XStack>
              )}

              {/* Resolution Type Selection */}
              <YStack gap="$2">
                <Text fontSize={12} color="#6B7280" fontWeight="600">RESOLUTION TYPE</Text>
                <Text fontSize={11} color="#9CA3AF" marginBottom="$1">Choose a single action or combo resolution</Text>
                {([
                  { key: 'refund_full', label: '💰 Full Refund', desc: `Refund ${formatCurrency(order.total_usd)} to buyer`, group: 'single' },
                  { key: 'refund_partial', label: '💸 Partial Refund', desc: 'Refund a portion to buyer', group: 'single' },
                  { key: 'credit_buyer', label: '🎁 Credit Buyer', desc: 'Issue store credit to buyer', group: 'single' },
                  { key: 'credit_seller', label: '🎁 Credit Seller', desc: 'Issue store credit to seller', group: 'single' },
                  { key: 'no_action', label: '✋ No Action', desc: "Resolve in seller's favor", group: 'single' },
                  { key: 'refund_full_credit_seller', label: '💰+🎁 Full Refund + Credit Seller', desc: 'Refund buyer fully + goodwill credit to seller', group: 'combo' },
                  { key: 'refund_partial_credit_seller', label: '💸+🎁 Partial Refund + Credit Seller', desc: 'Partial refund to buyer + goodwill credit to seller', group: 'combo' },
                  { key: 'credit_both', label: '🎁+🎁 Credit Both', desc: 'Issue credits to both buyer and seller', group: 'combo' },
                ] as const).map((opt, i, arr) => (
                  <React.Fragment key={opt.key}>
                    {i > 0 && arr[i-1].group !== opt.group && (
                      <Separator marginVertical="$1" />
                    )}
                    {i > 0 && arr[i-1].group !== opt.group && (
                      <Text fontSize={11} color="#6B7280" fontWeight="600">COMBO RESOLUTIONS</Text>
                    )}
                    <Button
                      size="$4"
                      backgroundColor={resolutionType === opt.key ? '#EEF2FF' : 'white'}
                      borderWidth={1}
                      borderColor={resolutionType === opt.key ? '#4F46E5' : '#E5E7EB'}
                      borderRadius={8}
                      onPress={() => setResolutionType(opt.key as ResolutionType)}
                      justifyContent="flex-start"
                      paddingHorizontal="$3"
                    >
                      <YStack>
                        <Text fontSize={13} fontWeight="600" color={resolutionType === opt.key ? '#4F46E5' : '#374151'}>
                          {opt.label}
                        </Text>
                        <Text fontSize={11} color="#9CA3AF">{opt.desc}</Text>
                      </YStack>
                    </Button>
                  </React.Fragment>
                ))}
              </YStack>

              {/* Refund amount (for partial refund types) */}
              {['refund_partial', 'refund_partial_credit_seller'].includes(resolutionType) && (
                <YStack gap="$1">
                  <Text fontSize={12} color="#6B7280" fontWeight="600">REFUND AMOUNT (max {formatCurrency(order.total_usd)})</Text>
                  <Input
                    placeholder="0.00"
                    value={refundAmount}
                    onChangeText={setRefundAmount}
                    keyboardType="numeric"
                    borderColor="#D1D5DB"
                  />
                </YStack>
              )}

              {/* Primary credit (for credit_buyer, credit_seller, credit_both) */}
              {['credit_buyer', 'credit_seller', 'credit_both'].includes(resolutionType) && (
                <YStack gap="$2" backgroundColor="#F0FDF4" borderWidth={1} borderColor="#86EFAC" borderRadius={8} padding="$3">
                  <Text fontSize={12} color="#166534" fontWeight="700">
                    {resolutionType === 'credit_both' ? '🎁 BUYER CREDIT' : resolutionType === 'credit_seller' ? '🎁 SELLER CREDIT' : '🎁 BUYER CREDIT'}
                  </Text>
                  <YStack gap="$1">
                    <Text fontSize={12} color="#6B7280" fontWeight="600">CREDIT AMOUNT</Text>
                    <Input placeholder="0.00" value={creditAmount} onChangeText={setCreditAmount} keyboardType="numeric" borderColor="#D1D5DB" />
                  </YStack>
                  <YStack gap="$1">
                    <Text fontSize={12} color="#6B7280" fontWeight="600">CREDIT TYPE</Text>
                    <XStack gap="$2">
                      <Button size="$2" flex={1} backgroundColor={creditType === 'purchase' ? '#EEF2FF' : 'white'}
                        borderWidth={1} borderColor={creditType === 'purchase' ? '#4F46E5' : '#D1D5DB'} borderRadius={6}
                        onPress={() => setCreditType('purchase')}>
                        <Text fontSize={11} color={creditType === 'purchase' ? '#4F46E5' : '#6B7280'}>Purchase Credit</Text>
                      </Button>
                      <Button size="$2" flex={1} backgroundColor={creditType === 'platform_fee' ? '#EEF2FF' : 'white'}
                        borderWidth={1} borderColor={creditType === 'platform_fee' ? '#4F46E5' : '#D1D5DB'} borderRadius={6}
                        onPress={() => setCreditType('platform_fee')}>
                        <Text fontSize={11} color={creditType === 'platform_fee' ? '#4F46E5' : '#6B7280'}>Platform Fee Credit</Text>
                      </Button>
                    </XStack>
                  </YStack>
                  <YStack gap="$1">
                    <Text fontSize={12} color="#6B7280" fontWeight="600">MAX % PER TXN</Text>
                    <Input placeholder="20" value={creditMaxPct} onChangeText={setCreditMaxPct} keyboardType="numeric" borderColor="#D1D5DB" />
                  </YStack>
                </YStack>
              )}

              {/* Secondary credit (for combo resolutions) */}
              {['refund_full_credit_seller', 'refund_partial_credit_seller', 'credit_both'].includes(resolutionType) && (
                <YStack gap="$2" backgroundColor="#EEF2FF" borderWidth={1} borderColor="#C7D2FE" borderRadius={8} padding="$3">
                  <Text fontSize={12} color="#4338CA" fontWeight="700">
                    🎁 {resolutionType === 'credit_both' ? 'SELLER CREDIT' : 'SELLER GOODWILL CREDIT'}
                  </Text>
                  <YStack gap="$1">
                    <Text fontSize={12} color="#6B7280" fontWeight="600">CREDIT AMOUNT</Text>
                    <Input placeholder="0.00" value={secondaryCreditAmount} onChangeText={setSecondaryCreditAmount} keyboardType="numeric" borderColor="#D1D5DB" />
                  </YStack>
                  <YStack gap="$1">
                    <Text fontSize={12} color="#6B7280" fontWeight="600">CREDIT TYPE</Text>
                    <XStack gap="$2">
                      <Button size="$2" flex={1} backgroundColor={secondaryCreditType === 'purchase' ? '#EEF2FF' : 'white'}
                        borderWidth={1} borderColor={secondaryCreditType === 'purchase' ? '#4F46E5' : '#D1D5DB'} borderRadius={6}
                        onPress={() => setSecondaryCreditType('purchase')}>
                        <Text fontSize={11} color={secondaryCreditType === 'purchase' ? '#4F46E5' : '#6B7280'}>Purchase Credit</Text>
                      </Button>
                      <Button size="$2" flex={1} backgroundColor={secondaryCreditType === 'platform_fee' ? '#EEF2FF' : 'white'}
                        borderWidth={1} borderColor={secondaryCreditType === 'platform_fee' ? '#4F46E5' : '#D1D5DB'} borderRadius={6}
                        onPress={() => setSecondaryCreditType('platform_fee')}>
                        <Text fontSize={11} color={secondaryCreditType === 'platform_fee' ? '#4F46E5' : '#6B7280'}>Platform Fee Credit</Text>
                      </Button>
                    </XStack>
                  </YStack>
                  <YStack gap="$1">
                    <Text fontSize={12} color="#6B7280" fontWeight="600">MAX % PER TXN</Text>
                    <Input placeholder="20" value={secondaryCreditMaxPct} onChangeText={setSecondaryCreditMaxPct} keyboardType="numeric" borderColor="#D1D5DB" />
                  </YStack>
                </YStack>
              )}

              {/* Reason */}
              <YStack gap="$1">
                <Text fontSize={12} color="#6B7280" fontWeight="600">REASON (required)</Text>
                <TextArea
                  placeholder="Explain the resolution decision..."
                  value={reason}
                  onChangeText={setReason}
                  minHeight={80}
                  borderColor="#D1D5DB"
                  borderWidth={1}
                  borderRadius={8}
                />
              </YStack>

              {/* Submit */}
              <Button
                size="$4"
                backgroundColor={resolutionType === 'no_action' ? '#6B7280' : '#DC2626'}
                borderRadius={8}
                onPress={handleResolve}
                disabled={resolving || !reason.trim()}
              >
                <Text color="white" fontWeight="700" fontSize={14}>
                  {resolving ? 'Resolving...' : `Resolve: ${resolutionType.replace(/_/g, ' ').toUpperCase()}`}
                </Text>
              </Button>
            </YStack>
          )}
        </YStack>
      </XStack>
    </YStack>
  )
}
