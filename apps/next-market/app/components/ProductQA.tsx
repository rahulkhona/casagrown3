'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'
import styles from './ProductQA.module.css'

interface Comment {
  id: string
  product_id: string
  author_id: string
  parent_id: string | null
  body: string
  created_at: string
  author_name?: string
}

interface ProductQAProps {
  productId: string
  sellerId: string
}

export function ProductQA({ productId, sellerId }: ProductQAProps) {
  const supabase = createClient()
  const { user, isAuthenticated } = useAuth()
  const [comments, setComments] = useState<Comment[]>([])
  const [newQuestion, setNewQuestion] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set())
  const [posting, setPosting] = useState(false)

  const loadComments = useCallback(async () => {
    const { data } = await supabase
      .from('product_comments')
      .select('*, profiles:author_id(full_name)')
      .eq('product_id', productId)
      .order('created_at', { ascending: true })

    if (data) {
      setComments(data.map((c: any) => ({
        ...c,
        author_name: c.profiles?.full_name || 'Anonymous'
      })))
    }

    // Load user's flags
    if (user) {
      const { data: flags } = await supabase
        .from('comment_flags')
        .select('comment_id')
        .eq('user_id', user.id)
      if (flags) setFlaggedIds(new Set(flags.map((f: any) => f.comment_id)))
    }
  }, [productId, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadComments() }, [loadComments])

  const postComment = async (body: string, parentId: string | null) => {
    if (!body.trim() || !user) return
    setPosting(true)
    await supabase.from('product_comments').insert({
      product_id: productId,
      author_id: user.id,
      parent_id: parentId,
      body: body.trim(),
    })
    setNewQuestion('')
    setReplyText('')
    setReplyTo(null)
    setPosting(false)
    loadComments()
  }

  const deleteComment = async (id: string) => {
    await supabase.from('product_comments').delete().eq('id', id)
    loadComments()
  }

  const flagComment = async (commentId: string) => {
    if (flaggedIds.has(commentId)) return
    await supabase.from('comment_flags').insert({
      comment_id: commentId,
      user_id: user!.id,
      reason: 'offensive',
    })
    setFlaggedIds(new Set(Array.from(flaggedIds).concat(commentId)))
  }

  // Group: top-level questions with their replies
  const questions = comments.filter(c => !c.parent_id)
  const repliesMap = new Map<string, Comment[]>()
  comments.filter(c => c.parent_id).forEach(c => {
    const arr = repliesMap.get(c.parent_id!) || []
    arr.push(c)
    repliesMap.set(c.parent_id!, arr)
  })

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  }

  const canDelete = (c: Comment) =>
    user?.id === c.author_id || user?.id === sellerId

  return (
    <div className={styles.qaSection}>
      <h3 className={styles.qaTitle}>
        Questions & Answers {questions.length > 0 && <span className={styles.qaCount}>({questions.length})</span>}
      </h3>

      {/* Ask a question */}
      {isAuthenticated ? (
        <div className={styles.askBox}>
          <textarea
            className={styles.qaInput}
            placeholder="Ask a question about this product..."
            value={newQuestion}
            onChange={e => setNewQuestion(e.target.value)}
            rows={2}
            maxLength={2000}
          />
          <button
            className="btn btn-primary"
            style={{ fontSize: 13, padding: '6px 16px', alignSelf: 'flex-end' }}
            onClick={() => postComment(newQuestion, null)}
            disabled={!newQuestion.trim() || posting}
          >
            Ask
          </button>
        </div>
      ) : (
        <p className={styles.loginPrompt}>Log in to ask a question</p>
      )}

      {/* Questions list */}
      {questions.length === 0 ? (
        <p className={styles.emptyState}>No questions yet. Be the first to ask!</p>
      ) : (
        <div className={styles.questionList}>
          {questions.map(q => {
            const isSeller = q.author_id === sellerId
            const replies = repliesMap.get(q.id) || []
            return (
              <div key={q.id} className={styles.questionBlock}>
                <div className={styles.comment}>
                  <div className={styles.commentHeader}>
                    <span className={styles.authorName}>
                      {q.author_name}
                      {isSeller && <span className={styles.sellerBadge}>Seller</span>}
                    </span>
                    <span className={styles.timeAgo}>{timeAgo(q.created_at)}</span>
                  </div>
                  <p className={styles.commentBody}>{q.body}</p>
                  <div className={styles.commentActions}>
                    {isAuthenticated && (
                      <button
                        className={styles.replyBtn}
                        onClick={() => setReplyTo(replyTo === q.id ? null : q.id)}
                      >
                        Reply
                      </button>
                    )}
                    {isAuthenticated && user?.id !== q.author_id && (
                      <button
                        className={styles.flagCommentBtn}
                        onClick={() => flagComment(q.id)}
                        disabled={flaggedIds.has(q.id)}
                      >
                        {flaggedIds.has(q.id) ? '✓ Reported' : 'Report'}
                      </button>
                    )}
                    {canDelete(q) && (
                      <button className={styles.deleteBtn} onClick={() => deleteComment(q.id)}>
                        Delete
                      </button>
                    )}
                  </div>
                </div>

                {/* Replies */}
                {replies.map(r => {
                  const isSellerReply = r.author_id === sellerId
                  return (
                    <div key={r.id} className={`${styles.reply} ${isSellerReply ? styles.sellerReply : ''}`}>
                      <div className={styles.commentHeader}>
                        <span className={styles.authorName}>
                          {r.author_name}
                          {isSellerReply && <span className={styles.sellerBadge}>Seller</span>}
                        </span>
                        <span className={styles.timeAgo}>{timeAgo(r.created_at)}</span>
                      </div>
                      <p className={styles.commentBody}>{r.body}</p>
                      <div className={styles.commentActions}>
                        {isAuthenticated && user?.id !== r.author_id && (
                          <button
                            className={styles.flagCommentBtn}
                            onClick={() => flagComment(r.id)}
                            disabled={flaggedIds.has(r.id)}
                          >
                            {flaggedIds.has(r.id) ? '✓ Reported' : 'Report'}
                          </button>
                        )}
                        {canDelete(r) && (
                          <button className={styles.deleteBtn} onClick={() => deleteComment(r.id)}>
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}

                {/* Reply input */}
                {replyTo === q.id && (
                  <div className={styles.replyBox}>
                    <textarea
                      className={styles.qaInput}
                      placeholder="Write a reply..."
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      rows={2}
                      maxLength={2000}
                      autoFocus
                    />
                    <div className={styles.replyActions}>
                      <button
                        className="btn btn-primary"
                        style={{ fontSize: 12, padding: '4px 12px' }}
                        onClick={() => postComment(replyText, q.id)}
                        disabled={!replyText.trim() || posting}
                      >
                        Reply
                      </button>
                      <button
                        className={styles.cancelBtn}
                        onClick={() => { setReplyTo(null); setReplyText('') }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
