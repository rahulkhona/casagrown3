'use client'
import { useState, useEffect } from 'react'
import { CommunityChatMessage, toggleMessageReaction } from '../../../../../../packages/app/features/community-chat/community-chat-service'
import { createClient } from '../../../../lib/supabase'
import { useErrorToast } from '../../../components/ErrorToast'
import { checkTextForViolations } from '../../../../lib/moderation'
import ProductListingCard from './ProductListingCard'
import SocialShareModal from '../../../components/SocialShareModal'
import { getCommunityMessageForwardMessage, getRandomGreeting } from '../../../../lib/shareMessages'
import { Share2 as ShareIcon } from 'lucide-react'
import styles from '../page.module.css'

interface ChatMessageProps {
  message: CommunityChatMessage
  currentUserId?: string
  onDelete: () => void
  onFlag: () => void
  onReplyTo?: (message: CommunityChatMessage) => void
  onEdit?: (messageId: string, newContent: string) => Promise<void>
  /** If true, the viewer is not authenticated — disable all write actions */
  isGuest?: boolean
}

const EMOJIS = ['👍', '❤️', '🎉', '😂', '😮', '🌱']

function formatTime(dateStr?: string) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const today = new Date()
  const isToday = d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear()
  const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  
  if (isToday) return timeStr
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' + timeStr
}

export default function ChatMessage({ message, currentUserId, onDelete, onFlag, onReplyTo, onEdit, isGuest }: ChatMessageProps) {
  const [showActions, setShowActions] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [richShareInfo, setRichShareInfo] = useState<string | null>(null)
  
  const [reactions, setReactions] = useState(message.reaction_counts)
  const [userReactions, setUserReactions] = useState<string[]>(message.user_reactions)
  const { showError } = useErrorToast()

  const isOwnMessage = currentUserId === message.author_id
  const isBot = message.is_system || 
                message.author_name === 'CasaBot' || 
                message.author_id === '00000000-0000-0000-0000-000000000000' || 
                message.author_id === 'a0000000-0000-0000-0000-00000ca5ab07'

  // Edit state
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(message.content)
  const [isSavingEdit, setIsSavingEdit] = useState(false)

  const handleToggleReaction = async (emoji: string) => {
    if (!currentUserId || isGuest) return
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
    setShowShareModal(true)
  }



  const handleBubbleTap = () => {
    if (isEditing) return
    // Don't toggle action bar if user is selecting text
    const selection = window.getSelection()
    if (selection && selection.toString().trim().length > 0) return
    const next = !showActions
    setShowActions(next)
  }

  const handleSaveEdit = async () => {
    if (!onEdit || !editText.trim() || isSavingEdit) return
    const violationCheck = checkTextForViolations(editText)
    if (!violationCheck.isClean) {
      showError(violationCheck.error!)
      return
    }
    
    setIsSavingEdit(true)
    try {
      await onEdit(message.id, editText.trim())
      message.content = editText.trim() // Optimistic UI
      setIsEditing(false)
    } catch (err) {
      console.error('Failed to edit', err)
      showError('Failed to save edit.')
    } finally {
      setIsSavingEdit(false)
    }
  }

  const activeReactions = Object.entries(reactions)
    .filter(([_, count]) => count > 0)
    .sort(([emojiA], [emojiB]) => {
      if (reactions[emojiA] !== reactions[emojiB]) return reactions[emojiB] - reactions[emojiA]
      return EMOJIS.indexOf(emojiA) - EMOJIS.indexOf(emojiB)
    })

  return (
    <div id={`msg-${message.id}`} className={`${styles.messageWrapper} ${isOwnMessage ? styles.isOwnMessage : ''} ${isBot ? styles.isBotMessage : ''}`}>
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
          
          {/* NEW: Inline Message Action */}
          {!isOwnMessage && !isBot && !isGuest && (
            <div style={{ display: 'inline-flex', alignItems: 'center' }}>
              <a 
                href={`/messages/new?userId=${message.author_id}&name=${encodeURIComponent(message.author_name || 'Neighbor')}`}
                style={{ fontSize: '0.75rem', background: '#dcfce3', border: '1px solid #86efac', padding: '2px 8px', borderRadius: '12px', marginLeft: 6, color: '#166534', textDecoration: 'none', fontWeight: 500 }}
                title="Send a Direct Message"
              >
                💬 DM
              </a>
              <ChatFollowButton currentUserId={currentUserId} targetUserId={message.author_id} />
            </div>
          )}

          {isOwnMessage && !isBot && !isGuest && (
            <div style={{ display: 'flex', gap: 6, marginLeft: 8 }}>
              <button 
                onClick={(e) => { e.stopPropagation(); setIsEditing(true) }} 
                style={{ fontSize: '0.65rem', color: '#6b7280', background: '#f3f4f6', border: 'none', borderRadius: 4, cursor: 'pointer', padding: '2px 6px', fontWeight: 500 }}
              >
                Edit
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); onDelete() }} 
                style={{ fontSize: '0.65rem', color: '#ef4444', background: '#fef2f2', border: 'none', borderRadius: 4, cursor: 'pointer', padding: '2px 6px', fontWeight: 500 }}
              >
                Delete
              </button>
            </div>
          )}

          <span className={styles.time}>{formatTime(message.created_at)}</span>
        </div>
        
        {/* Quote bar for reply messages */}
        {message.parent_id && message.quoted_content && (
          <div 
            className={styles.quoteBar}
            onClick={(e) => {
              e.stopPropagation()
              const parentEl = document.getElementById(`msg-${message.parent_id}`)
              if (parentEl) {
                parentEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
                parentEl.style.background = 'rgba(22, 163, 74, 0.08)'
                setTimeout(() => { parentEl.style.background = '' }, 2000)
              }
            }}
          >
            <span className={styles.quoteAuthor}>{message.quoted_author_name || 'Neighbor'}</span>
            <span className={styles.quoteText}>{message.quoted_content}</span>
          </div>
        )}

        {/* Product listing card OR regular text bubble */}
        {message.product_listing_id ? (
          <div onClick={handleBubbleTap} data-testid="message-bubble">
            <ProductListingCard
              productId={message.product_listing_id}
              messageContent={message.content}
              currentUserId={currentUserId}
              onShareDataLoaded={(info) => setRichShareInfo(info)}
            />
          </div>
        ) : isEditing ? (
          <div className={`${styles.messageBubble} ${styles.isOwnMessage}`} style={{ width: '100%' }}>
            <textarea
              className={styles.inlineReplyInput}
              value={editText}
              onChange={e => {
                setEditText(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = (e.target.scrollHeight) + 'px'
              }}
              style={{ resize: 'none', overflowY: 'hidden', minHeight: 38, width: '100%', padding: '8px 12px', marginBottom: 8 }}
              disabled={isSavingEdit}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button 
                onClick={() => { setIsEditing(false); setEditText(message.content) }} 
                style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 13, cursor: 'pointer', padding: '4px 8px' }}
                disabled={isSavingEdit}
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveEdit} 
                style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 12, fontSize: 13, cursor: 'pointer', padding: '4px 12px', fontWeight: 600 }}
                disabled={!editText.trim() || isSavingEdit}
              >
                {isSavingEdit ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <div 
            className={`${styles.messageBubble} ${isBot ? styles.botBubble : ''}`}
            onClick={handleBubbleTap}
            data-testid="message-bubble"
          >
            {message.media && message.media.length > 0 && (
              <div className={styles.mediaGrid}>
                {message.media.map((m, i) => (
                  <img key={i} src={m.url} alt="Attached media" className={styles.attachedImage} />
                ))}
              </div>
            )}

            <div className={styles.messageText}>
              <SimpleMarkdown text={message.content} />
              {message.edited_at && <span style={{ fontSize: '0.65rem', color: 'rgba(0,0,0,0.4)', marginLeft: 6 }}>(edited)</span>}
            </div>
          </div>
        )}

        {/* Tap-revealed action bar: emojis + share + delete/flag */}
        {showActions && (
          <>
            <div 
              style={{ position: 'fixed', inset: 0, zIndex: 40 }} 
              onClick={(e) => { e.stopPropagation(); setShowActions(false) }} 
            />
            <div className={styles.tapActionBar} style={{ zIndex: 50, position: 'relative' }}>
            {!isGuest && EMOJIS.map(emoji => (
              <button 
                key={emoji} 
                onClick={() => { handleToggleReaction(emoji); setShowActions(false) }} 
                className={styles.tapActionEmoji}
              >
                {emoji}
              </button>
            ))}
            {!isGuest && <span className={styles.tapActionDivider} />}
            {!isGuest && onReplyTo && (
              <button 
                className={styles.tapActionBtn} 
                onClick={() => { setShowActions(false); onReplyTo(message) }}
                title="Reply"
              >
                ↩
              </button>
            )}
            <button 
              className={styles.tapActionBtn} 
              onClick={() => { 
                navigator.clipboard.writeText(message.content)
                setShowActions(false) 
              }} 
              title="Copy"
            >
              📋
            </button>
            <button className={styles.tapActionBtn} onClick={handleShare} title="Share">
              <ShareIcon size={14} />
            </button>
            {!isGuest && (isOwnMessage ? (
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
            ))}
          </div>
          </>
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

      </div>

      <SocialShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        title="Share Message"
        subtitle="Invite your neighbors to the conversation."
        entityName="CasaGrown Message"
        shareContext="chat_message_share"
        shareUrl={`${typeof window !== 'undefined' ? window.location.origin : ''}/community?message_id=${message.id}`}
        shareMessage={(p) => {
          const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/community?message_id=${message.id}`
          if (richShareInfo) {
            return `${getRandomGreeting()} Check out what I found on CasaGrown Market:\n\n${richShareInfo}\n\n👇 Click here to view and purchase:\n${url}`
          }
          return getCommunityMessageForwardMessage(message.content.length > 200 ? message.content.slice(0, 200) + '…' : message.content, p) + url
        }}
      />
    </div>
  )
}

// ── Follow Button & Deduplicator ──

const _chatFollowCache = new Map<string, Promise<{boothId: string | null, isFollowing: boolean}>>()

function ChatFollowButton({ targetUserId, currentUserId, isSmall }: { targetUserId?: string, currentUserId?: string, isSmall?: boolean }) {
  const [isFollowing, setIsFollowing] = useState<boolean | null>(null)
  const [boothId, setBoothId] = useState<string | null>(null)

  useEffect(() => {
    if (!targetUserId || !currentUserId) return
    let mounted = true
    
    const key = `${currentUserId}-${targetUserId}`
    if (!_chatFollowCache.has(key)) {
      _chatFollowCache.set(key, (async () => {
        const supabase = createClient()
        const { data: booth } = await supabase.from('market_booths').select('id').eq('owner_id', targetUserId).single()
        if (!booth) return { boothId: null, isFollowing: false }
        
        const { data: follow } = await supabase.from('market_followers')
          .select('id').match({ follower_id: currentUserId, booth_id: booth.id }).maybeSingle()
          
        return { boothId: booth.id, isFollowing: !!follow }
      })())
    }

    _chatFollowCache.get(key)!.then(res => {
      if (mounted) {
        setBoothId(res.boothId)
        setIsFollowing(res.isFollowing)
      }
    })

    return () => { mounted = false }
  }, [targetUserId, currentUserId])

  const toggleFollow = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!boothId || !currentUserId || isFollowing === null) return

    const supabase = createClient()
    const nextState = !isFollowing
    setIsFollowing(nextState) // Optimistic

    // Also update cache for other mounts of the same user
    const key = `${currentUserId}-${targetUserId}`
    _chatFollowCache.set(key, Promise.resolve({ boothId, isFollowing: nextState }))

    if (nextState) {
      await supabase.from('market_followers').insert({ follower_id: currentUserId, booth_id: boothId })
    } else {
      await supabase.from('market_followers').delete().match({ follower_id: currentUserId, booth_id: boothId })
    }
  }

  if (isFollowing === null || !boothId) return null

  return (
    <button
      onClick={toggleFollow}
      style={{ 
        fontSize: isSmall ? '0.65rem' : '0.75rem', 
        background: isFollowing ? 'transparent' : '#166534', 
        border: '1px solid #166534', 
        padding: isSmall ? '1px 6px' : '2px 8px', 
        borderRadius: '12px', 
        marginLeft: 6, 
        color: isFollowing ? '#166534' : '#fff', 
        fontWeight: 600,
        cursor: 'pointer' 
      }}
      title={isFollowing ? 'Unfollow' : 'Follow'}
    >
      {isFollowing ? 'Following' : 'Follow'}
    </button>
  )
}

// ── Simple Markdown Parser ──
function SimpleMarkdown({ text }: { text: string }) {
  if (!text) return null
  if (!text.includes('- ') && !text.includes('*') && !text.includes('#')) {
    return <>{text}</>
  }
  
  const lines = text.split('\n')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {lines.map((line, i) => {
        let isBullet = false
        let cleanLine = line
        if (line.trim().startsWith('- ')) {
          isBullet = true
          cleanLine = line.trim().replace(/^- /, '')
        } else if (line.trim().startsWith('* ')) {
          isBullet = true
          cleanLine = line.trim().replace(/^\* /, '')
        }

        const parts = cleanLine.split(/(\*\*.*?\*\*)/g)
        const parsedLine = (
          <>
            {parts.map((p, j) => {
              if (p.startsWith('**') && p.endsWith('**')) {
                return <strong key={j}>{p.slice(2, -2)}</strong>
              }
              return p
            })}
          </>
        )

        if (isBullet) {
          return <li key={i} style={{ marginLeft: 20 }}>{parsedLine}</li>
        }
        return <div key={i}>{parsedLine}</div>
      })}
    </div>
  )
}

