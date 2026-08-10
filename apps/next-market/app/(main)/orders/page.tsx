'use client'

import { LoadingSpinner } from '../../components/LoadingSpinner'
import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '../../../lib/supabase'
import { useAuth } from '../../../lib/useAuth'
import { getWindowDays, anonymizeAddress } from '../../../lib/windowDisplay'
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
  buyer_address?: string | null
  seller_address?: string | null
  delivery_address?: string | null
  // Product window data (joined)
  window_dates?: any
  product_delivery_windows?: any
  product_pickup_windows?: any
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
  pending:   { label: 'Pending',   color: 'var(--amber-600, #d97706)', icon: '⏳' },
  delivered: { label: 'Delivered', color: 'var(--sky-600, #0284c7)',   icon: '📦' },
  completed: { label: 'Completed', color: 'var(--green-700)',          icon: '✓' },
  cancelled: { label: 'Cancelled', color: 'var(--gray-500)',           icon: '✕' },
  disputed:  { label: 'Disputed',  color: 'var(--red-600, #dc2626)',   icon: '⚠️' },
  escalated: { label: 'Escalated', color: 'var(--red-600, #dc2626)',   icon: '🔺' },
  resolved:  { label: 'Resolved',  color: 'var(--green-600)',          icon: '✓' },
}

function formatUsd(n: number) {
  return '$' + n.toFixed(2)
}

/** Get contextual action hint for a card */
function getHint(order: MarketOrder, userId: string): string | null {
  const isBuyer = order.buyer_id === userId
  const isSeller = order.seller_id === userId
  if (order.status === 'pending' && isSeller) return '⏳ Fulfill or decline this order'
  if (order.status === 'pending' && isBuyer) return '⏳ Seller is preparing your order'
  if (order.status === 'delivered' && isBuyer) return '✅ Confirm receipt or dispute within 4 hours'
  if (order.status === 'delivered' && isSeller) return '📦 Delivered — waiting for buyer confirmation'
  if (['disputed', 'escalated'].includes(order.status) && isSeller) return '⚠️ Respond to this dispute'
  if (['disputed', 'escalated'].includes(order.status) && isBuyer) return '⚠️ Dispute in progress'
  if (order.status === 'cancelled') return order.decline_reason ? `✕ Declined: ${order.decline_reason}` : '✕ Order cancelled'
  return null
}

function OrdersContent() {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, isAuthenticated, loading: authLoading } = useAuth()
  const [orders, setOrders] = useState<MarketOrder[]>([])
  const [helperOrders, setHelperOrders] = useState<HelperOrder[]>([])
  const [isHelper, setIsHelper] = useState(false)
  const [tab, setTab] = useState('needs_action')
  const [roleFilter, setRoleFilter] = useState<'all' | 'buying' | 'selling' | 'helping'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrolledEnd, setScrolledEnd] = useState(false)

  const loadOrders = useCallback(async () => {
    if (!user) return
    setLoading(true)

    // Step 1: Load raw orders without cross-user FK joins (profiles/market_booths are now RLS-restricted)
    const { data } = await supabase
      .from('market_orders')
      .select(`
        *,
        product:product_id(window_dates, product_delivery_windows, product_pickup_windows)
      `)
      .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
      .order('created_at', { ascending: false })

    if (data && data.length > 0) {
      // Step 2: Collect unique IDs for batch lookups
      const uniqueBuyerIds = Array.from(new Set(data.map((o: any) => o.buyer_id as string).filter(Boolean)))
      const uniqueSellerIds = Array.from(new Set(data.map((o: any) => o.seller_id as string).filter(Boolean)))
      const allProfileIds = Array.from(new Set([...uniqueBuyerIds, ...uniqueSellerIds]))
      const uniqueBoothIds = Array.from(new Set(data.map((o: any) => o.booth_id as string).filter(Boolean)))

      // Step 3: Batch fetch from public views in parallel
      const [{ data: profileRows }, { data: boothRows }] = await Promise.all([
        supabase.from('public_profiles').select('id, full_name, avatar_url').in('id', allProfileIds),
        supabase.from('public_market_booths').select('id, name, pickup_display_address').in('id', uniqueBoothIds),
      ])

      // Step 4: Build lookup maps
      const profileMap = Object.fromEntries((profileRows || []).map((p: any) => [p.id, p]))
      const boothMap = Object.fromEntries((boothRows || []).map((b: any) => [b.id, b]))

      setOrders(data.map((o: any) => ({
        ...o,
        buyer_name: profileMap[o.buyer_id]?.full_name || 'Unknown',
        seller_name: profileMap[o.seller_id]?.full_name || 'Unknown',
        buyer_avatar: profileMap[o.buyer_id]?.avatar_url || null,
        seller_avatar: profileMap[o.seller_id]?.avatar_url || null,
        booth_name: boothMap[o.booth_id]?.name || 'Unknown Stand',
        // Use only delivery_address — never fall back to buyer's profile street_address (PII)
        buyer_address: o.delivery_address || null,
        // Use only booth's pickup_display_address — never fall back to seller profile street_address (PII)
        seller_address: boothMap[o.booth_id]?.pickup_display_address || null,
        window_dates: o.product?.window_dates || null,
        product_delivery_windows: o.product?.product_delivery_windows || null,
        product_pickup_windows: o.product?.product_pickup_windows || null,
      })))
    } else if (data) {
      setOrders([])
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

  if (authLoading || !isAuthenticated) return <LoadingSpinner />
  if (loading) return <div className="container" style={{ padding: '80px 20px', textAlign: 'center' }}><p>Loading orders...</p></div>

  // ── Unified tab matchers ──
  // "Needs Action" surfaces everything needing attention regardless of buy/sell role
  const tabMatchers: Record<string, (o: MarketOrder) => boolean> = {
    needs_action: o => {
      const isBuyer = o.buyer_id === user!.id
      const isSeller = o.seller_id === user!.id
      // Seller: pending orders need fulfillment + disputes need response
      // Buyer: pending orders wait for seller + delivered orders need confirmation + disputes
      if (o.status === 'pending') return true
      if (isBuyer && o.status === 'delivered') return true
      if (['disputed', 'escalated'].includes(o.status)) return true
      return false
    },
    delivered: o => o.status === 'delivered',
    disputed: o => ['disputed', 'escalated'].includes(o.status),
    completed: o => ['completed', 'cancelled', 'resolved'].includes(o.status),
  }

  // Apply role filter + search query + tab filter
  let roleFiltered = roleFilter === 'all'
    ? orders
    : roleFilter === 'buying'
      ? orders.filter(o => o.buyer_id === user!.id)
      : orders.filter(o => o.seller_id === user!.id)

  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase()
    roleFiltered = roleFiltered.filter(o =>
      (o.product_name && o.product_name.toLowerCase().includes(q)) ||
      (o.buyer_name && o.buyer_name.toLowerCase().includes(q)) ||
      (o.seller_name && o.seller_name.toLowerCase().includes(q))
    )
  }

  const filtered = roleFiltered
    .filter(o => tabMatchers[tab]?.(o) ?? false)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  // Tab definitions with counts (always computed from full order list, not role-filtered)
  const tabDefs = [
    { key: 'needs_action', label: '🔔 Needs Action' },
    { key: 'delivered',    label: 'Delivered' },
    { key: 'disputed',     label: 'Disputed' },
    { key: 'completed',    label: 'Completed' },
  ]

  const tabs = tabDefs.map(t => {
    // Counts respect role filter
    const count = roleFiltered.filter(o => tabMatchers[t.key]?.(o) ?? false).length
    return { ...t, count }
  })

  // Scroll fade
  const handleTabScroll = () => {
    const el = scrollRef.current
    if (!el) return
    setScrolledEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 10)
  }

  return (
    <div className="container">
      <div className="page-header"><h1 className="page-title">Orders</h1></div>

      {/* ── Primary: Status Tabs ── */}
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

      {/* ── Secondary: Role Filter Pills ── */}
      <div className={styles.roleFilters}>
        {([
          { key: 'all', label: 'All' },
          { key: 'buying', label: '🛒 Buying' },
          { key: 'selling', label: '🏪 Selling' },
          ...(isHelper ? [{ key: 'helping', label: '🤝 Helping' }] : []),
        ] as { key: string; label: string }[]).map(rf => (
          <button
            key={rf.key}
            className={`${styles.filterPill} ${roleFilter === rf.key ? styles.filterPillActive : ''}`}
            onClick={() => setRoleFilter(rf.key as any)}
          >
            {rf.label}
          </button>
        ))}
      </div>

      <div className={styles.searchWrap}>
        <input 
          type="text" 
          placeholder="Search by buyer, seller, or product..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={styles.searchInput}
        />
      </div>

      {/* ── Helper View ── */}
      {isHelper && roleFilter === 'helping' ? (
        helperOrders.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🤝</div>
            <div className="empty-state-title">No active orders</div>
            <div className="empty-state-text">Orders for stands you help will appear here</div>
          </div>
        ) : (
          <div className={styles.orderList}>
            {Array.from(new Set(helperOrders.map(o => o.booth_name))).map(boothName => (
              <div key={boothName}>
                <div className={styles.groupHeader}>
                  📍 {boothName}
                  <span style={{ fontWeight: 400, fontSize: 12, marginLeft: 8, color: 'var(--gray-400)' }}>
                    {helperOrders.filter(o => o.booth_name === boothName).length} orders
                  </span>
                </div>
                {helperOrders.filter(o => o.booth_name === boothName).map(order => {
                  const config = STATUS_CONFIG[order.status] || { label: order.status, color: 'var(--gray-500)', icon: '•' }
                  return (
                    <Link key={order.order_id} href={`/orders/${order.order_id}`} className={`${styles.orderCard} ${styles.cardSelling}`}>
                      <div className={styles.orderHeader}>
                        <div>
                          <div className={styles.roleLabel} data-role="selling">HELPING</div>
                          <div className={styles.productName}>{order.product_name}</div>
                          <div className={styles.orderMeta}>
                            <span className={styles.modeChip} data-mode={order.fulfillment_type}>
                              {order.fulfillment_type === 'delivery' ? '🚗 Delivery' : '📍 Pickup'}
                            </span>
                            <span>{new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <div className={styles.counterparty}>
                            <span className={styles.avatarSmall}>{(order.buyer_name || '?').charAt(0).toUpperCase()}</span>
                            {order.buyer_name}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div className={styles.statusBadge} style={{ background: config.color }}>{config.icon} {config.label}</div>
                          <div className={styles.totalPrice}>{formatUsd(Number(order.total_usd))}</div>
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

      /* ── Main Order List ── */
      filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📦</div>
          <div className="empty-state-title">No orders here</div>
          <div className="empty-state-text">
            {tab === 'disputed' ? 'No disputes — great!' :
             tab === 'completed' ? 'Completed orders will appear here' :
             tab === 'needs_action' ? 'Nothing needs your attention right now 🎉' :
             `No ${tabDefs.find(t => t.key === tab)?.label?.toLowerCase() || tab} orders`}
          </div>
          <Link href="/market" className="btn btn-primary">Browse Market</Link>
        </div>
      ) : (() => {
        // Helper to render a single order card
        const renderCard = (order: MarketOrder) => {
          const config = STATUS_CONFIG[order.status] || { label: order.status, color: 'var(--gray-500)', icon: '•' }
          const isBuyer = order.buyer_id === user!.id
          const isSeller = order.seller_id === user!.id
          const roleCls = isSeller ? styles.cardSelling : styles.cardBuying
          const roleLabel = isSeller ? 'SELLING' : 'BUYING'
          const roleDataAttr = isSeller ? 'selling' : 'buying'
          const hint = getHint(order, user!.id)
          const location = order.fulfillment_type === 'pickup'
            ? (anonymizeAddress(order.seller_address || '') || order.seller_address)
            : order.buyer_address

          // Get fulfillment window pills for the order's mode
          const windowData = order.fulfillment_type === 'delivery'
            ? getWindowDays(order.window_dates, order.product_delivery_windows)
            : getWindowDays(order.window_dates, order.product_pickup_windows)

          return (
            <Link key={order.id} href={`/orders/${order.id}`} className={`${styles.orderCard} ${roleCls}`}>
              <div className={styles.orderHeader}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className={styles.roleLabel} data-role={roleDataAttr}>{roleLabel}</div>
                  <div className={styles.productName}>{order.product_name}</div>
                  {order.booth_name && order.booth_name !== 'Unknown Stand' && (
                    <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 2 }}>🏪 {order.booth_name}</div>
                  )}
                  <div className={styles.orderMeta}>
                    <span className={styles.modeChip} data-mode={order.fulfillment_type}>
                      {order.fulfillment_type === 'delivery' ? '🚗 Delivery' : '📍 Pickup'}
                    </span>
                    <span>{new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  {location && (
                    <div className={styles.locationLine}>📍 {location}</div>
                  )}
                  {/* Fulfillment windows for the order's selected mode */}
                  {windowData.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                      {windowData.slice(0, 2).map((day, di) => (
                        <div key={di} style={{ display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'center' }}>
                          <span style={{ fontSize: 11, color: 'var(--gray-500)', fontWeight: 500 }}>{day.label}:</span>
                          {day.pills.slice(0, 3).map((slot: string, si: number) => (
                            <span key={si} style={{
                              fontSize: 10, padding: '1px 6px', borderRadius: 8,
                              background: order.fulfillment_type === 'delivery' ? '#dcfce7' : '#dbeafe',
                              color: order.fulfillment_type === 'delivery' ? '#166534' : '#1e40af',
                              fontWeight: 500,
                            }}>{slot}</span>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div className={styles.statusBadge} style={{ background: config.color }}>
                    {config.icon} {config.label}
                  </div>
                  <div className={styles.totalPrice}>{formatUsd(order.total_usd)}</div>
                </div>
              </div>

              {/* Auto-complete countdown for buyer */}
              {order.status === 'delivered' && isBuyer && order.auto_complete_at && (
                <div className={styles.hint}>
                  ⏰ Auto-completes {new Date(order.auto_complete_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              )}

              {hint && <div className={styles.hint}>{hint}</div>}
            </Link>
          )
        }

        // ── Group by counterparty on Needs Action tab ──
        if (tab === 'needs_action') {
          // Group by counterparty (the other person)
          const groups = new Map<string, {
            otherId: string
            otherName: string
            otherAvatar: string | null
            orders: MarketOrder[]
          }>()
          filtered.forEach(order => {
            const isBuyer = order.buyer_id === user!.id
            const otherId = isBuyer ? order.seller_id : order.buyer_id
            const otherName = isBuyer ? (order.seller_name || 'Unknown') : (order.buyer_name || 'Unknown')
            const otherAvatar = isBuyer ? (order.seller_avatar || null) : (order.buyer_avatar || null)
            if (!groups.has(otherId)) {
              groups.set(otherId, { otherId, otherName, otherAvatar, orders: [] })
            }
            groups.get(otherId)!.orders.push(order)
          })

          return (
            <div className={styles.orderList}>
              {Array.from(groups.values()).map(group => {
                const groupTotal = group.orders.reduce((sum, o) => sum + o.total_usd, 0)
                return (
                  <div key={group.otherId} className={styles.counterpartyGroup}>
                    {/* Group header */}
                    <div className={styles.counterpartyGroupHeader}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {group.otherAvatar ? (
                          <img src={group.otherAvatar} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
                        ) : (
                          <span className={styles.avatarLarge}>
                            {group.otherName.charAt(0).toUpperCase()}
                          </span>
                        )}
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--gray-800)' }}>
                            {group.otherName}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                            {group.orders.length} item{group.orders.length !== 1 ? 's' : ''} · {formatUsd(groupTotal)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Order cards in this group */}
                    {group.orders.map(renderCard)}
                  </div>
                )
              })}
            </div>
          )
        }

        // ── Flat list for all other tabs ──
        return (
          <div className={styles.orderList}>
            {filtered.map(order => {
              const isBuyer = order.buyer_id === user!.id
              const otherName = isBuyer ? order.seller_name : order.buyer_name
              const otherAvatar = isBuyer ? order.seller_avatar : order.buyer_avatar
              // Add counterparty row for non-grouped views
              const card = renderCard(order)
              // Wrap card to inject counterparty line on non-grouped views
              return (
                <div key={order.id}>
                  {card}
                </div>
              )
            })}
          </div>
        )
      })()
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
