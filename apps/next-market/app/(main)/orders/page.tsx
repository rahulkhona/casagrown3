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

interface HelperOrder {
  order_id: string
  product_name: string
  quantity: number
  status: string
  fulfillment_type: string
  buyer_name: string
  booth_name: string
  booth_id: string
  seller_name: string
  total_usd: number
  created_at: string
  delivered_by_name: string | null
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
  const [helperOrders, setHelperOrders] = useState<HelperOrder[]>([])
  const [isHelper, setIsHelper] = useState(false)
  const [role, setRole] = useState<'selling' | 'buying' | 'helping'>(searchParams.get('role') === 'buying' ? 'buying' : searchParams.get('role') === 'helping' ? 'helping' : 'selling')
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

  // Check if user is a helper for any booth and load helper queue
  const loadHelperOrders = useCallback(async () => {
    if (!user) return
    const { count } = await supabase
      .from('booth_helpers')
      .select('*', { count: 'exact', head: true })
      .eq('helper_id', user.id)
      .eq('status', 'accepted')
    setIsHelper((count || 0) > 0)

    if ((count || 0) > 0) {
      const { data } = await supabase.rpc('get_helper_queue')
      if (data) setHelperOrders(data)
    }
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadHelperOrders() }, [loadHelperOrders])

  useEffect(() => {
    if (!user) return
    const id = setInterval(() => { loadOrders(); if (isHelper) loadHelperOrders() }, 15_000)
    return () => clearInterval(id)
  }, [user?.id, loadOrders, loadHelperOrders, isHelper])

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
  const helpingCount = helperOrders.length

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
        {isHelper && (
          <button
            className={`${styles.roleBtn} ${role === 'helping' ? styles.roleBtnActive : ''}`}
            onClick={() => { setRole('helping'); setTab('all') }}
          >
            🤝 Helping
            {helpingCount > 0 && <span className={styles.tabCount}>{helpingCount}</span>}
          </button>
        )}
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

      {/* Helper view: grouped by booth */}
      {role === 'helping' ? (
        helperOrders.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🤝</div>
            <div className="empty-state-title">No active orders</div>
            <div className="empty-state-text">Orders for booths you help will appear here</div>
          </div>
        ) : (
          <div className={styles.orderList}>
            {/* Group by booth */}
            {Array.from(new Set(helperOrders.map(o => o.booth_name))).map(boothName => (
              <div key={boothName}>
                <div style={{
                  padding: '12px 0 6px', fontWeight: 600, fontSize: 15,
                  borderBottom: '1px solid var(--gray-200)', marginBottom: 8,
                  color: 'var(--gray-700)',
                }}>
                  📍 {boothName}
                  <span style={{ fontWeight: 400, fontSize: 12, marginLeft: 8, color: 'var(--gray-400)' }}>
                    {helperOrders.filter(o => o.booth_name === boothName).length} orders
                  </span>
                </div>
                {helperOrders.filter(o => o.booth_name === boothName).map(order => {
                  const config = STATUS_CONFIG[order.status] || { label: order.status, color: 'var(--gray-500)', icon: '•' }
                  return (
                    <Link key={order.order_id} href={`/orders/${order.order_id}`} className={styles.orderCard}>
                      <div className={styles.orderHeader}>
                        <div>
                          <div className={styles.productName}>{order.product_name}</div>
                          <div className={styles.orderMeta}>
                            <span>{order.fulfillment_type === 'delivery' ? '🚗 Delivery' : '📍 Pickup'}</span>
                            <span>•</span>
                            <span>for {order.buyer_name}</span>
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
                          <span>{order.quantity} × {formatUsd(Number(order.total_usd) / order.quantity)}</span>
                          <span className={styles.totalPrice}>{formatUsd(Number(order.total_usd))}</span>
                        </div>
                      </div>
                      {order.delivered_by_name && (
                        <div className={styles.hint}>✅ Delivered by {order.delivered_by_name}</div>
                      )}
                    </Link>
                  )
                })}
              </div>
            ))}
          </div>
        )
      ) : (
      <>

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
      ) : (() => {
        // Group by buyer for seller's pending tabs
        const shouldGroup = role === 'selling' && (tab === 'pending_delivery' || tab === 'pending_pickup')
        if (!shouldGroup) {
          // Flat list for non-grouped views
          return (
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
                    {order.status === 'delivered' && order.buyer_id === user!.id && order.auto_complete_at && (
                      <div className={styles.hint}>
                        ⏰ Auto-completes {new Date(order.auto_complete_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
                    {order.status === 'ready_for_pickup' && (
                      <div className={styles.hint}>
                        📍 {order.buyer_id === user!.id ? 'Show your passcode at pickup' : 'Enter buyer\'s passcode to complete'}
                      </div>
                    )}
                    {order.status === 'pending' && order.seller_id === user!.id && (
                      <div className={styles.hint}>
                        ⏳ Waiting for you to process this order
                      </div>
                    )}
                  </Link>
                )
              })}
            </div>
          )
        }

        // Grouped by buyer for seller's pending tabs
        const buyerGroups = new Map<string, { buyerId: string; buyerName: string; buyerAvatar: string | null; orders: MarketOrder[] }>()
        filtered.forEach(order => {
          const key = order.buyer_id
          if (!buyerGroups.has(key)) {
            buyerGroups.set(key, { buyerId: order.buyer_id, buyerName: order.buyer_name || 'Unknown', buyerAvatar: order.buyer_avatar || null, orders: [] })
          }
          buyerGroups.get(key)!.orders.push(order)
        })

        return (
          <div className={styles.orderList}>
            {Array.from(buyerGroups.values()).map(group => {
              const groupTotal = group.orders.reduce((sum, o) => sum + o.total_usd, 0)
              return (
                <div key={group.buyerId}>
                  {/* Buyer group header */}
                  <div style={{
                    padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    borderBottom: '2px solid var(--green-200)', marginBottom: 8, marginTop: 12,
                    background: 'var(--green-50, #f0fdf4)', borderRadius: '10px 10px 0 0',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {group.buyerAvatar ? (
                        <img src={group.buyerAvatar} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
                      ) : (
                        <span style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--green-200)', color: 'var(--green-700)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>
                          {group.buyerName.charAt(0).toUpperCase()}
                        </span>
                      )}
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--gray-800)' }}>
                          {group.buyerName}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                          {group.orders.length} item{group.orders.length !== 1 ? 's' : ''} · {formatUsd(groupTotal)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Individual orders in this group */}
                  {group.orders.map(order => {
                    const config = STATUS_CONFIG[order.status] || { label: order.status, color: 'var(--gray-500)', icon: '•' }
                    return (
                      <Link key={order.id} href={`/orders/${order.id}`} className={styles.orderCard} style={{ marginLeft: 8 }}>
                        <div className={styles.orderHeader}>
                          <div>
                            <div className={styles.productName}>{order.product_name}</div>
                            <div className={styles.orderMeta}>
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
                        {order.status === 'pending' && (
                          <div className={styles.hint}>⏳ Waiting for you to process</div>
                        )}
                      </Link>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )
      })()}
      </>
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
