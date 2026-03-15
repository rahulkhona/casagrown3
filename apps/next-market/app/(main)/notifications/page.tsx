'use client'

/**
 * Notifications Page — In-app notification center
 * 
 * Reads from Supabase `notifications` table (shared with community app).
 * Polls every 30s for new notifications. Supports mark as read, mark all, clear all.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useAuth } from '../../../lib/useAuth'
import { createClient } from '../../../lib/supabase'

interface Notification {
  id: string
  user_id: string
  content: string
  link_url: string | null
  read_at: string | null
  created_at: string
}

function formatTimeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

export default function NotificationsPage() {
  const { isAuthenticated, loading: authLoading, user } = useAuth()
  const userId = user?.id
  const supabase = useMemo(() => createClient(), [])

  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  const fetchNotifications = useCallback(async () => {
    if (!userId) return
    const { data } = await supabase
      .from('notifications')
      .select('id, user_id, content, link_url, read_at, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)
    if (data) setNotifications(data)
    setLoading(false)
  }, [userId, supabase])

  // Initial fetch + poll every 30s
  useEffect(() => {
    if (!userId) return
    fetchNotifications()
    const id = setInterval(fetchNotifications, 30_000)
    return () => clearInterval(id)
  }, [userId, fetchNotifications])

  const markAsRead = useCallback(async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id)
  }, [supabase])

  const markAllAsRead = useCallback(async () => {
    if (!userId) return
    const now = new Date().toISOString()
    setNotifications(prev => prev.map(n => n.read_at ? n : { ...n, read_at: now }))
    await supabase.from('notifications').update({ read_at: now }).eq('user_id', userId).is('read_at', null)
  }, [userId, supabase])

  const clearAll = useCallback(async () => {
    if (!userId) return
    setNotifications([])
    await supabase.from('notifications').delete().eq('user_id', userId)
  }, [userId, supabase])

  const unreadCount = notifications.filter(n => !n.read_at).length

  if (authLoading) return <div className="container" style={{ padding: '80px 20px', textAlign: 'center' }}><p>Loading...</p></div>
  if (!isAuthenticated) {
    return <div className="container" style={{ padding: '80px 20px', textAlign: 'center' }}>
      <h2>Sign in to view notifications</h2>
      <Link href="/login" className="btn btn-primary" style={{ marginTop: 16 }}>Sign In</Link>
    </div>
  }

  return (
    <div className="container-sm">
      <div style={{ paddingBottom: 40 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h1 className="page-title">Notifications</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            {unreadCount > 0 && (
              <button className="btn btn-sm" onClick={markAllAsRead}>
                ✓ Mark all read ({unreadCount})
              </button>
            )}
            {notifications.length > 0 && (
              <button className="btn btn-sm btn-outline" onClick={clearAll}>Clear all</button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="empty-state"><p>Loading notifications...</p></div>
        ) : notifications.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🔔</div>
            <div className="empty-state-title">No notifications</div>
            <p style={{ color: 'var(--gray-400)', fontSize: 13 }}>
              You'll be notified about orders, settlements, ratings, and more
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {notifications.map(n => {
              const isUnread = !n.read_at
              const Wrapper = n.link_url ? Link : 'div'
              const wrapperProps = n.link_url ? { href: n.link_url } : {}
              return (
                <Wrapper
                  key={n.id}
                  {...(wrapperProps as any)}
                  onClick={() => { if (isUnread) markAsRead(n.id) }}
                  style={{
                    display: 'flex', gap: 12, padding: '12px 16px',
                    borderRadius: 'var(--radius-lg)', textDecoration: 'none',
                    background: isUnread ? 'var(--green-50)' : '#fff',
                    border: `1px solid ${isUnread ? 'var(--green-200)' : 'var(--border)'}`,
                    cursor: 'pointer', transition: 'background 0.15s',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <span style={{
                      fontSize: 14, color: 'var(--gray-800)',
                      fontWeight: isUnread ? 600 : 400,
                      display: 'block', lineHeight: 1.4,
                    }}>
                      {n.content}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4, display: 'block' }}>
                      {formatTimeAgo(n.created_at)}
                    </span>
                  </div>
                  {isUnread && (
                    <span style={{
                      width: 8, height: 8, borderRadius: 4,
                      background: 'var(--green-500)', flexShrink: 0, marginTop: 6,
                    }} />
                  )}
                </Wrapper>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
