'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useMarket, formatUsd, type OrderStatus } from '../../../../lib/store'

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: '⏳ Pending', accepted: '✓ Accepted', rejected: '✕ Rejected',
  delivering: '🚗 Delivering', delivered: '📦 Delivered', confirmed: '✓ Confirmed',
  disputed: '⚠️ Disputed', resolved: '✓ Resolved', cancelled: '✕ Cancelled',
}

export default function SellerOrdersPage() {
  const { state, dispatch } = useMarket()
  const [tab, setTab] = useState<'pending' | 'active' | 'completed' | 'disputed'>('pending')
  const myOrders = state.orders.filter(o => o.sellerId === state.user?.id)

  const filtered = myOrders.filter(o => {
    if (tab === 'pending') return o.status === 'pending'
    if (tab === 'active') return ['accepted', 'delivering', 'delivered'].includes(o.status)
    if (tab === 'completed') return ['confirmed', 'rejected', 'cancelled', 'resolved'].includes(o.status)
    return o.status === 'disputed'
  })

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px 0 16px' }}>
        <div><h1 className="page-title">Booth Orders</h1></div>
        <Link href="/my-booth" className="btn btn-outline btn-sm">← My Booth</Link>
      </div>
      <div className="tabs">
        {(['pending', 'active', 'completed', 'disputed'] as const).map(t => (
          <button key={t} className={`tab ${tab === t ? 'tab-active' : ''}`} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
            {t === 'pending' && myOrders.filter(o => o.status === 'pending').length > 0 && (
              <span className="badge badge-red" style={{ marginLeft: 6 }}>{myOrders.filter(o => o.status === 'pending').length}</span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <div className="empty-state-title">No {tab} orders</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 40 }}>
          {filtered.map(o => {
            const conv = state.conversations.find(c => c.orderId === o.id)
            return (
              <div key={o.id} className="card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <strong>{o.buyerName}</strong>
                    <span style={{ fontSize: 12, color: 'var(--gray-500)', display: 'block' }}>
                      {new Date(o.createdAt).toLocaleDateString()} • {o.deliveryType === 'delivery' ? '🚗 Delivery' : '📍 Pickup'}
                    </span>
                  </div>
                  <span className={`badge ${o.status === 'disputed' ? 'badge-red' : o.status === 'pending' ? 'badge-amber' : 'badge-green'}`}>
                    {STATUS_LABELS[o.status]}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--gray-600)', marginBottom: 8 }}>
                  {o.items.map(i => `${i.productName} ×${i.qty}`).join(', ')}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <strong className="price">{formatUsd(o.total)}</strong>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {o.status === 'pending' && (
                      <>
                        <button className="btn btn-primary btn-xs" onClick={() => {
                          dispatch({ type: 'UPDATE_ORDER_STATUS', payload: { orderId: o.id, status: 'accepted' } })
                          dispatch({ type: 'ADD_TOAST', payload: { message: 'Order accepted', type: 'success' } })
                        }}>✓ Accept</button>
                        <button className="btn btn-danger btn-xs" onClick={() => {
                          dispatch({ type: 'UPDATE_ORDER_STATUS', payload: { orderId: o.id, status: 'rejected' } })
                          dispatch({ type: 'ADD_TOAST', payload: { message: 'Order rejected', type: 'info' } })
                        }}>✕ Reject</button>
                      </>
                    )}
                    {o.status === 'accepted' && (
                      <button className="btn btn-primary btn-xs" onClick={() => {
                        dispatch({ type: 'UPDATE_ORDER_STATUS', payload: { orderId: o.id, status: 'delivered', proofPhotos: ['proof.jpg'] } })
                        dispatch({ type: 'ADD_TOAST', payload: { message: 'Marked delivered', type: 'success' } })
                      }}>📷 Mark Delivered</button>
                    )}
                    {conv && <Link href={`/chat/${conv.id}`} className="btn btn-outline btn-xs">💬</Link>}
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
