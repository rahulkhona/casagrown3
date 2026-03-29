'use client'

import { LoadingSpinner } from '../../components/LoadingSpinner'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../../lib/useAuth'
import { createClient } from '../../../lib/supabase'
import { formatUsd } from '../../../lib/store'
import { useErrorToast } from '../../components/ErrorToast'
import styles from './page.module.css'

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

export default function HelpingPage() {
  const { isAuthenticated, loading: authLoading } = useAuth()
  const router = useRouter()
  const [orders, setOrders] = useState<HelperOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const { showError, showSuccess } = useErrorToast()

  const supabase = createClient()

  const fetchQueue = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_helper_queue')
      if (!error && data) setOrders(data)
    } catch (e: any) {
      console.error('Helper queue error:', e)
      showError('Failed to load queue: ' + (e.message || 'Unknown error'))
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    if (isAuthenticated) fetchQueue()
  }, [isAuthenticated, fetchQueue])

  const handleMarkDelivered = useCallback(async (orderId: string) => {
    setActionLoading(orderId)
    try {
      const { data, error } = await supabase.rpc('helper_mark_delivered', {
        p_order_id: orderId,
        p_proof_urls: [],
      })
      if (error) {
        showError('Error: ' + error.message)
      } else if (data?.error) {
        showError(data.error)
      } else {
        showSuccess('Order marked as delivered! 📦✅')
        fetchQueue()
      }
    } catch (e: any) {
      console.error('Mark delivered error:', e)
      showError('Failed to mark delivered: ' + (e.message || 'Unknown error'))
    } finally {
      setActionLoading(null)
    }
  }, [supabase, fetchQueue])

  if (authLoading) return <LoadingSpinner />
  if (!isAuthenticated) {
    return (
      <div className="container" style={{ padding: '80px 20px', textAlign: 'center' }}>
        <h2>Sign in to view your helping assignments</h2>
        <Link href="/login" className="btn btn-primary" style={{ marginTop: 16 }}>Sign In</Link>
      </div>
    )
  }

  // Group orders by booth
  const grouped = orders.reduce<Record<string, { boothName: string; sellerName: string; orders: HelperOrder[] }>>((acc, o) => {
    if (!acc[o.booth_id]) acc[o.booth_id] = { boothName: o.booth_name, sellerName: o.seller_name, orders: [] }
    acc[o.booth_id].orders.push(o)
    return acc
  }, {})

  const boothIds = Object.keys(grouped)

  return (
    <div className="container">
      <div className={styles.pageWrap}>
        <div className="page-header">
          <h1 className="page-title">🤝 Helping</h1>
          <p className="page-subtitle">Orders for booths you help with — deliver or support pickup</p>
        </div>

        {loading ? (
          <div className={styles.emptyState}><p>Loading orders...</p></div>
        ) : boothIds.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>🤝</span>
            <p>No pending orders for your booths</p>
            <p style={{ fontSize: 13, color: 'var(--gray-400)' }}>
              Join a booth as a helper to see orders here
            </p>
          </div>
        ) : (
          boothIds.map(boothId => {
            const group = grouped[boothId]
            return (
              <div key={boothId} className={styles.boothGroup}>
                <div className={styles.boothHeader}>
                  <div>
                    <h2 className={styles.boothName}>{group.boothName}</h2>
                    <span className={styles.boothSeller}>by {group.sellerName}</span>
                  </div>
                  <span className={styles.orderCount}>{group.orders.length} order{group.orders.length !== 1 ? 's' : ''}</span>
                </div>

                <div className={styles.orderList}>
                  {group.orders.map(order => (
                    <div key={order.order_id} className={styles.orderCard}>
                      <div className={styles.orderTop}>
                        <div className={styles.orderInfo}>
                          <span className={styles.fulfillmentBadge} data-type={order.fulfillment_type}>
                            {order.fulfillment_type === 'delivery' ? '🚗 Delivery' : '📍 Pickup'}
                          </span>
                          <span className={`${styles.statusBadge} ${styles['status_' + order.status]}`}>
                            {order.status}
                          </span>
                        </div>
                        <span className={styles.orderTotal}>{formatUsd(order.total_usd)}</span>
                      </div>

                      <div className={styles.orderBody}>
                        <h3 className={styles.productName}>
                          {order.product_name} <span className={styles.qty}>× {order.quantity}</span>
                        </h3>
                        <p className={styles.buyerName}>🧑 {order.buyer_name}</p>
                        {order.delivered_by_name && (
                          <p className={styles.deliveredBy}>✅ Delivered by {order.delivered_by_name}</p>
                        )}
                      </div>

                      <div className={styles.orderActions}>
                        <Link href={`/orders/${order.order_id}`} className={styles.chatBtn}>
                          💬 Chat
                        </Link>
                        {['pending', 'confirmed', 'delivering'].includes(order.status) && (
                          <button
                            className={styles.deliverBtn}
                            onClick={() => handleMarkDelivered(order.order_id)}
                            disabled={actionLoading === order.order_id}
                          >
                            {actionLoading === order.order_id ? 'Marking...' : '📦 Mark Delivered'}
                          </button>
                        )}
                        <Link href={`/orders/${order.order_id}`} className={styles.viewBtn}>
                          View →
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
