'use client'

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '../../../lib/supabase'
import { useMarket } from '../../../lib/store'

import { useAuth } from '../../../lib/useAuth'
import { useQuickSetup } from '../../../lib/useQuickSetup'
import {
  fetchCommunityMessages,
  sendCommunityMessage,
  deleteCommunityMessage,
  editCommunityMessage,
  flagMessage,
  CommunityChatMessage,
} from '../../../../../packages/app/features/community-chat/community-chat-service'
import styles from './page.module.css'
import ChatMessage from './components/ChatMessage'
import ComposeBar from './components/ComposeBar'
import SuggestionChips from './components/SuggestionChips'
import FindPanel from './components/FindPanel'
import NotifyPanel from './components/NotifyPanel'
import InviteBanner from './components/InviteBanner'
import WelcomeCard from './components/WelcomeCard'
import NewMessagesBadge from './components/NewMessagesBadge'
import { useNotificationPrompt } from '../../../lib/useNotificationPrompt'
import { NotificationPromptModal } from '../../components/NotificationPromptModal'
import { useErrorToast } from '../../components/ErrorToast'
import { checkTextForViolations } from '../../../lib/moderation'

// Realtime settings
const BACKGROUND_POLL_INTERVAL = 60000 // 60s fallback when tab is hidden or socket drops

const GUEST_POLL_INTERVAL = 15000 // 15s polling for guest users (no WebSockets)

export interface ClientPageProps {
  initialProfileH3: string | null
  initialMessages: CommunityChatMessage[]
  initialProfileName: string
  initialBuzzWelcomedAt: string | null
  isGuest?: boolean
}

export default function ClientPage({
  initialProfileH3,
  initialMessages,
  initialProfileName,
  initialBuzzWelcomedAt,
  isGuest = false,
}: ClientPageProps) {

  const router = useRouter()
  const searchParams = useSearchParams()
  const targetMessageId = searchParams?.get('message_id')
  const { state } = useMarket()
  const { user, isAuthenticated, loading } = useAuth()
  const { requireAuth } = useQuickSetup()
  
  const [messages, setMessages] = useState<CommunityChatMessage[]>([...initialMessages].reverse())
  const [isLoading, setIsLoading] = useState(false) // No longer loading initially!
  const [profileH3, setProfileH3] = useState<string | null>(initialProfileH3)
  const [errorState, setErrorState] = useState<{ message: string; cta?: string; action?: () => void } | null>(null)
  
  // Welcome card logic — defer if there's a pending draft from guest compose flow
  const draftRef = useRef<string | null>(
    typeof window !== 'undefined' ? localStorage.getItem('casagrown_community_draft') : null
  )
  const [showWelcome, setShowWelcome] = useState<boolean>(
    initialProfileH3 !== null && !initialBuzzWelcomedAt && !draftRef.current
  )
  const [profileName, setProfileName] = useState(initialProfileName)
  const { showError, showInfo } = useErrorToast()

  
  // Polling state
  const [lastFetchTime, setLastFetchTime] = useState<string | null>(null)
  const newMessagesCountRef = useRef(0)
  
  // Scroll and UI state
  const scrollRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true)
  const typeDebounceRef = useRef<NodeJS.Timeout | null>(null)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const initialScrollDoneRef = useRef(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  
  // Track total expected messages to prevent feed truncation on optimistic saves
  const messageCountRef = useRef(50)
  const topAnchorRef = useRef<HTMLDivElement>(null)
  const composeRef = useRef<HTMLDivElement>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [replyingTo, setReplyingTo] = useState<CommunityChatMessage | null>(null)
  const [composePrefill, setComposePrefill] = useState<string | undefined>(undefined)
  const [showGuestLoginPrompt, setShowGuestLoginPrompt] = useState(false)
  const [guestDraftMessage, setGuestDraftMessage] = useState('')
  
  // Pagination State
  const [isLoadingOlder, setIsLoadingOlder] = useState(false)
  const [hasMoreOlder, setHasMoreOlder] = useState(true)
  const [pendingMessages, setPendingMessages] = useState<CommunityChatMessage[]>([])

  // Refs for reading current values inside effects without re-subscribing
  const messagesRef = useRef<CommunityChatMessage[]>(messages)
  messagesRef.current = messages
  const pendingMessagesRef = useRef<CommunityChatMessage[]>(pendingMessages)
  pendingMessagesRef.current = pendingMessages

  // Find panel state
  const [findActive, setFindActive] = useState(false)
  const [notifyActive, setNotifyActive] = useState(false)

  // Push notification prompt
  const { showPrompt, modalProps } = useNotificationPrompt(user?.id)
  
  // Calculate first unread message ID for rendering the red visual marker
  const [firstUnreadId, setFirstUnreadId] = useState<string | null>(() => {
    if (!initialBuzzWelcomedAt || !user) return null
    const first = initialMessages.find(m => new Date(m.created_at) > new Date(initialBuzzWelcomedAt) && m.author_id !== user.id)
    return first ? first.id : null
  })
  
  // 1. Fetch user's H3 community index on load (Fallback for SPA navigation)
  useEffect(() => {
    if (loading) return
    
    // Guest mode: no redirect, no profile check
    if (isGuest) return
    
    if (!isAuthenticated || !user) {
      // Don't redirect — guest mode handles this gracefully
      return
    }

    if (initialProfileH3 === null) {
      console.warn('User has no home community set')
      setErrorState({ message: 'You need to set your neighborhood location before you can join the Community!', cta: 'Update Profile', action: () => router.push('/profile-setup') })
    }
  }, [loading, isAuthenticated, user, router, initialProfileH3, isGuest])

  // Auto-send draft message from guest compose-then-login flow
  // Watches profileH3 + user so it fires once both are ready after auth
  useEffect(() => {
    if (!isAuthenticated || isGuest || loading) return
    if (!draftRef.current) return
    if (!profileH3 || !user) return

    const draft = draftRef.current
    draftRef.current = null
    try { localStorage.removeItem('casagrown_community_draft') } catch {}

    // Auto-send the draft — user already clicked Send before login
    handleSendMessage(draft).then(() => {
      // Message sent — now show welcome banner (messages stay visible since we removed the hide)
      if (!initialBuzzWelcomedAt) {
        setShowWelcome(true)
      }
    }).catch(() => {
      // If send fails, prefill compose bar so they can retry manually
      setComposePrefill(draft)
    })
  }, [isAuthenticated, isGuest, loading, profileH3, user]) // eslint-disable-line react-hooks/exhaustive-deps
  
  // 2. Initial scroll to bottom
  const loadMessages = useCallback(async () => {
    // If called manually (e.g. after a send), we just hit the DB and reset
    if (!profileH3) return
    try {
      const supabase = createClient()
      const limitToFetch = Math.max(50, messageCountRef.current)
      const msgs = await fetchCommunityMessages(supabase, profileH3, null, limitToFetch)
      
      const uniqueKeys = new Set(msgs.map(m => m.id))
      const combined = [...msgs]
      // Preserve optimistic pending messages
      pendingMessages.forEach(pm => {
        if (!uniqueKeys.has(pm.id)) {
          combined.push(pm)
          uniqueKeys.add(pm.id)
        }
      })
      
      messageCountRef.current = combined.length
      combined.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      setMessages(combined)
      
      const scrollToBottom = () => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = 0
        }
      }
      requestAnimationFrame(scrollToBottom)
      setTimeout(scrollToBottom, 100)
      setTimeout(scrollToBottom, 300)
      setTimeout(scrollToBottom, 600)
    } catch (err) {
      console.error('Failed to reload messages', err)
    }
  }, [profileH3, pendingMessages])
  
  useEffect(() => {
    setLastFetchTime(new Date().toISOString())
    // flex-direction: column-reverse handles initial scroll position natively
    initialScrollDoneRef.current = true
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  
  // 3. Supabase Realtime (WebSockets for authenticated, polling for guests)
  useEffect(() => {
    // For guests: use polling with a placeholder H3 (RPC ignores it)
    // For authenticated: use WebSockets with their real H3
    const effectiveH3 = isGuest ? 'guest' : profileH3
    if (!effectiveH3 || isLoading) return
    
    let isSubscribed = true
    const checkNewMessages = async () => {
      if (!lastFetchTime || document.visibilityState === 'hidden') return
      
      try {
        const supabase = createClient()
        const newMsgs = await fetchCommunityMessages(supabase, effectiveH3, undefined, 50)
        
        // Read current values from refs (not stale closure captures)
        const currentMessages = messagesRef.current
        const currentPending = pendingMessagesRef.current
        
        const tempLocalMsgs = currentMessages.filter(m => m.id.startsWith('temp-'))
        const actualNewMsgs = newMsgs.filter((m: CommunityChatMessage) => {
          if (currentMessages.find(existing => existing.id === m.id)) return false
          if (currentPending.find(existing => existing.id === m.id)) return false
          
          // Realtime race condition filter: Prevent socket payload from triggering UI duplication 
          // if it belongs to a local optimistic message currently awaiting HTTP return.
          if (tempLocalMsgs.some(t => 
            t.author_id === m.author_id && 
            t.content === m.content && 
            Math.abs(new Date(t.created_at).getTime() - new Date(m.created_at).getTime()) < 15000
          )) {
            return false
          }
          return true
        })
        
        if (actualNewMsgs.length > 0 && isSubscribed) {
          // Read scroll position from ref (not stale state)
          const atBottom = isAtBottomRef.current
          
          // If user is at the bottom, merge new messages directly (like normal texting)
          if (atBottom) {
            setMessages(prev => {
              const uniqueNew = actualNewMsgs.filter(newM => !prev.some(e => e.id === newM.id))
              // Also replace any temp-* optimistic messages that match
              const cleaned = prev.filter(m => {
                if (!m.id.startsWith('temp-')) return true
                return !actualNewMsgs.some(nm => nm.author_id === m.author_id && nm.content === m.content)
              })
              const merged = [...cleaned, ...uniqueNew]
              return merged.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
            })
            // Pin to bottom after merge settles
            const pinToBottom = () => {
              if (scrollRef.current) scrollRef.current.scrollTop = 0
            }
            requestAnimationFrame(pinToBottom)
            setTimeout(pinToBottom, 100)
            setTimeout(pinToBottom, 300)
          } else {
            // Store in ref only — NO state updates, NO re-render
            pendingMessagesRef.current = [
              ...pendingMessagesRef.current,
              ...actualNewMsgs.filter(newM => !pendingMessagesRef.current.some(e => e.id === newM.id))
            ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
            newMessagesCountRef.current = pendingMessagesRef.current.length
            
            // Update badge via DOM — zero React re-renders
            const badgeEl = document.getElementById('new-messages-badge')
            if (badgeEl) {
              badgeEl.textContent = `${newMessagesCountRef.current} new message${newMessagesCountRef.current > 1 ? 's' : ''} ↓`
              badgeEl.style.display = 'flex'
            }
          }
        }
      } catch (err) {
        console.error('Realtime fetch error', err)
      }
    }
    
    // Fallback polling for when tab is hidden (Sockets intentionally drop/sleep usually)
    let pollTimer: NodeJS.Timeout
    const schedulePoll = () => {
      if (document.visibilityState === 'hidden') {
        pollTimer = setTimeout(() => {
          checkNewMessages()
          schedulePoll()
        }, BACKGROUND_POLL_INTERVAL) as unknown as NodeJS.Timeout
      }
    }
    schedulePoll()
    
    // ── GUEST: polling only (no WebSockets) ──
    let guestPollTimer: NodeJS.Timeout | null = null
    if (isGuest) {
      guestPollTimer = setInterval(checkNewMessages, GUEST_POLL_INTERVAL) as unknown as NodeJS.Timeout

      const handleVisChange = () => {
        clearTimeout(pollTimer)
        if (document.visibilityState === 'visible') {
          checkNewMessages()
        } else {
          schedulePoll()
        }
      }
      document.addEventListener('visibilitychange', handleVisChange)

      return () => {
        isSubscribed = false
        if (guestPollTimer) clearInterval(guestPollTimer)
        clearTimeout(pollTimer)
        document.removeEventListener('visibilitychange', handleVisChange)
      }
    }

    // ── AUTHENTICATED: WebSocket channel ──
    const supabase = createClient()
    let channel: any = null

    const connectWebSocket = () => {
      if (channel) return
      channel = supabase.channel(`community_chat_${effectiveH3}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'community_chat_messages' },
          (payload: any) => {
            checkNewMessages()
          }
        )
        .subscribe()
    }

    const disconnectWebSocket = () => {
      if (channel) {
        supabase.removeChannel(channel)
        channel = null
      }
    }

    const handleVisChange = () => {
      clearTimeout(pollTimer)
      if (document.visibilityState === 'visible') {
        connectWebSocket()
        checkNewMessages()
      } else {
        disconnectWebSocket()
        schedulePoll()
        // Stamp exit time on tab hide
        supabase.rpc('update_profile_last_seen').then()
      }
    }
    
    // Initial mount
    connectWebSocket()
    checkNewMessages() // Catch any messages (like newly published products) created while navigating away
    document.addEventListener('visibilitychange', handleVisChange)
    
    return () => {
      isSubscribed = false
      clearTimeout(pollTimer)
      document.removeEventListener('visibilitychange', handleVisChange)
      
      disconnectWebSocket()
      supabase.rpc('update_profile_last_seen').then()
    }
  }, [profileH3, lastFetchTime, isLoading, isGuest]) // eslint-disable-line react-hooks/exhaustive-deps
  
  // 4. Infinite Scroll (Older Messages)
  const loadOlderMessages = useCallback(async () => {
    if (isLoadingOlder || !hasMoreOlder || messages.length === 0 || !profileH3) return
    
    setIsLoadingOlder(true)
    try {
      const oldestMessage = messages[0]
      const oldestTimestamp = oldestMessage.bumped_at || oldestMessage.created_at
      
      const supabase = createClient()
      // Standard limit matches initial slice amount
      const newMsgs = await fetchCommunityMessages(supabase, profileH3, oldestTimestamp, 50)
      
      if (newMsgs.length < 50) {
        setHasMoreOlder(false)
      }
      
      if (newMsgs && newMsgs.length > 0) {
        const scrollArea = scrollRef.current
        if (scrollArea) {
          const previousScrollHeight = scrollArea.scrollHeight
          const previousScrollTop = scrollArea.scrollTop
          
          // 🛑 STOP the marker from reappearing if scrolling high 🛑
          setFirstUnreadId(null)

          setMessages(prev => {
            const prevMap = new Map(prev.map(m => [m.id, m]))
            newMsgs.forEach(m => prevMap.set(m.id, m))
            const merged = Array.from(prevMap.values()).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
            messageCountRef.current = merged.length
            return merged
          })
          
          requestAnimationFrame(() => {
            if (scrollRef.current) {
              // Maintain exact scroll position by offsetting the newly added height
              scrollRef.current.scrollTop = previousScrollTop + (scrollRef.current.scrollHeight - previousScrollHeight)
            }
          })
        } else {
          setMessages(prev => {
            const uniqueOlder = newMsgs.filter(older => !prev.some(e => e.id === older.id))
            return [...uniqueOlder.reverse(), ...prev]
          })
        }
      }
    } catch (err) {
      console.error('Failed to load older messages', err)
    } finally {
      setIsLoadingOlder(false)
    }
  }, [isLoadingOlder, hasMoreOlder, messages, profileH3])

  // Intersection Observer to trigger pagination when scrolling to top
  useEffect(() => {
    const anchor = topAnchorRef.current
    if (!anchor) return
    
    const observer = new IntersectionObserver(
      (entries) => {
        // Don't load older messages until initial scroll-to-bottom is done
        if (entries[0].isIntersecting && initialScrollDoneRef.current) {
          loadOlderMessages()
        }
      },
      // Root is the scroll area, trigger when anchor is within 100px from top
      { root: scrollRef.current, rootMargin: '100px 0px 0px 0px' }
    )
    
    observer.observe(anchor)
    return () => observer.disconnect()
  }, [loadOlderMessages])

  // Scroll handler to track if user is at bottom
  // With column-reverse: scrollTop=0 is at the bottom (newest), scrollTop>0 means scrolled up
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget
    const bottomThreshold = 100
    // column-reverse: scrollTop=0 is at bottom. Chrome uses negative scrollTop when scrolled up.
    const isBottom = Math.abs(target.scrollTop) < bottomThreshold
    
    isAtBottomRef.current = isBottom
    if (initialScrollDoneRef.current) {
      setIsAtBottom(isBottom)
    }
    
    if (isBottom && newMessagesCountRef.current > 0) {
      // Merge pending messages from ref into state
      const pending = pendingMessagesRef.current
      setMessages(prev => {
        const uniquePending = pending.filter(pm => !prev.some(m => m.id === pm.id))
        return [...prev, ...uniquePending].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      })
      newMessagesCountRef.current = 0
      pendingMessagesRef.current = []
      setPendingMessages([])
      // Hide badge via DOM
      const badgeEl = document.getElementById('new-messages-badge')
      if (badgeEl) badgeEl.style.display = 'none'
    }
  }

  // Handlers
  const handleSendMessage = async (content: string, media?: any[]) => {
    if (!profileH3 || !user) return
    
    // ── Pre-flight Content Moderation ──
    const violationCheck = checkTextForViolations(content)
    if (!violationCheck.isClean) {
      showError(violationCheck.error!)
      throw new Error(violationCheck.error!) // Throw so ComposeBar doesn't clear the input
    }
    
    try {
      // Optimistic rendering so we don't need to re-fetch and resize the whole feed
      const tempId = `temp-${Date.now()}`
      // Hydrate media URLs for instant display
      const supabaseForMedia = createClient()
      const optimisticMedia = (media || []).map(m => {
        if (m.storage_path && !m.url) {
          const { data } = supabaseForMedia.storage.from('community-chat-media').getPublicUrl(m.storage_path)
          return { ...m, url: data.publicUrl }
        }
        return m
      })
      const optimisticMsg: CommunityChatMessage = {
        id: tempId,
        content,
        created_at: new Date().toISOString(),
        author_id: user.id,
        author_name: profileName || 'Neighbor',
        author_avatar_url: typeof (user as any)?.user_metadata?.avatar_url === 'string' ? (user as any).user_metadata.avatar_url : null,
        community_h3_index: profileH3,
        parent_id: replyingTo?.id || null,
        media: optimisticMedia,
        product_listing_id: null,
        is_system: false,
        is_pinned: false,
        bumped_at: null,
        edited_at: null,
        reaction_counts: {},
        reply_count: 0,
        user_reactions: [],
        flag_count: 0,
        quoted_author_name: replyingTo?.author_name || null,
        quoted_content: replyingTo ? replyingTo.content.substring(0, 100) : null,
      }
      setMessages(prev => [...prev, optimisticMsg])
      
      // Sender should always see their own message — mark as at-bottom and pin
      isAtBottomRef.current = true
      const pinToBottom = () => {
        if (scrollRef.current) scrollRef.current.scrollTop = 0
      }
      requestAnimationFrame(pinToBottom)
      setTimeout(pinToBottom, 50)
      setTimeout(pinToBottom, 200)

      const supabase = createClient()
      const msgId = await sendCommunityMessage(supabase, {
        h3Index: profileH3,
        authorId: user.id,
        content,
        media,
        parentId: replyingTo?.id,
      })
      
      // Clear reply-to state
      setReplyingTo(null)
      
      // Swap out temp ID (will naturally happen anyway via Supabase Realtime catching it, but this keeps our state perfectly clean)
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, id: msgId } : m))
      
      // Prompt for push notification permission (first time / re-prompt after 7 days)
      showPrompt()

      // If message mentions @CasaBot OR is a reply to a CasaBot message, trigger AI response
      const CASABOT_ID = 'a0000000-0000-0000-0000-00000ca5ab07'
      const isCasaBotTrigger = 
        content.toLowerCase().includes('@growbot') ||
        (replyingTo && (
          replyingTo.author_id === CASABOT_ID ||
          replyingTo.author_name === 'GrowBot' ||
          replyingTo.is_system
        ))

      if (isCasaBotTrigger) {
        console.log('[CasaBot] Invoking casabot-reply for message:', msgId)
        supabase.functions.invoke('casabot-reply', {
          body: {
            message_id: msgId,
            content,
            community_h3_index: profileH3,
            author_name: profileName || 'Neighbor',
            parent_id: replyingTo?.id,
          },
        }).then((res: any) => {
          console.log('[CasaBot] Response:', res)
          // Don't call loadMessages() — the WebSocket/polling will pick up the bot reply
          // and merge it in. This prevents the full re-fetch that causes flicker.
        }).catch((err: unknown) => console.error('[CasaBot] Error:', err))
      }

      // Ensure we're scrolled to the bottom after own message
      const pin = () => { if (scrollRef.current) scrollRef.current.scrollTop = 0 }
      requestAnimationFrame(pin)
      setTimeout(pin, 100)
      setTimeout(pin, 300)
      setTimeout(pin, 600)
    } catch (err) {
      // Remove optimistic message if failed
      setMessages(prev => prev.filter(m => !m.id.startsWith('temp-')))
      console.error('Failed to send message', err)
      showError('Failed to send message. Please try again.')
    }
  }

  // ── Sell chip handler ──
  const handleSellClick = () => {
    if (!user) {
      requireAuth({
        trigger: 'sell_from_community',
        onReady: () => handleSellClick(),
      })
      return
    }
    router.push('/my-booth/products/new?from=buzz')
  }

  // ── Find chip handler ──
  const handleFindClick = () => {
    setFindActive(true)
  }

  if (!isAuthenticated && !isGuest) return null // Handled by redirect in useEffect
  
  if (errorState) {
    return (
      <div className={styles.container}>
        <div className={styles.centerContainer}>
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>📍</span>
            <h3>Missing Location</h3>
            <p className={styles.emptyMessage}>{errorState.message}</p>
            {errorState.cta && (
              <button className={styles.actionButton} onClick={errorState.action}>
                {errorState.cta}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (!profileH3 && !isGuest) {
    return (
      <div className={styles.container}>
        <div className={styles.centerContainer}>
          <p>Loading your community chat...</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      {/* Community Name Header */}
      <div className={styles.communityHeader}>
        <span className={styles.communityHeaderIcon}>🌿</span>
        <span className={styles.communityHeaderName}>CasaGrown Community</span>
      </div>
      
      {!findActive && !notifyActive && !isGuest && <InviteBanner h3Index={profileH3 || 'guest'} userId={user?.id} />}


      {/* Message List Area — or Find/Notify Panel overlay */}
      {findActive ? (
        <FindPanel
          userId={user?.id}
          profileH3={profileH3}
          onClose={() => setFindActive(false)}
          onSendMessage={async (content) => { await handleSendMessage(content) }}
          onReloadMessages={loadMessages}
        />
      ) : notifyActive && user ? (
        <NotifyPanel
          userId={user.id}
          onClose={() => setNotifyActive(false)}
        />
      ) : (
        <div 
          className={styles.messageScrollArea} 
          ref={scrollRef}
          onScroll={handleScroll}
        >
          {isLoading ? (
            <div className={styles.loading}>Loading chat...</div>
          ) : (
            <div className={styles.messageList}>
              {hasMoreOlder && messages.length > 0 && (
                <div ref={topAnchorRef} style={{ height: 20, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                  {isLoadingOlder ? <span style={{ fontSize: 12, color: '#888' }}>Loading older...</span> : null}
                </div>
              )}

              {messages.length === 0 && !showWelcome && (
                <div className={styles.emptyState}>
                  <span className={styles.emptyIcon}>👋</span>
                  <h3>Be the first to say hello!</h3>
                  <p>Start a conversation with your neighbors.</p>
                </div>
              )}
              {messages.map(msg => (
                <div key={msg.id} style={{ overflowAnchor: 'auto' }}>
                  {firstUnreadId === msg.id && (
                    <div id={`unread-marker-${msg.id}`} className={styles.unreadDivider}>
                      Unread Messages
                    </div>
                  )}
                  <ChatMessage 
                    message={msg} 
                    currentUserId={user?.id}
                    isGuest={isGuest}
                    onReplyTo={isGuest ? undefined : (targetMsg) => {
                      setReplyingTo(targetMsg)
                      // Focus the compose bar input
                      setTimeout(() => {
                        const input = composeRef.current?.querySelector('textarea')
                        if (input) input.focus()
                      }, 100)
                    }}
                    onEdit={async (messageId, content) => {
                      const supabase = createClient()
                      await editCommunityMessage(supabase, messageId, content)
                      await loadMessages()
                    }}
                    onDelete={() => {
                      const supabase = createClient()
                      deleteCommunityMessage(supabase, msg.id).then(() => loadMessages())
                    }}
                    onFlag={() => {
                      if (user) {
                        const supabase = createClient()
                        flagMessage(supabase, msg.id, user.id).then(() => {
                          showInfo('Message flagged for review.')
                          loadMessages()
                        })
                      }
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Floating Badge for New Messages — updated via DOM, always present but hidden */}
      <div 
        id="new-messages-badge"
        style={{ display: 'none' }}
        onClick={() => {
          // Hide badge immediately
          const badgeEl = document.getElementById('new-messages-badge')
          if (badgeEl) badgeEl.style.display = 'none'
          
          // Merge pending messages first
          const pending = pendingMessagesRef.current
          if (pending.length > 0) {
            setMessages(prev => {
              const uniquePending = pending.filter(pm => !prev.some(m => m.id === pm.id))
              return [...prev, ...uniquePending].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
            })
            newMessagesCountRef.current = 0
            pendingMessagesRef.current = []
            setPendingMessages([])
          }
          
          // Scroll to bottom AFTER merge settles (instant, not smooth)
          const pinToBottom = () => {
            if (scrollRef.current) scrollRef.current.scrollTop = 0
          }
          requestAnimationFrame(pinToBottom)
          setTimeout(pinToBottom, 100)
          setTimeout(pinToBottom, 300)
        }}
        className={`${styles.newMessagesBadge}`}
      >
        0 new messages ↓
      </div>

      {/* Welcome Card for new users — appears above compose bar */}
      {showWelcome && user && !findActive && (
        <WelcomeCard
          userId={user.id}
          userName={profileName}
          profileH3={profileH3!}
          onComplete={() => {
            setShowWelcome(false)
            setTimeout(() => {
              if (scrollRef.current) scrollRef.current.scrollTop = 0
            }, 50)
          }}
          onSendMessage={async (msg) => { await handleSendMessage(msg) }}
          showPrompt={showPrompt}
        />
      )}

      {/* Compose Input — guests can type but are prompted to login on send */}
      {isGuest ? (
        <div className={styles.composeWrapper} ref={composeRef}>
          <ComposeBar
            onSend={async (msg) => {
              setGuestDraftMessage(msg)
              try { localStorage.setItem('casagrown_community_draft', msg) } catch {}
              requireAuth({
                trigger: 'community_post',
                onReady: () => {
                  // After auth completes, the auto-send draft effect will handle posting
                  setShowGuestLoginPrompt(false)
                },
              })
            }}
            userId="guest"
            h3Index={profileH3 || undefined}
            prefillText={composePrefill}
            onPrefillConsumed={() => setComposePrefill(undefined)}
          />

        </div>
      ) : (
        <div className={styles.composeWrapper} ref={composeRef}>
          <SuggestionChips 
            onSelect={(text: string) => handleSendMessage(text)}
            onPrefill={(text: string) => setComposePrefill(text)}
            userMessageCount={messages.filter(m => m.author_id === user?.id && !m.is_system).length}
            onSellClick={handleSellClick}
            onFindClick={handleFindClick}
            onNotifyClick={() => setNotifyActive(true)}
          />
          {/* Reply-to preview bar */}
          {replyingTo && (
            <div className={styles.replyToPreview}>
              <div className={styles.replyToInfo}>
                <div className={styles.replyToAuthor}>Replying to {replyingTo.author_name || 'Neighbor'}</div>
                <div className={styles.replyToText}>{replyingTo.content.substring(0, 80)}{replyingTo.content.length > 80 ? '…' : ''}</div>
              </div>
              <button className={styles.replyToClose} onClick={() => setReplyingTo(null)}>✕</button>
            </div>
          )}
          <ComposeBar
            onSend={handleSendMessage}
            userId={user?.id}
            h3Index={profileH3 || undefined}
            prefillText={composePrefill}
            onPrefillConsumed={() => setComposePrefill(undefined)}
          />
        </div>
      )}
      {!isGuest && <NotificationPromptModal {...modalProps} />}

    </div>
  )
}
