'use client'

import Link from 'next/link'
import { useMarket } from '../../../lib/store'

export default function NotificationsPage() {
  const { state, dispatch } = useMarket()
  const notifications = [...state.notifications].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  return (
    <div className="container-sm">
      <div className="page-header"><h1 className="page-title">Notifications</h1></div>
      {notifications.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🔔</div>
          <div className="empty-state-title">No notifications</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 40 }}>
          {notifications.map(n => (
            <Link
              key={n.id}
              href={n.link || '#'}
              onClick={() => dispatch({ type: 'MARK_NOTIFICATION_READ', payload: n.id })}
              style={{
                display: 'flex', gap: 12, padding: '12px 16px',
                borderRadius: 'var(--radius-lg)', textDecoration: 'none',
                background: n.read ? '#fff' : 'var(--green-50)',
                border: `1px solid ${n.read ? 'var(--border)' : 'var(--green-200)'}`,
              }}
            >
              <span style={{ fontSize: 20 }}>
                {n.type === 'order' ? '📦' : n.type === 'message' ? '💬' : n.type === 'market' ? '🏪' : '🔔'}
              </span>
              <div style={{ flex: 1 }}>
                <strong style={{ fontSize: 14, display: 'block' }}>{n.title}</strong>
                <span style={{ fontSize: 13, color: 'var(--gray-500)' }}>{n.body}</span>
                <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4 }}>
                  {new Date(n.createdAt).toLocaleString()}
                </div>
              </div>
              {!n.read && <span style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--green-500)', flexShrink: 0, marginTop: 6 }} />}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
