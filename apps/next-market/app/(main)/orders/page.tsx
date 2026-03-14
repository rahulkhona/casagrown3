'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useMarket, formatUsd, type OrderStatus } from '../../../lib/store'
import { useAuth } from '../../../lib/useAuth'
import styles from './page.module.css'

const STATUS_LABELS: Record<OrderStatus, { label: string; color: string }> = {
  pending: { label: '⏳ Pending', color: 'badge-amber' },
  accepted: { label: '✓ Accepted', color: 'badge-blue' },
  rejected: { label: '✕ Rejected', color: 'badge-red' },
  delivering: { label: '🚗 Delivering', color: 'badge-blue' },
  delivered: { label: '📦 Delivered', color: 'badge-green' },
  confirmed: { label: '✓ Confirmed', color: 'badge-green' },
  disputed: { label: '⚠️ Disputed', color: 'badge-red' },
  resolved: { label: '✓ Resolved', color: 'badge-gray' },
  cancelled: { label: '✕ Cancelled', color: 'badge-gray' },
}

export default function OrdersPage() {
  const { state, dispatch } = useMarket()
  const [tab, setTab] = useState<'active' | 'past' | 'disputed'>('active')

  const myOrders = state.orders.filter(o => o.buyerId === state.user?.id)
  const activeStatuses: OrderStatus[] = ['pending', 'accepted', 'delivering', 'delivered']
  const pastStatuses: OrderStatus[] = ['confirmed', 'rejected', 'cancelled', 'resolved']
  const disputedStatuses: OrderStatus[] = ['disputed']

  const { isAuthenticated, loading: authLoading } = useAuth()

  const filtered = myOrders.filter(o => {
    if (tab === 'active') return activeStatuses.includes(o.status)
    if (tab === 'past') return pastStatuses.includes(o.status)
    return disputedStatuses.includes(o.status)
  })

  if (authLoading) return <div className="container" style={{ padding: '80px 20px', textAlign: 'center' }}><p>Loading...</p></div>

  if (!isAuthenticated) {
    return <div className="container" style={{ padding: '80px 20px', textAlign: 'center' }}><h2>Sign in to view orders</h2><Link href="/login" className="btn btn-primary" style={{ marginTop: 16 }}>Sign In</Link></div>
  }

  return (
    <div className="container">
      <div className="page-header"><h1 className="page-title">My Orders</h1></div>
      <div className="tabs">
        {(['active', 'past', 'disputed'] as const).map(t => (
          <button key={t} className={`tab ${tab === t ? 'tab-active' : ''}`} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
            {t === 'active' && myOrders.filter(o => activeStatuses.includes(o.status)).length > 0 && (
              <span className="badge badge-green" style={{ marginLeft: 6 }}>{myOrders.filter(o => activeStatuses.includes(o.status)).length}</span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📦</div>
          <div className="empty-state-title">No {tab} orders</div>
          <div className="empty-state-text">Orders you place will appear here</div>
          <Link href="/market" className="btn btn-primary">Browse Market</Link>
        </div>
      ) : (
        <div className={styles.orderList}>
          {filtered.map(order => {
            const status = STATUS_LABELS[order.status]
            const conv = state.conversations.find(c => c.orderId === order.id)
            return (
              <div key={order.id} className={styles.orderCard}>
                <div className={styles.orderHeader}>
                  <div>
                    <strong style={{ fontSize: 15 }}>{order.boothName}</strong>
                    <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                      {new Date(order.createdAt).toLocaleDateString()} • {order.deliveryType === 'delivery' ? '🚗 Delivery' : '📍 Pickup'}
                    </div>
                  </div>
                  <span className={`badge ${status.color}`}>{status.label}</span>
                </div>
                <div className={styles.orderItems}>
                  {order.items.map((item, i) => (
                    <div key={i} className={styles.orderItem}>
                      <span>{item.productName}</span>
                      <span>×{item.qty} @ {formatUsd(item.unitPrice)}</span>
                    </div>
                  ))}
                </div>
                <div className={styles.orderFooter}>
                  <strong className="price">{formatUsd(order.total)}</strong>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {order.status === 'delivered' && (
                      <button className="btn btn-primary btn-sm" onClick={() => {
                        dispatch({ type: 'UPDATE_ORDER_STATUS', payload: { orderId: order.id, status: 'confirmed' } })
                        dispatch({ type: 'ADD_TOAST', payload: { message: 'Delivery confirmed! ✓', type: 'success' } })
                      }}>
                        ✓ Confirm Delivery
                      </button>
                    )}
                    {order.status === 'delivered' && (
                      <button className="btn btn-danger btn-sm" onClick={() => {
                        dispatch({ type: 'UPDATE_ORDER_STATUS', payload: { orderId: order.id, status: 'disputed', disputeReason: 'Issue with delivery' } })
                        dispatch({ type: 'ADD_TOAST', payload: { message: 'Dispute filed', type: 'info' } })
                      }}>
                        ⚠️ Dispute
                      </button>
                    )}
                    {order.deliveryType === 'pickup' && order.status === 'accepted' && (
                      <div className={styles.passcodeBox}>
                        <span>Passcode:</span>
                        <strong>{order.passcode}</strong>
                      </div>
                    )}
                    {conv && <Link href={`/chat/${conv.id}`} className="btn btn-outline btn-sm">💬 Chat</Link>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
