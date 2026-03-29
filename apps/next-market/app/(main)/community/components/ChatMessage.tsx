'use client'
import { useState, useEffect } from 'react'
import { CommunityChatMessage, toggleMessageReaction, fetchCommunityReplies } from '../../../../../../packages/app/features/community-chat/community-chat-service'
import { createClient } from '../../../../lib/supabase'
import { useErrorToast } from '../../../components/ErrorToast'
import { checkTextForViolations } from '../../../../lib/moderation'
import styles from '../page.module.css'

interface ChatMessageProps {
  message: CommunityChatMessage
  currentUserId?: string
  onDelete: () => void
  onFlag: () => void
  onReply?: (parentId: string, content: string) => Promise<void>
  /** If true, this message is inside a thread view — hide reply/thread actions */
  isThreadReply?: boolean
}

const EMOJIS = ['👍', '❤️', '🎉', '😂', '😮', '🌱']

function formatTime(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export default function ChatMessage({ message, currentUserId, onDelete, onFlag, onReply, isThreadReply }: ChatMessageProps) {
  const [showActions, setShowActions] = useState(false)
  
  const [reactions, setReactions] = useState(message.reaction_counts)
  const [userReactions, setUserReactions] = useState<string[]>(message.user_reactions)
  const { showError } = useErrorToast()

  const isOwnMessage = currentUserId === message.author_id
  const isBot = message.is_system

  // Inline reply state
  const [showReplyInput, setShowReplyInput] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [isSendingReply, setIsSendingReply] = useState(false)

  // Thread expansion state
  const [threadReplies, setThreadReplies] = useState<CommunityChatMessage[]>([])
  const [showAllReplies, setShowAllReplies] = useState(false)
  const [loadingThread, setLoadingThread] = useState(false)

  const VISIBLE_REPLY_LIMIT = 5

  // Auto-fetch replies and show input for messages that have replies
  useEffect(() => {
    if (message.reply_count > 0 && !isThreadReply) {
      setShowReplyInput(true)
      // Auto-fetch thread replies
      const fetchReplies = async () => {
        setLoadingThread(true)
        try {
          const supabase = createClient()
          const replies = await fetchCommunityReplies(supabase, message.id)
          setThreadReplies(replies)
        } catch (err) {
          console.error('Failed to load replies', err)
          showError('Failed to load replies.')
        } finally {
          setLoadingThread(false)
        }
      }
      fetchReplies()
    }
  }, [message.reply_count, message.id, isThreadReply])

  const handleToggleReaction = async (emoji: string) => {
    if (!currentUserId) return
    const hasReacted = userReactions.includes(emoji)
    
    if (hasReacted) {
      setUserReactions(prev => prev.filter(e => e !== emoji))
      setReactions(prev => ({ ...prev, [emoji]: Math.max(0, (prev[emoji] || 0) - 1) }))
    } else {
      setUserReactions(prev => [...prev, emoji])
      setReactions(prev => ({ ...prev, [emoji]: (prev[emoji] || 0) + 1 }))
    }

    try {
      const supabase = createClient()
      await toggleMessageReaction(supabase, message.id, currentUserId, emoji, !hasReacted)
    } catch (err) {
      console.error('Failed to toggle reaction', err)
      showError('Failed to toggle reaction. Please try again.')
      setReactions(message.reaction_counts)
      setUserReactions(message.user_reactions)
    }
  }

  const handleShare = async () => {
    setShowActions(false)
    const truncated = message.content.length > 200 ? message.content.slice(0, 200) + '…' : message.content
    const shareText = `💬 From CasaGrown Buzz:\n\n"${truncated}"\n\nJoin the neighborhood chat 👇`
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'CasaGrown Buzz — Neighborhood Chat',
          text: shareText,
          url: `${window.location.origin}/community`,
        })
        return
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
      }
    }
    try { await navigator.clipboard.writeText(`${shareText}\n${window.location.origin}/community`) } catch {}
  }



  const handleBubbleTap = () => {
    if (isThreadReply) return
    // Toggle: show actions + reply input
    const next = !showActions
    setShowActions(next)
    if (next) setShowReplyInput(true)
  }

  const activeReactions = Object.entries(reactions)
    .filter(([_, count]) => count > 0)
    .sort(([emojiA], [emojiB]) => {
      if (reactions[emojiA] !== reactions[emojiB]) return reactions[emojiB] - reactions[emojiA]
      return EMOJIS.indexOf(emojiA) - EMOJIS.indexOf(emojiB)
    })

  return (
    <div className={`${styles.messageWrapper} ${isOwnMessage ? styles.isOwnMessage : ''} ${isBot ? styles.isBotMessage : ''}`}>
      <div className={`${styles.avatar} ${isBot ? styles.botAvatar : ''}`}>
        {isBot ? (
          <span>🐝</span>
        ) : message.author_avatar_url ? (
          <img src={message.author_avatar_url} alt={message.author_name || 'User'} />
        ) : (
          <span>{(message.author_name || '?').charAt(0).toUpperCase()}</span>
        )}
      </div>
      
      <div className={styles.messageContent}>
        <div className={styles.messageHeader}>
          <span className={styles.authorName}>
            {isBot ? 'CasaBot' : (message.author_name || 'Neighbor')}
          </span>
          {isBot && <span className={styles.botBadge}>BOT</span>}
          <span className={styles.time}>{formatTime(message.created_at)}</span>
        </div>
        
        {/* Tap the bubble to show reply input + actions */}
        <div 
          className={`${styles.messageBubble} ${isBot ? styles.botBubble : ''}`}
          onClick={handleBubbleTap}
        >
          <p className={styles.messageText}>{message.content}</p>
          
          {message.media && message.media.length > 0 && (
            <div className={styles.mediaGrid}>
              {message.media.map((m, i) => (
                <img key={i} src={m.url} alt="Attached media" className={styles.attachedImage} />
              ))}
            </div>
          )}
        </div>

        {/* Tap-revealed action bar: emojis + share + delete/flag */}
        {showActions && (
          <div className={styles.tapActionBar}>
            {EMOJIS.map(emoji => (
              <button 
                key={emoji} 
                onClick={() => { handleToggleReaction(emoji); setShowActions(false) }} 
                className={styles.tapActionEmoji}
              >
                {emoji}
              </button>
            ))}
            <span className={styles.tapActionDivider} />
            <button className={styles.tapActionBtn} onClick={handleShare} title="Share">
              ↗
            </button>
            {isOwnMessage ? (
              <button 
                className={`${styles.tapActionBtn} ${styles.tapActionDanger}`} 
                onClick={() => { setShowActions(false); onDelete() }}
                title="Delete"
              >
                ✕
              </button>
            ) : (
              <button 
                className={`${styles.tapActionBtn} ${styles.tapActionDanger}`} 
                onClick={() => { setShowActions(false); onFlag() }}
                title="Report"
              >
                ⚑
              </button>
            )}
          </div>
        )}

        {/* Active reactions */}
        {activeReactions.length > 0 && (
          <div className={styles.reactionsList}>
            {activeReactions.map(([emoji, count]) => (
              <button 
                key={emoji}
                className={`${styles.reactionPill} ${userReactions.includes(emoji) ? styles.reactionPillActive : ''}`}
                onClick={() => handleToggleReaction(emoji)}
              >
                <span>{emoji}</span>
                <span className={styles.reactionCount}>{count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Thread replies — auto-shown, latest 5 visible if >5 */}
        {!isThreadReply && threadReplies.length > 0 && (
          <div className={styles.threadRepliesList}>
            {loadingThread && <span className={styles.threadLoading}>Loading replies...</span>}
            {threadReplies.length > VISIBLE_REPLY_LIMIT && !showAllReplies && (
              <button
                className={styles.viewRepliesBtn}
                onClick={() => setShowAllReplies(true)}
              >
                Show {threadReplies.length - VISIBLE_REPLY_LIMIT} earlier repl{threadReplies.length - VISIBLE_REPLY_LIMIT === 1 ? 'y' : 'ies'}
              </button>
            )}
            {threadReplies.length > VISIBLE_REPLY_LIMIT && showAllReplies && (
              <button
                className={styles.viewRepliesBtn}
                onClick={() => setShowAllReplies(false)}
              >
                ▴ Hide earlier replies
              </button>
            )}
            {(showAllReplies ? threadReplies : threadReplies.slice(-VISIBLE_REPLY_LIMIT)).map(reply => (
              <div key={reply.id} className={styles.threadReplyItem}>
                <div className={styles.threadReplyAvatar}>
                  {reply.author_avatar_url ? (
                    <img src={reply.author_avatar_url} alt={reply.author_name || ''} />
                  ) : (
                    <span>{(reply.author_name || '?').charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div className={styles.threadReplyContent}>
                  <span className={styles.threadReplyAuthor}>{reply.author_name || 'Neighbor'}</span>
                  <span className={styles.threadReplyText}>{reply.content}</span>
                </div>
                <span className={styles.threadReplyTime}>{formatTime(reply.created_at)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Inline reply input */}
        {!isThreadReply && showReplyInput && onReply && (
          <form 
            className={styles.inlineReplyForm}
            onSubmit={async (e) => {
              e.preventDefault()
              if (!replyText.trim() || isSendingReply) return
              
              const violationCheck = checkTextForViolations(replyText)
              if (!violationCheck.isClean) {
                showError(violationCheck.error!)
                return
              }

              setIsSendingReply(true)
              try {
                await onReply(message.id, replyText.trim())
                setReplyText('')

                // Reset the textarea physical height since we cleared its state
                const ta = e.currentTarget.querySelector('textarea')
                if (ta) ta.style.height = '38px'

                // Always refresh thread to show new reply
                const supabase = createClient()
                const replies = await fetchCommunityReplies(supabase, message.id)
                setThreadReplies(replies)
              } finally {
                setIsSendingReply(false)
              }
            }}
          >
            <textarea
              className={styles.inlineReplyInput}
              placeholder="Reply..."
              value={replyText}
              rows={1}
              onChange={(e) => {
                setReplyText(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = (e.target.scrollHeight) + 'px'
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  e.currentTarget.form?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
                }
              }}
              style={{ resize: 'none', overflowY: 'auto', minHeight: 38, maxHeight: 150, padding: '8px 12px' }}
              autoFocus={showActions}
              disabled={isSendingReply}
            />
            <button 
              type="submit" 
              className={styles.inlineReplySend}
              disabled={!replyText.trim() || isSendingReply}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
