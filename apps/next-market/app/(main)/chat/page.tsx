'use client'

import { LoadingSpinner } from '../../components/LoadingSpinner'
import Link from 'next/link'
import { useMarket } from '../../../lib/store'
import { useAuth } from '../../../lib/useAuth'

export default function ChatListPage() {
  const { state } = useMarket()
  const convos = state.conversations.filter(
    c => c.buyerId === state.user?.id || c.sellerId === state.user?.id
  ).sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())

  const { isAuthenticated, loading: authLoading } = useAuth()

  if (authLoading) return <LoadingSpinner />

  if (!isAuthenticated) {
    return <div className="container" style={{ padding: '80px 20px', textAlign: 'center' }}><h2>Sign in to view chats</h2><Link href="/login" className="btn btn-primary" style={{ marginTop: 16 }}>Sign In</Link></div>
  }

  return (
    <div className="container-sm">
      <div className="page-header"><h1 className="page-title">Messages</h1></div>
      {convos.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">💬</div>
          <div className="empty-state-title">No conversations yet</div>
          <div className="empty-state-text">Start a conversation by placing an order</div>
          <Link href="/market" className="btn btn-primary">Browse Market</Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 40 }}>
          {convos.map(c => {
            const otherName = c.buyerId === state.user?.id ? c.sellerName : c.buyerName
            const order = state.orders.find(o => o.id === c.orderId)
            return (
              <Link key={c.id} href={`/chat/${c.id}`} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                borderRadius: 'var(--radius-lg)', textDecoration: 'none',
                background: c.unread > 0 ? 'var(--green-50)' : '#fff',
                border: `1px solid ${c.unread > 0 ? 'var(--green-200)' : 'var(--border)'}`,
                transition: 'background 0.15s',
              }}>
                <div className="avatar">{otherName.charAt(0)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: 14 }}>{otherName}</strong>
                    <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>
                      {new Date(c.lastMessageAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 2 }}>{c.boothName}</div>
                  <div style={{ fontSize: 13, color: 'var(--gray-600)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.lastMessage}
                  </div>
                </div>
                {c.unread > 0 && <span className="badge badge-green">{c.unread}</span>}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
