'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '../../../lib/supabase'
import { useMarket } from '../../../lib/store'
import { useAuth } from '../../../lib/useAuth'
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

export interface ClientPageProps {
  initialProfileH3: string | null
  initialMessages: CommunityChatMessage[]
  initialProfileName: string
  initialBuzzWelcomedAt: string | null
}

export default function ClientPage({
  initialProfileH3,
  initialMessages,
  initialProfileName,
  initialBuzzWelcomedAt
}: ClientPageProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const targetMessageId = searchParams?.get('message_id')
  const { state } = useMarket()
  const { user, isAuthenticated, loading } = useAuth()
  
  const [messages, setMessages] = useState<CommunityChatMessage[]>([...initialMessages].reverse())
  const [isLoading, setIsLoading] = useState(false) // No longer loading initially!
  const [profileH3, setProfileH3] = useState<string | null>(initialProfileH3)
  const [errorState, setErrorState] = useState<{ message: string; cta?: string; action?: () => void } | null>(null)
  
  // Welcome card logic
  const [showWelcome, setShowWelcome] = useState<boolean>(
    initialProfileH3 !== null && !initialBuzzWelcomedAt
  )
  const [profileName, setProfileName] = useState(initialProfileName)
  const { showError, showInfo } = useErrorToast()

  
  // Polling state
  const [lastFetchTime, setLastFetchTime] = useState<string | null>(null)
  const [newMessagesCount, setNewMessagesCount] = useState(0)
  
  // Scroll and UI state
  const scrollRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true)
  const typeDebounceRef = useRef<NodeJS.Timeout | null>(null)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const initialScrollDoneRef = useRef(false)
  
  // Track total expected messages to prevent feed truncation on optimistic saves
  const messageCountRef = useRef(50)
  const topAnchorRef = useRef<HTMLDivElement>(null)
  const composeRef = useRef<HTMLDivElement>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [replyingTo, setReplyingTo] = useState<CommunityChatMessage | null>(null)
  const [composePrefill, setComposePrefill] = useState<string | undefined>(undefined)
  
  // Pagination State
  const [isLoadingOlder, setIsLoadingOlder] = useState(false)
  const [hasMoreOlder, setHasMoreOlder] = useState(true)
  const [pendingMessages, setPendingMessages] = useState<CommunityChatMessage[]>([])

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
    
    if (!isAuthenticated || !user) {
      router.push('/login?redirect=/community')
      return
    }

    if (initialProfileH3 === null) {
      console.warn('User has no home community set')
      setErrorState({ message: 'You need to set your neighborhood location before you can join the Community!', cta: 'Update Profile', action: () => router.push('/profile-setup') })
    }
  }, [loading, isAuthenticated, user, router, initialProfileH3])
  
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
      setMessages(combined.reverse()) // Reverse for chronological order (newest at bottom)
      
      const scrollToBottom = () => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
      }
      requestAnimationFrame(scrollToBottom)
      setTimeout(scrollToBottom, 200)
    } catch (err) {
      console.error('Failed to reload messages', err)
    }
  }, [profileH3, pendingMessages])
  
  useEffect(() => {
    // Component mounted with SSR data! We don't fetch, we just scroll to the bottom.
    // Set the initial fetch time so polling knows the baseline
    setLastFetchTime(new Date().toISOString())
    
    // Smart scroll: either jump to the first unread message, or fall back to bottom
    const scrollToInitialPosition = () => {
      if (!scrollRef.current) return
      
      let targetUnread: HTMLElement | null = null
      if (targetMessageId) {
        // If a user clicked a shared link pointing to a specific message ID
        targetUnread = document.getElementById(`msg-${targetMessageId}`) || document.getElementById(`unread-marker-${targetMessageId}`)
      } else if (initialBuzzWelcomedAt && user) {
        const firstUnread = messages.find(m => new Date(m.created_at) > new Date(initialBuzzWelcomedAt) && m.author_id !== user.id)
        if (firstUnread) {
          // Look for the specific red marker line, otherwise fallback to the chat component root
          targetUnread = document.getElementById(`unread-marker-${firstUnread.id}`) || document.getElementById(`msg-${firstUnread.id}`)
        }
      }

      if (targetUnread) {
        // Scroll exactly so the unread marker sits boldly at the top
        const container = scrollRef.current
        const targetRect = targetUnread.getBoundingClientRect()
        const containerRect = container.getBoundingClientRect()
        
        container.scrollTop = container.scrollTop + (targetRect.top - containerRect.top) - 10
      } else {
        // Normal fallback: slap to bottom
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }
    }
    requestAnimationFrame(scrollToInitialPosition)
    setTimeout(scrollToInitialPosition, 200)
    setTimeout(scrollToInitialPosition, 600)
  }, [])
  
  // 3. Supabase Realtime (WebSockets) for new messages
  useEffect(() => {
    if (!profileH3 || isLoading) return
    
    let isSubscribed = true
    const checkNewMessages = async () => {
      if (!lastFetchTime || document.visibilityState === 'hidden') return
      
      try {
        const supabase = createClient()
        const newMsgs = await fetchCommunityMessages(supabase, profileH3, undefined, 50)
        
        const tempLocalMsgs = messages.filter(m => m.id.startsWith('temp-'))
        const actualNewMsgs = newMsgs.filter((m: CommunityChatMessage) => {
          if (messages.find(existing => existing.id === m.id)) return false
          if (pendingMessages.find(existing => existing.id === m.id)) return false
          
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
          // If they are staring directly at the bottom and a couple messages pop in natively, just scroll down like normal texting
          if (isAtBottom && pendingMessages.length === 0 && actualNewMsgs.length <= 2) {
            setMessages(prev => {
              const uniqueNew = actualNewMsgs.filter(newM => !prev.some(e => e.id === newM.id))
              return [...prev, ...uniqueNew.reverse()]
            })
            if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
          } else {
            // Otherwise, they tabbed out and suddenly gained 5+ messages, or they were scrolled way up evaluating history. Use the badge!
            setPendingMessages(prev => {
              const uniqueNew = actualNewMsgs.filter(newM => !prev.some(e => e.id === newM.id))
              return [...prev, ...uniqueNew.reverse()]
            })
            setNewMessagesCount(prev => prev + actualNewMsgs.length)
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
    
    // ── SUPABASE WEBSOCKET CHANNEL ──
    const supabase = createClient()
    let channel: any = null

    const connectWebSocket = () => {
      if (channel) return
      channel = supabase.channel(`community_chat_${profileH3}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'community_chat_messages' },
          (payload) => {
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
    document.addEventListener('visibilitychange', handleVisChange)
    
    return () => {
      isSubscribed = false
      clearTimeout(pollTimer)
      document.removeEventListener('visibilitychange', handleVisChange)
      
      disconnectWebSocket()
      supabase.rpc('update_profile_last_seen').then()
    }
  }, [profileH3, lastFetchTime, isLoading, isAtBottom, messages, pendingMessages])
  
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
        if (entries[0].isIntersecting) {
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
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget
    const bottomThreshold = 100 // pixels from bottom to consider "at bottom"
    const isBottom = target.scrollHeight - target.scrollTop - target.clientHeight < bottomThreshold
    
    setIsAtBottom(isBottom)
    
    if (isBottom && newMessagesCount > 0) {
      // User scrolled to bottom, drop new messages directly in 
      setMessages(prev => {
        // Filter out any potential duplicates between existing messages and pending
        const uniquePending = pendingMessages.filter(pm => !prev.some(m => m.id === pm.id))
        return [...prev, ...uniquePending]
      })
      setNewMessagesCount(0)
      setPendingMessages([])
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
      }, 50)
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
      const optimisticMsg: CommunityChatMessage = {
        id: tempId,
        content,
        created_at: new Date().toISOString(),
        author_id: user.id,
        author_name: profileName || 'Neighbor',
        author_avatar_url: typeof (user as any)?.user_metadata?.avatar_url === 'string' ? (user as any).user_metadata.avatar_url : null,
        community_h3_index: profileH3,
        parent_id: null,
        media: [],
        product_listing_id: null,
        is_system: false,
        is_pinned: false,
        bumped_at: null,
        edited_at: null,
        reaction_counts: {},
        reply_count: 0,
        user_reactions: [],
        flag_count: 0,
      }
      setMessages(prev => [...prev, optimisticMsg])
      
      // Ensure we're scrolled to the bottom so user immediately sees their own message
      setTimeout(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }, 50)

      const supabase = createClient()
      const msgId = await sendCommunityMessage(supabase, {
        h3Index: profileH3,
        authorId: user.id,
        content,
        media
      })
      
      // Swap out temp ID (will naturally happen anyway via Supabase Realtime catching it, but this keeps our state perfectly clean)
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, id: msgId } : m))
      
      // Prompt for push notification permission (first time / re-prompt after 7 days)
      showPrompt()

      // If message mentions @CasaBot, trigger AI response in background
      if (content.toLowerCase().includes('@casabot')) {
        console.log('[CasaBot] Invoking casabot-reply for message:', msgId)
        supabase.functions.invoke('casabot-reply', {
          body: {
            message_id: msgId,
            content,
            community_h3_index: profileH3,
            author_name: 'Neighbor',
          },
        }).then((res) => {
          console.log('[CasaBot] Response:', res)
          // Reload after a short delay to show the bot reply
          setTimeout(() => loadMessages(), 3000)
        }).catch((err: unknown) => console.error('[CasaBot] Error:', err))
      }

      // Ensure we're scrolled to the bottom
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
      }, 100)
    } catch (err) {
      // Remove optimistic message if failed
      setMessages(prev => prev.filter(m => !m.id.startsWith('temp-')))
      console.error('Failed to send message', err)
      showError('Failed to send message. Please try again.')
    }
  }

  // ── Sell chip handler ──
  const handleSellClick = () => {
    if (!user) { router.push('/login?redirect=/community'); return }
    router.push('/my-booth/products/new?from=buzz')
  }

  // ── Find chip handler ──
  const handleFindClick = () => {
    setFindActive(true)
  }

  if (!isAuthenticated) return null // Handled by redirect in useEffect
  
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

  if (!profileH3) {
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
      
      {!findActive && !notifyActive && <InviteBanner h3Index={profileH3} />}


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
              {hasMoreOlder && messages.length > 0 && !showWelcome && (
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
              {!showWelcome && messages.map(msg => (
                <div key={msg.id}>
                  {firstUnreadId === msg.id && (
                    <div id={`unread-marker-${msg.id}`} className={styles.unreadDivider}>
                      Unread Messages
                    </div>
                  )}
                  <ChatMessage 
                    message={msg} 
                    currentUserId={user?.id}
                    onReply={async (parentId, content) => {
                      const supabase = createClient()
                      const replyId = await sendCommunityMessage(supabase, {
                        h3Index: profileH3!,
                        authorId: user!.id,
                        content,
                        parentId,
                      })
                      await loadMessages()
                      
                      const CASABOT_ID = 'a0000000-0000-0000-0000-00000ca5ab07'
                      const isCasaBotThread = 
                        content.toLowerCase().includes('@casabot') ||
                        msg.author_id === CASABOT_ID ||
                        msg.content?.toLowerCase().includes('@casabot')
                      
                      if (isCasaBotThread) {
                        supabase.functions.invoke('casabot-reply', {
                          body: {
                            message_id: replyId,
                            content,
                            community_h3_index: profileH3,
                            author_name: 'Neighbor',
                          },
                        }).then(() => setTimeout(() => loadMessages(), 3000))
                      }
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

      {/* Floating Badge for New Messages */}
      {newMessagesCount > 0 && !isAtBottom && (
        <NewMessagesBadge 
          count={newMessagesCount} 
          onClick={() => {
            if (scrollRef.current) {
              scrollRef.current.scrollTo({
                top: scrollRef.current.scrollHeight,
                behavior: 'smooth'
              })
            }
          }} 
        />
      )}

      {/* Welcome Card for new users — appears above compose bar */}
      {showWelcome && user && !findActive && (
        <WelcomeCard
          userId={user.id}
          userName={profileName}
          profileH3={profileH3!}
          onComplete={() => {
            setShowWelcome(false)
            setTimeout(() => {
              if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
            }, 50)
          }}
          onSendMessage={async (msg) => { await handleSendMessage(msg) }}
          showPrompt={showPrompt}
        />
      )}

      {/* Compose Input — suggestions above, compose bar below */}
      <div className={styles.composeWrapper}>
        <SuggestionChips 
          onSelect={(text: string) => handleSendMessage(text)}
          onPrefill={(text: string) => setComposePrefill(text)}
          userMessageCount={messages.filter(m => m.author_id === user?.id && !m.is_system).length}
          onSellClick={handleSellClick}
          onFindClick={handleFindClick}
          onNotifyClick={() => setNotifyActive(true)}
        />
        <ComposeBar
          onSend={handleSendMessage}
          userId={user?.id}
          h3Index={profileH3}
          prefillText={composePrefill}
          onPrefillConsumed={() => setComposePrefill(undefined)}
        />
      </div>
      <NotificationPromptModal {...modalProps} />
    </div>
  )
}
