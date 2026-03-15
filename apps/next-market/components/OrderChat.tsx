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
            <span>💬</span>
            <p>Start a conversation about this order</p>
          </div>
        )}
        {messages.map((msg) => {
          const isMine = msg.sender_id === user.id
          const avatar = isMine ? myAvatar : otherAvatar
          const initial = isMine ? 'Y' : otherUserName.charAt(0).toUpperCase()
          return (
            <div key={msg.id} className={`${styles.messageRow} ${isMine ? styles.mine : styles.theirs}`}>
              {!isMine && (
                <div className={styles.avatar}>
                  {avatar ? <img src={avatar} alt="" /> : <span>{initial}</span>}
                </div>
              )}
              <div className={styles.messageBubble}>
                <div className={styles.bubbleContent} style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                <div className={styles.bubbleTime}>
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
