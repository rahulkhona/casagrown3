'use client'
import { useState, useEffect } from 'react'
import { CommunityChatMessage, fetchCommunityReplies } from '../../../../../../packages/app/features/community-chat/community-chat-service'
import { createClient } from '../../../../lib/supabase'
import ChatMessage from './ChatMessage'
import ComposeBar from './ComposeBar'
import { useErrorToast } from '../../../components/ErrorToast'
import styles from '../page.module.css'

interface ThreadRepliesProps {
  parentMessage: CommunityChatMessage
  replyCount: number
  currentUserId?: string
}

export default function ThreadReplies({ parentMessage, replyCount, currentUserId }: ThreadRepliesProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [replies, setReplies] = useState<CommunityChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const { showError, showInfo } = useErrorToast()

  const loadReplies = async () => {
    setIsLoading(true)
    try {
      const supabase = createClient()
      const data = await fetchCommunityReplies(supabase, parentMessage.id, 50)
      setReplies(data)
    } catch (err) {
      console.error('Failed to load replies', err)
      showError('Failed to load replies. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // Load replies when expanding
  useEffect(() => {
    if (isExpanded && replies.length === 0) {
      loadReplies()
    }
  }, [isExpanded, parentMessage.id, replies.length])

  if (!isExpanded) {
    return (
      <div className={styles.threadCollapsed}>
        {replyCount > 0 ? (
          <button 
            className={styles.viewRepliesBtn}
            onClick={() => setIsExpanded(true)}
          >
            ↳ View {replyCount} repl{replyCount === 1 ? 'y' : 'ies'}
          </button>
        ) : (
          <button 
            className={styles.viewRepliesBtn}
            onClick={() => setIsExpanded(true)}
          >
            ↳ Reply
          </button>
        )}
      </div>
    )
  }

  return (
    <div className={styles.threadExpanded}>
      <div className={styles.threadLine} />
      
      <div className={styles.threadContent}>
        {isLoading ? (
          <div className={styles.threadLoading}>Loading replies...</div>
        ) : (
          <div className={styles.threadList}>
            {replies.map(reply => (
              <ChatMessage
                key={reply.id}
                message={reply}
                currentUserId={currentUserId}
                onDelete={() => loadReplies()} /* reload after delete */
                onFlag={() => showInfo('Message flagged.')}
              />
            ))}
          </div>
        )}
        
        {/* Thread Compose Input */}
        <div className={styles.threadCompose}>
          <ComposeBar 
            userId={currentUserId}
            onSend={async (content) => {
              // Service expects full structure for sendCommunityMessage
              // We'll use the API direct import here or handle this in a parent context
              // For now, we simulate success and reload
              await import('../../../../../../packages/app/features/community-chat/community-chat-service')
                .then(mod => mod.sendCommunityMessage(createClient(), {
                  h3Index: parentMessage.community_h3_index,
                  content,
                  authorId: currentUserId!,
                  parentId: parentMessage.id
                }))
              await loadReplies()
            }} 
          />
        </div>
        
        <button 
          className={styles.collapseThreadBtn}
          onClick={() => setIsExpanded(false)}
        >
          Collapse Thread
        </button>
      </div>
    </div>
  )
}
