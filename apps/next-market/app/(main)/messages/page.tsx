'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '../../../lib/supabase'
import { useAuth } from '../../../lib/useAuth'
import { UserSearchModal } from './UserSearchModal'

export default function MessagesInboxPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [conversations, setConversations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchModalOpen, setSearchModalOpen] = useState(false)
  const [filterQuery, setFilterQuery] = useState('')
  const [growBotPreview, setGrowBotPreview] = useState('Ask me anything about gardening! 🌱')

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      const t = setTimeout(() => {
        router.replace('/login')
      }, 500)
      return () => clearTimeout(t)
    }

    const fetchInbox = async () => {
      const supabase = createClient()

      // Fetch CasaGrown DMs
      const { data } = await supabase
        .from('market_conversations')
        .select(`
          id,
          last_message_at,
          unread_count_a,
          unread_count_b,
          participant_a,
          participant_b,
          profile_a:profiles!market_conversations_participant_a_fkey(id, full_name, avatar_url),
          profile_b:profiles!market_conversations_participant_b_fkey(id, full_name, avatar_url),
          market_chat_messages(content, created_at, sender_id, media)
        `)
        .or(`participant_a.eq.${user.id},participant_b.eq.${user.id}`)
        .order('last_message_at', { ascending: false })
        .order('created_at', { ascending: false, foreignTable: 'market_chat_messages' })
        .limit(1, { foreignTable: 'market_chat_messages' })

      // Fetch Messenger conversations for this seller
      const { data: messengerData } = await supabase
        .from('messenger_conversations')
        .select(`
          id,
          fb_sender_id,
          last_message_at,
          message_count,
          messenger_messages(content, created_at, role)
        `)
        .eq('seller_id', user.id)
        .order('last_message_at', { ascending: false })
        .order('created_at', { ascending: false, foreignTable: 'messenger_messages' })
        .limit(1, { foreignTable: 'messenger_messages' })

      let gbPreview = 'Ask me anything about gardening! 🌱'
      const allConversations: any[] = []

      // Format CasaGrown DMs
      if (data) {
        for (const conv of data) {
          const isA = conv.participant_a === user.id
          const otherProfile = (isA ? conv.profile_b : conv.profile_a) as any
          const unreadCount = isA ? conv.unread_count_a : conv.unread_count_b
          
          let messages = conv.market_chat_messages || []
          messages.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          const lastMessage = messages.length > 0 ? messages[0] : null
          
          let previewText = 'No messages yet'
          if (lastMessage) {
              if (lastMessage.content) {
                  previewText = lastMessage.content
              } else if (lastMessage.media && lastMessage.media.length > 0) {
                  previewText = '📷 Image snippet'
              }
          }

          if (otherProfile?.id === 'a0000000-0000-0000-0000-00000ca5ab07' && previewText !== 'No messages yet') {
             gbPreview = previewText
          }

          allConversations.push({
            id: conv.id,
            otherUser: otherProfile,
            lastMessageAt: new Date(conv.last_message_at),
            unreadCount,
            preview: previewText,
            channel: 'dm' as const,
          })
        }
      }

      // Format Messenger conversations
      if (messengerData) {
        for (const mc of messengerData) {
          const msgs = mc.messenger_messages || []
          msgs.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          const lastMsg = msgs.length > 0 ? msgs[0] : null

          allConversations.push({
            id: mc.id,
            otherUser: {
              id: mc.fb_sender_id,
              full_name: mc.fb_sender_id ? `FB User ${mc.fb_sender_id.slice(-4)}` : 'Facebook Customer',
              avatar_url: null,
            },
            lastMessageAt: new Date(mc.last_message_at),
            unreadCount: 0,
            preview: lastMsg?.content || 'No messages yet',
            channel: 'messenger' as const,
          })
        }
      }

      // Sort merged list by last_message_at DESC
      allConversations.sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime())

      setGrowBotPreview(gbPreview)
      setConversations(allConversations)
      setLoading(false)
    }

    fetchInbox()
  }, [user, authLoading, router])

  if (authLoading || loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading inbox...</div>

  return (
    <div style={{ paddingBottom: 80, background: '#f9fafb', minHeight: '100vh', position: 'relative' }}>
      
      {/* Dynamic Search Modal Component Boundary */}
      {searchModalOpen && <UserSearchModal onClose={() => setSearchModalOpen(false)} />}
      
      <header style={{ padding: '16px', background: 'white', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0, color: '#111827' }}>Direct Messages</h1>
        <button
          className="btn btn-primary"
          onClick={() => setSearchModalOpen(true)}
          style={{ padding: '6px 16px', fontSize: '0.9rem', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Chat
        </button>
      </header>
      
      {/* Existing Conversation List Search */}
      {conversations.length > 0 && (
        <div style={{ padding: '12px 16px', background: 'white', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 64, zIndex: 9 }}>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }}>🔍</span>
            <input
              type="text"
              placeholder="Search existing conversations..."
              value={filterQuery}
              onChange={e => setFilterQuery(e.target.value)}
              style={{
                width: '100%', padding: '10px 12px 10px 36px', borderRadius: 8,
                border: '1px solid #d1d5db', fontSize: '0.9rem', outline: 'none',
                background: '#f9fafb', color: '#111827'
              }}
            />
          </div>
        </div>
      )}

      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {/* Pinned GrowBot */}
        <li style={{ borderBottom: '4px solid #f3f4f6' }}>
          <Link href="/growbot" style={{ display: 'flex', padding: '16px', textDecoration: 'none', color: 'inherit', alignItems: 'center', background: '#fdfce8', transition: 'background 0.2s' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', backgroundColor: '#fef08a', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, marginRight: 16 }}>
              <img src="/growbot-avatar-v3.png" alt="GrowBot" style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scale(1.2)' }} />
            </div>
            <div style={{ flexGrow: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                <span style={{ fontWeight: '700', color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 4 }}>
                  GrowBot <span style={{fontSize: 10, background: '#166534', color: 'white', padding: '2px 6px', borderRadius: 8}}>AI</span>
                </span>
                <span style={{ fontSize: '0.75rem', color: '#ca8a04', flexShrink: 0, marginLeft: 8, fontWeight: 600 }}>
                  📌 Pinned
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <p style={{ fontSize: '0.875rem', color: '#4b5563', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: '500', flexGrow: 1 }}>
                  {growBotPreview}
                </p>
              </div>
            </div>
          </Link>
        </li>

        {conversations.length === 0 ? (
          <div style={{ padding: '4rem 2rem', textAlign: 'center', color: '#6b7280' }}>
            <div style={{ fontSize: '3rem', marginBottom: 16 }}>📬</div>
            <h2 style={{ color: '#374151', fontSize: '1.25rem', marginBottom: 8 }}>No other conversations</h2>
            <p style={{ fontSize: '0.875rem' }}>Start a private chat from a Farmer's Booth or the Community feed!</p>
          </div>
        ) : (
          conversations
            .filter(c => c.channel === 'messenger' || c.otherUser?.id !== 'a0000000-0000-0000-0000-00000ca5ab07')
            .filter(c => !filterQuery.trim() || c.otherUser?.full_name?.toLowerCase().includes(filterQuery.toLowerCase()))
            .map(conv => (
            <li key={`${conv.channel}-${conv.id}`} style={{ borderBottom: '1px solid #f3f4f6' }}>
              <Link href={conv.channel === 'messenger' ? `/messages/messenger/${conv.id}` : `/messages/${conv.id}`} style={{ display: 'flex', padding: '16px', textDecoration: 'none', color: 'inherit', alignItems: 'center', background: conv.unreadCount > 0 ? '#ecfdf5' : 'white', transition: 'background 0.2s' }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', backgroundColor: conv.channel === 'messenger' ? '#e7f0ff' : '#e5e7eb', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: conv.channel === 'messenger' ? '#1877F2' : '#9ca3af', marginRight: 16, fontSize: conv.channel === 'messenger' ? '20px' : 'inherit' }}>
                  {conv.channel === 'messenger' ? (
                    '📱'
                  ) : conv.otherUser?.avatar_url ? (
                    <img src={conv.otherUser.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    conv.otherUser?.full_name?.charAt(0).toUpperCase() || '?'
                  )}
                </div>
                <div style={{ flexGrow: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                    <span style={{ fontWeight: conv.unreadCount > 0 ? '700' : '600', color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {conv.otherUser?.full_name || 'Neighbor'}
                      {conv.channel === 'messenger' && (
                        <span style={{ fontSize: 10, background: '#1877F2', color: 'white', padding: '2px 6px', borderRadius: 8, fontWeight: 700, whiteSpace: 'nowrap' }}>📱 Messenger</span>
                      )}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: conv.unreadCount > 0 ? '#10b981' : '#9ca3af', flexShrink: 0, marginLeft: 8 }}>
                      {conv.lastMessageAt.toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <p style={{ fontSize: '0.875rem', color: conv.unreadCount > 0 ? '#1f2937' : '#6b7280', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: conv.unreadCount > 0 ? '500' : '400', flexGrow: 1 }}>
                      {conv.preview}
                    </p>
                    {conv.unreadCount > 0 && (
                      <span style={{ background: '#ef4444', color: 'white', borderRadius: '10px', padding: '3px 7px', fontSize: '0.7rem', fontWeight: 'bold', marginLeft: 8 }}>
                        {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          ))
        )}
      </ul>
    </div>
  )
}
