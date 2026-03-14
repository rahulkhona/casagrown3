'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '../../../lib/supabase'
import { useAuth } from '../../../lib/useAuth'
import styles from './page.module.css'

interface MarketOrder {
  id: string
  buyer_id: string
  seller_id: string
  product_name: string
  quantity: number
  unit_price_usd: number
  subtotal_usd: number
  tax_amount_usd: number
  total_usd: number
  fulfillment_type: 'delivery' | 'pickup'
  status: string
  created_at: string
  delivered_at: string | null
  auto_complete_at: string | null
  completed_at: string | null
  decline_reason: string | null
  buyer_passcode: string | null
  seller_passcode: string | null
  // joined fields
  buyer_name?: string
  seller_name?: string
  booth_name?: string
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  pending:          { label: 'Pending',          color: 'var(--amber-600, #d97706)', icon: '⏳' },
  delivering:       { label: 'On the Way',       color: 'var(--blue-600, #2563eb)',  icon: '🚗' },
  delivered:        { label: 'Delivered',         color: 'var(--green-600)',          icon: '📦' },
  completed:        { label: 'Completed',         color: 'var(--green-700)',          icon: '✓' },
  ready_for_pickup: { label: 'Ready for Pickup',  color: 'var(--blue-600, #2563eb)',  icon: '📍' },
  declined:         { label: 'Declined',          color: 'var(--gray-500)',           icon: '✕' },
  cancelled:        { label: 'Cancelled',         color: 'var(--gray-500)',           icon: '✕' },
  disputed:         { label: 'Disputed',          color: 'var(--red-600, #dc2626)',   icon: '⚠️' },
  escalated:        { label: 'Escalated',         color: 'var(--red-600, #dc2626)',   icon: '🔺' },
  resolved:         { label: 'Resolved',          color: 'var(--gray-500)',           icon: '✓' },
  pickup_declined:  { label: 'Pickup Declined',   color: 'var(--gray-500)',           icon: '✕' },
  confirmed:        { label: 'Confirmed',         color: 'var(--green-700)',          icon: '✓' },
}

const ACTIVE_STATUSES = ['pending', 'delivering', 'delivered', 'ready_for_pickup', 'confirmed']
const PAST_STATUSES = ['completed', 'resolved', 'declined', 'cancelled', 'pickup_declined']
const DISPUTED_STATUSES = ['disputed', 'escalated']

function formatUsd(n: number) {
  return '$' + n.toFixed(2)
}

export default function OrdersPage() {
  const supabase = createClient()
  const router = useRouter()
  const { user, isAuthenticated, loading: authLoading } = useAuth()
  const [orders, setOrders] = useState<MarketOrder[]>([])
  const [tab, setTab] = useState<'active' | 'past' | 'disputed'>('active')
  const [loading, setLoading] = useState(true)

  const loadOrders = useCallback(async () => {
    if (!user) return
    setLoading(true)

    // Fetch orders where user is buyer or seller
    const { data } = await supabase
      .from('market_orders')
      .select(`
        *,
        buyer:buyer_id(full_name),
        seller:seller_id(full_name),
        booth:booth_id(name)
      `)
      .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
      .order('created_at', { ascending: false })

    if (data) {
      setOrders(data.map((o: any) => ({
        ...o,
        buyer_name: o.buyer?.full_name || 'Unknown',
        seller_name: o.seller?.full_name || 'Unknown',
        booth_name: o.booth?.name || 'Unknown Booth',
      })))
    }
    setLoading(false)
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadOrders() }, [loadOrders])

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push('/login?redirect=/orders')
  }, [authLoading, isAuthenticated, router])

  if (authLoading || !isAuthenticated) {
    return <div className="container" style={{ padding: '80px 20px', textAlign: 'center' }}><p>Loading...</p></div>
  }

  if (loading) {
    return <div className="container" style={{ padding: '80px 20px', textAlign: 'center' }}><p>Loading orders...</p></div>
  }

  const filtered = orders.filter(o => {
    if (tab === 'active') return ACTIVE_STATUSES.includes(o.status)
    if (tab === 'past') return PAST_STATUSES.includes(o.status)
    return DISPUTED_STATUSES.includes(o.status)
  })

  const activeCount = orders.filter(o => ACTIVE_STATUSES.includes(o.status)).length
  const disputedCount = orders.filter(o => DISPUTED_STATUSES.includes(o.status)).length

  return (
    <div className="container">
      <div className="page-header"><h1 className="page-title">Orders</h1></div>

      <div className="tabs">
        {([
          { key: 'active', label: 'Active', count: activeCount },
          { key: 'past', label: 'Past', count: 0 },
          { key: 'disputed', label: 'Disputed', count: disputedCount },
        ] as const).map(t => (
          <button
            key={t.key}
            className={`tab ${tab === t.key ? 'tab-active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`badge ${t.key === 'disputed' ? 'badge-red' : 'badge-green'}`} style={{ marginLeft: 6 }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📦</div>
          <div className="empty-state-title">No {tab} orders</div>
          <div className="empty-state-text">
            {tab === 'active' ? 'Orders you place or receive will appear here' : 
             tab === 'disputed' ? 'No disputes — great!' : 
             'Completed orders will appear here'}
          </div>
          <Link href="/market" className="btn btn-primary">Browse Market</Link>
        </div>
      ) : (
        <div className={styles.orderList}>
          {filtered.map(order => {
            const config = STATUS_CONFIG[order.status] || { label: order.status, color: 'var(--gray-500)', icon: '•' }
            const isBuyer = order.buyer_id === user!.id
            const role = isBuyer ? 'Buyer' : 'Seller'
            const otherParty = isBuyer ? order.seller_name : order.buyer_name

            return (
              <Link key={order.id} href={`/orders/${order.id}`} className={styles.orderCard}>
                <div className={styles.orderHeader}>
                  <div>
                    <div className={styles.productName}>{order.product_name}</div>
                    <div className={styles.orderMeta}>
                      <span className={styles.roleBadge} style={{ background: isBuyer ? 'var(--blue-50, #eff6ff)' : 'var(--green-50)', color: isBuyer ? 'var(--blue-700, #1d4ed8)' : 'var(--green-700)' }}>
                        {role}
                      </span>
                      <span>{order.fulfillment_type === 'delivery' ? '🚗 Delivery' : '📍 Pickup'}</span>
                      <span>•</span>
                      <span>{new Date(order.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className={styles.statusBadge} style={{ background: config.color }}>
                    {config.icon} {config.label}
                  </div>
                </div>

                <div className={styles.orderDetails}>
                  <div className={styles.detailRow}>
                    <span>{isBuyer ? 'Seller' : 'Buyer'}</span>
                    <span>{otherParty}</span>
                  </div>
                  <div className={styles.detailRow}>
                    <span>{order.quantity} × {formatUsd(order.unit_price_usd)}</span>
                    <span className={styles.totalPrice}>{formatUsd(order.total_usd)}</span>
                  </div>
                </div>

                {/* Quick status hints */}
                {order.status === 'delivered' && isBuyer && order.auto_complete_at && (
                  <div className={styles.hint}>
                    ⏰ Auto-completes {new Date(order.auto_complete_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
                {order.status === 'ready_for_pickup' && (
                  <div className={styles.hint}>
                    📍 {isBuyer ? 'Show your passcode at pickup' : 'Enter buyer\'s passcode to complete'}
                  </div>
                )}
                {order.status === 'pending' && !isBuyer && (
                  <div className={styles.hint}>
                    ⏳ Waiting for you to process this order
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
