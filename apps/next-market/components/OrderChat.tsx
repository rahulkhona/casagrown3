'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createClient } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import styles from './OrderChat.module.css'

interface ChatMessage {
  id: string
  sender_id: string
  content: string
  created_at: string
}

interface OrderChatProps {
  orderId: string
  otherUserName: string
  otherUserId: string
  myAvatar?: string
  otherAvatar?: string
  isSeller?: boolean
  fulfillmentType?: 'pickup' | 'delivery'
  onMessageSent?: () => void
}

export default function OrderChat({ orderId, otherUserName, otherUserId, myAvatar, otherAvatar, isSeller = false, fulfillmentType = 'pickup', onMessageSent }: OrderChatProps) {
  const supabase = useMemo(() => createClient(), [])
  const { user } = useAuth()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [newMsg, setNewMsg] = useState('')
  const [sending, setSending] = useState(false)
  const [etaMode, setEtaMode] = useState(false)
  const [etaValue, setEtaValue] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const loadMessages = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('order_chat_messages')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true })
    if (data) {
      setMessages(prev => {
        // Only update if there are new messages (avoids unnecessary re-renders)
        if (prev.length === data.length && prev[prev.length - 1]?.id === data[data.length - 1]?.id) return prev
        return data
      })
    }
  }, [user, orderId, supabase])

  // Load messages on mount
  useEffect(() => {
    loadMessages()
  }, [loadMessages])

  // Poll every 5 seconds
  useEffect(() => {
    pollingRef.current = setInterval(loadMessages, 5000)
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [loadMessages])

  // Scroll to bottom on new messages
  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  const sendMessage = async () => {
    if (!newMsg.trim() || !user || sending) return
    setSending(true)
    const content = newMsg.trim()
    setNewMsg('')

    await supabase.from('order_chat_messages').insert({
      order_id: orderId,
      sender_id: user.id,
      content,
    })

    // Immediately load to show own message
    await loadMessages()
    setSending(false)
    onMessageSent?.()
  }

  const sendQuickReply = async (text: string) => {
    if (!user || sending) return
    setSending(true)
    await supabase.from('order_chat_messages').insert({
      order_id: orderId,
      sender_id: user.id,
      content: text,
    })
    await loadMessages()
    setSending(false)
    onMessageSent?.()
  }

  const handleEtaSubmit = () => {
    if (!etaValue.trim()) {
      setEtaMode(false)
      return
    }
    const text = `I'm on my way!\nETA: ${etaValue.trim()}`
    setEtaMode(false)
    setEtaValue('')
    sendQuickReply(text)
  }

  if (!user) return null

  return (
    <div className={styles.chatContainer}>
      {/* Header */}
      <div className={styles.chatHeader}>
        <div className={styles.headerInfo}>
          <span className={styles.userName}>{otherUserName}</span>
        </div>
      </div>

      {/* Messages */}
      <div className={styles.messageList}>
        {messages.length === 0 && (
          <div className={styles.emptyState}>
            <span>📋</span>
            <p>Add a note about this order</p>
          </div>
        )}
        {messages.map((msg) => {
          const isMine = msg.sender_id === user.id
          const avatar = isMine ? myAvatar : otherAvatar
          const initial = isMine
            ? ((user as any).user_metadata?.full_name?.charAt(0) || user.email?.charAt(0) || 'M').toUpperCase()
            : otherUserName.charAt(0).toUpperCase()
          return (
            <div key={msg.id} className={`${styles.messageRow} ${isMine ? styles.mine : styles.theirs}`}>
              {!isMine && (
                <div className={styles.avatar}>
                  {avatar ? <img src={avatar} alt="" /> : <span>{initial}</span>}
                </div>
              )}
              <div className={styles.messageBubble}>
                <div
                  className={styles.bubbleContent}
                  style={{
                    whiteSpace: 'pre-wrap',
                    background: isMine ? 'var(--primary, #16a34a)' : '#fff',
                    color: isMine ? '#fff' : 'var(--gray-800, #1f2937)',
                    border: isMine ? 'none' : '1px solid var(--gray-200, #e5e7eb)',
                    borderBottomRightRadius: isMine ? 4 : 16,
                    borderBottomLeftRadius: isMine ? 16 : 4,
                  }}
                >
                  {msg.content.split('\n').map((line, i) => {
                    // Render URLs ending in image extensions as inline thumbnails
                    if (/^https?:\/\/.+\.(jpg|jpeg|png|webp|gif)/i.test(line.trim())) {
                      return (
                        <img
                          key={i}
                          src={line.trim()}
                          alt="Evidence"
                          style={{
                            display: 'block', maxWidth: '100%', maxHeight: 180,
                            borderRadius: 8, marginTop: 4,
                            objectFit: 'cover',
                          }}
                        />
                      )
                    }
                    return <span key={i}>{line}{i < msg.content.split('\n').length - 1 ? '\n' : ''}</span>
                  })}
                </div>
                <div className={styles.bubbleTime} style={{ textAlign: isMine ? 'right' : 'left' }}>
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              {isMine && (
                <div className={`${styles.avatar} ${styles.avatarMine}`}>
                  {avatar ? <img src={avatar} alt="" /> : <span>{initial}</span>}
                </div>
              )}
            </div>
          )
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Replies / ETA Box */}
      {etaMode ? (
        <div className={styles.etaBox}>
          <span className={styles.etaLabel}>ETA:</span>
          <input
            type="text"
            value={etaValue}
            onChange={(e) => setEtaValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleEtaSubmit() } }}
            placeholder="e.g. 15 mins"
            className={styles.etaInput}
            autoFocus
          />
          <button onClick={handleEtaSubmit} className={styles.etaSubmitBtn}>Send</button>
          <button onClick={() => setEtaMode(false)} className={styles.etaCancelBtn}>✕</button>
        </div>
      ) : (
        <div className={styles.quickRepliesContainer}>
          {isSeller && fulfillmentType === 'pickup' && (
            <button onClick={() => sendQuickReply('Your order is ready for pickup!')} className={styles.quickReplyChip}>✅ Ready for Pickup</button>
          )}
          {((isSeller && fulfillmentType === 'delivery') || (!isSeller && fulfillmentType === 'pickup')) && (
            <button onClick={() => setEtaMode(true)} className={styles.quickReplyChip}>🚗 On my way...</button>
          )}
        </div>
      )}

      {/* Input */}
      <div className={styles.chatInput}>
        <input
          type="text"
          value={newMsg}
          onChange={(e) => setNewMsg(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
          placeholder="Type a message..."
          className={styles.input}
        />
        <button
          onClick={sendMessage}
          disabled={!newMsg.trim() || sending}
          className={styles.sendBtn}
        >
          ↑
        </button>
      </div>
    </div>
  )
}
