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
import NewMessagesBadge from './components/NewMessagesBadge'
import { useNotificationPrompt } from '../../../lib/useNotificationPrompt'
import { NotificationPromptModal } from '../../components/NotificationPromptModal'

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
  
  // Polling state
  const [lastFetchTime, setLastFetchTime] = useState<string | null>(null)
  const [newMessagesCount, setNewMessagesCount] = useState(0)
  
  // Scroll and UI state
  const scrollRef = useRef<HTMLDivElement>(null)
  const composeRef = useRef<HTMLDivElement>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [replyingTo, setReplyingTo] = useState<CommunityChatMessage | null>(null)

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
        .select('home_community_h3_index')
        .eq('id', user.id)
        .single()
        
      if (data?.home_community_h3_index) {
        setProfileH3(data.home_community_h3_index)
      } else {
        // If they don't have a community, redirect to onboarding or show error
        console.warn('User has no home community set')
        // For now we could show an error state or prompt to set location
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

      // Ensure we're scrolled to the bottom
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
      }, 100)
    } catch (err) {
      console.error('Failed to send message', err)
      alert('Failed to send message. Please try again.')
    }
  }

  if (!isAuthenticated) return null // Handled by redirect in useEffect
  
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
      {/* Message List Area */}
      <div 
        className={styles.messageScrollArea} 
        ref={scrollRef}
        onScroll={handleScroll}
      >
        {isLoading ? (
          <div className={styles.loading}>Loading chat...</div>
        ) : messages.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>👋</span>
            <h3>Be the first to say hello!</h3>
            <p>Start a conversation with your neighbors.</p>
          </div>
        ) : (
          <div className={styles.messageList}>
            {messages.map(msg => (
              <ChatMessage 
                key={msg.id} 
                message={msg} 
                currentUserId={user?.id}
                onReply={async (parentId, content) => {
                  const supabase = createClient()
                  await sendCommunityMessage(supabase, {
                    h3Index: profileH3!,
                    authorId: user!.id,
                    content,
                    parentId,
                  })
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
                      alert('Message flagged for review.')
                      loadMessages()
                    })
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>

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

      {/* Compose Input — suggestions above, compose bar below */}
      <div className={styles.composeWrapper}>
        <SuggestionChips 
          onSelect={(text: string) => handleSendMessage(text)} 
          userMessageCount={messages.filter(m => m.author_id === user?.id && !m.is_system).length}
        />
        <ComposeBar onSend={handleSendMessage} userId={user?.id} h3Index={profileH3} />
      </div>
      <NotificationPromptModal {...modalProps} />
    </div>
  )
}
