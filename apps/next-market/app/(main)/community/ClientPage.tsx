'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
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

// How often to poll for new messages
const POLL_INTERVAL_ACTIVE = 15000 // 15s when tab is active
const POLL_INTERVAL_BACKGROUND = 60000 // 60s when tab is hidden

export default function ClientPage() {
  const router = useRouter()
  const { state } = useMarket()
  const { user, isAuthenticated, loading } = useAuth()
  
  const [messages, setMessages] = useState<CommunityChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [profileH3, setProfileH3] = useState<string | null>(null)
  const [errorState, setErrorState] = useState<{ message: string; cta?: string; action?: () => void } | null>(null)
  const [showWelcome, setShowWelcome] = useState(false)
  const [profileName, setProfileName] = useState('')
  const { showError, showInfo } = useErrorToast()

  
  // Polling state
  const [lastFetchTime, setLastFetchTime] = useState<string | null>(null)
  const [newMessagesCount, setNewMessagesCount] = useState(0)
  
  // Scroll and UI state
  const scrollRef = useRef<HTMLDivElement>(null)
  const composeRef = useRef<HTMLDivElement>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [replyingTo, setReplyingTo] = useState<CommunityChatMessage | null>(null)
  const [composePrefill, setComposePrefill] = useState<string | undefined>(undefined)

  // Find panel state
  const [findActive, setFindActive] = useState(false)
  const [notifyActive, setNotifyActive] = useState(false)

  // Push notification prompt
  const { showPrompt, modalProps } = useNotificationPrompt(user?.id)
  
  // 1. Fetch user's H3 community index on load
  useEffect(() => {
    if (loading) return
    
    if (!isAuthenticated || !user) {
      router.push('/login?redirect=/community')
      return
    }

    const fetchProfileH3 = async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('profiles')
        .select('home_community_h3_index, buzz_welcomed_at, full_name')
        .eq('id', user.id)
        .single()
        
      if (error) {
        console.error('Failed to fetch profile H3 index:', error)
        showError('We encountered an error loading your community profile.')
        setErrorState({ message: 'We encountered an error loading your community profile.', cta: 'Try Again', action: () => window.location.reload() })
        return
      }

      if (data?.home_community_h3_index) {
        setProfileH3(data.home_community_h3_index)
        setProfileName(data.full_name || '')
        if (!data.buzz_welcomed_at) {
          setShowWelcome(true)
        }
      } else {
        // If they don't have a community, redirect to onboarding or show error
        console.warn('User has no home community set')
        setErrorState({ message: 'You need to set your neighborhood location before you can join the Community!', cta: 'Update Profile', action: () => router.push('/profile-setup') })
      }
    }
    
    fetchProfileH3()
  }, [loading, isAuthenticated, user, router])
  
  // 2. Initial message fetch once we have the H3 index
  const loadMessages = useCallback(async () => {
    if (!profileH3) return
    
    try {
      const supabase = createClient()
      const msgs = await fetchCommunityMessages(supabase, profileH3)
      setMessages(msgs.reverse()) // Reverse for chronological order (newest at bottom)
      setLastFetchTime(new Date().toISOString())
      setIsLoading(false)
      
      // Auto-scroll to bottom on initial load
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
      }, 100)
    } catch (err) {
      console.error('Failed to load messages', err)
      setIsLoading(false)
    }
  }, [profileH3])
  
  useEffect(() => {
    if (profileH3) loadMessages()
  }, [profileH3, loadMessages])
  
  // 3. Polling for new messages
  useEffect(() => {
    if (!profileH3 || isLoading) return
    
    let pollTimer: NodeJS.Timeout
    
    const checkNewMessages = async () => {
      if (!lastFetchTime || document.visibilityState === 'hidden') return
      
      try {
        const supabase = createClient()
        // Fetch only messages newer than our last fetch time
        const newMsgs = await fetchCommunityMessages(supabase, profileH3, undefined, 50)
        
        // Filter out messages we already have and ones older than our last fetch
        const actualNewMsgs = newMsgs.filter((m: CommunityChatMessage) => 
          new Date(m.created_at) > new Date(lastFetchTime) && 
          !messages.find(existing => existing.id === m.id)
        )
        
        if (actualNewMsgs.length > 0) {
          if (isAtBottom) {
            // If user is at bottom, just append and scroll
            setMessages(prev => [...prev, ...actualNewMsgs.reverse()])
            setLastFetchTime(new Date().toISOString())
            setTimeout(() => {
              if (scrollRef.current) {
                scrollRef.current.scrollTop = scrollRef.current.scrollHeight
              }
            }, 50)
          } else {
            // User scrolled up, show badge instead
            setNewMessagesCount(prev => prev + actualNewMsgs.length)
          }
        }
      } catch (err) {
        console.error('Polling error', err)
      }
      
      // Schedule next poll
      schedulePoll()
    }
    
    const schedulePoll = () => {
      const interval = document.visibilityState === 'visible' 
        ? POLL_INTERVAL_ACTIVE 
        : POLL_INTERVAL_BACKGROUND
        
      pollTimer = setTimeout(checkNewMessages, interval) as unknown as NodeJS.Timeout
    }
    
    schedulePoll()
    
    // Also trigger immediately when tab becomes visible again
    const handleVisChange = () => {
      if (document.visibilityState === 'visible') {
        clearTimeout(pollTimer)
        checkNewMessages()
      }
    }
    document.addEventListener('visibilitychange', handleVisChange)
    
    return () => {
      clearTimeout(pollTimer)
      document.removeEventListener('visibilitychange', handleVisChange)
    }
  }, [profileH3, lastFetchTime, isLoading, isAtBottom, messages])
  
  // Scroll handler to track if user is at bottom
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget
    const bottomThreshold = 100 // pixels from bottom to consider "at bottom"
    const isBottom = target.scrollHeight - target.scrollTop - target.clientHeight < bottomThreshold
    
    setIsAtBottom(isBottom)
    
    if (isBottom && newMessagesCount > 0) {
      // User scrolled to bottom, apply the pending messages
      loadMessages()
      setNewMessagesCount(0)
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

              {messages.length === 0 && !showWelcome && (
                <div className={styles.emptyState}>
                  <span className={styles.emptyIcon}>👋</span>
                  <h3>Be the first to say hello!</h3>
                  <p>Start a conversation with your neighbors.</p>
                </div>
              )}
              {messages.map(msg => (
                <ChatMessage 
                  key={msg.id} 
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

                    // Auto-trigger CasaBot if replying in a CasaBot thread
                    const CASABOT_ID = 'a0000000-0000-0000-0000-00000ca5ab07'
                    const isCasaBotThread = 
                      content.toLowerCase().includes('@casabot') ||
                      msg.author_id === CASABOT_ID ||
                      msg.content?.toLowerCase().includes('@casabot')

                    if (isCasaBotThread) {
                      console.log('[CasaBot] Auto-reply in thread for:', replyId)
                      supabase.functions.invoke('casabot-reply', {
                        body: {
                          message_id: replyId,
                          content,
                          community_h3_index: profileH3,
                          author_name: 'Neighbor',
                        },
                      }).then((res) => {
                        console.log('[CasaBot] Thread reply response:', res)
                        setTimeout(() => loadMessages(), 3000)
                      }).catch((err: unknown) => console.error('[CasaBot] Thread reply error:', err))
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
          onComplete={() => setShowWelcome(false)}
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
