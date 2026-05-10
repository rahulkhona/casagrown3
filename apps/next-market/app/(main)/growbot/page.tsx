'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useAuth } from '../../../lib/useAuth'
import { createClient } from '../../../lib/supabase'
import DynamicUICardRenderer from '../../components/casabot/DynamicUICards'

// ─── Types ────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  uiActions?: any[]
  media?: { url: string; type: string }[]
  timestamp: string
}

const STORAGE_KEY = 'growbot_chat_history'
const GROWBOT_AVATAR = '/growbot-avatar-v3.png'

// ─── Helpers ──────────────────────────────────────────────────────────

function loadHistory(): ChatMessage[] {
  if (typeof window === 'undefined') return []
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch { return [] }
}

function saveHistory(messages: ChatMessage[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-50))) } catch {}
}

// ─── Main Component ──────────────────────────────────────────────────

export default function GrowBotChatPage() {
  const { user } = useAuth()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [mediaFiles, setMediaFiles] = useState<File[]>([])
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const initRef = useRef(false)

  // Load history on mount
  useEffect(() => {
    const h = loadHistory()
    setMessages(h)
  }, [])

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isThinking])

  // Trigger welcome on first visit (no history)
  useEffect(() => {
    if (initRef.current) return
    const h = loadHistory()
    if (h.length === 0) {
      initRef.current = true
      sendToGrowBot('__INIT_WELCOME__', [])
    } else {
      initRef.current = true
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const sendToGrowBot = useCallback(async (messageText: string, currentMessages: ChatMessage[], imageBase64?: string) => {
    setIsThinking(true)

    // Build history for the edge function
    const history = currentMessages.map(m => ({
      role: m.role,
      text: m.text,
    }))

    try {
      const supabase = createClient()
      const { data, error } = await supabase.functions.invoke('growbot', {
        body: {
          message: messageText,
          image: imageBase64 || null,
          history,
          userId: user?.id || null,
        },
      })

      if (error) throw error

      const botMessage: ChatMessage = {
        id: `bot-${Date.now()}`,
        role: 'assistant',
        text: data.text || '',
        uiActions: data.uiActions || [],
        timestamp: new Date().toISOString(),
      }

      setMessages(prev => {
        const updated = [...prev, botMessage]
        saveHistory(updated)
        return updated
      })
    } catch (err: any) {
      console.error('GrowBot error:', err)
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        text: 'Sorry, I had trouble processing that. Please try again.',
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => {
        const updated = [...prev, errorMessage]
        saveHistory(updated)
        return updated
      })
    } finally {
      setIsThinking(false)
    }
  }, [user?.id])

  const handleSend = async () => {
    const text = input.trim()
    if (!text && mediaFiles.length === 0) return

    // Convert media to base64 if present
    let imageBase64: string | undefined
    if (mediaFiles.length > 0) {
      const file = mediaFiles[0]
      const reader = new FileReader()
      imageBase64 = await new Promise<string>((resolve) => {
        reader.onloadend = () => resolve(reader.result as string)
        reader.readAsDataURL(file)
      })
    }

    // Add user message
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: text || '📷 Photo',
      media: mediaPreviews.map(url => ({ url, type: 'image' })),
      timestamp: new Date().toISOString(),
    }

    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    saveHistory(updatedMessages)
    setInput('')
    setMediaFiles([])
    setMediaPreviews([])

    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
    }

    await sendToGrowBot(text || 'Please analyze this photo', updatedMessages.slice(0, -1), imageBase64)
  }

  const handleActionClick = (action: string) => {
    setInput(action)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const handleNewChat = () => {
    setMessages([])
    localStorage.removeItem(STORAGE_KEY)
    initRef.current = false
    setTimeout(() => sendToGrowBot('__INIT_WELCOME__', []), 100)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      const file = files[0]
      setMediaFiles([file])
      setMediaPreviews([URL.createObjectURL(file)])
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeMedia = () => {
    mediaPreviews.forEach(url => URL.revokeObjectURL(url))
    setMediaFiles([])
    setMediaPreviews([])
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`
    }
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100dvh',
      background: 'linear-gradient(180deg, #f0fdf4 0%, #ffffff 30%)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
        borderBottom: '1px solid #e5e7eb', background: 'white',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button
          onClick={() => window.history.back()}
          style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', padding: 0, color: '#6b7280' }}
          aria-label="Go back"
        >
          ←
        </button>
        <div style={{ position: 'relative', width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
          <img src={GROWBOT_AVATAR} alt="GrowBot" style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scale(1.2)' }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, color: '#111827', fontSize: 16 }}>GrowBot</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />
            <span style={{ fontSize: 12, color: '#6b7280' }}>Online</span>
          </div>
        </div>
        <button
          onClick={handleNewChat}
          style={{
            background: 'none', border: '1px solid #e5e7eb', borderRadius: 20,
            padding: '6px 14px', fontSize: 13, color: '#6b7280', cursor: 'pointer',
          }}
        >
          New Chat
        </button>
      </div>

      {/* Message Area */}
      <div
        ref={scrollRef}
        style={{
          flex: 1, overflowY: 'auto', padding: '16px 12px',
          display: 'flex', flexDirection: 'column', gap: 16,
        }}
      >
        {messages.map(msg => (
          <div key={msg.id} style={{
            display: 'flex', gap: 10,
            flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
            alignItems: 'flex-start',
          }}>
            {/* Avatar */}
            {msg.role === 'assistant' && (
              <div style={{ width: 32, height: 32, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
                <img src={GROWBOT_AVATAR} alt="GrowBot" style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scale(1.2)' }} />
              </div>
            )}

            <div style={{ maxWidth: '80%', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {/* Media attachments */}
              {msg.media && msg.media.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {msg.media.map((m, i) => (
                    <img key={i} src={m.url} alt="Attachment" style={{
                      maxWidth: 200, maxHeight: 200, borderRadius: 12, objectFit: 'cover',
                    }} />
                  ))}
                </div>
              )}

              {/* Text bubble */}
              {msg.text && (
                <div style={{
                  padding: '10px 14px',
                  borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  background: msg.role === 'user' ? '#166534' : 'white',
                  color: msg.role === 'user' ? 'white' : '#111827',
                  fontSize: 14, lineHeight: 1.5,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>
                  {msg.text}
                </div>
              )}

              {/* Tool cards */}
              {msg.uiActions && msg.uiActions.length > 0 && (
                <div>
                  {msg.uiActions.map((action: any, i: number) => (
                    <DynamicUICardRenderer key={i} action={action} onActionClick={handleActionClick} />
                  ))}
                </div>
              )}

              {/* Timestamp */}
              <div style={{
                fontSize: 11, color: '#9ca3af',
                textAlign: msg.role === 'user' ? 'right' : 'left',
                paddingTop: 2,
              }}>
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {isThinking && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
              <img src={GROWBOT_AVATAR} alt="GrowBot" style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scale(1.2)' }} />
            </div>
            <div style={{
              padding: '12px 16px', borderRadius: '16px 16px 16px 4px',
              background: 'white', boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
              display: 'flex', gap: 4, alignItems: 'center',
            }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', animation: 'growbot-dot 1.4s infinite ease-in-out both', animationDelay: '0s' }} />
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', animation: 'growbot-dot 1.4s infinite ease-in-out both', animationDelay: '0.2s' }} />
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', animation: 'growbot-dot 1.4s infinite ease-in-out both', animationDelay: '0.4s' }} />
              <style>{`
                @keyframes growbot-dot {
                  0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
                  40% { transform: scale(1); opacity: 1; }
                }
              `}</style>
            </div>
          </div>
        )}
      </div>

      {/* Media Preview */}
      {mediaPreviews.length > 0 && (
        <div style={{ padding: '8px 16px', background: '#f9fafb', borderTop: '1px solid #e5e7eb', display: 'flex', gap: 8 }}>
          {mediaPreviews.map((preview, i) => (
            <div key={i} style={{ position: 'relative', width: 64, height: 64 }}>
              <img src={preview} alt="Preview" style={{ width: '100%', height: '100%', borderRadius: 8, objectFit: 'cover' }} />
              <button
                onClick={removeMedia}
                style={{
                  position: 'absolute', top: -6, right: -6, width: 20, height: 20,
                  borderRadius: '50%', background: '#ef4444', color: 'white',
                  border: 'none', fontSize: 12, cursor: 'pointer', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                }}
              >✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Compose Bar */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', gap: 8, padding: '10px 12px',
        borderTop: '1px solid #e5e7eb', background: 'white',
        paddingBottom: 'max(10px, env(safe-area-inset-bottom))',
      }}>
        {/* Photo button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 6,
            color: '#6b7280', display: 'flex', alignItems: 'center',
          }}
          aria-label="Attach photo"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />

        {/* Text input */}
        <textarea
          ref={inputRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Ask GrowBot anything..."
          disabled={isThinking}
          rows={1}
          style={{
            flex: 1, padding: '10px 14px', border: '1px solid #e5e7eb',
            borderRadius: 20, fontSize: 14, resize: 'none', outline: 'none',
            maxHeight: 120, lineHeight: 1.4, fontFamily: 'inherit',
            background: isThinking ? '#f9fafb' : 'white',
          }}
        />

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={(!input.trim() && mediaFiles.length === 0) || isThinking}
          style={{
            background: (!input.trim() && mediaFiles.length === 0) || isThinking ? '#d1d5db' : '#166534',
            color: 'white', border: 'none', width: 40, height: 40,
            borderRadius: '50%', cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
          aria-label="Send message"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
