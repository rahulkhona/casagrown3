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
  actions?: any[]
  media?: { url: string; type: string }[]
  timestamp: string
}

interface Topic {
  id: string
  title: string
  messages: ChatMessage[]
  lastUpdated: string
}

const GROWBOT_AVATAR = '/growbot-avatar-v3.png'

// Storage helpers: guests use sessionStorage (tab-scoped), logged-in users use
// localStorage keyed by user ID — prevents shared-device topic leakage.

function getStorage(userId?: string | null): Storage {
  if (typeof window === 'undefined') return { getItem: () => null, setItem: () => {}, removeItem: () => {} } as any
  return userId ? window.localStorage : window.sessionStorage
}
function topicsKey(userId?: string | null) { return userId ? `growbot_topics_${userId}` : 'growbot_topics' }
function activeKey(userId?: string | null)  { return userId ? `growbot_active_${userId}` : 'growbot_active_topic' }

function loadTopics(userId?: string | null): Topic[] {
  try {
    const stored = getStorage(userId).getItem(topicsKey(userId))
    return stored ? JSON.parse(stored) : []
  } catch { return [] }
}

function saveTopics(topics: Topic[], userId?: string | null) {
  try { getStorage(userId).setItem(topicsKey(userId), JSON.stringify(topics.slice(0, 20))) } catch {}
}

function getActiveTopic(userId?: string | null): Topic | null {
  try {
    const activeId = getStorage(userId).getItem(activeKey(userId))
    if (!activeId) return null
    return loadTopics(userId).find(t => t.id === activeId) || null
  } catch { return null }
}


function deriveTitle(messages: ChatMessage[]): string {
  const firstUserMsg = messages.find(m => m.role === 'user')
  if (!firstUserMsg?.text) return 'New Topic'
  return firstUserMsg.text.slice(0, 40) + (firstUserMsg.text.length > 40 ? '…' : '')
}

function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let listItems: string[] = []

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`ul-${elements.length}`} style={{ margin: '6px 0', paddingLeft: 20 }}>
          {listItems.map((item, i) => (
            <li key={i} style={{ marginBottom: 2 }}>{formatInline(item)}</li>
          ))}
        </ul>
      )
      listItems = []
    }
  }

  const formatInline = (str: string): React.ReactNode => {
    // Bold + italic
    const parts = str.split(/(\*\*\*.*?\*\*\*|\*\*.*?\*\*|\*.*?\*)/g)
    return parts.map((part, i) => {
      if (part.startsWith('***') && part.endsWith('***'))
        return <strong key={i}><em>{part.slice(3, -3)}</em></strong>
      if (part.startsWith('**') && part.endsWith('**'))
        return <strong key={i}>{part.slice(2, -2)}</strong>
      if (part.startsWith('*') && part.endsWith('*'))
        return <em key={i}>{part.slice(1, -1)}</em>
      return part
    })
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('* ') || trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
      listItems.push(trimmed.slice(2))
    } else {
      flushList()
      if (trimmed === '') {
        elements.push(<br key={`br-${elements.length}`} />)
      } else {
        elements.push(<p key={`p-${elements.length}`} style={{ margin: '4px 0' }}>{formatInline(trimmed)}</p>)
      }
    }
  }
  flushList()
  return <>{elements}</>
}

// ─── Main Component ──────────────────────────────────────────────────

export default function GrowBotChatPage() {
  const { user, loading: authLoading } = useAuth()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [mediaFiles, setMediaFiles] = useState<File[]>([])
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([])
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null)
  const [showTopics, setShowTopics] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const initRef = useRef(false)
  const lastUserIdRef = useRef<string | null | undefined>(undefined)
  // Stable ID for this browser session — used for guest token tracking
  const guestSessionIdRef = useRef<string>('')
  useEffect(() => {
    const GUEST_KEY = 'growbot_guest_sid'
    let sid = window.sessionStorage.getItem(GUEST_KEY)
    if (!sid) { sid = crypto.randomUUID(); window.sessionStorage.setItem(GUEST_KEY, sid) }
    guestSessionIdRef.current = sid
  }, [])

  // Save current messages to topic storage
  const saveCurrentTopic = useCallback((msgs: ChatMessage[], topicId?: string) => {
    const id = topicId || activeTopicId
    if (!id) return
    const uid = user?.id || null
    const topics = loadTopics(uid)
    const idx = topics.findIndex(t => t.id === id)
    const topic: Topic = {
      id,
      title: deriveTitle(msgs),
      messages: msgs.slice(-50),
      lastUpdated: new Date().toISOString(),
    }
    if (idx >= 0) {
      topics[idx] = topic
    } else {
      topics.unshift(topic)
    }
    saveTopics(topics, uid)
  }, [activeTopicId, user?.id])

  // Load active topic on mount
  useEffect(() => {
    if (authLoading) return
    const active = getActiveTopic(user?.id)
    if (active) {
      setActiveTopicId(active.id)
      setMessages(active.messages)
    }
  }, [authLoading, user?.id])

  // Detect auth state changes — migrate guest topics on LOGIN, clear on LOGOUT
  useEffect(() => {
    if (authLoading) return
    const currentUserId = user?.id || null
    if (lastUserIdRef.current === undefined) {
      lastUserIdRef.current = currentUserId
      return
    }
    if (lastUserIdRef.current !== currentUserId) {
      const wasLogin  = !lastUserIdRef.current && !!currentUserId
      const wasLogout = !!lastUserIdRef.current && !currentUserId
      lastUserIdRef.current = currentUserId

      if (wasLogin && currentUserId) {
        // Migrate guest sessionStorage topics → user localStorage
        const guestTopics = loadTopics(null)
        if (guestTopics.length > 0) {
          const existingUserTopics = loadTopics(currentUserId)
          // Prepend guest topics (most recent first), dedup by id
          const merged = [...guestTopics, ...existingUserTopics].filter(
            (t, i, arr) => arr.findIndex(x => x.id === t.id) === i
          )
          saveTopics(merged, currentUserId)
          // Restore active topic for this user
          const guestActiveId = window.sessionStorage.getItem(activeKey(null))
          if (guestActiveId) {
            window.localStorage.setItem(activeKey(currentUserId), guestActiveId)
            setActiveTopicId(guestActiveId)
          }
          // Clear guest session storage
          window.sessionStorage.removeItem(topicsKey(null))
          window.sessionStorage.removeItem(activeKey(null))
        }
        // Re-init to load user's topics (including migrated ones)
        initRef.current = false
      }

      if (wasLogout) {
        setMessages([])
        setActiveTopicId(null)
        initRef.current = false
        setTimeout(() => sendToGrowBot('__INIT_WELCOME__', []), 200)
      }
    }
  }, [user?.id, authLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isThinking])

  // Trigger welcome on first visit (no active topic)
  useEffect(() => {
    if (authLoading || initRef.current) return
    const uid = user?.id || null
    const active = getActiveTopic(uid)
    if (!active || active.messages.length === 0) {
      initRef.current = true
      const newId = `topic-${Date.now()}`
      setActiveTopicId(newId)
      getStorage(uid).setItem(activeKey(uid), newId)
      sendToGrowBot('__INIT_WELCOME__', [], undefined, newId)
    } else {
      initRef.current = true
    }
  }, [authLoading, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const sendToGrowBot = useCallback(async (messageText: string, currentMessages: ChatMessage[], imageBase64?: string, topicIdOverride?: string) => {
    setIsThinking(true)

    // Build history for the edge function
    const history = currentMessages.map(m => {
      let text = m.text || '';
      // Include tool results in history so the LLM knows what was already called
      if (m.role === 'assistant' && m.actions && m.actions.length > 0) {
        const toolSummaries = m.actions.map((a: any) => {
          const name = a.type || 'unknown';
          const resultCount = a.data?.result_count;
          const status = a.data?.status;
          if (name === 'ShoppingResultsCard') {
            return `[TOOL CALLED: Shopping search — ${resultCount != null ? resultCount + ' results found' : 'completed'}]`;
          }
          if (name === 'BroadcastBuyRequestCard') {
            return `[TOOL CALLED: Buy request posted to community — status: ${status || 'completed'}]`;
          }
          return `[TOOL CALLED: ${name}]`;
        }).join(' ');
        text += '\n' + toolSummaries;
      }
      return { role: m.role, text };
    })

    try {
      const supabase = createClient()
      const { data, error } = await supabase.functions.invoke('growbot', {
        body: {
          message: messageText,
          image: imageBase64 || null,
          history,
          userId: user?.id || null,
          guestSessionId: user?.id ? null : guestSessionIdRef.current,
        },
      })

      if (error) throw error

      const botMessage: ChatMessage = {
        id: `bot-${Date.now()}`,
        role: 'assistant',
        text: data.text || '',
        actions: data.actions || [],
        timestamp: new Date().toISOString(),
      }

      setMessages(prev => {
        const updated = [...prev, botMessage]
        saveCurrentTopic(updated, topicIdOverride)
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
        saveCurrentTopic(updated, topicIdOverride)
        return updated
      })
    } finally {
      setIsThinking(false)
    }
  }, [user?.id, saveCurrentTopic])

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
    saveCurrentTopic(updatedMessages)
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

  // Silent system-level trigger — sends to LLM without a visible user message
  const handleSystemMessage = (msg: string) => {
    sendToGrowBot(msg, messages)
  }

  const handleNewTopic = () => {
    if (activeTopicId && messages.length > 0) {
      saveCurrentTopic(messages)
    }
    const uid = user?.id || null
    const newId = `topic-${Date.now()}`
    setActiveTopicId(newId)
    getStorage(uid).setItem(activeKey(uid), newId)
    setMessages([])
    initRef.current = false
    setTimeout(() => sendToGrowBot('__INIT_WELCOME__', [], undefined, newId), 100)
  }

  const handleSwitchTopic = (topicId: string) => {
    if (activeTopicId && messages.length > 0) {
      saveCurrentTopic(messages)
    }
    const uid = user?.id || null
    const topics = loadTopics(uid)
    const topic = topics.find(t => t.id === topicId)
    if (topic) {
      setActiveTopicId(topic.id)
      getStorage(uid).setItem(activeKey(uid), topic.id)
      setMessages(topic.messages)
      initRef.current = true
    }
    setShowTopics(false)
  }

  const [attachMenu, setAttachMenu] = useState(false)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const [locating, setLocating] = useState(false)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      const file = files[0]
      setMediaFiles([file])
      setMediaPreviews([URL.createObjectURL(file)])
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (cameraInputRef.current) cameraInputRef.current.value = ''
    setAttachMenu(false)
  }

  const removeMedia = () => {
    mediaPreviews.forEach(url => URL.revokeObjectURL(url))
    setMediaFiles([])
    setMediaPreviews([])
  }

  const handleShareLocation = () => {
    setAttachMenu(false)
    if (!navigator.geolocation) {
      alert('Location is not supported by your browser.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        setLocating(false)
        const locationText = `📍 My current location is: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
        // Add as a user message and send to GrowBot
        const userMessage: ChatMessage = {
          id: `user-${Date.now()}`,
          role: 'user',
          text: locationText,
          timestamp: new Date().toISOString(),
        }
        const updatedMessages = [...messages, userMessage]
        setMessages(updatedMessages)
        saveCurrentTopic(updatedMessages)
        sendToGrowBot(locationText, messages)
      },
      (err) => {
        setLocating(false)
        alert('Unable to get your location. Please check your browser permissions.')
        console.error('Geolocation error:', err)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
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
      display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 144px)',
      background: 'linear-gradient(180deg, #f0fdf4 0%, #ffffff 30%)',
      maxWidth: '100vw', overflow: 'hidden',
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
          onClick={() => setShowTopics(!showTopics)}
          style={{
            background: 'none', border: '1px solid #e5e7eb', borderRadius: 20,
            padding: '6px 12px', fontSize: 13, color: '#6b7280', cursor: 'pointer',
          }}
          aria-label="Show topics"
        >
          ☰
        </button>
        <button
          onClick={handleNewTopic}
          style={{
            background: 'none', border: '1px solid #e5e7eb', borderRadius: 20,
            padding: '6px 14px', fontSize: 13, color: '#6b7280', cursor: 'pointer',
          }}
        >
          + New Topic
        </button>
      </div>

      {/* Topic Drawer */}
      {showTopics && (
        <div style={{
          position: 'absolute', top: 65, right: 0, left: 0, bottom: 0,
          background: 'rgba(0,0,0,0.12)', zIndex: 20,
        }} onClick={() => setShowTopics(false)}>
          <div
            style={{
              background: '#f0fdf4', width: '80%', maxWidth: 300, height: '100%',
              borderRight: '2px solid #bbf7d0', padding: '16px 0',
              overflowY: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: '0 16px 12px', fontWeight: 700, color: '#14532d', fontSize: 15, borderBottom: '1px solid #bbf7d0' }}>
              Past Topics
            </div>
            {loadTopics(user?.id).length === 0 && (
              <div style={{ padding: '24px 16px', color: '#6b7280', fontSize: 13, textAlign: 'center' }}>No past topics yet</div>
            )}
            {loadTopics(user?.id).map(topic => (
              <button
                key={topic.id}
                onClick={() => handleSwitchTopic(topic.id)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '12px 16px', border: 'none', cursor: 'pointer',
                  background: topic.id === activeTopicId ? '#dcfce7' : 'transparent',
                  borderBottom: '1px solid #dcfce7',
                }}
              >
                <div style={{ fontWeight: 600, color: '#111827', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {topic.title}
                </div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                  {new Date(topic.lastUpdated).toLocaleDateString()} · {topic.messages.length} msgs
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

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
                  wordBreak: 'break-word',
                }}>
                  {msg.role === 'assistant' ? renderMarkdown(msg.text) : msg.text}
                </div>
              )}

              {/* Tool cards */}
              {msg.actions && msg.actions.length > 0 && (
                <div>
                  {msg.actions.map((action: any, i: number) => (
                    <DynamicUICardRenderer key={i} action={action} onActionClick={handleActionClick} onSystemMessage={handleSystemMessage} />
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
        display: 'flex', alignItems: 'flex-end', gap: 6, padding: '10px 12px',
        borderTop: '1px solid #e5e7eb', background: 'white',
        paddingBottom: 'max(10px, env(safe-area-inset-bottom))',
      }}>
        {/* Hidden file inputs */}
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileSelect} style={{ display: 'none' }} />
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} style={{ display: 'none' }} />

        {/* Attach button with popup menu */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setAttachMenu(prev => !prev)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 6,
              color: attachMenu ? '#166534' : '#6b7280', display: 'flex', alignItems: 'center',
              transition: 'color 0.15s',
            }}
            aria-label="Attach"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="16"/>
              <line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
          </button>

          {attachMenu && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setAttachMenu(false)} />
              <div style={{
                position: 'absolute', bottom: '100%', left: 0, marginBottom: 8,
                background: 'white', borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                border: '1px solid #e5e7eb', overflow: 'hidden', zIndex: 50, minWidth: 180,
              }}>
                <button
                  onClick={() => { setAttachMenu(false); cameraInputRef.current?.click() }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    padding: '12px 16px', background: 'none', border: 'none',
                    cursor: 'pointer', fontSize: 14, color: '#374151',
                  }}
                >
                  📸 Take Photo
                </button>
                <div style={{ height: 1, background: '#f3f4f6' }} />
                <button
                  onClick={() => { setAttachMenu(false); fileInputRef.current?.click() }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    padding: '12px 16px', background: 'none', border: 'none',
                    cursor: 'pointer', fontSize: 14, color: '#374151',
                  }}
                >
                  🖼️ Photo Library
                </button>
                <div style={{ height: 1, background: '#f3f4f6' }} />
                <button
                  onClick={handleShareLocation}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    padding: '12px 16px', background: 'none', border: 'none',
                    cursor: 'pointer', fontSize: 14, color: '#374151',
                  }}
                >
                  📍 Share Location
                </button>
              </div>
            </>
          )}
        </div>

        {/* Text input */}
        <textarea
          ref={inputRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Ask GrowBot anything..."
          disabled={isThinking || locating}
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
