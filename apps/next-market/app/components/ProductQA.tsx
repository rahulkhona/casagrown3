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
  author_name: string
  author_avatar: string | null
  like_count: number
  liked_by_me: boolean
}

interface ProductQAProps {
  productId: string
  sellerId: string
  isDemo?: boolean
  productName?: string
  productDescription?: string
}

export function ProductQA({ productId, sellerId, isDemo, productName, productDescription }: ProductQAProps) {
  const supabase = createClient()
  const { user, isAuthenticated } = useAuth()
  const [comments, setComments] = useState<Comment[]>([])
  const [newQuestion, setNewQuestion] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set())
  const [posting, setPosting] = useState(false)

  // ── Demo Q&A Mode ──────────────────────────────────────────────────────────
  // For demo products, provide a local AI-powered Q&A experience without DB
  const [demoQuestions, setDemoQuestions] = useState<{ q: string; a: string; ts: string }[]>([])
  const [demoInput, setDemoInput] = useState('')
  const [demoTyping, setDemoTyping] = useState(false)

  const generateDemoAnswer = (question: string): string => {
    const q = question.toLowerCase()
    const name = productName || 'this product'
    const desc = productDescription || ''

    // Context-aware responses
    if (q.includes('organic') || q.includes('pesticide') || q.includes('spray'))
      return `Great question! Our demo sellers on CasaGrown typically grow organically in their home gardens. When you find a real seller, you can ask them directly about their growing practices right here in the Q&A section. 🌱`
    if (q.includes('deliver') || q.includes('delivery') || q.includes('ship'))
      return `Delivery options vary by seller. Most CasaGrown sellers offer both local delivery and pickup from their home. You'll see the specific delivery radius and pickup address on each real listing. 🚗`
    if (q.includes('fresh') || q.includes('harvest') || q.includes('pick'))
      return `CasaGrown sellers harvest from their own gardens, so produce is typically picked the same day or day before! Each listing shows the harvest date so you know exactly how fresh it is. 🌿`
    if (q.includes('price') || q.includes('cost') || q.includes('expensive') || q.includes('cheap'))
      return `Prices on CasaGrown are set by individual sellers. Since they're your neighbors growing in their backyards, prices are typically very competitive — often less than grocery stores for much fresher produce! 💰`
    if (q.includes('how') && (q.includes('sell') || q.includes('list')))
      return `Selling on CasaGrown is easy! Just tap "Take Photo to Sell", snap a picture of what you're growing, and we'll help you create a listing in seconds. Your neighbors will see it right away! 📸`
    if (q.includes('pay') || q.includes('payment') || q.includes('stripe'))
      return `CasaGrown uses Stripe for secure payments. Your payment is held safely until you confirm receipt of your order. Sellers get paid daily to their connected account. 🔒`
    if (q.includes('avail') || q.includes('stock') || q.includes('inventory'))
      return `${name} availability depends on what's growing in the seller's garden. This is a demo listing — when real sellers list their harvest, you'll see live inventory counts updated in real-time. 📊`

    // Fallback: helpful generic answer using product context
    return `That's a great question about ${name}! This is a demo listing showing what CasaGrown looks like.${desc ? ` This would be: ${desc}.` : ''} When real sellers are nearby, you'll be able to chat with them directly in this Q&A section. Start selling yourself to help fill your neighborhood's market! 🌻`
  }

  const handleDemoQuestion = () => {
    if (!demoInput.trim()) return
    const question = demoInput.trim()
    setDemoInput('')
    setDemoTyping(true)

    // Simulate typing delay
    setTimeout(() => {
      setDemoQuestions(prev => [...prev, {
        q: question,
        a: generateDemoAnswer(question),
        ts: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      }])
      setDemoTyping(false)
    }, 800 + Math.random() * 600)
  }

  if (isDemo) {
    return (
      <div className={styles.qaSection}>
        <h3 className={styles.qaTitle}>
          💬 Questions & Answers
          <span className={styles.qaCount} style={{ background: '#f0fdf4', color: '#15803d' }}>🌿 Demo</span>
        </h3>

        {/* Pre-seeded example Q&A */}
        <div className={styles.questionList}>
          <div className={styles.questionBlock}>
            <div className={styles.commentRow}>
              <div className={`${styles.avatar} ${styles.avatarMd}`}><span>JM</span></div>
              <div className={styles.commentContent}>
                <div className={styles.commentMeta}>
                  <span className={styles.authorName}>Jessica M.</span>
                  <span className={styles.timestamp}>2d ago</span>
                </div>
                <p className={styles.commentBody}>Is this grown organically?</p>
              </div>
            </div>
            <div className={styles.repliesSection}>
              <div className={`${styles.replyRow} ${styles.sellerReplyRow}`}>
                <div className={`${styles.avatar} ${styles.avatarSm} ${styles.avatarSeller}`}><span>🌱</span></div>
                <div className={styles.commentContent}>
                  <div className={styles.commentMeta}>
                    <span className={styles.authorName}>Demo Seller <span className={styles.sellerBadge}>Seller</span></span>
                    <span className={styles.timestamp}>2d ago</span>
                  </div>
                  <p className={styles.commentBody}>Yes! Everything I grow is 100% organic — no pesticides, just compost and love. Happy to answer any other questions! 🌿</p>
                </div>
              </div>
            </div>
          </div>

          {/* User-submitted demo questions */}
          {demoQuestions.map((dq, i) => (
            <div key={i} className={styles.questionBlock}>
              <div className={styles.commentRow}>
                <div className={`${styles.avatar} ${styles.avatarMd}`}><span>You</span></div>
                <div className={styles.commentContent}>
                  <div className={styles.commentMeta}>
                    <span className={styles.authorName}>You</span>
                    <span className={styles.timestamp}>{dq.ts}</span>
                  </div>
                  <p className={styles.commentBody}>{dq.q}</p>
                </div>
              </div>
              <div className={styles.repliesSection}>
                <div className={`${styles.replyRow} ${styles.sellerReplyRow}`}>
                  <div className={`${styles.avatar} ${styles.avatarSm} ${styles.avatarSeller}`}><span>🤖</span></div>
                  <div className={styles.commentContent}>
                    <div className={styles.commentMeta}>
                      <span className={styles.authorName}>CasaGrown AI <span className={styles.sellerBadge} style={{ background: '#dbeafe', color: '#1d4ed8' }}>AI</span></span>
                      <span className={styles.timestamp}>Just now</span>
                    </div>
                    <p className={styles.commentBody}>{dq.a}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Typing indicator */}
        {demoTyping && (
          <div style={{ padding: '8px 16px', fontSize: 13, color: 'var(--gray-500)', fontStyle: 'italic' }}>
            🤖 CasaGrown AI is typing...
          </div>
        )}

        {/* Ask input */}
        <div className={styles.askBox}>
          <div className={styles.askRow}>
            <div className={`${styles.avatar} ${styles.avatarSm}`}><span>?</span></div>
            <textarea
              className={styles.askInput}
              placeholder="Ask a question about this demo product..."
              value={demoInput}
              onChange={e => setDemoInput(e.target.value)}
              rows={1}
              maxLength={2000}
              onFocus={e => { (e.target as HTMLTextAreaElement).rows = 3 }}
              onBlur={e => { if (!demoInput) (e.target as HTMLTextAreaElement).rows = 1 }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleDemoQuestion() } }}
            />
          </div>
          {demoInput.trim() && (
            <div className={styles.askActions}>
              <button
                className={styles.postBtn}
                onClick={handleDemoQuestion}
                disabled={demoTyping}
              >
                Ask AI
              </button>
              <button className={styles.cancelBtn} onClick={() => setDemoInput('')}>
                Cancel
              </button>
            </div>
          )}
        </div>

        <p style={{ fontSize: 12, color: 'var(--gray-400)', textAlign: 'center', marginTop: 8 }}>
          🌿 This is a demo Q&A powered by CasaGrown AI. Real listings have seller-answered questions.
        </p>
      </div>
    )
  }

  const loadComments = useCallback(async () => {
    // Fetch comments with author profile info
    const { data } = await supabase
      .from('product_comments')
      .select('*, profiles:author_id(full_name, avatar_url)')
      .eq('product_id', productId)
      .order('created_at', { ascending: true })

    if (!data) return

    // Fetch all like counts in one query
    const commentIds = data.map((c: any) => c.id)
    const { data: likeCounts } = await supabase
      .from('comment_likes')
      .select('comment_id')
      .in('comment_id', commentIds)

    // Count likes per comment
    const likeMap = new Map<string, number>()
    if (likeCounts) {
      likeCounts.forEach((l: any) => {
        likeMap.set(l.comment_id, (likeMap.get(l.comment_id) || 0) + 1)
      })
    }

    // Check which comments current user has liked
    let myLikes = new Set<string>()
    if (user) {
      const { data: myLikeData } = await supabase
        .from('comment_likes')
        .select('comment_id')
        .eq('user_id', user.id)
        .in('comment_id', commentIds)
      if (myLikeData) myLikes = new Set(myLikeData.map((l: any) => l.comment_id))
    }

    setComments(data.map((c: any) => ({
      ...c,
      author_name: c.profiles?.full_name || 'Anonymous',
      author_avatar: c.profiles?.avatar_url || null,
      like_count: likeMap.get(c.id) || 0,
      liked_by_me: myLikes.has(c.id),
    })))

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

  const toggleLike = async (commentId: string, currentlyLiked: boolean) => {
    if (!user) return
    if (currentlyLiked) {
      await supabase.from('comment_likes').delete().match({ comment_id: commentId, user_id: user.id })
    } else {
      await supabase.from('comment_likes').insert({ comment_id: commentId, user_id: user.id })
    }
    // Optimistic update
    setComments(prev => prev.map(c =>
      c.id === commentId
        ? { ...c, liked_by_me: !currentlyLiked, like_count: c.like_count + (currentlyLiked ? -1 : 1) }
        : c
    ))
  }

  // Group: top-level questions with their replies
  const questions = comments.filter(c => !c.parent_id)
  const repliesMap = new Map<string, Comment[]>()
  comments.filter(c => c.parent_id).forEach(c => {
    const arr = repliesMap.get(c.parent_id!) || []
    arr.push(c)
    repliesMap.set(c.parent_id!, arr)
  })

  const formatDate = (date: string) => {
    const d = new Date(date)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays < 7) return `${diffDays}d ago`

    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
  }

  const canDelete = (c: Comment) =>
    user?.id === c.author_id || user?.id === sellerId

  const getInitials = (name: string) => {
    const parts = name.split(' ').filter(Boolean)
    return parts.length > 1
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase()
  }

  const renderAvatar = (c: Comment, size: 'sm' | 'md' = 'md') => {
    const isSeller = c.author_id === sellerId
    const sizeClass = size === 'sm' ? styles.avatarSm : styles.avatarMd
    return (
      <div className={`${styles.avatar} ${sizeClass} ${isSeller ? styles.avatarSeller : ''}`}>
        {c.author_avatar ? (
          <img src={c.author_avatar} alt={c.author_name} />
        ) : (
          <span>{getInitials(c.author_name)}</span>
        )}
      </div>
    )
  }

  const renderActions = (c: Comment, isReply = false) => (
    <div className={styles.actions}>
      {isAuthenticated ? (
        <button
          className={`${styles.likeBtn} ${c.liked_by_me ? styles.likeBtnActive : ''}`}
          onClick={() => toggleLike(c.id, c.liked_by_me)}
        >
          {c.liked_by_me ? '👍' : '👍'} <span>{c.like_count}</span>
        </button>
      ) : (
        <span className={styles.likeCount}>👍 {c.like_count}</span>
      )}
      {isAuthenticated && !isReply && (
        <button
          className={styles.actionLink}
          onClick={() => setReplyTo(replyTo === c.id ? null : c.id)}
        >
          Reply
        </button>
      )}
      {isAuthenticated && user?.id !== c.author_id && (
        <button
          className={`${styles.actionLink} ${styles.reportLink}`}
          onClick={() => flagComment(c.id)}
          disabled={flaggedIds.has(c.id)}
        >
          {flaggedIds.has(c.id) ? '✓ Reported' : 'Report'}
        </button>
      )}
      {canDelete(c) && (
        <button
          className={`${styles.actionLink} ${styles.deleteLink}`}
          onClick={() => deleteComment(c.id)}
        >
          Delete
        </button>
      )}
    </div>
  )

  return (
    <div className={styles.qaSection}>
      <h3 className={styles.qaTitle}>
        💬 Questions & Answers
        {questions.length > 0 && <span className={styles.qaCount}>{questions.length}</span>}
      </h3>

      {/* Ask a question */}
      {isAuthenticated ? (
        <div className={styles.askBox}>
          <div className={styles.askRow}>
            <div className={`${styles.avatar} ${styles.avatarSm}`}>
              <span>{user?.email ? user.email[0].toUpperCase() : '?'}</span>
            </div>
            <textarea
              className={styles.askInput}
              placeholder="Ask a question about this product..."
              value={newQuestion}
              onChange={e => setNewQuestion(e.target.value)}
              rows={1}
              maxLength={2000}
              onFocus={e => { (e.target as HTMLTextAreaElement).rows = 3 }}
              onBlur={e => { if (!newQuestion) (e.target as HTMLTextAreaElement).rows = 1 }}
            />
          </div>
          {newQuestion.trim() && (
            <div className={styles.askActions}>
              <button
                className={styles.postBtn}
                onClick={() => postComment(newQuestion, null)}
                disabled={posting}
              >
                Post Question
              </button>
              <button className={styles.cancelBtn} onClick={() => setNewQuestion('')}>
                Cancel
              </button>
            </div>
          )}
        </div>
      ) : (
        <p className={styles.loginPrompt}>Sign in to ask a question or reply</p>
      )}

      {/* Questions list */}
      {questions.length === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>💬</span>
          <p>No questions yet — be the first to ask!</p>
        </div>
      ) : (
        <div className={styles.questionList}>
          {questions.map(q => {
            const isSeller = q.author_id === sellerId
            const replies = repliesMap.get(q.id) || []
            return (
              <div key={q.id} className={styles.questionBlock}>
                {/* Question */}
                <div className={styles.commentRow}>
                  {renderAvatar(q)}
                  <div className={styles.commentContent}>
                    <div className={styles.commentMeta}>
                      <span className={styles.authorName}>
                        {q.author_name}
                        {isSeller && <span className={styles.sellerBadge}>Seller</span>}
                      </span>
                      <span className={styles.timestamp}>{formatDate(q.created_at)}</span>
                    </div>
                    <p className={styles.commentBody}>{q.body}</p>
                    {renderActions(q)}
                  </div>
                </div>

                {/* Replies */}
                {replies.length > 0 && (
                  <div className={styles.repliesSection}>
                    {replies.map(r => {
                      const isSellerReply = r.author_id === sellerId
                      return (
                        <div key={r.id} className={`${styles.replyRow} ${isSellerReply ? styles.sellerReplyRow : ''}`}>
                          {renderAvatar(r, 'sm')}
                          <div className={styles.commentContent}>
                            <div className={styles.commentMeta}>
                              <span className={styles.authorName}>
                                {r.author_name}
                                {isSellerReply && <span className={styles.sellerBadge}>Seller</span>}
                              </span>
                              <span className={styles.timestamp}>{formatDate(r.created_at)}</span>
                            </div>
                            <p className={styles.commentBody}>{r.body}</p>
                            {renderActions(r, true)}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Reply input */}
                {replyTo === q.id && (
                  <div className={styles.replyInputRow}>
                    <div className={`${styles.avatar} ${styles.avatarSm}`}>
                      <span>{user?.email ? user.email[0].toUpperCase() : '?'}</span>
                    </div>
                    <div className={styles.replyInputWrap}>
                      <textarea
                        className={styles.askInput}
                        placeholder="Write a reply..."
                        value={replyText}
                        onChange={e => setReplyText(e.target.value)}
                        rows={2}
                        maxLength={2000}
                        autoFocus
                      />
                      <div className={styles.askActions}>
                        <button
                          className={styles.postBtn}
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
