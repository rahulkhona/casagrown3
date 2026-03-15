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
}

export default function OrderChat({ orderId, otherUserName, otherUserId, myAvatar, otherAvatar }: OrderChatProps) {
  const supabase = useMemo(() => createClient(), [])
  const { user } = useAuth()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [newMsg, setNewMsg] = useState('')
  const [sending, setSending] = useState(false)
  const [isOnline, setIsOnline] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const channelRef = useRef<any>(null)
  const mountedRef = useRef(true)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  // Track mount status
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // Load existing messages
  useEffect(() => {
    if (!user) return

    const loadMessages = async () => {
      const { data } = await supabase
        .from('order_chat_messages')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: true })
      if (data && mountedRef.current) setMessages(data)
    }
    loadMessages()
  }, [user, orderId, supabase])

  // Subscribe to new messages + presence + typing on ONE channel
  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel(`order-chat-${orderId}`, {
        config: { presence: { key: user.id } },
      })
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'order_chat_messages',
          filter: `order_id=eq.${orderId}`,
        },
        (payload: any) => {
          if (!mountedRef.current) return
          setMessages(prev => {
            if (prev.find(m => m.id === payload.new.id)) return prev
            return [...prev, payload.new as ChatMessage]
          })
        }
      )
      .on('presence', { event: 'sync' }, () => {
        if (!mountedRef.current) return
        const state = channel.presenceState()
        setIsOnline(!!state[otherUserId])
      })
      .on('broadcast', { event: 'typing' }, (payload: any) => {
        if (!mountedRef.current) return
        if (payload.payload?.user_id !== user.id) {
          setIsTyping(true)
          if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
          typingTimerRef.current = setTimeout(() => {
            if (mountedRef.current) setIsTyping(false)
          }, 2000)
        }
      })
      .subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED' && mountedRef.current) {
          try {
            await channel.track({ user_id: user.id })
          } catch {
            // Ignore AbortError on unmount
          }
        }
      })

    channelRef.current = channel

    return () => {
      try {
        supabase.removeChannel(channel)
      } catch {
        // Ignore errors during cleanup
      }
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    }
  }, [user, orderId, otherUserId, supabase])

  // Scroll to bottom on new messages
  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  const broadcastTyping = useCallback(() => {
    if (channelRef.current && user) {
      try {
        channelRef.current.send({
          type: 'broadcast',
          event: 'typing',
          payload: { user_id: user.id },
        })
      } catch {
        // Ignore if channel is closed
      }
    }
  }, [user])

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

    if (mountedRef.current) setSending(false)
  }

  if (!user) return null

  return (
    <div className={styles.chatContainer}>
      {/* Header */}
      <div className={styles.chatHeader}>
        <div className={styles.headerInfo}>
          <span className={styles.userName}>{otherUserName}</span>
          <span className={`${styles.statusDot} ${isOnline ? styles.online : styles.offline}`} />
          {isOnline && <span className={styles.statusText}>Online</span>}
        </div>
      </div>

      {/* Messages */}
      <div className={styles.messageList}>
        {messages.length === 0 && (
          <div className={styles.emptyState}>
            <span>💬</span>
            <p>Start a conversation about this order</p>
          </div>
        )}
        {messages.map((msg) => {
          const isMine = msg.sender_id === user.id
          const avatar = isMine ? myAvatar : otherAvatar
          const initials = isMine ? '👤' : otherUserName.charAt(0).toUpperCase()
          return (
            <div key={msg.id} className={`${styles.messageRow} ${isMine ? styles.mine : styles.theirs}`}>
              {!isMine && (
                <div className={styles.avatar}>
                  {avatar ? <img src={avatar} alt="" /> : <span>{initials}</span>}
                </div>
              )}
              <div className={styles.messageBubble}>
                <div className={styles.bubbleContent}>{msg.content}</div>
                <div className={styles.bubbleTime}>
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              {isMine && (
                <div className={styles.avatar}>
                  {avatar ? <img src={avatar} alt="" /> : <span>{'👤'}</span>}
                </div>
              )}
            </div>
          )
        })}
        {isTyping && (
          <div className={`${styles.messageRow} ${styles.theirs}`}>
            <div className={styles.avatar}>
              {otherAvatar ? <img src={otherAvatar} alt="" /> : <span>{otherUserName.charAt(0).toUpperCase()}</span>}
            </div>
            <div className={styles.messageBubble}>
              <div className={styles.typingIndicator}>
                <span /><span /><span />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className={styles.chatInput}>
        <input
          type="text"
          value={newMsg}
          onChange={(e) => {
            setNewMsg(e.target.value)
            broadcastTyping()
          }}
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
