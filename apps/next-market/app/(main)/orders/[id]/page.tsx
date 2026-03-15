'use client'

import { use, useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '../../../../lib/supabase'
import { useAuth } from '../../../../lib/useAuth'
import CameraCapture, { CaptureResult } from '../../../../components/CameraCapture'
import OrderChat from '../../../../components/OrderChat'
import { geocodeAddress } from '../../../../lib/geocode'
import styles from './page.module.css'

// Haversine distance in meters
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

interface OrderDetail {
  id: string
  buyer_id: string
  seller_id: string
  product_id: string
  product_name: string
  quantity: number
  unit_price_usd: number
  subtotal_usd: number
  tax_rate_pct: number
  tax_amount_usd: number
  platform_fee_pct: number
  platform_fee_usd: number
  total_usd: number
  fulfillment_type: 'delivery' | 'pickup'
  status: string
  created_at: string
  updated_at: string
  delivered_at: string | null
  auto_complete_at: string | null
  completed_at: string | null
  decline_reason: string | null
  delivery_proof: any[]
  buyer_passcode: string | null
  seller_passcode: string | null
  buyer_passcode_entered: boolean
  seller_passcode_entered: boolean
  // joined
  buyer_name: string
  seller_name: string
  buyer_address?: string
  seller_address?: string
  buyer_avatar?: string
  seller_avatar?: string
  booth_name: string
}

interface Dispute {
  id: string
  reason: string
  photos: any[]
  dispute_type: string | null
  quantity_received: number | null
  refund_type: string | null
  refund_amount_usd: number | null
  pickup_offered: boolean
  status: string
  staff_decision: string | null
  staff_notes: string | null
  created_at: string
}

interface DisputeMessage {
  id: string
  sender_id: string
  body: string
  photos: any[]
  created_at: string
  sender_name?: string
}

function formatUsd(n: number) { return '$' + n.toFixed(2) }

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: orderId } = use(params)
  const router = useRouter()
  const supabase = createClient()
  const { user, isAuthenticated, loading: authLoading } = useAuth()
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [dispute, setDispute] = useState<Dispute | null>(null)
  const [disputeMessages, setDisputeMessages] = useState<DisputeMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  // Form states
  const [showDecline, setShowDecline] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [showDispute, setShowDispute] = useState(false)
  const [disputeType, setDisputeType] = useState<string | null>(null)
  const [disputeReason, setDisputeReason] = useState('')
  const [disputeQuantityReceived, setDisputeQuantityReceived] = useState('')
  const [disputePhotos, setDisputePhotos] = useState<{ preview: string; result: CaptureResult }[]>([])
  const [showDisputeCamera, setShowDisputeCamera] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [showRefund, setShowRefund] = useState(false)
  const [refundType, setRefundType] = useState<'full' | 'partial'>('full')
  const [refundAmount, setRefundAmount] = useState('')
  const [pickupOffered, setPickupOffered] = useState(false)
  const [passcodeInput, setPasscodeInput] = useState('')
  const [showPickupDecline, setShowPickupDecline] = useState(false)
  const [pickupDeclineReason, setPickupDeclineReason] = useState('')
  const [newMessage, setNewMessage] = useState('')
  const [countdown, setCountdown] = useState('')
  const [showDeliveryProof, setShowDeliveryProof] = useState(false)
  const [showCamera, setShowCamera] = useState(false)
  const [proofPhotos, setProofPhotos] = useState<{ preview: string; result: CaptureResult }[]>([])
  const [uploading, setUploading] = useState(false)
  const [buyerCoords, setBuyerCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [locationWarning, setLocationWarning] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadOrder = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('market_orders')
      .select('*, buyer:buyer_id(full_name, street_address, avatar_url), seller:seller_id(full_name, street_address, avatar_url), booth:booth_id(name)')
      .eq('id', orderId)
      .single()

    if (data) {
      setOrder({
        ...data,
        buyer_name: (data as any).buyer?.full_name || 'Unknown',
        seller_name: (data as any).seller?.full_name || 'Unknown',
        buyer_address: (data as any).buyer?.street_address || undefined,
        seller_address: (data as any).seller?.street_address || undefined,
        buyer_avatar: (data as any).buyer?.avatar_url || undefined,
        seller_avatar: (data as any).seller?.avatar_url || undefined,
        booth_name: (data as any).booth?.name || 'Unknown Booth',
      } as OrderDetail)

      // Load dispute if exists
      const { data: disp } = await supabase
        .from('order_disputes')
        .select('*')
        .eq('order_id', orderId)
        .maybeSingle()
      setDispute(disp)

      if (disp) {
        const { data: msgs } = await supabase
          .from('order_dispute_messages')
          .select('*, profiles:sender_id(full_name)')
          .eq('dispute_id', disp.id)
          .order('created_at', { ascending: true })
        if (msgs) {
          setDisputeMessages(msgs.map((m: any) => ({
            ...m,
            sender_name: m.profiles?.full_name || 'Unknown',
          })))
        }
      }
    }
    setLoading(false)
  }, [orderId, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (user) loadOrder() }, [loadOrder, user])

  // Auth redirect
  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push('/login?redirect=/orders')
  }, [authLoading, isAuthenticated, router])

  // Countdown timer for auto-complete
  useEffect(() => {
    if (order?.status === 'delivered' && order.auto_complete_at) {
      const update = () => {
        const diff = new Date(order.auto_complete_at!).getTime() - Date.now()
        if (diff <= 0) {
          setCountdown('Auto-completing...')
          if (timerRef.current) clearInterval(timerRef.current)
          setTimeout(loadOrder, 2000)
          return
        }
        const h = Math.floor(diff / 3600000)
        const m = Math.floor((diff % 3600000) / 60000)
        const s = Math.floor((diff % 60000) / 1000)
        setCountdown(`${h}h ${m}m ${s}s`)
      }
      update()
      timerRef.current = setInterval(update, 1000)
      return () => { if (timerRef.current) clearInterval(timerRef.current) }
    }
  }, [order?.status, order?.auto_complete_at]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fast poll: refresh order every 10s while on this page
  useEffect(() => {
    if (!user) return
    const id = setInterval(loadOrder, 10_000)
    return () => clearInterval(id)
  }, [user?.id, loadOrder])

  const callRpc = async (fn: string, args: Record<string, any>) => {
    setActionLoading(true)
    const { data, error } = await supabase.rpc(fn, args)
    setActionLoading(false)
    if (error) { alert('Error: ' + error.message); return null }
    if (data?.error) { alert(data.error); return null }
    loadOrder()
    return data
  }

  const sendDisputeMessage = async () => {
    if (!newMessage.trim() || !dispute || !user) return
    await supabase.from('order_dispute_messages').insert({
      dispute_id: dispute.id,
      sender_id: user.id,
      body: newMessage.trim(),
    })
    setNewMessage('')
    loadOrder()
  }

  if (authLoading || !isAuthenticated) {
    return <div className="container" style={{ padding: '80px 20px', textAlign: 'center' }}><p>Loading...</p></div>
  }

  if (loading) {
    return <div className="container" style={{ padding: '80px 20px', textAlign: 'center' }}><p>Loading order...</p></div>
  }

  if (!order) {
    return <div className="container" style={{ padding: '80px 20px', textAlign: 'center' }}><h2>Order not found</h2></div>
  }

  const isBuyer = order.buyer_id === user?.id
  const isSeller = order.seller_id === user?.id

  return (
    <div className="container">
      <div className={styles.breadcrumb}>
        <Link href="/orders">← Orders</Link>
      </div>

      {/* Order Summary */}
      <div className={styles.summaryCard}>
        <div className={styles.summaryHeader}>
          <div>
            <h1 className={styles.orderTitle}>{order.product_name}</h1>
            <p className={styles.orderSub}>
              {order.fulfillment_type === 'delivery' ? '🚗 Delivery' : '📍 Pickup'} · Order placed {new Date(order.created_at).toLocaleDateString()}
            </p>
          </div>
          <div className={styles.statusPill} data-status={order.status}>
            {order.status.replace(/_/g, ' ')}
          </div>
        </div>

        <div className={styles.partiesRow}>
          <div className={styles.party}>
            <span className={styles.partyLabel}>Buyer</span>
            <span className={styles.partyName}>{order.buyer_name} {isBuyer && '(you)'}</span>
          </div>
          <div className={styles.partySep}>→</div>
          <div className={styles.party}>
            <span className={styles.partyLabel}>Seller</span>
            <span className={styles.partyName}>{order.seller_name} {isSeller && '(you)'}</span>
          </div>
        </div>

        {/* Delivery address — shown for delivery orders */}
        {order.fulfillment_type === 'delivery' && order.buyer_address && (
          <div style={{ background: 'var(--gray-50)', borderRadius: 'var(--radius-lg)', padding: '10px 14px', marginTop: 12, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>📍</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Delivery Address</div>
              <div style={{ color: 'var(--gray-800)' }}>{order.buyer_address}</div>
            </div>
          </div>
        )}

        {/* Pickup address — shown for pickup orders */}
        {order.fulfillment_type === 'pickup' && order.seller_address && (
          <div style={{ background: 'var(--gray-50)', borderRadius: 'var(--radius-lg)', padding: '10px 14px', marginTop: 12, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>📍</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Pickup Address</div>
              <div style={{ color: 'var(--gray-800)' }}>{order.seller_address}</div>
            </div>
            {isBuyer && (
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(order.seller_address)}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary)', whiteSpace: 'nowrap', textDecoration: 'none' }}
              >
                🗺️ Navigate
              </a>
            )}
          </div>
        )}

        <div className={styles.priceGrid}>
          <div className={styles.priceRow}><span>{order.quantity} × {formatUsd(order.unit_price_usd)}</span><span>{formatUsd(order.subtotal_usd)}</span></div>
          {order.tax_amount_usd > 0 && <div className={styles.priceRow}><span>Tax ({order.tax_rate_pct}%)</span><span>{formatUsd(order.tax_amount_usd)}</span></div>}
          <div className={`${styles.priceRow} ${styles.priceTotal}`}><span>Total</span><span>{formatUsd(order.total_usd)}</span></div>
        </div>
      </div>

      {/* Timeline / Status */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Status</h2>

        {/* Auto-complete countdown */}
        {order.status === 'delivered' && isBuyer && countdown && (
          <div className={styles.countdownBar}>
            <span>⏰ Auto-completes in <strong>{countdown}</strong></span>
            <span className={styles.countdownSub}>Confirm receipt or dispute within this time</span>
          </div>
        )}

        {/* Decline reason */}
        {order.decline_reason && (
          <div className={styles.infoBox} data-type="warning">
            <strong>Decline reason:</strong> {order.decline_reason}
          </div>
        )}

        {/* Delivery proof photos */}
        {Array.isArray(order.delivery_proof) && order.delivery_proof.length > 0 && (
          <div className={styles.proofSection}>
            <h3 className={styles.subTitle}>Delivery Proof</h3>
            <div className={styles.photoGrid}>
              {order.delivery_proof.map((p: any, i: number) => (
                <div key={i} className={styles.proofPhoto}>
                  <img src={typeof p === 'string' ? p : p.url} alt={`Proof ${i + 1}`} />
                  <div className={styles.proofMeta}>
                    {p.timestamp && <span>🕐 {new Date(p.timestamp).toLocaleString()}</span>}
                    {p.latitude && <span>📍 {Number(p.latitude).toFixed(5)}, {Number(p.longitude).toFixed(5)}</span>}
                    {p.accuracy && <span>±{Math.round(p.accuracy)}m</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ===== CHAT BUTTON ===== */}
      {!['completed', 'resolved', 'declined', 'cancelled'].includes(order.status) && (
        <div className={styles.actionPanel}>
          <button
            className="btn btn-outline"
            style={{ width: '100%', fontSize: 14 }}
            onClick={() => setShowChat(prev => !prev)}
          >
            💬 {showChat ? 'Hide Chat' : 'Chat with ' + (isSeller ? order.buyer_name : order.seller_name)}
          </button>
        </div>
      )}

      {/* ===== CHAT PANEL ===== */}
      {showChat && (
        <div style={{ margin: '0 -4px' }}>
          <OrderChat
            orderId={orderId}
            otherUserName={isSeller ? order.buyer_name : order.seller_name}
            otherUserId={isSeller ? order.buyer_id : order.seller_id}
            myAvatar={isSeller ? order.seller_avatar : order.buyer_avatar}
            otherAvatar={isSeller ? order.buyer_avatar : order.seller_avatar}
          />
        </div>
      )}

      {/* ===== ACTION PANELS ===== */}

      {/* SELLER: Pending delivery order → Navigate, Mark Delivered or Decline */}
      {isSeller && order.status === 'pending' && order.fulfillment_type === 'delivery' && (
        <div className={styles.actionPanel}>
          <h2 className={styles.sectionTitle}>Seller Actions</h2>
          {order.buyer_address && (
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(order.buyer_address)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-outline"
              style={{ width: '100%', marginBottom: 8, textAlign: 'center', display: 'block', fontSize: 14 }}
            >
              🗺️ Navigate to Buyer
            </a>
          )}
          <div className={styles.actionButtons}>
            <button className="btn btn-primary" onClick={() => setShowDeliveryProof(true)}>
              📦 Mark Delivered
            </button>
            <button className="btn btn-outline" onClick={() => setShowDecline(true)}>
              ✕ Decline Order
            </button>
          </div>
        </div>
      )}

      {/* BUYER: Pending pickup → Navigate to seller */}
      {isBuyer && order.status === 'pending' && order.fulfillment_type === 'pickup' && order.seller_address && (
        <div className={styles.actionPanel}>
          <h2 className={styles.sectionTitle}>Pickup</h2>
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(order.seller_address)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-outline"
            style={{ width: '100%', marginBottom: 8, textAlign: 'center', display: 'block', fontSize: 14 }}
          >
            🗺️ Navigate to Pickup
          </a>
        </div>
      )}

      {/* SELLER: Pending pickup → Hand Off to Buyer (optional photo) */}
      {isSeller && order.status === 'pending' && order.fulfillment_type === 'pickup' && (
        <div className={styles.actionPanel}>
          <h2 className={styles.sectionTitle}>Actions</h2>
          <div className={styles.actionButtons}>
            <button className="btn btn-primary" onClick={() => setShowDeliveryProof(true)}>
              📍 Hand Off with Photo
            </button>
            <button className="btn btn-primary" disabled={actionLoading}
              onClick={() => callRpc('seller_mark_ready_pickup', { p_order_id: orderId, p_proof: [] })}>
              ✓ Mark Handed Off
            </button>
            <button className="btn btn-outline" onClick={() => setShowDecline(true)}>
              ✕ Decline Order
            </button>
          </div>
        </div>
      )}

      {/* BUYER: Delivered (delivery or pickup) → Confirm or Dispute */}
      {isBuyer && order.status === 'delivered' && (
        <div className={styles.actionPanel}>
          <h2 className={styles.sectionTitle}>{order.fulfillment_type === 'pickup' ? 'Confirm Pickup' : 'Confirm Receipt'}</h2>
          <div className={styles.actionButtons}>
            <button className="btn btn-primary" disabled={actionLoading}
              onClick={() => callRpc('buyer_confirm_delivery', { p_order_id: orderId })}>
              ✓ {order.fulfillment_type === 'pickup' ? 'Confirm Pickup' : 'Confirm Delivery'}
            </button>
          </div>

          <div style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Report an Issue</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
              {[
                { id: 'not_delivered', icon: '📦', label: 'Not Delivered', desc: 'Never received' },
                { id: 'quantity_mismatch', icon: '🔢', label: 'Qty Mismatch', desc: 'Missing items' },
                { id: 'wrong_item', icon: '❌', label: 'Wrong Item', desc: 'Different product' },
                { id: 'poor_quality', icon: '👎', label: 'Poor Quality', desc: 'Damaged / spoiled' },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => { setDisputeType(t.id); setShowDispute(true) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 12px', borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--gray-200)', background: 'var(--gray-50)',
                    cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--gray-100)'; e.currentTarget.style.borderColor = 'var(--gray-300)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--gray-50)'; e.currentTarget.style.borderColor = 'var(--gray-200)' }}
                >
                  <span style={{ fontSize: 22, lineHeight: 1 }}>{t.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--gray-800)' }}>{t.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 1 }}>{t.desc}</div>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>›</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== DISPUTE SECTION ===== */}
      {dispute && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Dispute</h2>

          <div className={styles.disputeCard}>
            <div className={styles.disputeHeader}>
              <span className={styles.disputeStatus} data-status={dispute.status}>
                {dispute.status === 'open' ? '🔍 Under Review' : dispute.status.replace(/_/g, ' ')}
              </span>
              <span className={styles.disputeDate}>{new Date(dispute.created_at).toLocaleDateString()}</span>
            </div>

            {/* Dispute type label */}
            {dispute.dispute_type && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 10px', borderRadius: 12,
                background: 'var(--amber-50, #fffbeb)', border: '1px solid var(--amber-200, #fde68a)',
                fontSize: 12, fontWeight: 600, color: 'var(--amber-700, #b45309)',
                marginBottom: 8,
              }}>
                {dispute.dispute_type === 'not_delivered' && '📦'}
                {dispute.dispute_type === 'quantity_mismatch' && '🔢'}
                {dispute.dispute_type === 'wrong_item' && '❌'}
                {dispute.dispute_type === 'poor_quality' && '👎'}
                {' '}{dispute.dispute_type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
              </div>
            )}

            <p className={styles.disputeReason}><strong>Reason:</strong> {dispute.reason}</p>

            {/* Dispute photos */}
            {dispute.photos && dispute.photos.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                {dispute.photos.map((p: any, i: number) => (
                  <img key={i} src={p.url || p} alt={`Evidence ${i + 1}`}
                    style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--gray-200)' }} />
                ))}
              </div>
            )}

            {/* Quantity info for quantity mismatch */}
            {dispute.dispute_type === 'quantity_mismatch' && dispute.quantity_received != null && (
              <p style={{ fontSize: 13, color: 'var(--gray-600)', marginTop: 8 }}>
                <strong>Ordered:</strong> {order.quantity} · <strong>Received:</strong> {dispute.quantity_received}
              </p>
            )}

            {/* Suggested refund (auto-calculated) */}
            {dispute.status === 'open' && (
              <div style={{
                marginTop: 12, padding: '10px 14px', borderRadius: 'var(--radius-md)',
                background: 'var(--blue-50, #eff6ff)', border: '1px solid var(--blue-200, #bfdbfe)',
                fontSize: 13, color: 'var(--blue-700, #1d4ed8)',
              }}>
                {isSeller
                  ? '⏳ This dispute is being reviewed by CasaGrown staff. You can use chat to coordinate with the buyer.'
                  : '⏳ Your dispute is being reviewed. We\'ll resolve it within 24–48 hours.'}
              </div>
            )}

            {/* Staff decision */}
            {dispute.staff_decision && (
              <div className={styles.infoBox} data-type="info">
                <strong>Staff Decision:</strong> {dispute.staff_decision}
                {dispute.staff_notes && <p>{dispute.staff_notes}</p>}
              </div>
            )}

            {/* Refund applied */}
            {dispute.refund_type && (
              <div style={{
                marginTop: 12, padding: '10px 14px', borderRadius: 'var(--radius-md)',
                background: 'var(--green-50, #f0fdf4)', border: '1px solid var(--green-200, #bbf7d0)',
                fontSize: 13, color: 'var(--green-700, #15803d)',
              }}>
                <strong>{dispute.refund_type === 'full' ? 'Full' : 'Partial'} refund applied</strong>
                {dispute.refund_amount_usd && <span> — {formatUsd(dispute.refund_amount_usd)}</span>}
              </div>
            )}

            {/* Buyer: Issue Resolved button (withdraw dispute) */}
            {isBuyer && ['open', 'escalated'].includes(dispute.status) && (
              <button
                className="btn btn-primary btn-sm"
                style={{ marginTop: 14, width: '100%' }}
                disabled={actionLoading}
                onClick={async () => {
                  await callRpc('buyer_resolve_dispute', { p_dispute_id: dispute.id })
                  await supabase.from('order_chat_messages').insert({
                    order_id: orderId, sender_id: user!.id,
                    content: '✅ Issue resolved — dispute withdrawn.',
                  })
                }}
              >
                ✓ Issue Resolved
              </button>
            )}
          </div>
        </div>
      )}

      {/* ===== MODALS / FORMS ===== */}

      {/* Decline order modal */}
      {showDecline && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <h3>Decline Order</h3>
            <p>This will cancel the order and restore inventory.</p>
            <textarea
              value={declineReason}
              onChange={e => setDeclineReason(e.target.value)}
              placeholder="Reason for declining..."
              rows={3}
            />
            <div className={styles.modalActions}>
              <button className="btn btn-danger" disabled={!declineReason.trim() || actionLoading}
                onClick={async () => {
                  await callRpc('seller_decline_order', { p_order_id: orderId, p_reason: declineReason })
                  setShowDecline(false)
                }}>
                Decline Order
              </button>
              <button className="btn btn-outline" onClick={() => setShowDecline(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Dispute form modal */}
      {showDispute && (
        <div className={styles.modal}>
          <div className={styles.modalContent} style={{ maxWidth: 440 }}>
            <h3>File a Dispute</h3>

            {/* Step 1: Pick type */}
            {!disputeType ? (
              <>
                <p style={{ fontSize: 14, color: 'var(--gray-600)', marginBottom: 12 }}>What's the issue?</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { id: 'not_delivered', label: '📦 Not Delivered', desc: 'I never received this order' },
                    { id: 'quantity_mismatch', label: '🔢 Quantity Mismatch', desc: 'Received fewer items than ordered' },
                    { id: 'wrong_item', label: '❌ Wrong Item', desc: 'Received something different than ordered' },
                    { id: 'poor_quality', label: '👎 Poor Quality', desc: 'Items are damaged, spoiled, or low quality' },
                  ].map(t => (
                    <button
                      key={t.id}
                      className="btn btn-outline"
                      style={{ textAlign: 'left', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 2 }}
                      onClick={() => setDisputeType(t.id)}
                    >
                      <span style={{ fontWeight: 600 }}>{t.label}</span>
                      <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>{t.desc}</span>
                    </button>
                  ))}
                </div>
                <div className={styles.modalActions} style={{ marginTop: 12 }}>
                  <button className="btn btn-outline" onClick={() => setShowDispute(false)}>Cancel</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ background: 'var(--gray-50)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13 }}>
                  <strong>{disputeType.replace(/_/g, ' ')}</strong>
                  <button style={{ marginLeft: 8, fontSize: 12, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer' }}
                    onClick={() => { setDisputeType(null); setDisputePhotos([]); setDisputeQuantityReceived('') }}>
                    Change
                  </button>
                </div>

                {/* Quantity mismatch: how many received */}
                {disputeType === 'quantity_mismatch' && (
                  <div className={styles.formGroup} style={{ marginBottom: 12 }}>
                    <label style={{ fontWeight: 600, fontSize: 13 }}>How many did you receive?</label>
                    <input
                      type="number"
                      value={disputeQuantityReceived}
                      onChange={e => setDisputeQuantityReceived(e.target.value)}
                      placeholder={`Ordered: ${order.quantity}`}
                      min={0}
                      max={order.quantity}
                      style={{ marginTop: 4 }}
                    />
                  </div>
                )}

                {/* Photo required for: quantity_mismatch, wrong_item, poor_quality */}
                {['quantity_mismatch', 'wrong_item', 'poor_quality'].includes(disputeType) && (
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontWeight: 600, fontSize: 13 }}>
                      📸 Photo evidence {disputeType !== 'poor_quality' ? '(required)' : '(recommended)'}
                    </label>
                    {disputePhotos.length > 0 && (
                      <div className={styles.photoGrid} style={{ marginTop: 8, marginBottom: 8 }}>
                        {disputePhotos.map((p, i) => (
                          <div key={i} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden' }}>
                            <img src={p.preview} alt={`Evidence ${i + 1}`} style={{ width: '100%', maxHeight: 120, objectFit: 'cover' }} />
                            <button type="button" onClick={() => {
                              URL.revokeObjectURL(p.preview)
                              setDisputePhotos(prev => prev.filter((_, j) => j !== i))
                            }} style={{ position: 'absolute', top: 2, right: 2, width: 20, height: 20, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                    <button className="btn btn-outline btn-sm" onClick={() => setShowDisputeCamera(true)} style={{ width: '100%' }}>
                      📸 {disputePhotos.length > 0 ? 'Take Another Photo' : 'Take Photo'}
                    </button>
                  </div>
                )}

                {/* Optional notes */}
                <textarea
                  value={disputeReason}
                  onChange={e => setDisputeReason(e.target.value)}
                  placeholder="Additional details (optional)..."
                  rows={2}
                  style={{ marginBottom: 12 }}
                />

                <div className={styles.modalActions}>
                  <button
                    className="btn btn-danger"
                    disabled={actionLoading
                      || (disputeType === 'quantity_mismatch' && (!disputeQuantityReceived || disputePhotos.length === 0))
                      || (disputeType === 'wrong_item' && disputePhotos.length === 0)
                    }
                    onClick={async () => {
                      // Upload evidence photos
                      const photoUrls: any[] = []
                      for (const photo of disputePhotos) {
                        const path = `disputes/${orderId}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
                        const { error } = await supabase.storage.from('order-evidence').upload(path, photo.result.file)
                        if (!error) {
                          const { data: urlData } = supabase.storage.from('order-evidence').getPublicUrl(path)
                          photoUrls.push({ url: urlData.publicUrl, ...photo.result.meta })
                        }
                      }
                      const reason = disputeReason.trim() || disputeType!.replace(/_/g, ' ')
                      await callRpc('buyer_dispute_order', {
                        p_order_id: orderId,
                        p_reason: reason,
                        p_photos: photoUrls,
                        p_dispute_type: disputeType,
                        p_quantity_received: disputeType === 'quantity_mismatch' ? parseInt(disputeQuantityReceived) : null,
                      })

                      // Send dispute reason as first chat message
                      const typeLabel = disputeType!.replace(/_/g, ' ')
                      const chatMsg = `⚠️ Dispute filed: ${typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1)}${reason !== typeLabel ? '\n' + reason : ''}`
                      await supabase.from('order_chat_messages').insert({
                        order_id: orderId,
                        sender_id: user!.id,
                        content: chatMsg,
                      })

                      disputePhotos.forEach(p => URL.revokeObjectURL(p.preview))
                      setDisputePhotos([])
                      setDisputeType(null)
                      setDisputeReason('')
                      setDisputeQuantityReceived('')
                      setShowDispute(false)
                      setShowChat(true) // Auto-open chat
                    }}
                  >
                    Submit Dispute
                  </button>
                  <button className="btn btn-outline" onClick={() => {
                    disputePhotos.forEach(p => URL.revokeObjectURL(p.preview))
                    setDisputePhotos([])
                    setDisputeType(null)
                    setDisputeReason('')
                    setShowDispute(false)
                  }}>Cancel</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Pickup decline modal */}
      {showPickupDecline && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <h3>Decline Pickup</h3>
            <p>The order will be cancelled and you will not be charged.</p>
            <textarea
              value={pickupDeclineReason}
              onChange={e => setPickupDeclineReason(e.target.value)}
              placeholder="Reason for declining (e.g., produce quality issue)..."
              rows={3}
            />
            <div className={styles.modalActions}>
              <button className="btn btn-danger" disabled={!pickupDeclineReason.trim() || actionLoading}
                onClick={async () => {
                  await callRpc('buyer_decline_pickup', { p_order_id: orderId, p_reason: pickupDeclineReason, p_photos: JSON.stringify([]) })
                  setShowPickupDecline(false)
                }}>
                Decline Pickup
              </button>
              <button className="btn btn-outline" onClick={() => setShowPickupDecline(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== DELIVERY/PICKUP PROOF MODAL ===== */}
      {showDeliveryProof && (
        <div className={styles.fullscreenModal}>
          <div className={styles.modalHeader}>
            <button className={styles.modalClose} onClick={() => {
              proofPhotos.forEach(p => URL.revokeObjectURL(p.preview))
              setProofPhotos([])
              setShowDeliveryProof(false)
              setShowCamera(false)
              setLocationWarning(null)
            }}>← Back</button>
            <h2>{order.fulfillment_type === 'pickup' ? 'Pickup Proof' : 'Delivery Proof'}</h2>
            <div style={{ width: 60 }} />
          </div>

          <div className={styles.modalBody}>
            {/* Location mismatch warning */}
            {locationWarning && (
              <div style={{ background: '#FFF3CD', border: '1px solid #FFECB5', borderRadius: 12, padding: '12px 14px', marginBottom: 16, fontSize: 13 }}>
                <div style={{ fontWeight: 700, marginBottom: 4, color: '#856404' }}>⚠️ Location Mismatch</div>
                <div style={{ color: '#664D03' }}>{locationWarning}</div>
                <div style={{ marginTop: 6, color: '#856404', fontWeight: 600 }}>
                  📸 Please take a photo of the door, gate, or house to help identify the drop-off location in case of a dispute.
                </div>
              </div>
            )}
            {/* Captured photos */}
            {proofPhotos.length > 0 && (
              <>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-600)', marginBottom: 8 }}>
                  {proofPhotos.length} photo{proofPhotos.length !== 1 ? 's' : ''} captured
                </p>
                <div className={styles.photoGrid} style={{ marginBottom: 16 }}>
                  {proofPhotos.map((p, i) => (
                    <div key={i} style={{ position: 'relative', borderRadius: 12, overflow: 'hidden' }}>
                      <img src={p.preview} alt={`Proof ${i + 1}`} style={{ width: '100%', maxHeight: 200, objectFit: 'contain', background: '#f0f0f0' }} />
                      {p.result.meta.latitude && (
                        <span style={{ position: 'absolute', bottom: 2, left: 4, fontSize: 9, color: '#fff', background: 'rgba(0,0,0,0.5)', padding: '1px 4px', borderRadius: 4 }}>
                          📍 {p.result.meta.latitude.toFixed(4)}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          URL.revokeObjectURL(p.preview)
                          setProofPhotos(prev => prev.filter((_, j) => j !== i))
                        }}
                        style={{ position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >✕</button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Take photo button */}
            <button
              className="btn btn-outline"
              style={{ width: '100%', marginBottom: 12 }}
              onClick={() => setShowCamera(true)}
            >
              📸 {proofPhotos.length > 0 ? 'Take Another Photo' : 'Take Photo'}
            </button>

            {/* Submit */}
            <button
              className="btn btn-primary"
              style={{ width: '100%' }}
              disabled={proofPhotos.length === 0 || uploading}
              onClick={async () => {
                setUploading(true)
                try {
                  const proofUrls: any[] = []
                  for (const photo of proofPhotos) {
                    const path = `${orderId}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
                    const { error } = await supabase.storage.from('order-evidence').upload(path, photo.result.file)
                    if (error) {
                      console.error('Storage upload error:', error)
                    } else {
                      const { data: urlData } = supabase.storage.from('order-evidence').getPublicUrl(path)
                      proofUrls.push({
                        url: urlData.publicUrl,
                        ...photo.result.meta,
                      })
                    }
                  }
                  const rpc = order.fulfillment_type === 'pickup' ? 'seller_mark_ready_pickup' : 'seller_mark_delivered'
                  await callRpc(rpc, { p_order_id: orderId, p_proof: proofUrls })
                  proofPhotos.forEach(p => URL.revokeObjectURL(p.preview))
                  setProofPhotos([])
                  setShowDeliveryProof(false)
                } finally {
                  setUploading(false)
                }
              }}
            >
              {uploading ? 'Uploading & marking delivered...' : `✓ Confirm Delivery (${proofPhotos.length} photo${proofPhotos.length !== 1 ? 's' : ''})`}
            </button>
          </div>
        </div>
      )}

      {/* Camera overlay (shared component) — single capture, returns to proof view */}
      {showCamera && (
        <CameraCapture
          captureLabel="📸 Capture Photo"
          closeLabel="✕ Cancel"
          onCapture={async (result) => {
            const preview = URL.createObjectURL(result.file)
            setProofPhotos(prev => [...prev, { preview, result }])
            setShowCamera(false)

            // Check distance from buyer's address (delivery only)
            if (order.fulfillment_type === 'delivery' && result.meta.latitude && order.buyer_address) {
              try {
                // Geocode buyer address if not cached
                let coords = buyerCoords
                if (!coords) {
                  const geo = await geocodeAddress(order.buyer_address)
                  if (geo) {
                    coords = { lat: geo.lat, lng: geo.lng }
                    setBuyerCoords(coords)
                  }
                }
                if (coords) {
                  const distM = haversineMeters(result.meta.latitude, result.meta.longitude!, coords.lat, coords.lng)
                  if (distM > 50) { // 50 meters
                    setLocationWarning(
                      `Your photo was taken ~${distM < 1000 ? Math.round(distM) + 'm' : (distM / 1000).toFixed(1) + 'km'} from the buyer's address.`
                    )
                  } else {
                    setLocationWarning(null)
                  }
                }
              } catch {
                // geocoding failed silently
              }
            }
          }}
          onClose={() => setShowCamera(false)}
        />
      )}

      {/* Camera overlay for dispute evidence */}
      {showDisputeCamera && (
        <CameraCapture
          captureLabel="📸 Capture Evidence"
          closeLabel="✕ Cancel"
          onCapture={(result) => {
            const preview = URL.createObjectURL(result.file)
            setDisputePhotos(prev => [...prev, { preview, result }])
            setShowDisputeCamera(false)
          }}
          onClose={() => setShowDisputeCamera(false)}
        />
      )}
    </div>
  )
}
