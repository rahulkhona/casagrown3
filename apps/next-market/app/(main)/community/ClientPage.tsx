'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../../lib/supabase'
import { useMarket } from '../../../lib/store'
import { useAuth } from '../../../lib/useAuth'
import {
  fetchCommunityMessages,
  sendCommunityMessage,
  deleteCommunityMessage,
  flagMessage,
  CommunityChatMessage,
} from '../../../../../packages/app/features/community-chat/community-chat-service'
import styles from './page.module.css'
import ChatMessage from './components/ChatMessage'
import ComposeBar from './components/ComposeBar'
import SuggestionChips from './components/SuggestionChips'
import FindPanel from './components/FindPanel'
import NotifyPanel from './components/NotifyPanel'
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
  const firstUnreadId = useMemo(() => {
    if (!initialBuzzWelcomedAt || !user) return null
    const first = messages.find(m => new Date(m.created_at) > new Date(initialBuzzWelcomedAt) && m.author_id !== user.id)
    return first ? first.id : null
  }, [messages, initialBuzzWelcomedAt, user])
  
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
      const msgs = await fetchCommunityMessages(supabase, profileH3)
      setMessages([...msgs].reverse()) // Reverse for chronological order (newest at bottom)
      
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
  }, [profileH3])
  
  useEffect(() => {
    // Component mounted with SSR data! We don't fetch, we just scroll to the bottom.
    // Set the initial fetch time so polling knows the baseline
    setLastFetchTime(new Date().toISOString())
    
    // Smart scroll: either jump to the first unread message, or fall back to bottom
    const scrollToInitialPosition = () => {
      if (!scrollRef.current) return
      
      let targetUnread: HTMLElement | null = null
      if (initialBuzzWelcomedAt && user) {
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
        
        const actualNewMsgs = newMsgs.filter((m: CommunityChatMessage) => 
          !messages.find(existing => existing.id === m.id) &&
          !pendingMessages.find(existing => existing.id === m.id)
        )
        
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
      const olderMsgs = await fetchCommunityMessages(supabase, profileH3, oldestTimestamp)
      
      if (olderMsgs.length < 50) {
        setHasMoreOlder(false)
      }
      
      if (olderMsgs.length > 0) {
        const scrollArea = scrollRef.current
        if (scrollArea) {
          const previousScrollHeight = scrollArea.scrollHeight
          const previousScrollTop = scrollArea.scrollTop
          
          setMessages(prev => {
            const uniqueOlder = olderMsgs.filter(older => !prev.some(e => e.id === older.id))
            return [...uniqueOlder.reverse(), ...prev]
          })
          
          requestAnimationFrame(() => {
            if (scrollRef.current) {
              // Maintain exact scroll position by offsetting the newly added height
              scrollRef.current.scrollTop = previousScrollTop + (scrollRef.current.scrollHeight - previousScrollHeight)
            }
          })
        } else {
          setMessages(prev => {
            const uniqueOlder = olderMsgs.filter(older => !prev.some(e => e.id === older.id))
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
      const supabase = createClient()
      const msgId = await sendCommunityMessage(supabase, {
        h3Index: profileH3,
        authorId: user.id,
        content,
        media
      })
      
      // Optimistically trigger a reload to show the new message
      loadMessages()
      
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
