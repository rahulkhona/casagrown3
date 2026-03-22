'use client'

import { LoadingSpinner } from '../../components/LoadingSpinner'
import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
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
  buyer_avatar?: string | null
  seller_avatar?: string | null
  booth_name?: string
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  pending:          { label: 'Pending',          color: 'var(--amber-600, #d97706)', icon: '⏳' },
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

const ACTIVE_STATUSES = ['pending', 'delivered', 'ready_for_pickup', 'confirmed']
const PAST_STATUSES = ['completed', 'resolved', 'declined', 'cancelled', 'pickup_declined']
const DISPUTED_STATUSES = ['disputed', 'escalated']

function formatUsd(n: number) {
  return '$' + n.toFixed(2)
}

function OrdersContent() {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, isAuthenticated, loading: authLoading } = useAuth()
  const [orders, setOrders] = useState<MarketOrder[]>([])
  const [role, setRole] = useState<'selling' | 'buying'>(searchParams.get('role') === 'buying' ? 'buying' : 'selling')
  const [tab, setTab] = useState('pending_delivery')
  const [loading, setLoading] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrolledEnd, setScrolledEnd] = useState(false)

  const loadOrders = useCallback(async () => {
    if (!user) return
    setLoading(true)

    // Fetch orders where user is buyer or seller
    const { data } = await supabase
      .from('market_orders')
      .select(`
        *,
        buyer:buyer_id(full_name, avatar_url),
        seller:seller_id(full_name, avatar_url),
        booth:booth_id(name)
      `)
      .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
      .order('created_at', { ascending: false })

    if (data) {
      setOrders(data.map((o: any) => ({
        ...o,
        buyer_name: o.buyer?.full_name || 'Unknown',
        seller_name: o.seller?.full_name || 'Unknown',
        buyer_avatar: o.buyer?.avatar_url || null,
        seller_avatar: o.seller?.avatar_url || null,
        booth_name: o.booth?.name || 'Unknown Booth',
      })))
    }
    setLoading(false)
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadOrders() }, [loadOrders])

  // Fast poll: refresh orders every 15s while on this page
  useEffect(() => {
    if (!user) return
    const id = setInterval(loadOrders, 15_000)
    return () => clearInterval(id)
  }, [user?.id, loadOrders])

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push('/login?redirect=/orders')
  }, [authLoading, isAuthenticated, router])

  if (authLoading || !isAuthenticated) {
    return <LoadingSpinner />
  }

  if (loading) {
    return <div className="container" style={{ padding: '80px 20px', textAlign: 'center' }}><p>Loading orders...</p></div>
  }

  // Filter by role first (selling vs buying)
  const roleOrders = orders.filter(o =>
    role === 'selling' ? o.seller_id === user!.id : o.buyer_id === user!.id
  )

  // Tab filter functions — vary by role
  const PAST = ['completed', 'resolved', 'declined', 'cancelled', 'pickup_declined']
  const tabMatchers: Record<string, (o: MarketOrder) => boolean> = role === 'selling' ? {
    // Sellers: delivered orders go to Completed (not actionable by seller)
    pending_delivery:  o => o.status === 'pending' && o.fulfillment_type === 'delivery',
    pending_pickup:    o => o.status === 'pending' && o.fulfillment_type === 'pickup',
    disputed:          o => ['disputed', 'escalated'].includes(o.status),
    completed:         o => [...PAST, 'delivered', 'confirmed'].includes(o.status),
  } : {
    // Buyers: delivered pickup orders stay in Pickup tab; Confirmation only for deliveries
    pending_delivery:  o => o.status === 'pending' && o.fulfillment_type === 'delivery',
    pending_pickup:    o => ['pending', 'delivered'].includes(o.status) && o.fulfillment_type === 'pickup',
    pending_confirm:   o => ['delivered', 'confirmed'].includes(o.status) && o.fulfillment_type === 'delivery',
    disputed:          o => ['disputed', 'escalated'].includes(o.status),
    completed:         o => PAST.includes(o.status),
  }

  const filtered = roleOrders
    .filter(o => tabMatchers[tab]?.(o) ?? false)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  // Tab definitions — role-aware
  const tabDefs = role === 'selling' ? [
    { key: 'pending_delivery', label: 'Delivery' },
    { key: 'pending_pickup',   label: 'Pickup' },
    { key: 'disputed',         label: 'Disputed' },
    { key: 'completed',        label: 'Completed' },
  ] : [
    { key: 'pending_delivery', label: 'Delivery' },
    { key: 'pending_pickup',   label: 'Pickup' },
    { key: 'pending_confirm',  label: 'Confirmation' },
    { key: 'disputed',         label: 'Disputed' },
    { key: 'completed',        label: 'Completed' },
  ]

  const tabs = tabDefs.map(t => ({
    ...t,
    count: roleOrders.filter(o => tabMatchers[t.key]?.(o) ?? false).length,
  }))

  const sellingCount = orders.filter(o => o.seller_id === user!.id && ACTIVE_STATUSES.includes(o.status)).length
  const buyingCount = orders.filter(o => o.buyer_id === user!.id && ACTIVE_STATUSES.includes(o.status)).length

  // Scroll fade: detect when scrolled to end
  const handleTabScroll = () => {
    const el = scrollRef.current
    if (!el) return
    setScrolledEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 10)
  }

  return (
    <div className="container">
      <div className="page-header"><h1 className="page-title">Orders</h1></div>

      {/* Role toggle: segmented control */}
      <div className={styles.roleToggle}>
        <button
          className={`${styles.roleBtn} ${role === 'selling' ? styles.roleBtnActive : ''}`}
          onClick={() => { setRole('selling'); setTab('pending_delivery') }}
        >
          🏪 Sales
          {sellingCount > 0 && <span className={styles.tabCount}>{sellingCount}</span>}
        </button>
        <button
          className={`${styles.roleBtn} ${role === 'buying' ? styles.roleBtnActive : ''}`}
          onClick={() => { setRole('buying'); setTab('pending_delivery') }}
        >
          🛒 Purchases
          {buyingCount > 0 && <span className={styles.tabCount}>{buyingCount}</span>}
        </button>
      </div>

      {/* Status pills: horizontally scrollable with fade hint */}
      <div className={`${styles.scrollTabsWrap} ${scrolledEnd ? styles.scrollEnd : ''}`}>
        <div className={styles.scrollTabs} ref={scrollRef} onScroll={handleTabScroll}>
          {tabs.map(t => (
            <button
              key={t.key}
              className={`${styles.tabPill} ${tab === t.key ? styles.tabPillActive : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
              {t.count > 0 && <span className={styles.tabCount}>{t.count}</span>}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📦</div>
          <div className="empty-state-title">No orders here</div>
          <div className="empty-state-text">
            {tab === 'disputed' ? 'No disputes — great!' :
             tab === 'completed' ? 'Completed orders will appear here' :
             `No ${tabDefs.find(t => t.key === tab)?.label?.toLowerCase() || tab} orders`}
          </div>
          <Link href="/market" className="btn btn-primary">Browse Market</Link>
        </div>
      ) : (
        <div className={styles.orderList}>
          {filtered.map(order => {
            const config = STATUS_CONFIG[order.status] || { label: order.status, color: 'var(--gray-500)', icon: '•' }
            const isBuyer = order.buyer_id === user!.id
            const otherName = isBuyer ? order.seller_name : order.buyer_name
            const otherAvatar = isBuyer ? order.seller_avatar : order.buyer_avatar

            return (
              <Link key={order.id} href={`/orders/${order.id}`} className={styles.orderCard}>
                <div className={styles.orderHeader}>
                  <div>
                    <div className={styles.productName}>{order.product_name}</div>
                    <div className={styles.orderMeta}>
                      {otherAvatar ? (
                        <img src={otherAvatar} alt="" style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover' }} />
                      ) : (
                        <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--green-100)', color: 'var(--green-700)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                          {(otherName || '?').charAt(0).toUpperCase()}
                        </span>
                      )}
                      <span>{isBuyer ? `Bought from ${otherName}` : `Selling to ${otherName}`}</span>
                      <span>•</span>
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

export default function OrdersPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <OrdersContent />
    </Suspense>
  )
}
