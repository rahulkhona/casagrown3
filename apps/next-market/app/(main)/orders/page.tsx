'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
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

export default function OrdersPage() {
  const supabase = createClient()
  const router = useRouter()
  const { user, isAuthenticated, loading: authLoading } = useAuth()
  const [orders, setOrders] = useState<MarketOrder[]>([])
  const [role, setRole] = useState<'selling' | 'buying'>('selling')
  const [tab, setTab] = useState('pending_delivery')
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
    return <div className="container" style={{ padding: '80px 20px', textAlign: 'center' }}><p>Loading...</p></div>
  }

  if (loading) {
    return <div className="container" style={{ padding: '80px 20px', textAlign: 'center' }}><p>Loading orders...</p></div>
  }

  // Filter by role first (selling vs buying)
  const roleOrders = orders.filter(o =>
    role === 'selling' ? o.seller_id === user!.id : o.buyer_id === user!.id
  )

  // Tab filter functions — filter by status AND fulfillment type
  const tabMatchers: Record<string, (o: MarketOrder) => boolean> = {
    pending_delivery:  o => o.status === 'pending' && o.fulfillment_type === 'delivery',
    pending_pickup:    o => o.status === 'pending' && o.fulfillment_type === 'pickup',
    pending_confirm:   o => ['delivered', 'ready_for_pickup', 'confirmed'].includes(o.status),
    disputed:          o => ['disputed', 'escalated'].includes(o.status),
    completed:         o => ['completed', 'resolved', 'declined', 'cancelled', 'pickup_declined'].includes(o.status),
  }

  const filtered = roleOrders
    .filter(o => tabMatchers[tab]?.(o) ?? false)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  // Tab definitions with short labels for mobile
  const tabDefs = [
    { key: 'pending_delivery', label: 'Pending Delivery', short: 'Delivery',  icon: '🚗' },
    { key: 'pending_pickup',   label: 'Pending Pickup',   short: 'Pickup',    icon: '📍' },
    { key: 'pending_confirm',  label: 'Pending Confirmation', short: 'Confirm', icon: '⏳' },
    { key: 'disputed',         label: 'Disputed',         short: 'Disputed',  icon: '⚠️' },
    { key: 'completed',        label: 'Completed',        short: 'Done',      icon: '✓' },
  ]

  const tabs = tabDefs.map(t => ({
    ...t,
    count: roleOrders.filter(o => tabMatchers[t.key]?.(o) ?? false).length,
  }))

  const sellingCount = orders.filter(o => o.seller_id === user!.id && ACTIVE_STATUSES.includes(o.status)).length
  const buyingCount = orders.filter(o => o.buyer_id === user!.id && ACTIVE_STATUSES.includes(o.status)).length

  // Scroll fade: detect when scrolled to end
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrolledEnd, setScrolledEnd] = useState(false)
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
          🏪 <span className={styles.tabLabelFull}>My Sales</span><span className={styles.tabLabelShort}>Sales</span>
          {sellingCount > 0 && <span className={styles.tabCount}>{sellingCount}</span>}
        </button>
        <button
          className={`${styles.roleBtn} ${role === 'buying' ? styles.roleBtnActive : ''}`}
          onClick={() => { setRole('buying'); setTab('pending_delivery') }}
        >
          🛒 <span className={styles.tabLabelFull}>My Purchases</span><span className={styles.tabLabelShort}>Purchases</span>
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
              <span className={styles.tabLabelFull}>{t.label}</span>
              <span className={styles.tabLabelShort}>{t.short}</span>
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
            const role = isBuyer ? 'Buyer' : 'Seller'
            const otherParty = isBuyer ? order.seller_name : order.buyer_name

            return (
              <Link key={order.id} href={`/orders/${order.id}`} className={styles.orderCard}>
                <div className={styles.orderHeader}>
                  <div>
                    <div className={styles.productName}>{order.product_name}</div>
                    <div className={styles.orderMeta}>
                      <span>{isBuyer ? `Bought from ${order.seller_name}` : `Selling to ${order.buyer_name}`}</span>
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
