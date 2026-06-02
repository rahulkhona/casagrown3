'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createClient } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import { useSubscription } from '../lib/useSubscription'
import { BotSuggestionBar } from '../app/components/BotSuggestionBar'
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
  orderStatus?: string
  onMessageSent?: () => void
  onStatusChange?: () => void
}

export default function OrderChat({ orderId, otherUserName, otherUserId, myAvatar, otherAvatar, isSeller = false, fulfillmentType = 'pickup', orderStatus = 'pending', onMessageSent, onStatusChange }: OrderChatProps) {
  const supabase = useMemo(() => createClient(), [])
  const { user } = useAuth()
  const { isPro } = useSubscription()
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [assistLoading, setAssistLoading] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [newMsg, setNewMsg] = useState('')
  const [sending, setSending] = useState(false)
  const [etaMode, setEtaMode] = useState(false)
  const [etaValue, setEtaValue] = useState('')

  // Handle GrowBot Assist manual trigger for Order Chat
  const handleGrowBotAssist = async () => {
    if (showSuggestions) {
      setShowSuggestions(false)
      return
    }

    setShowSuggestions(true)
    setAssistLoading(true)
    try {
      const lastBuyerMsg = [...messages].reverse().find(m => m.sender_id === otherUserId)
      const triggerMsgId = lastBuyerMsg?.id || 'fake-id'

      const { error } = await supabase.functions.invoke('auto-reply-seller-chat', {
        body: {
          type: 'order',
          messageId: triggerMsgId,
          senderId: otherUserId,
          recipientId: user?.id,
          orderId: orderId,
          isManual: true,
        }
      })

      if (error) {
        console.error('[GROWBOT ASSIST] Trigger error:', error.message)
      }
    } catch (err) {
      console.error('[GROWBOT ASSIST] Invoke failed:', err)
    } finally {
      setAssistLoading(false)
    }
  }
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
    setShowSuggestions(false)

    await supabase.from('order_chat_messages').insert({
      order_id: orderId,
      sender_id: user.id,
      content,
    })

    // Notify the other party (in-app bell notification)
    if (otherUserId) {
      const myName = (user as any).user_metadata?.full_name || user.email?.split('@')[0] || 'Someone'
      await supabase.from('market_notifications').insert({
        user_id: otherUserId,
        content: `💬 ${myName}: ${content.length > 80 ? content.slice(0, 80) + '…' : content}`,
        link_url: `/orders/${orderId}`,
      })
    }

    // Immediately load to show own message
    await loadMessages()
    setSending(false)
    onMessageSent?.()
  }

  const sendQuickReply = async (text: string, skipNotification = false) => {
    if (!user || sending) return
    setSending(true)
    setShowSuggestions(false)
    await supabase.from('order_chat_messages').insert({
      order_id: orderId,
      sender_id: user.id,
      content: text,
    })

    // Notify the other party (in-app bell notification) unless skipped
    // (e.g. 'Ready for Pickup' already triggers a full notification via the DB trigger)
    if (otherUserId && !skipNotification) {
      const myName = (user as any).user_metadata?.full_name || user.email?.split('@')[0] || 'Someone'
      await supabase.from('market_notifications').insert({
        user_id: otherUserId,
        content: `💬 ${myName}: ${text.length > 80 ? text.slice(0, 80) + '…' : text}`,
        link_url: `/orders/${orderId}`,
      })
    }

    await loadMessages()
    setSending(false)
    onMessageSent?.()
  }

  const handleEtaSubmit = async () => {
    if (!etaValue.trim()) {
      setEtaMode(false)
      return
    }
    const eta = etaValue.trim()
    const text = `I'm on my way!\nETA: ${eta}`
    setEtaMode(false)
    setEtaValue('')
    await sendQuickReply(text, true)
    // Notify the other party
    if (user && otherUserId) {
      const myName = (user as any).user_metadata?.full_name || user.email?.split('@')[0] || 'Someone'
      await supabase.from('market_notifications').insert({
        user_id: otherUserId,
        content: `🚗 ${myName} is on their way! ETA: ${eta}`,
        link_url: `/orders/${orderId}`,
      })
    }
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
          {isSeller && isPro && (
            <button
              type="button"
              disabled={sending || assistLoading}
              onClick={handleGrowBotAssist}
              style={{
                background: showSuggestions
                  ? 'linear-gradient(135deg, #ecfdf5, #d1fae5)'
                  : 'linear-gradient(135deg, #f0f9ff, #e0f2fe)',
                border: showSuggestions ? '1px solid #34d399' : '1px solid #38bdf8',
                padding: '6px 12px',
                borderRadius: 9999,
                fontSize: '11px',
                color: showSuggestions ? '#065f46' : '#0369a1',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s',
                fontWeight: 600,
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                marginRight: 6,
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              {assistLoading ? '🤖 Thinking...' : '🤖 Suggest Reply'}
            </button>
          )}
          {isSeller && fulfillmentType === 'pickup' && orderStatus === 'pending' && (
            <button onClick={async () => {
              await sendQuickReply('Your order is ready for pickup!', true)
              // Signal readiness — status stays 'pending', ready_for_pickup_at is set
              await supabase.rpc('seller_mark_ready_pickup', { p_order_id: orderId })
            }} className={styles.quickReplyChip}>✅ Ready for Pickup</button>
          )}
          {isSeller && fulfillmentType === 'delivery' && orderStatus === 'pending' && (
            <button onClick={() => setEtaMode(true)} className={styles.quickReplyChip}>🚗 On my way...</button>
          )}
          {!isSeller && fulfillmentType === 'pickup' && orderStatus === 'pending' && (
            <button onClick={() => setEtaMode(true)} className={styles.quickReplyChip}>🚗 On my way to pick up...</button>
          )}
        </div>
      )}

      {/* Bot Suggestion Bar */}
      {isSeller && isPro && showSuggestions && (
        <div style={{ padding: '0 12px 8px', width: '100%', boxSizing: 'border-box' }}>
          <BotSuggestionBar
            channel="order"
            conversationRef={orderId}
            isLoading={assistLoading}
            onSend={(text: string) => {
              setNewMsg(text)
              setShowSuggestions(false)
              setTimeout(() => {
                const btn = document.querySelector(`.${styles.sendBtn}`) as HTMLButtonElement
                if (btn) btn.click()
              }, 50)
            }}
            onSelect={(text: string) => {
              setNewMsg(text)
            }}
          />
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
