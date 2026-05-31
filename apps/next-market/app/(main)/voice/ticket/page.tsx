'use client'


import { useState, useEffect , Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '../../../../lib/supabase'
import { fetchTicketById, toggleVote, addComment, flagTicket, unflagTicket, type FeedbackDetail } from '../../../../lib/feedback-service'
import { LoadingSpinner } from '../../../components/LoadingSpinner'
import styles from '../voice.module.css'

const STATUS_COLORS: Record<string, string> = {
  open: 'var(--gray-500)', under_review: 'var(--amber-600)', planned: 'var(--blue-600)',
  in_progress: 'var(--purple-600)', completed: 'var(--green-600)', rejected: 'var(--red-600)',
}
const STATUS_LABELS: Record<string, string> = {
  open: 'Open', under_review: 'Under Review', planned: 'Planned',
  in_progress: 'In Progress', completed: 'Completed', rejected: 'Rejected',
}
const TYPE_LABELS: Record<string, string> = {
  bug_report: 'Bug', feature_request: 'Feature', support_request: 'Support',
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(dateStr).toLocaleDateString()
}

function VoiceTicketPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const ticketId = searchParams.get('id') || ''

  const [userId, setUserId] = useState<string | null>(null)
  const [ticket, setTicket] = useState<FeedbackDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [commentText, setCommentText] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: any } }) => {
      const user = session?.user
      if (user) setUserId(user.id)
    })
  }, [])

  useEffect(() => {
    if (!ticketId) return
    setLoading(true)
    fetchTicketById(ticketId, userId || undefined).then(data => {
      setTicket(data)
      setLoading(false)
    })
  }, [ticketId, userId])

  const handleVote = async () => {
    if (!userId || !ticket) { router.push('/login?redirect=/voice/ticket?id=' + ticketId); return }
    await toggleVote(ticket.id, userId, ticket.is_voted)
    setTicket(prev => prev ? {
      ...prev,
      is_voted: !prev.is_voted,
      vote_count: prev.is_voted ? prev.vote_count - 1 : prev.vote_count + 1,
    } : null)
  }

  const handleFlag = async () => {
    if (!userId || !ticket) return
    if (ticket.is_flagged) {
      await unflagTicket(ticket.id, userId)
      setTicket(prev => prev ? { ...prev, is_flagged: false, flag_count: prev.flag_count - 1 } : null)
    } else {
      await flagTicket(ticket.id, userId)
      setTicket(prev => prev ? { ...prev, is_flagged: true, flag_count: prev.flag_count + 1 } : null)
    }
  }

  const handleComment = async () => {
    if (!userId || !ticket || !commentText.trim()) return
    setSubmittingComment(true)
    const comment = await addComment({
      feedbackId: ticket.id,
      authorId: userId,
      content: commentText.trim(),
    })
    if (comment) {
      setTicket(prev => prev ? {
        ...prev,
        comments: [...prev.comments, comment],
        comment_count: prev.comment_count + 1,
      } : null)
      setCommentText('')
    }
    setSubmittingComment(false)
  }

  if (loading) {
    return <div className={styles.voicePage}><div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}><LoadingSpinner /></div></div>
  }

  if (!ticket) {
    return (
      <div className={styles.voicePage}>
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>🔍</div>
          <p>Ticket not found</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.voicePage}>
      <button className={styles.backLink} onClick={() => router.push('/voice/board')}>← Back to Board</button>

      {/* Header */}
      <div className={styles.detailHeader}>
        <div className={styles.detailMeta}>
          <span className={`${styles.ticketType} ${
            ticket.type === 'bug_report' ? styles.ticketTypeBug
            : ticket.type === 'feature_request' ? styles.ticketTypeFeature
            : styles.ticketTypeSupport
          }`}>{TYPE_LABELS[ticket.type]}</span>
          <span style={{ color: STATUS_COLORS[ticket.status], fontWeight: 600 }}>
            {STATUS_LABELS[ticket.status]}
          </span>
          <span>by {ticket.author_name}</span>
          <span>{timeAgo(ticket.created_at)}</span>
        </div>
        <h1 className={styles.detailTitle}>{ticket.title}</h1>
      </div>

      {/* Body */}
      <div className={styles.detailBody}>{ticket.description}</div>

      {/* Attachments */}
      {ticket.attachments.length > 0 && (
        <div className={styles.attachmentGrid}>
          {ticket.attachments.map(att => (
            <img
              key={att.id}
              src={att.storage_path}
              className={styles.attachmentImg}
              alt="Attachment"
              onClick={() => window.open(att.storage_path, '_blank')}
            />
          ))}
        </div>
      )}

      {/* Actions */}
      <div className={styles.detailActions}>
        <button className={`${styles.actionBtn} ${ticket.is_voted ? styles.active : ''}`} onClick={handleVote}>
          ▲ {ticket.vote_count} {ticket.is_voted ? 'Voted' : 'Vote'}
        </button>
        <button className={`${styles.actionBtn} ${ticket.is_flagged ? styles.active : ''}`} onClick={handleFlag}>
          🚩 {ticket.is_flagged ? 'Flagged' : 'Flag'}
        </button>
      </div>

      {/* Comments */}
      <div className={styles.commentsSection}>
        <h2 className={styles.commentsTitle}>💬 Comments ({ticket.comments.length})</h2>

        {ticket.comments.length === 0 ? (
          <div className={styles.emptyState} style={{ padding: '24px 0' }}>
            <p>No comments yet. Be the first to reply!</p>
          </div>
        ) : (
          ticket.comments.map(c => (
            <div key={c.id} className={`${styles.commentCard} ${c.is_official_response ? styles.official : ''}`}>
              <div className={styles.commentHeader}>
                <span className={styles.commentAuthor}>
                  {c.author_name}
                  {c.is_official_response && <span style={{ color: 'var(--green-600)', marginLeft: 6 }}>✓ Staff</span>}
                </span>
                <span className={styles.commentTime}>{timeAgo(c.created_at)}</span>
              </div>
              <div className={styles.commentBody}>{c.content}</div>
            </div>
          ))
        )}

        {/* Comment input */}
        {userId ? (
          <div className={styles.commentForm}>
            <input
              className={styles.commentInput}
              placeholder="Write a comment..."
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleComment() } }}
            />
            <button
              className={styles.commentSubmitBtn}
              disabled={submittingComment || !commentText.trim()}
              onClick={handleComment}
            >
              {submittingComment ? '...' : 'Reply'}
            </button>
          </div>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--gray-500)', textAlign: 'center' }}>
            <a href={`/login?redirect=/voice/ticket?id=${ticket.id}`} style={{ color: 'var(--green-600)' }}>Sign in</a> to comment
          </p>
        )}
      </div>
    </div>
  )
}

export default function VoiceTicketPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><LoadingSpinner /></div>}>
      <VoiceTicketPageInner />
    </Suspense>
  )
}
