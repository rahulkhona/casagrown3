'use client'

import { use, useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '../../../../lib/supabase'
import { useAuth } from '../../../../lib/useAuth'
import styles from './page.module.css'

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
  booth_name: string
}

interface Dispute {
  id: string
  reason: string
  photos: any[]
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
  const [disputeReason, setDisputeReason] = useState('')
  const [showRefund, setShowRefund] = useState(false)
  const [refundType, setRefundType] = useState<'full' | 'partial'>('full')
  const [refundAmount, setRefundAmount] = useState('')
  const [pickupOffered, setPickupOffered] = useState(false)
  const [passcodeInput, setPasscodeInput] = useState('')
  const [showPickupDecline, setShowPickupDecline] = useState(false)
  const [pickupDeclineReason, setPickupDeclineReason] = useState('')
  const [newMessage, setNewMessage] = useState('')
  const [countdown, setCountdown] = useState('')
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadOrder = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('market_orders')
      .select('*, buyer:buyer_id(full_name), seller:seller_id(full_name), booth:booth_id(name)')
      .eq('id', orderId)
      .single()

    if (data) {
      setOrder({
        ...data,
        buyer_name: (data as any).buyer?.full_name || 'Unknown',
        seller_name: (data as any).seller?.full_name || 'Unknown',
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
        {order.delivery_proof && order.delivery_proof.length > 0 && (
          <div className={styles.proofSection}>
            <h3 className={styles.subTitle}>Delivery Proof</h3>
            <div className={styles.photoGrid}>
              {order.delivery_proof.map((p: any, i: number) => (
                <div key={i} className={styles.proofPhoto}>
                  <img src={typeof p === 'string' ? p : p.url} alt={`Proof ${i + 1}`} />
                  {p.timestamp && <span className={styles.photoTime}>{new Date(p.timestamp).toLocaleTimeString()}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ===== ACTION PANELS ===== */}

      {/* SELLER: Pending delivery order → Mark Delivered or Decline */}
      {isSeller && order.status === 'pending' && order.fulfillment_type === 'delivery' && (
        <div className={styles.actionPanel}>
          <h2 className={styles.sectionTitle}>Actions</h2>
          <p className={styles.actionHint}>Upload geotagged photos as proof of delivery</p>
          <div className={styles.actionButtons}>
            <button className="btn btn-primary" disabled={actionLoading}
              onClick={() => {
                callRpc('seller_mark_delivered', { p_order_id: orderId, p_proof: JSON.stringify([]) })
              }}>
              📦 Mark Delivered
            </button>
            <button className="btn btn-outline" onClick={() => setShowDecline(true)}>
              ✕ Decline Order
            </button>
          </div>
        </div>
      )}

      {/* SELLER: Pending pickup → Mark Ready */}
      {isSeller && order.status === 'pending' && order.fulfillment_type === 'pickup' && (
        <div className={styles.actionPanel}>
          <h2 className={styles.sectionTitle}>Actions</h2>
          <div className={styles.actionButtons}>
            <button className="btn btn-primary" disabled={actionLoading}
              onClick={() => callRpc('seller_mark_ready_pickup', { p_order_id: orderId })}>
              📍 Mark Ready for Pickup
            </button>
            <button className="btn btn-outline" onClick={() => setShowDecline(true)}>
              ✕ Decline Order
            </button>
          </div>
        </div>
      )}

      {/* BUYER: Delivered → Confirm or Dispute */}
      {isBuyer && order.status === 'delivered' && (
        <div className={styles.actionPanel}>
          <h2 className={styles.sectionTitle}>Confirm Receipt</h2>
          <div className={styles.actionButtons}>
            <button className="btn btn-primary" disabled={actionLoading}
              onClick={() => callRpc('buyer_confirm_delivery', { p_order_id: orderId })}>
              ✓ Confirm Delivery
            </button>
            <button className="btn btn-danger" onClick={() => setShowDispute(true)}>
              ⚠️ Dispute
            </button>
          </div>
        </div>
      )}

      {/* PICKUP: Passcode exchange */}
      {order.status === 'ready_for_pickup' && (
        <div className={styles.actionPanel}>
          <h2 className={styles.sectionTitle}>Pickup Exchange</h2>
          <div className={styles.passcodeSection}>
            <div className={styles.passcodeDisplay}>
              <span className={styles.passcodeLabel}>Your passcode (show to {isBuyer ? 'seller' : 'buyer'})</span>
              <div className={styles.passcodeValue}>{isBuyer ? order.buyer_passcode : order.seller_passcode}</div>
            </div>

            {((isBuyer && !order.buyer_passcode_entered) || (isSeller && !order.seller_passcode_entered)) ? (
              <div className={styles.passcodeEntry}>
                <span className={styles.passcodeLabel}>Enter {isBuyer ? "seller's" : "buyer's"} passcode</span>
                <div className={styles.passcodeInputRow}>
                  <input
                    type="text"
                    className={styles.passcodeInput}
                    value={passcodeInput}
                    onChange={e => setPasscodeInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="0000"
                    maxLength={4}
                    inputMode="numeric"
                  />
                  <button className="btn btn-primary" disabled={passcodeInput.length !== 4 || actionLoading}
                    onClick={() => callRpc('enter_pickup_passcode', { p_order_id: orderId, p_passcode: passcodeInput })}>
                    Verify
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.infoBox} data-type="success">
                ✓ You've entered the passcode. Waiting for {isBuyer ? 'seller' : 'buyer'}.
              </div>
            )}
          </div>

          {isBuyer && (
            <button className="btn btn-outline btn-sm" style={{ marginTop: 12 }}
              onClick={() => setShowPickupDecline(true)}>
              ✕ Decline Pickup
            </button>
          )}
        </div>
      )}

      {/* ===== DISPUTE SECTION ===== */}
      {dispute && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Dispute</h2>

          <div className={styles.disputeCard}>
            <div className={styles.disputeHeader}>
              <span className={styles.disputeStatus} data-status={dispute.status}>
                {dispute.status.replace(/_/g, ' ')}
              </span>
              <span className={styles.disputeDate}>{new Date(dispute.created_at).toLocaleDateString()}</span>
            </div>
            <p className={styles.disputeReason}><strong>Reason:</strong> {dispute.reason}</p>

            {/* Seller's refund offer */}
            {dispute.refund_type && (
              <div className={styles.refundOffer}>
                <strong>{dispute.refund_type === 'full' ? 'Full' : 'Partial'} refund offered</strong>
                {dispute.refund_amount_usd && <span> — {formatUsd(dispute.refund_amount_usd)}</span>}
                {dispute.pickup_offered && <div className={styles.pickupOfferNote}>Seller offered to pick up the item</div>}
              </div>
            )}

            {/* Staff decision */}
            {dispute.staff_decision && (
              <div className={styles.infoBox} data-type="info">
                <strong>Staff Decision:</strong> {dispute.staff_decision}
                {dispute.staff_notes && <p>{dispute.staff_notes}</p>}
              </div>
            )}

            {/* Buyer accepts refund */}
            {isBuyer && dispute.status === 'seller_responded' && (
              <div className={styles.actionButtons} style={{ marginTop: 12 }}>
                <button className="btn btn-primary" disabled={actionLoading}
                  onClick={() => callRpc('buyer_accept_refund', { p_dispute_id: dispute.id })}>
                  ✓ Accept Refund
                </button>
                <button className="btn btn-danger" disabled={actionLoading}
                  onClick={() => callRpc('escalate_dispute', { p_dispute_id: dispute.id })}>
                  🔺 Escalate to Staff
                </button>
              </div>
            )}

            {/* Seller responds */}
            {isSeller && dispute.status === 'open' && (
              <div style={{ marginTop: 12 }}>
                <button className="btn btn-primary btn-sm" onClick={() => setShowRefund(true)}>
                  Respond to Dispute
                </button>
              </div>
            )}

            {/* Buyer resolves */}
            {isBuyer && ['open', 'escalated'].includes(dispute.status) && (
              <button className="btn btn-outline btn-sm" style={{ marginTop: 8 }} disabled={actionLoading}
                onClick={() => callRpc('buyer_resolve_dispute', { p_dispute_id: dispute.id })}>
                Resolve Dispute
              </button>
            )}

            {/* Either party escalates */}
            {['open', 'seller_responded'].includes(dispute.status) && (
              <button className="btn btn-outline btn-sm" style={{ marginTop: 8 }} disabled={actionLoading}
                onClick={() => callRpc('escalate_dispute', { p_dispute_id: dispute.id })}>
                🔺 Escalate to CasaGrown Staff
              </button>
            )}
          </div>

          {/* Dispute Messages */}
          <div className={styles.messagesSection}>
            <h3 className={styles.subTitle}>Discussion</h3>
            {disputeMessages.length === 0 ? (
              <p className={styles.emptyMessages}>No messages yet</p>
            ) : (
              <div className={styles.messageList}>
                {disputeMessages.map(m => (
                  <div key={m.id} className={`${styles.message} ${m.sender_id === user?.id ? styles.messageMine : ''}`}>
                    <div className={styles.msgMeta}>
                      <strong>{m.sender_name}</strong>
                      <span>{new Date(m.created_at).toLocaleString()}</span>
                    </div>
                    <p>{m.body}</p>
                  </div>
                ))}
              </div>
            )}
            <div className={styles.messageInput}>
              <input
                type="text"
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                placeholder="Type a message..."
                onKeyDown={e => { if (e.key === 'Enter') sendDisputeMessage() }}
              />
              <button className="btn btn-primary btn-sm" onClick={sendDisputeMessage} disabled={!newMessage.trim()}>
                Send
              </button>
            </div>
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
          <div className={styles.modalContent}>
            <h3>File a Dispute</h3>
            <p>Describe the issue with your delivery. You can upload photos as evidence.</p>
            <textarea
              value={disputeReason}
              onChange={e => setDisputeReason(e.target.value)}
              placeholder="What's wrong with the delivery?"
              rows={3}
            />
            <div className={styles.modalActions}>
              <button className="btn btn-danger" disabled={!disputeReason.trim() || actionLoading}
                onClick={async () => {
                  await callRpc('buyer_dispute_order', { p_order_id: orderId, p_reason: disputeReason, p_photos: JSON.stringify([]) })
                  setShowDispute(false)
                }}>
                Submit Dispute
              </button>
              <button className="btn btn-outline" onClick={() => setShowDispute(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Refund response modal */}
      {showRefund && dispute && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <h3>Respond to Dispute</h3>
            <div className={styles.formGroup}>
              <label>Refund Type</label>
              <div className={styles.radioGroup}>
                <label><input type="radio" checked={refundType === 'full'} onChange={() => setRefundType('full')} /> Full Refund ({formatUsd(order.total_usd)})</label>
                <label><input type="radio" checked={refundType === 'partial'} onChange={() => setRefundType('partial')} /> Partial Refund</label>
              </div>
            </div>
            {refundType === 'partial' && (
              <div className={styles.formGroup}>
                <label>Refund Amount</label>
                <input type="number" value={refundAmount} onChange={e => setRefundAmount(e.target.value)}
                  placeholder="0.00" step="0.01" max={order.total_usd} />
              </div>
            )}
            <div className={styles.formGroup}>
              <label>
                <input type="checkbox" checked={pickupOffered} onChange={e => setPickupOffered(e.target.checked)} />
                {' '}Offer to pick up the item
              </label>
            </div>
            <div className={styles.modalActions}>
              <button className="btn btn-primary" disabled={actionLoading || (refundType === 'partial' && !refundAmount)}
                onClick={async () => {
                  const amt = refundType === 'full' ? order.total_usd : parseFloat(refundAmount)
                  await callRpc('seller_respond_dispute', {
                    p_dispute_id: dispute.id,
                    p_refund_type: refundType,
                    p_refund_amount: amt,
                    p_pickup_offered: pickupOffered,
                  })
                  setShowRefund(false)
                }}>
                Send Offer
              </button>
              <button className="btn btn-outline" onClick={() => setShowRefund(false)}>Cancel</button>
            </div>
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
    </div>
  )
}
