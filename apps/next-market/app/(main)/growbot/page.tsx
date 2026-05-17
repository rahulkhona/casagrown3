'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../../lib/useAuth'
import { createClient } from '../../../lib/supabase'
import DynamicUICardRenderer from '../../components/casabot/DynamicUICards'
import SocialShareModal from '../../components/SocialShareModal'
import { summarizeActions } from '../../../lib/growbot-share-utils'

// ─── Types ────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  actions?: any[]
  nextActions?: string[]   // follow-up chips for plain text answers
  media?: { url: string; type: string }[]
  timestamp: string
  shareId?: string     // set after user shares this message
  feedback?: 'up' | 'down'  // in-chat thumbs up/down
  isError?: boolean
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
  const { user, loading: authLoading, refresh: refreshAuth } = useAuth()
  const router = useRouter()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null)
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

  // Migrate guest-created polls, facts, AND garden data to the authenticated user
  useEffect(() => {
    if (!user || !guestSessionIdRef.current) return
    const supabase = createClient()
    const guestSid = guestSessionIdRef.current

    // 1. Migrate polls
    supabase.from('growbot_shared_responses')
      .update({ user_id: user.id })
      .eq('guest_session_id', guestSid)
      .is('user_id', null)
      .then(({ error }) => { if (error) console.warn('[GrowBot] Poll migration failed:', error) })

    // 2. Migrate facts AND extract crops for user_garden
    supabase.from('growbot_user_facts')
      .select('fact')
      .eq('guest_session_id', guestSid)
      .is('user_id', null)
      .then(async ({ data: guestFacts, error: fetchErr }) => {
        if (fetchErr) { console.warn('[GrowBot] Fact fetch failed:', fetchErr); return }
        if (!guestFacts || guestFacts.length === 0) return

        // Migrate facts to user
        await supabase.from('growbot_user_facts')
          .update({ user_id: user.id, guest_session_id: null })
          .eq('guest_session_id', guestSid)
          .is('user_id', null)

        // Extract crops from facts like "User grows: tomatoes, basil, peppers."
        const crops: string[] = []
        let wantsNotify = true // default opt-in
        guestFacts.forEach(f => {
          const match = f.fact.match(/^User grows:\s*(.+)\.?$/i)
          if (match) {
            match[1].split(',').forEach((c: string) => {
              const name = c.trim().toLowerCase().replace(/\.$/, '')
              if (name) crops.push(name)
            })
          }
          if (/does NOT want demand/i.test(f.fact)) wantsNotify = false
        })

        // Populate user_garden
        if (crops.length > 0) {
          const gardenInserts = crops.map(name => ({
            user_id: user.id,
            produce_name: name,
            is_custom: true,
          }))
          const { error: gardenErr } = await supabase.from('user_garden')
            .upsert(gardenInserts, { onConflict: 'user_id,produce_name', ignoreDuplicates: true })
          if (gardenErr) console.warn('[GrowBot] Garden migration failed:', gardenErr)

          // Also populate grower_produces (community chat "Notify Me" table)
          if (wantsNotify) {
            const growerInserts = crops.map(name => ({
              user_id: user.id,
              produce_name: name,
              notify_on_search: true,
            }))
            const { error: growerErr } = await supabase.from('grower_produces')
              .upsert(growerInserts, { onConflict: 'user_id,produce_name', ignoreDuplicates: true })
            if (growerErr) console.warn('[GrowBot] Grower produces migration failed:', growerErr)
            else console.log(`[GrowBot] Migrated ${crops.length} crops to grower_produces`)
          }
        }
      })
  }, [user])

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

    const botMessageId = `bot-${Date.now()}`

    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

      // Use raw fetch for SSE streaming
      const res = await fetch(`${supabaseUrl}/functions/v1/growbot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || anonKey}`,
          'apikey': anonKey,
        },
        body: JSON.stringify({
          message: messageText,
          image: imageBase64 || null,
          history,
          userId: user?.id || null,
          guestSessionId: user?.id ? null : guestSessionIdRef.current,
        }),
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const contentType = res.headers.get('content-type') || ''

      if (contentType.includes('text/event-stream') && res.body) {
        // SSE streaming mode
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let streamedText = ''

        // Add placeholder bot message immediately
        const placeholderMsg: ChatMessage = {
          id: botMessageId, role: 'assistant', text: '', timestamp: new Date().toISOString(),
        }
        setMessages(prev => [...prev, placeholderMsg])
        setIsThinking(false) // Hide thinking indicator, text is streaming
        setStreamingMsgId(botMessageId)

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          let currentEvent = ''
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim()
            } else if (line.startsWith('data: ') && currentEvent) {
              const jsonStr = line.slice(6).trim()
              if (!jsonStr) continue
              try {
                const payload = JSON.parse(jsonStr)

                if (currentEvent === 'delta') {
                  // Clear status rotation if running
                  if ((window as any).__growbotStatusInterval) {
                    clearInterval((window as any).__growbotStatusInterval)
                    ;(window as any).__growbotStatusInterval = null
                  }
                  // Append streaming text chunk
                  streamedText += payload.text || ''
                  setMessages(prev => prev.map(m =>
                    m.id === botMessageId ? { ...m, text: streamedText } : m
                  ))
                } else if (currentEvent === 'status') {
                  // Tool processing — start rotating status messages
                  const statusPhrases = [
                    'Thinking…',
                    'Researching…',
                    'Generating…',
                    'Polishing…',
                  ]
                  let phraseIdx = 0
                  setMessages(prev => prev.map(m =>
                    m.id === botMessageId ? { ...m, text: streamedText + '\n\n' + statusPhrases[0] } : m
                  ))
                  const statusInterval = setInterval(() => {
                    phraseIdx = (phraseIdx + 1) % statusPhrases.length
                    setMessages(prev => prev.map(m =>
                      m.id === botMessageId ? { ...m, text: streamedText + '\n\n' + statusPhrases[phraseIdx] } : m
                    ))
                  }, 2000)
                  // Store interval to clear on done/delta
                  ;(window as any).__growbotStatusInterval = statusInterval
                } else if (currentEvent === 'done') {
                  // Clear status rotation
                  if ((window as any).__growbotStatusInterval) {
                    clearInterval((window as any).__growbotStatusInterval)
                    ;(window as any).__growbotStatusInterval = null
                  }
                  // Final state — replace interim text with clean final response + cards
                  setStreamingMsgId(null)
                  const finalMsg: ChatMessage = {
                    id: botMessageId,
                    role: 'assistant',
                    text: payload.text || streamedText,
                    actions: payload.actions || [],
                    nextActions: payload.nextActions || [],
                    timestamp: new Date().toISOString(),
                  }
                  setMessages(prev => {
                    const updated = prev.map(m => m.id === botMessageId ? finalMsg : m)
                    saveCurrentTopic(updated, topicIdOverride)
                    return updated
                  })
                } else if (currentEvent === 'error') {
                  setMessages(prev => prev.map(m =>
                    m.id === botMessageId ? { ...m, text: payload.message || 'Something went wrong.' } : m
                  ))
                } else if (currentEvent === 'auth_required') {
                  // Guest hit the free-exchange limit — inject AuthenticationCard into chat
                  setStreamingMsgId(null)
                  setIsThinking(false)
                  const authMsg: ChatMessage = {
                    id: botMessageId,
                    role: 'assistant',
                    text: "You've had 5 free chats today \uD83C\uDF31 Sign in to keep going — it's free!",
                    actions: [{ type: 'AuthenticationCard', position: 'after', data: { reason: 'guest_limit' } }],
                    timestamp: new Date().toISOString(),
                  }
                  setMessages(prev => {
                    const updated = prev.map(m => m.id === botMessageId ? authMsg : m)
                    saveCurrentTopic(updated, topicIdOverride)
                    return updated
                  })
                }
              } catch { /* skip malformed */ }
              currentEvent = ''
            }
          }
        }
      } else {
        // Fallback: non-streaming JSON response (backwards compat)
        const data = await res.json()
        const botMessage: ChatMessage = {
          id: botMessageId, role: 'assistant',
          text: data.text || '', actions: data.actions || [],
          nextActions: data.nextActions || [], timestamp: new Date().toISOString(),
        }
        setMessages(prev => {
          const updated = [...prev, botMessage]
          saveCurrentTopic(updated, topicIdOverride)
          return updated
        })
      }
    } catch (err: any) {
      console.error('GrowBot error:', err)
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        text: 'System is currently busy or rate-limited. Please try again in a moment.',
        timestamp: new Date().toISOString(),
        isError: true
      }
      setMessages(prev => {
        const updated = [...prev, errorMessage]
        saveCurrentTopic(updated, topicIdOverride)
        return updated
      })
    } finally {
      setIsThinking(false)
      setStreamingMsgId(null)
    }
  }, [user?.id, saveCurrentTopic])

  const handleSend = async () => {
    const text = input.trim()
    if (!text && mediaFiles.length === 0) return

    // Convert media to base64 for Gemini AND upload to storage for persistence
    let imageBase64: string | undefined
    let persistentMediaUrl: string | undefined
    if (mediaFiles.length > 0) {
      const file = mediaFiles[0]
      const reader = new FileReader()
      imageBase64 = await new Promise<string>((resolve) => {
        reader.onloadend = () => resolve(reader.result as string)
        reader.readAsDataURL(file)
      })

      // Upload to Supabase Storage for persistent URL (used in polls, sharing)
      try {
        const supabase = createClient()
        const ext = file.name.split('.').pop() || 'jpg'
        const storagePath = `growbot/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
        const { error: uploadErr } = await supabase.storage.from('chat-media').upload(storagePath, file)
        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from('chat-media').getPublicUrl(storagePath)
          if (urlData?.publicUrl) persistentMediaUrl = urlData.publicUrl
        } else {
          console.warn('[GrowBot] Image upload to storage failed:', uploadErr.message)
        }
      } catch (e) {
        console.warn('[GrowBot] Image upload error:', e)
      }
    }

    // Add user message — use persistent storage URL if available, else blob preview
    const mediaUrl = persistentMediaUrl || (mediaPreviews.length > 0 ? mediaPreviews[0] : undefined)
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: text || '📷 Photo',
      media: mediaUrl ? [{ url: mediaUrl, type: 'image' }] : [],
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


  // ── Share the raw answer via SocialShareModal (e.g. for recipes)
  const [shareAnswerModal, setShareAnswerModal] = useState<{ question: string; answer: string; pollUrl?: string } | null>(null)

  const handleShareAnswer = (msg: ChatMessage) => {
    const msgIndex = messages.findIndex(m => m.id === msg.id)
    const lastUserMsg = [...messages.slice(0, msgIndex + 1)].reverse().find(m => m.role === 'user')
    setShareAnswerModal({ question: lastUserMsg?.text || 'GrowBot answer', answer: msg.text })
  }

  // ── In-chat poll view (shown as overlay, no navigation)
  const [pollView, setPollView] = useState<{
    shareId: string; question: string; answer: string;
    questionImage?: string;
    actions?: any[];
    votes: { accurate: number; partial: number; inaccurate: number };
    myVote: string | null;
  } | null>(null)
  const [pollingMsgId, setPollingMsgId] = useState<string | null>(null)
  const [pollSuggestion, setPollSuggestion] = useState('')
  const [suggestionSubmitted, setSuggestionSubmitted] = useState(false)

  // My Polls panel
  const [showMyPolls, setShowMyPolls] = useState(false)
  const [myPollsTab, setMyPollsTab] = useState<'created' | 'voted'>('created')
  const [myCreatedPolls, setMyCreatedPolls] = useState<{ id: string; question: string; created_at: string; vote_count: number }[]>([])
  const [myVotedPolls, setMyVotedPolls] = useState<{ id: string; question: string; rating: string; created_at: string }[]>([])
  const [myPollsLoading, setMyPollsLoading] = useState(false)

  const fetchMyPolls = async () => {
    if (!user) return
    setMyPollsLoading(true)
    const supabase = createClient()
    // Fetch polls I created
    const { data: created } = await supabase
      .from('growbot_shared_responses')
      .select('id, question, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)
    if (created) {
      // Get vote counts for each
      const withCounts = await Promise.all(created.map(async p => {
        const { count } = await supabase.from('growbot_response_votes').select('*', { count: 'exact', head: true }).eq('response_id', p.id)
        return { ...p, vote_count: count || 0 }
      }))
      setMyCreatedPolls(withCounts)
    }
    // Fetch polls I voted on
    const { data: voted } = await supabase
      .from('growbot_response_votes')
      .select('rating, created_at, response_id, growbot_shared_responses!inner(id, question)')
      .eq('voter_key', user.id)
      .order('created_at', { ascending: false })
      .limit(50)
    if (voted) {
      setMyVotedPolls(voted.map((v: any) => ({
        id: v.response_id,
        question: v.growbot_shared_responses?.question || '',
        rating: v.rating,
        created_at: v.created_at,
      })))
    }
    setMyPollsLoading(false)
  }

  const toggleMyPolls = () => {
    if (!showMyPolls) fetchMyPolls()
    setShowMyPolls(!showMyPolls)
  }

  // Lightweight sign-up form inside poll overlay — just email + OTP
  // Profile completion and TOS are handled by the existing layout gates
  const [pollGuestForm, setPollGuestForm] = useState<{
    email: string;
    step: 'capture' | 'otp' | 'done';
    otp: string; loading: boolean; error: string;
  }>({ email: '', step: 'capture', otp: '', loading: false, error: '' })

  const openPollView = (view: NonNullable<typeof pollView>) => {
    setPollView(view)
    setPollGuestForm({ email: '', step: 'capture', otp: '', loading: false, error: '' })
    setPollSuggestion('')
    setSuggestionSubmitted(false)
  }

  const handlePoll = async (msg: ChatMessage) => {
    const msgIndex = messages.findIndex(m => m.id === msg.id)
    const lastUserMsg = [...messages.slice(0, msgIndex + 1)].reverse().find(m => m.role === 'user')
    if (!lastUserMsg) return

    // Grab the first image from the user message (plant photo for ID/diagnosis)
    const questionImage = lastUserMsg.media?.[0]?.url || undefined

    setPollingMsgId(msg.id)
    const supabase = createClient()
    const uid = user?.id || null
    const { data, error } = await supabase
      .from('growbot_shared_responses')
      .insert({
        question: lastUserMsg.text,
        bot_response: msg.text,
        conversation_context: [],
        actions: msg.actions || [],
        image_url: questionImage || null,
        user_id: uid,
        guest_session_id: uid ? null : guestSessionIdRef.current,
      })
      .select('id')
      .single()
    setPollingMsgId(null)
    if (error || !data) { console.error('Poll create failed:', error); return }

    setMessages(prev => {
      const updated = prev.map(m => m.id === msg.id ? { ...m, shareId: data.id } : m)
      saveCurrentTopic(updated)
      return updated
    })
    // Show in-chat poll overlay instead of navigating
    openPollView({ shareId: data.id, question: lastUserMsg.text, answer: msg.text, questionImage, actions: msg.actions, votes: { accurate: 0, partial: 0, inaccurate: 0 }, myVote: null })
  }

  const handlePollVote = async (rating: 'accurate' | 'partial' | 'inaccurate') => {
    if (!pollView || pollView.myVote) return
    const supabase = createClient()
    const voterKey = user?.id || guestSessionIdRef.current
    const { error } = await supabase.from('growbot_response_votes').insert({
      response_id: pollView.shareId, voter_key: voterKey, rating,
    })
    if (!error) {
      setPollView(prev => prev ? { ...prev, myVote: rating, votes: { ...prev.votes, [rating]: prev.votes[rating] + 1 } } : prev)
    }
  }

  const handleGuestPollSignIn = async () => {
    if (!pollGuestForm.email.trim()) {
      setPollGuestForm(p => ({ ...p, error: 'Please enter your email.' }))
      return
    }
    setPollGuestForm(p => ({ ...p, loading: true, error: '' }))
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email: pollGuestForm.email.toLowerCase().trim(),
      options: { shouldCreateUser: true },
    })
    setPollGuestForm(p => {
      if (error) {
        const msg = error.message?.toLowerCase() || ''
        const friendlyMsg = (msg.includes('database error saving new user') || msg.includes('not available for registration'))
          ? 'This email address has been permanently closed and cannot be used to create a new account.'
          : error.message
        return { ...p, loading: false, error: friendlyMsg }
      }
      return { ...p, loading: false, step: 'otp' }
    })
  }

  const handleGuestPollVerify = async () => {
    if (pollGuestForm.otp.length < 6) return
    setPollGuestForm(p => ({ ...p, loading: true, error: '' }))
    const supabase = createClient()
    const { error } = await supabase.auth.verifyOtp({
      email: pollGuestForm.email.toLowerCase().trim(),
      token: pollGuestForm.otp,
      type: 'email',
    })
    if (error) {
      setPollGuestForm(p => ({ ...p, loading: false, error: error.message }))
      return
    }
    // Account created → handle_new_user trigger creates profile row + referral code
    // Session is now active → useAuth() picks it up → sessionStorage migrates to localStorage
    setPollGuestForm(p => ({ ...p, loading: false, step: 'done' }))
  }

  // Inline TOS acceptance for "Post to Community" action
  const [showInlineTos, setShowInlineTos] = useState(false)
  const [inlineTosLoading, setInlineTosLoading] = useState(false)
  const [inlineTosError, setInlineTosError] = useState('')

  const [communityPostStatus, setCommunityPostStatus] = useState<'idle' | 'posting' | 'posted' | 'error' | 'no-profile'>('idle')

  // Auto-post pending community poll after returning from profile-setup
  useEffect(() => {
    if (!user) return
    const pending = localStorage.getItem('growbot_pending_community_post')
    if (!pending) return
    localStorage.removeItem('growbot_pending_community_post')
    try {
      const { shareId, question, answer, pollViewData } = JSON.parse(pending)
      // Restore the poll overlay so user sees it
      if (pollViewData) {
        setPollView(pollViewData)
      }
      const autoPost = async () => {
        const supabase = createClient()
        const { data: profile } = await supabase.from('profiles').select('home_community_h3_index').eq('id', user.id).single()
        if (!profile?.home_community_h3_index) {
          console.warn('[GrowBot] Auto-post skipped: still no home_community_h3_index')
          return
        }
        const content = `🗳️ GrowBot Poll: "${question}" — Vote here: ${typeof window !== 'undefined' ? window.location.origin : ''}/growbot/share/${shareId}`
        try {
          const { sendCommunityMessage } = await import('../../../../../packages/app/features/community-chat/community-chat-service')
          await sendCommunityMessage(supabase, { h3Index: profile.home_community_h3_index, content, authorId: user.id })
          setCommunityPostStatus('posted')
        } catch (err) { console.error('[GrowBot] Auto-post failed:', err) }
      }
      autoPost()
    } catch (e) { console.error('[GrowBot] Failed to parse pending post:', e) }
  }, [user])

  const postToCommunityInline = async () => {
    if (!user || !pollView) return
    setCommunityPostStatus('posting')
    const supabase = createClient()
    // Get user's h3 index for community posting
    const { data: profile } = await supabase.from('profiles').select('home_community_h3_index').eq('id', user.id).single()
    if (!profile?.home_community_h3_index) {
      setCommunityPostStatus('no-profile')
      return
    }
    const content = `🗳️ GrowBot Poll: "${pollView.question}" — Vote here: ${typeof window !== 'undefined' ? window.location.origin : ''}/growbot/share/${pollView.shareId}`
    try {
      const { sendCommunityMessage } = await import('../../../../../packages/app/features/community-chat/community-chat-service')
      await sendCommunityMessage(supabase, {
        h3Index: profile.home_community_h3_index,
        content,
        authorId: user.id,
      })
      setCommunityPostStatus('posted')
    } catch (err: any) {
      console.error('[GrowBot] Failed to post to community:', err)
      setCommunityPostStatus('error')
    }
  }

  const handlePostToCommunity = async () => {
    if (!user || !pollView) return
    const { tosAccepted } = useAuthRef.current
    if (tosAccepted) {
      await postToCommunityInline()
      return
    }
    setShowInlineTos(true)
  }

  const handleInlineTosAccept = async () => {
    if (!user || !pollView) return
    setInlineTosLoading(true)
    setInlineTosError('')
    const supabase = createClient()
    const { error } = await supabase
      .from('profiles')
      .update({ tos_accepted_at: new Date().toISOString() })
      .eq('id', user.id)
    if (error) {
      setInlineTosError(`Could not save: ${error.message}`)
      setInlineTosLoading(false)
      return
    }
    await refreshAuth()
    setInlineTosLoading(false)
    setShowInlineTos(false)
    await postToCommunityInline()
  }

  // Keep a ref to auth state so handlers can read tosAccepted/profileComplete synchronously
  const { tosAccepted: currentTosAccepted, profileComplete: currentProfileComplete } = useAuth()
  const useAuthRef = useRef({ tosAccepted: false, profileComplete: false })
  useEffect(() => { useAuthRef.current = { tosAccepted: !!currentTosAccepted, profileComplete: !!currentProfileComplete } }, [currentTosAccepted, currentProfileComplete])

  const handleFeedback = (msgId: string, rating: 'up' | 'down') => {
    setMessages(prev => {
      const updated = prev.map(m => m.id === msgId ? { ...m, feedback: rating } : m)
      saveCurrentTopic(updated)
      return updated
    })
  }

  // Silent system-level trigger — sends to LLM without a visible user message
  const handleSystemMessage = (msg: string) => {
    sendToGrowBot(msg, messages)
  }

  // Auto-post to community board from CommunityRedirectCard
  const handleCommunityCardPost = async (postContent: string): Promise<boolean> => {
    if (!user) return false
    const supabase = createClient()
    const { data: profile } = await supabase.from('profiles').select('home_community_h3_index').eq('id', user.id).single()
    if (!profile?.home_community_h3_index) return false
    try {
      const { sendCommunityMessage } = await import('../../../../../packages/app/features/community-chat/community-chat-service')
      await sendCommunityMessage(supabase, {
        h3Index: profile.home_community_h3_index,
        content: postContent,
        authorId: user.id,
      })
      return true
    } catch (err: any) {
      console.error('[GrowBot] Community card post failed:', err)
      return false
    }
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
        {user && (
          <button
            onClick={toggleMyPolls}
            style={{
              background: showMyPolls ? '#dcfce7' : 'none', border: '1px solid #e5e7eb', borderRadius: 20,
              padding: '6px 12px', fontSize: 13, color: showMyPolls ? '#166534' : '#6b7280', cursor: 'pointer',
            }}
            aria-label="My Polls"
          >
            📊
          </button>
        )}
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

      {/* My Polls Drawer */}
      {showMyPolls && (
        <div style={{
          position: 'absolute', top: 65, right: 0, left: 0, bottom: 0,
          background: 'rgba(0,0,0,0.12)', zIndex: 20,
        }} onClick={() => setShowMyPolls(false)}>
          <div
            style={{
              background: '#f0fdf4', width: '85%', maxWidth: 340, height: '100%',
              borderRight: '2px solid #bbf7d0', padding: '16px 0',
              overflowY: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: '0 16px 12px', fontWeight: 700, color: '#14532d', fontSize: 15, borderBottom: '1px solid #bbf7d0' }}>
              📊 My Polls
            </div>
            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid #dcfce7' }}>
              {(['created', 'voted'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setMyPollsTab(tab)}
                  style={{
                    flex: 1, padding: '10px', border: 'none', cursor: 'pointer',
                    background: myPollsTab === tab ? '#dcfce7' : 'transparent',
                    color: myPollsTab === tab ? '#166534' : '#6b7280',
                    fontWeight: myPollsTab === tab ? 700 : 400, fontSize: 13,
                  }}
                >
                  {tab === 'created' ? `Created (${myCreatedPolls.length})` : `Voted (${myVotedPolls.length})`}
                </button>
              ))}
            </div>
            {myPollsLoading ? (
              <div style={{ padding: '24px 16px', color: '#6b7280', fontSize: 13, textAlign: 'center' }}>Loading…</div>
            ) : myPollsTab === 'created' ? (
              myCreatedPolls.length === 0 ? (
                <div style={{ padding: '24px 16px', color: '#6b7280', fontSize: 13, textAlign: 'center' }}>No polls created yet</div>
              ) : (
                myCreatedPolls.map(p => (
                  <button
                    key={p.id}
                    onClick={() => { setShowMyPolls(false); router.push(`/growbot/share/${p.id}`) }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '12px 16px', border: 'none', cursor: 'pointer',
                      background: 'transparent', borderBottom: '1px solid #dcfce7',
                    }}
                  >
                    <div style={{ fontWeight: 600, color: '#111827', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.question}
                    </div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3, display: 'flex', gap: 8 }}>
                      <span>{new Date(p.created_at).toLocaleDateString()}</span>
                      <span>🗳️ {p.vote_count} vote{p.vote_count !== 1 ? 's' : ''}</span>
                    </div>
                  </button>
                ))
              )
            ) : (
              myVotedPolls.length === 0 ? (
                <div style={{ padding: '24px 16px', color: '#6b7280', fontSize: 13, textAlign: 'center' }}>No votes cast yet</div>
              ) : (
                myVotedPolls.map(p => (
                  <button
                    key={p.id}
                    onClick={() => { setShowMyPolls(false); router.push(`/growbot/share/${p.id}`) }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '12px 16px', border: 'none', cursor: 'pointer',
                      background: 'transparent', borderBottom: '1px solid #dcfce7',
                    }}
                  >
                    <div style={{ fontWeight: 600, color: '#111827', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.question}
                    </div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3, display: 'flex', gap: 8 }}>
                      <span>{new Date(p.created_at).toLocaleDateString()}</span>
                      <span>{p.rating === 'accurate' ? '✅' : p.rating === 'partial' ? '🤔' : '❌'} You voted: {p.rating}</span>
                    </div>
                  </button>
                ))
              )
            )}
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

              {/* Text bubble — hidden for assistant messages that have structured cards */}
              {msg.text && !(msg.role === 'assistant' && msg.actions && msg.actions.length > 0) && (
                <div style={{
                  padding: '10px 14px',
                  borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  background: msg.role === 'user' ? '#166534' : msg.isError ? '#fef2f2' : 'white',
                  color: msg.role === 'user' ? 'white' : msg.isError ? '#991b1b' : '#111827',
                  border: msg.isError ? '1px solid #fecaca' : 'none',
                  fontSize: 14, lineHeight: 1.5,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                  wordBreak: 'break-word',
                }}>
                  {msg.role === 'assistant' ? renderMarkdown(msg.text) : msg.text}
                  {msg.isError && (
                    <div style={{ marginTop: 10 }}>
                      <button
                        onClick={() => {
                          const msgIdx = messages.findIndex(m => m.id === msg.id);
                          const userMsgIdx = [...messages].slice(0, msgIdx).reverse().findIndex(m => m.role === 'user');
                          if (userMsgIdx !== -1) {
                            const actualUserIdx = msgIdx - 1 - userMsgIdx;
                            const lastUserMsg = messages[actualUserIdx];
                            const updatedHistory = messages.slice(0, msgIdx).filter(m => m.id !== msg.id);
                            
                            // Remove the error message locally
                            setMessages(updatedHistory);
                            saveCurrentTopic(updatedHistory);
                            
                            // Resend the text using the history prior to the user message
                            // so we don't duplicate the user message in history
                            const historyBeforeUserMsg = updatedHistory.slice(0, actualUserIdx);
                            sendToGrowBot(lastUserMsg.text, historyBeforeUserMsg);
                          }
                        }}
                        style={{ padding: '6px 16px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                      >
                        ↻ Retry Message
                      </button>
                    </div>
                  )}
                  {msg.id === streamingMsgId && (
                    <span style={{ animation: 'blink-cursor 1s step-end infinite', color: '#16a34a', fontWeight: 700 }}>▍</span>
                  )}
                </div>
              )}
              {/* Show cursor when streaming but no text yet */}
              {msg.id === streamingMsgId && !msg.text && (
                <div style={{
                  padding: '10px 14px', borderRadius: '16px 16px 16px 4px',
                  background: 'white', boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                }}>
                  <span style={{ animation: 'blink-cursor 1s step-end infinite', color: '#16a34a', fontWeight: 700 }}>▍</span>
                </div>
              )}

              {/* Tool cards */}
              {msg.actions && msg.actions.length > 0 && (
                <div>
                  {msg.actions.map((action: any, i: number) => (
                    <DynamicUICardRenderer key={i} action={action} onActionClick={handleActionClick} onSystemMessage={handleSystemMessage} onCommunityPost={handleCommunityCardPost} />
                  ))}
                </div>
              )}

              {/* AI follow-up chips — plain text answers only (no tool cards) */}
              {msg.role === 'assistant' && msg.nextActions && msg.nextActions.length > 0 && (!msg.actions || msg.actions.length === 0) && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {msg.nextActions.map((action, i) => (
                    <button
                      key={i}
                      onClick={() => handleActionClick(action)}
                      style={{
                        fontSize: 12, color: '#166534', background: '#f0fdf4',
                        border: '1px solid #bbf7d0', borderRadius: 999,
                        padding: '4px 12px', cursor: 'pointer',
                      }}
                    >{action}</button>
                  ))}
                </div>
              )}

              {/* Thumbs + Share — only on substantive advice (not data collection or redirects) */}
              {msg.role === 'assistant' && (() => {
                const msgIdx = messages.findIndex(m => m.id === msg.id)
                const hasUserBefore = messages.slice(0, msgIdx).some(m => m.role === 'user')
                if (!hasUserBefore) return null
                // Only show feedback/poll on substantive advice
                const hasNextActions = msg.nextActions && msg.nextActions.length > 0
                const skipCardTypes = ['UserMemoryCard', 'MarketRedirectCard', 'CommunityRedirectCard', 'ExternalSearchCard', 'SellerWizardCard', 'AuthenticationCard']
                const hasSubstantiveCards = (msg.actions?.length ?? 0) > 0 && msg.actions!.some((a: any) => !skipCardTypes.includes(a.type))
                const isSubstantive = hasNextActions || hasSubstantiveCards || (msg.text?.trim().length > 80)
                if (!isSubstantive) return null
                return (
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end', borderTop: '1px solid #f3f4f6', paddingTop: 8 }}>
                    <button
                      onClick={() => handleFeedback(msg.id, 'up')}
                      title="Helpful"
                      style={{ background: msg.feedback === 'up' ? '#dcfce7' : 'none', border: `1px solid ${msg.feedback === 'up' ? '#86efac' : '#e5e7eb'}`, borderRadius: 20, padding: '3px 8px', cursor: msg.feedback ? 'default' : 'pointer', fontSize: 14, opacity: msg.feedback && msg.feedback !== 'up' ? 0.35 : 1 }}
                    >👍</button>
                    <button
                      onClick={() => handleFeedback(msg.id, 'down')}
                      title="Not helpful"
                      style={{ background: msg.feedback === 'down' ? '#fee2e2' : 'none', border: `1px solid ${msg.feedback === 'down' ? '#fca5a5' : '#e5e7eb'}`, borderRadius: 20, padding: '3px 8px', cursor: msg.feedback ? 'default' : 'pointer', fontSize: 14, opacity: msg.feedback && msg.feedback !== 'down' ? 0.35 : 1 }}
                    >👎</button>
                    <div style={{ width: 1, height: 16, background: '#e5e7eb', alignSelf: 'center' }} />
                    {msg.shareId ? (
                      // Already polled — reopen the in-chat poll overlay
                      <button
                        onClick={() => {
                          const msgIdx = messages.findIndex(m => m.id === msg.id)
                          const lastUserMsg = [...messages.slice(0, msgIdx + 1)].reverse().find(m => m.role === 'user')
                          const qImage = lastUserMsg?.media?.[0]?.url || undefined
                          setPollView({ shareId: msg.shareId!, question: lastUserMsg?.text || '', answer: msg.text, questionImage: qImage, actions: msg.actions, votes: { accurate: 0, partial: 0, inaccurate: 0 }, myVote: null })
                        }}
                        style={{ fontSize: 12, color: '#166534', textDecoration: 'none', background: '#dcfce7', border: '1px solid #bbf7d0', borderRadius: 12, padding: '3px 10px', cursor: 'pointer' }}
                      >📊 View poll</button>
                    ) : (
                      <button
                        onClick={() => handlePoll(msg)}
                        disabled={pollingMsgId === msg.id}
                        title="Create a community poll and let neighbors vote on whether this advice is accurate"
                        style={{ fontSize: 12, color: '#166534', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '3px 10px', cursor: pollingMsgId === msg.id ? 'default' : 'pointer', opacity: pollingMsgId === msg.id ? 0.6 : 1 }}
                      >{pollingMsgId === msg.id ? '⏳ Creating…' : '🗳️ Poll your neighbors'}</button>
                    )}
                  </div>
                )
              })()}


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
                @keyframes blink-cursor {
                  0%, 100% { opacity: 1; }
                  50% { opacity: 0; }
                }
              `}</style>
            </div>
          </div>
        )}
      </div>



      {/* In-chat Poll Overlay */}
      {pollView && (
        <>
          <div onClick={() => setPollView(null)} style={{
            position: 'fixed', inset: 0, zIndex: 9998,
            background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)',
          }} />
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999,
            background: '#fff', borderRadius: '20px 20px 0 0',
            boxShadow: '0 -8px 40px rgba(0,0,0,0.18)',
            padding: '20px 20px 32px', maxHeight: '80vh', overflowY: 'auto',
          }}>
            {/* Handle */}
            <div style={{ width: 40, height: 4, background: '#e5e7eb', borderRadius: 2, margin: '0 auto 16px' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: '#111827' }}>🗳️ Community Poll</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>Ask neighbors if this advice is accurate</div>
              </div>
              <button onClick={() => setPollView(null)} style={{ background: 'none', border: 'none', fontSize: 20, color: '#9ca3af', cursor: 'pointer', padding: 4 }}>✕</button>
            </div>

            {/* Question image + bubble */}
            {pollView.questionImage && (
              <div style={{ marginBottom: 8, borderRadius: 12, overflow: 'hidden', maxWidth: 200 }}>
                <img src={pollView.questionImage} alt="Plant photo" style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 12 }} />
              </div>
            )}
            <div style={{ background: '#1e3a2f', color: 'white', borderRadius: '12px 12px 4px 12px', padding: '10px 14px', fontSize: 14, marginBottom: 10 }}>
              {pollView.question}
            </div>

            {/* Answer — show text AND/OR action cards */}
            <div style={{ marginBottom: 16 }}>
              {pollView.answer && pollView.answer.trim().length > 0 && (
                <div style={{ background: '#f0fdf4', borderRadius: '12px 12px 12px 4px', padding: '10px 14px', fontSize: 14, color: '#111827', lineHeight: 1.6, border: '1px solid #bbf7d0', maxHeight: 200, overflowY: 'auto' }}>
                  {pollView.answer}
                </div>
              )}
              {pollView.actions && pollView.actions.length > 0 && (
                <div>
                  {pollView.actions.map((action: any, i: number) => (
                    <DynamicUICardRenderer key={i} action={action} />
                  ))}
                </div>
              )}
              {(!pollView.answer || pollView.answer.trim().length === 0) && (!pollView.actions || pollView.actions.length === 0) && (
                <div style={{ background: '#f9fafb', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: '#6b7280', fontStyle: 'italic' }}>
                  No response content available.
                </div>
              )}
            </div>

            {/* Vote buttons */}
            <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 10 }}>How accurate is this answer?</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              {(['accurate', 'partial', 'inaccurate'] as const).map(r => (
                <button key={r} onClick={() => handlePollVote(r)}
                  style={{
                    flex: 1, padding: '10px 6px', borderRadius: 12, cursor: pollView.myVote ? 'default' : 'pointer',
                    border: `2px solid ${r === 'accurate' ? '#22c55e' : r === 'partial' ? '#f59e0b' : '#ef4444'}`,
                    background: pollView.myVote === r ? (r === 'accurate' ? '#dcfce7' : r === 'partial' ? '#fef3c7' : '#fee2e2') : pollView.myVote ? '#f9fafb' : 'white',
                    color: r === 'accurate' ? '#166534' : r === 'partial' ? '#92400e' : '#991b1b',
                    fontWeight: 600, fontSize: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                    opacity: pollView.myVote && pollView.myVote !== r ? 0.5 : 1, transition: 'all 0.15s',
                  }}
                >
                  <span style={{ fontSize: 18 }}>{r === 'accurate' ? '✅' : r === 'partial' ? '🤔' : '❌'}</span>
                  <span>{r === 'accurate' ? 'Accurate' : r === 'partial' ? 'Partial' : 'Off track'}</span>
                  {(pollView.votes.accurate + pollView.votes.partial + pollView.votes.inaccurate) > 0 &&
                    <span style={{ fontSize: 11, fontWeight: 400 }}>{pollView.votes[r]}</span>}
                </button>
              ))}
            </div>
            {pollView.myVote && (
              <div style={{ textAlign: 'center', fontSize: 13, color: '#6b7280', marginBottom: 12 }}>✓ Thanks! Your vote helps improve GrowBot.</div>
            )}

            {/* Suggestion field — always visible */}
            {!suggestionSubmitted ? (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>💬 Have a better answer or tip?</div>
                <textarea
                  placeholder="Share your experience or correction…"
                  value={pollSuggestion}
                  onChange={e => setPollSuggestion(e.target.value)}
                  rows={3}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 10, fontSize: 13, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
                />
                {pollSuggestion.trim().length > 0 && (
                  <button
                    onClick={async () => {
                      const supabase = createClient()
                      await supabase.from('growbot_response_suggestions').insert({
                        response_id: pollView.shareId,
                        suggestion_text: pollSuggestion.trim(),
                        suggester_key: user?.id || guestSessionIdRef.current,
                      })
                      setSuggestionSubmitted(true)
                    }}
                    style={{ marginTop: 6, padding: '8px 16px', border: 'none', borderRadius: 10, background: '#166534', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
                  >
                    Submit suggestion
                  </button>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: '#166534', marginBottom: 16, background: '#f0fdf4', padding: '8px 12px', borderRadius: 10 }}>✓ Suggestion submitted — thank you!</div>
            )}

            {/* ── Progressive Profiling: convert guest → member ── */}
            {!user && (
              <div style={{
                background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 14,
                padding: '14px 16px', marginBottom: 16,
              }}>
                {pollGuestForm.step === 'done' ? (
                  <div style={{ textAlign: 'center', padding: '8px 0' }}>
                    <div style={{ fontSize: 24, marginBottom: 6 }}>🎉</div>
                    <div style={{ fontWeight: 700, color: '#166534', fontSize: 14 }}>You're in the community!</div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                      We'll notify you when neighbors vote on this poll.
                    </div>
                  </div>
                ) : pollGuestForm.step === 'otp' ? (
                  <>
                    <div style={{ fontWeight: 600, color: '#166534', fontSize: 13, marginBottom: 8 }}>
                      ✉️ Check your email for a code
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
                      Sent to <strong>{pollGuestForm.email}</strong>
                    </div>
                    {pollGuestForm.error && (
                      <div style={{ background: '#fef2f2', color: '#dc2626', borderRadius: 8, padding: '6px 10px', fontSize: 12, marginBottom: 8 }}>{pollGuestForm.error}</div>
                    )}
                    <input
                      type="text" inputMode="numeric" maxLength={6}
                      placeholder="6-digit code"
                      value={pollGuestForm.otp}
                      onChange={e => setPollGuestForm(p => ({ ...p, otp: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                      style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 10, fontSize: 18, letterSpacing: '0.3em', textAlign: 'center', outline: 'none', boxSizing: 'border-box', marginBottom: 8 }}
                    />
                    <button
                      onClick={handleGuestPollVerify}
                      disabled={pollGuestForm.loading || pollGuestForm.otp.length < 6}
                      style={{ width: '100%', padding: '10px', border: 'none', borderRadius: 10, background: pollGuestForm.otp.length < 6 ? '#9ca3af' : '#166534', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
                    >
                      {pollGuestForm.loading ? 'Verifying…' : 'Verify & Join →'}
                    </button>
                    <button onClick={() => setPollGuestForm(p => ({ ...p, step: 'capture', otp: '' }))} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 12, cursor: 'pointer', marginTop: 6, textDecoration: 'underline' }}>
                      Use a different email
                    </button>
                  </>
                ) : (
                  <>
                    <div style={{ fontWeight: 700, color: '#166534', fontSize: 14, marginBottom: 4 }}>
                      🔔 Join to share this poll
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 12, lineHeight: 1.5 }}>
                      Enter your email to create a free account and share this poll with neighbors.
                    </div>
                    {pollGuestForm.error && (
                      <div style={{ background: '#fef2f2', color: '#dc2626', borderRadius: 8, padding: '7px 10px', fontSize: 12, marginBottom: 10 }}>{pollGuestForm.error}</div>
                    )}
                    <input
                      type="email" placeholder="Email address"
                      value={pollGuestForm.email}
                      onChange={e => setPollGuestForm(p => ({ ...p, email: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && handleGuestPollSignIn()}
                      style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 10, fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 10 }}
                    />
                    <button
                      onClick={handleGuestPollSignIn}
                      disabled={pollGuestForm.loading}
                      style={{ width: '100%', padding: '11px', border: 'none', borderRadius: 10, background: '#166534', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
                    >
                      {pollGuestForm.loading ? 'Sending code…' : 'Send Verification Code →'}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Inline TOS acceptance — shown when user clicks Post to Community without TOS */}
            {showInlineTos && user && (
              <div style={{ background: '#fffbeb', border: '1px solid #fbbf24', borderRadius: 12, padding: 14, marginBottom: 12 }}>
                <div style={{ fontWeight: 600, color: '#92400e', fontSize: 14, marginBottom: 10 }}>
                  📋 Terms of Service &amp; Privacy Policy
                </div>
                {inlineTosError && (
                  <div style={{ background: '#fef2f2', color: '#dc2626', borderRadius: 8, padding: '6px 10px', fontSize: 12, marginBottom: 8 }}>{inlineTosError}</div>
                )}
                <div style={{
                  maxHeight: 220, overflowY: 'auto', fontSize: 12, color: '#374151', lineHeight: 1.6,
                  background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginBottom: 12,
                }}>
                  <p style={{ margin: '0 0 6px', fontWeight: 700, fontSize: 13 }}>Terms of Service</p>
                  <ul style={{ margin: '0 0 12px', paddingLeft: 16 }}>
                    <li style={{ marginBottom: 5 }}><strong>Community Standards</strong> — Respectful conduct, no prohibited listings, and honest representations.</li>
                    <li style={{ marginBottom: 5 }}><strong>Seller Tax Liability</strong> — Sellers are responsible for applicable tax obligations. CasaGrown reports via 1099-K when thresholds are met.</li>
                    <li style={{ marginBottom: 5 }}><strong>Clearinghouse &amp; Payouts</strong> — All payments are processed through CasaGrown&apos;s netting model with settlement thresholds.</li>
                    <li style={{ marginBottom: 5 }}><strong>Agricultural Compliance</strong> — Listings must comply with USDA quarantine regulations for your region.</li>
                    <li style={{ marginBottom: 5 }}><strong>Dispute Resolution</strong> — CasaGrown mediates disputes between buyers and sellers per our cancellation policy.</li>
                    <li style={{ marginBottom: 0 }}><strong>Minor Safety</strong> — Users must be 13+ to use CasaGrown. Teen accounts have additional safeguards per COPPA.</li>
                  </ul>
                  <p style={{ margin: '0 0 6px', fontWeight: 700, fontSize: 13 }}>Privacy Policy</p>
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    <li style={{ marginBottom: 5 }}><strong>Information Collected</strong> — Name, email, address, transaction history, and device/usage data.</li>
                    <li style={{ marginBottom: 5 }}><strong>How We Use Data</strong> — Community matching, tax compliance, order fulfillment, and platform improvement. We do not sell personal data.</li>
                    <li style={{ marginBottom: 5 }}><strong>Third-Party Sharing</strong> — Limited to payment processors (Stripe), shipping, and legal obligations.</li>
                    <li style={{ marginBottom: 5 }}><strong>Your Rights</strong> — You can access, correct, or delete your data at any time from Settings.</li>
                    <li style={{ marginBottom: 0 }}><strong>COPPA Compliance</strong> — We do not knowingly collect data from children under 13.</li>
                  </ul>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => { setShowInlineTos(false); setInlineTosError('') }}
                    style={{
                      flex: 1, padding: '11px', border: '1px solid #d1d5db', borderRadius: 10,
                      background: '#fff', color: '#374151', fontWeight: 600, fontSize: 14, cursor: 'pointer',
                    }}
                  >
                    Decline
                  </button>
                  <button
                    onClick={handleInlineTosAccept}
                    disabled={inlineTosLoading}
                    style={{
                      flex: 1, padding: '11px', border: 'none', borderRadius: 10,
                      background: '#166534', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer',
                    }}
                  >
                    {inlineTosLoading ? 'Saving…' : 'I Accept →'}
                  </button>
                </div>
              </div>
            )}

            {/* Actions: Share poll + Post to Community */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={() => {
                  if (!user) return
                  const answerText = pollView.answer?.trim() || summarizeActions(pollView.actions)
                  setShareAnswerModal({
                    question: pollView.question,
                    answer: answerText,
                    pollUrl: `${typeof window !== 'undefined' ? window.location.origin : ''}/growbot/share/${pollView.shareId}`,
                  })
                }}
                disabled={!user}
                style={{
                  width: '100%', padding: '13px', border: 'none', borderRadius: 12,
                  background: user ? '#166534' : '#9ca3af', color: '#fff',
                  fontWeight: 600, fontSize: 14, cursor: user ? 'pointer' : 'default',
                  opacity: user ? 1 : 0.6,
                }}
              >
                📤 Share this poll with friends
              </button>
              {communityPostStatus === 'posted' ? (
                <div style={{ width: '100%', padding: '13px', borderRadius: 12, background: '#dcfce7', color: '#166534', fontSize: 14, fontWeight: 600, textAlign: 'center' }}>
                  ✓ Posted to your Community Board!
                </div>
              ) : communityPostStatus === 'no-profile' ? (
                <div style={{ width: '100%', padding: '12px', borderRadius: 12, background: '#fef3c7', color: '#92400e', fontSize: 13, textAlign: 'center' }}>
                  📍 Complete your profile to post to community.
                  <button
                    onClick={() => {
                      if (pollView) {
                        localStorage.setItem('growbot_pending_community_post', JSON.stringify({
                          shareId: pollView.shareId,
                          question: pollView.question,
                          pollViewData: pollView,
                        }))
                      }
                      router.push('/profile-setup?redirect=/growbot')
                    }}
                    style={{ display: 'block', margin: '8px auto 0', padding: '6px 16px', border: 'none', borderRadius: 8, background: '#166534', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
                  >
                    Update Profile
                  </button>
                </div>
              ) : (
                <button
                  onClick={handlePostToCommunity}
                  disabled={!user || communityPostStatus === 'posting'}
                  style={{
                    width: '100%', padding: '13px', border: '1px solid #e5e7eb', borderRadius: 12,
                    background: 'white', color: user ? '#374151' : '#9ca3af',
                    fontSize: 14, fontWeight: 500, cursor: user ? 'pointer' : 'default',
                    opacity: user ? 1 : 0.6,
                  }}
                >
                  {communityPostStatus === 'posting' ? '⏳ Posting…' : communityPostStatus === 'error' ? '⚠️ Retry Post to Community' : '👥 Post to Community Board'}
                </button>
              )}
              {!user && (
                <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center' }}>
                  Create an account above to share and post
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Share Modal — used for polls (shareUrl = poll page) opened from the poll overlay */}
      {shareAnswerModal && (() => {
        const isPollShare = !!shareAnswerModal.pollUrl
        const shareUrl = isPollShare ? shareAnswerModal.pollUrl! : (typeof window !== 'undefined' ? window.location.href : '')
        // Strip markdown for plain-text share body
        const plainAnswer = shareAnswerModal.answer
          .replace(/\*\*(.*?)\*\*/g, '$1')  // bold
          .replace(/\*(.*?)\*/g, '$1')       // italic
          .replace(/^[\s]*[-*]\s/gm, '• ')   // bullets
          .replace(/^#{1,3}\s+/gm, '')       // headings
          .trim()
        const truncatedAnswer = plainAnswer.length > 500 ? plainAnswer.slice(0, 500) + '…' : plainAnswer
        const shareMsg = isPollShare
          ? `🌱 I asked GrowBot: "${shareAnswerModal.question}"

Here's what GrowBot said:
${truncatedAnswer}

🗳️ Do you think this advice is accurate? Vote here:`
          : `🌱 GrowBot tip: ${truncatedAnswer}`
        return (
          <SocialShareModal
            isOpen={true}
            onClose={() => setShareAnswerModal(null)}
            title={isPollShare ? 'Share Community Poll' : 'Share this answer'}
            subtitle={shareAnswerModal.question}
            entityName={isPollShare ? 'GrowBot Poll' : 'GrowBot Answer'}
            shareUrl={shareUrl}
            shareMessage={shareMsg}
          />
        )
      })()}

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
