'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '../../../../lib/supabase'
import { fetchTickets, toggleVote, type FeedbackTicket } from '../../../../lib/feedback-service'
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
  return `${Math.floor(d / 7)}w ago`
}

export default function VoiceBoardPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [tickets, setTickets] = useState<FeedbackTicket[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'most_votes'>('newest')
  const [page, setPage] = useState(1)
  const [showFilters, setShowFilters] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const PAGE_SIZE = 20

  // Auth
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user
      if (user) setUserId(user.id)
    })
  }, [])

  // Debounce
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => { setDebouncedSearch(search); setPage(1) }, 300)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [search])

  // Load
  const load = useCallback(async () => {
    setLoading(true)
    const result = await fetchTickets({
      search: debouncedSearch, type: typeFilter, status: statusFilter,
      sort: sortBy, page, pageSize: PAGE_SIZE, currentUserId: userId || undefined,
    })
    setTickets(result.tickets)
    setTotalCount(result.totalCount)
    setLoading(false)
  }, [debouncedSearch, typeFilter, statusFilter, sortBy, page, userId])

  useEffect(() => { load() }, [load])

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  const handleVote = async (e: React.MouseEvent, ticket: FeedbackTicket) => {
    e.preventDefault(); e.stopPropagation()
    if (!userId) { router.push('/login?redirect=/voice/board'); return }
    await toggleVote(ticket.id, userId, ticket.is_voted)
    setTickets(prev => prev.map(t =>
      t.id === ticket.id
        ? { ...t, is_voted: !t.is_voted, vote_count: t.is_voted ? t.vote_count - 1 : t.vote_count + 1 }
        : t
    ))
  }

  return (
    <div className={styles.voicePage}>
      {/* Header */}
      <div className={styles.voiceHeader}>
        <h1>Community Feedback</h1>
        <p>Search existing issues, upvote, and comment — or submit a new one.</p>
        <div className={styles.voiceActions}>
          <Link href="/voice/submit?type=bug" className={`${styles.voiceBtn} ${styles.voiceBtnBug}`}>
            🐛 Report Issue
          </Link>
          <Link href="/voice/submit?type=feature" className={`${styles.voiceBtn} ${styles.voiceBtnFeature}`}>
            💡 Suggest Feature
          </Link>
          <Link href="/voice/submit?type=support" className={`${styles.voiceBtn} ${styles.voiceBtnSupport}`}>
            🎧 Support
          </Link>
        </div>
      </div>

      {/* Search + Filter Toggle */}
      <div className={styles.searchRow}>
        <input
          className={styles.searchInput}
          placeholder="Search issues and feature requests..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button
          className={`${styles.filterBtn} ${showFilters ? styles.active : ''}`}
          onClick={() => setShowFilters(!showFilters)}
        >
          ⚙️
        </button>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className={styles.filterPanel}>
          <div>
            <div className={styles.filterLabel}>Type</div>
            <div className={styles.filterChips}>
              {[{ v: 'all', l: 'All' }, { v: 'bug_report', l: 'Bugs' }, { v: 'feature_request', l: 'Features' }].map(o => (
                <button key={o.v} className={`${styles.filterChip} ${typeFilter === o.v ? styles.active : ''}`}
                  onClick={() => { setTypeFilter(o.v); setPage(1) }}>{o.l}</button>
              ))}
            </div>
          </div>
          <div>
            <div className={styles.filterLabel}>Status</div>
            <div className={styles.filterChips}>
              {['all', 'open', 'under_review', 'planned', 'in_progress', 'completed', 'rejected'].map(s => (
                <button key={s} className={`${styles.filterChip} ${statusFilter === s ? styles.active : ''}`}
                  onClick={() => { setStatusFilter(s); setPage(1) }}>{s === 'all' ? 'All' : STATUS_LABELS[s]}</button>
              ))}
            </div>
          </div>
          <div>
            <div className={styles.filterLabel}>Sort</div>
            <div className={styles.filterChips}>
              {[{ v: 'newest', l: 'Newest' }, { v: 'oldest', l: 'Oldest' }, { v: 'most_votes', l: 'Most Votes' }].map(o => (
                <button key={o.v} className={`${styles.filterChip} ${sortBy === o.v ? styles.active : ''}`}
                  onClick={() => { setSortBy(o.v as any); setPage(1) }}>{o.l}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      <div className={styles.resultCount}>{loading ? 'Searching...' : `${totalCount} results`}</div>

      {loading ? (
        <div className={styles.spinner}>⏳ Loading...</div>
      ) : tickets.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>📋</div>
          <p>No tickets found. Try adjusting your search or filters.</p>
        </div>
      ) : (
        <>
          {tickets.map(ticket => (
            <Link href={`/voice/ticket?id=${ticket.id}`} key={ticket.id} className={styles.ticketCard}>
              {/* Vote */}
              <div className={styles.voteCol}>
                <button
                  className={`${styles.voteBtn} ${ticket.is_voted ? styles.voted : ''}`}
                  onClick={e => handleVote(e, ticket)}
                >
                  <span className={styles.voteArrow}>▲</span>
                  <span className={styles.voteCount}>{ticket.vote_count}</span>
                </button>
              </div>
              {/* Content */}
              <div className={styles.ticketContent}>
                <div className={styles.ticketMeta}>
                  <span className={`${styles.ticketType} ${
                    ticket.type === 'bug_report' ? styles.ticketTypeBug
                    : ticket.type === 'feature_request' ? styles.ticketTypeFeature
                    : styles.ticketTypeSupport
                  }`}>{TYPE_LABELS[ticket.type]}</span>
                  <span className={styles.ticketStatus} style={{ color: STATUS_COLORS[ticket.status] }}>
                    {STATUS_LABELS[ticket.status]}
                  </span>
                </div>
                <h3 className={styles.ticketTitle}>{ticket.title}</h3>
                <p className={styles.ticketDesc}>{ticket.description}</p>
                <div className={styles.ticketFooter}>
                  <span>💬 {ticket.comment_count}</span>
                  <span>{timeAgo(ticket.created_at)}</span>
                  <span>by {ticket.author_name}</span>
                </div>
              </div>
            </Link>
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className={styles.pagination}>
              <button className={styles.pageBtn} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
              <span className={styles.pageInfo}>Page {page} of {totalPages}</span>
              <button className={styles.pageBtn} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
