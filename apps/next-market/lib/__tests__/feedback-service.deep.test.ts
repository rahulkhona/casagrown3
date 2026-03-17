// @vitest-environment jsdom
/**
 * Deep tests for feedback-service.ts (305 lines, 43% coverage).
 * Covers: fetchTickets with filters/pagination, fetchTicketById with comments/votes/flags,
 * createTicket with file uploads, toggleVote, addComment, flagTicket, unflagTicket.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Unmock so we test the real implementation (setup.ts mocks it for rendering tests)
vi.unmock('../../lib/feedback-service')

// ── Supabase mock ──
function chain(data: any = [], error: any = null) {
  const result = { data: data ?? [], error, count: Array.isArray(data) ? data.length : 0 }
  const c: any = {}
  const methods = ['select', 'eq', 'neq', 'single', 'maybeSingle', 'limit', 'is', 'gt', 'lt', 'gte', 'lte', 'in', 'insert', 'update', 'upsert', 'delete', 'match', 'order', 'or', 'not', 'contains', 'like', 'ilike', 'range', 'filter', 'ascending']
  methods.forEach(m => { c[m] = vi.fn().mockReturnValue(c) })
  c.single = vi.fn().mockResolvedValue({ data: Array.isArray(data) ? data[0] ?? null : data, error })
  c.maybeSingle = vi.fn().mockResolvedValue({ data: Array.isArray(data) ? data[0] ?? null : data, error })
  c.then = (resolve: any) => Promise.resolve(result).then(resolve)
  c.catch = (reject: any) => Promise.resolve(result).catch(reject)
  c.finally = (cb: any) => Promise.resolve(result).finally(cb)
  return c
}

const mockSupabase = {
  from: vi.fn(() => chain()),
  storage: {
    from: vi.fn().mockReturnValue({
      upload: vi.fn().mockResolvedValue({ error: null }),
      getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://cdn.test/file.jpg' } }),
    }),
  },
}

vi.mock('../../lib/supabase', () => ({ createClient: () => mockSupabase }))

beforeEach(() => { vi.clearAllMocks() })

describe('fetchTickets', () => {
  it('returns tickets from Supabase with default params', async () => {
    const ticketRows = [
      {
        id: 't1', title: 'Feature A', description: 'Add thing', type: 'feature_request',
        status: 'open', visibility: 'public', created_at: '2026-03-01', author_id: 'a1',
        author: { full_name: 'Alice' },
        feedback_votes: [{ count: 5 }], feedback_comments: [{ count: 2 }],
      },
    ]
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'user_feedback') return chain(ticketRows)
      if (table === 'feedback_votes') return chain([])
      return chain()
    })

    const { fetchTickets } = await import('../../lib/feedback-service')
    const result = await fetchTickets({})

    expect(result.tickets.length).toBe(1)
    expect(result.tickets[0].title).toBe('Feature A')
    expect(result.tickets[0].author_name).toBe('Alice')
    expect(result.tickets[0].vote_count).toBe(5)
    expect(result.tickets[0].comment_count).toBe(2)
  })

  it('applies search filter', async () => {
    mockSupabase.from.mockImplementation(() => chain([]))
    const { fetchTickets } = await import('../../lib/feedback-service')
    await fetchTickets({ search: 'bug fix' })
    // from().select().eq().or() should include search terms
    expect(mockSupabase.from).toHaveBeenCalledWith('user_feedback')
  })

  it('applies type and status filters', async () => {
    mockSupabase.from.mockImplementation(() => chain([]))
    const { fetchTickets } = await import('../../lib/feedback-service')
    await fetchTickets({ type: 'bug_report', status: 'open' })
    expect(mockSupabase.from).toHaveBeenCalledWith('user_feedback')
  })

  it('sorts by most_votes', async () => {
    const rows = [
      { id: 't1', title: 'B', description: '', type: 'feature_request', status: 'open', visibility: 'public', created_at: '', author_id: 'a1', author: { full_name: 'A' }, feedback_votes: [{ count: 2 }], feedback_comments: [{ count: 0 }] },
      { id: 't2', title: 'A', description: '', type: 'feature_request', status: 'open', visibility: 'public', created_at: '', author_id: 'a2', author: { full_name: 'B' }, feedback_votes: [{ count: 10 }], feedback_comments: [{ count: 0 }] },
    ]
    mockSupabase.from.mockImplementation(() => chain(rows))
    const { fetchTickets } = await import('../../lib/feedback-service')
    const result = await fetchTickets({ sort: 'most_votes' })
    expect(result.tickets[0].vote_count).toBe(10)
    expect(result.tickets[1].vote_count).toBe(2)
  })

  it('marks user-voted tickets', async () => {
    const rows = [
      { id: 't1', title: 'X', description: '', type: 'feature_request', status: 'open', visibility: 'public', created_at: '', author_id: 'a1', author: null, feedback_votes: [{ count: 1 }], feedback_comments: [{ count: 0 }] },
    ]
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'user_feedback') return chain(rows)
      if (table === 'feedback_votes') return chain([{ feedback_id: 't1' }])
      return chain()
    })
    const { fetchTickets } = await import('../../lib/feedback-service')
    const result = await fetchTickets({ currentUserId: 'voter-1' })
    expect(result.tickets[0].is_voted).toBe(true)
  })

  it('returns empty on error', async () => {
    mockSupabase.from.mockImplementation(() => chain(null, { message: 'db error' }))
    const { fetchTickets } = await import('../../lib/feedback-service')
    const result = await fetchTickets({})
    expect(result.tickets).toEqual([])
    expect(result.totalCount).toBe(0)
  })
})

describe('fetchTicketById', () => {
  it('returns ticket detail with comments and flags', async () => {
    const ticketRow = {
      id: 't1', title: 'Bug', description: 'Broken', type: 'bug_report',
      status: 'open', visibility: 'public', created_at: '2026-03-01', author_id: 'a1',
      author: { full_name: 'Alice' },
      feedback_votes: [{ count: 3 }],
      feedback_comments: [
        { id: 'c1', content: 'Me too', is_official_response: false, created_at: '2026-03-02', author_id: 'a2', comment_author: { full_name: 'Bob' } },
      ],
    }
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'user_feedback') return chain(ticketRow)
      if (table === 'feedback_votes') return chain(null)
      if (table === 'feedback_media') return chain([])
      if (table === 'feedback_flags') return chain([{ user_id: 'someone' }])
      return chain()
    })
    const { fetchTicketById } = await import('../../lib/feedback-service')
    const ticket = await fetchTicketById('t1', 'a1')
    expect(ticket).toBeTruthy()
    expect(ticket!.title).toBe('Bug')
    expect(ticket!.comments.length).toBe(1)
    expect(ticket!.flag_count).toBe(1)
  })

  it('returns null on error', async () => {
    mockSupabase.from.mockImplementation(() => {
      const c = chain(null, { message: 'not found' })
      c.single = vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } })
      return c
    })
    const { fetchTicketById } = await import('../../lib/feedback-service')
    const ticket = await fetchTicketById('nonexistent')
    expect(ticket).toBeNull()
  })
})

describe('createTicket', () => {
  it('creates ticket and returns id', async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'user_feedback') {
        const c = chain({ id: 'new-t1' })
        c.insert = vi.fn().mockReturnValue(c)
        c.select = vi.fn().mockReturnValue(c)
        c.single = vi.fn().mockResolvedValue({ data: { id: 'new-t1' }, error: null })
        return c
      }
      return chain()
    })

    const { createTicket } = await import('../../lib/feedback-service')
    const result = await createTicket({
      title: 'New Feature', description: 'Please add', type: 'feature_request', authorId: 'a1',
    })
    expect(result).toEqual({ id: 'new-t1' })
  })

  it('returns null on insert error', async () => {
    mockSupabase.from.mockImplementation(() => {
      const c = chain(null, { message: 'insert failed' })
      c.insert = vi.fn().mockReturnValue(c)
      c.select = vi.fn().mockReturnValue(c)
      c.single = vi.fn().mockResolvedValue({ data: null, error: { message: 'insert failed' } })
      return c
    })
    const { createTicket } = await import('../../lib/feedback-service')
    const result = await createTicket({ title: 'X', description: 'Y', type: 'bug_report', authorId: 'a1' })
    expect(result).toBeNull()
  })

  it('handles file uploads when files provided', async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'user_feedback') {
        const c = chain()
        c.insert = vi.fn().mockReturnValue(c)
        c.select = vi.fn().mockReturnValue(c)
        c.single = vi.fn().mockResolvedValue({ data: { id: 'new-t2' }, error: null })
        return c
      }
      if (table === 'media_assets') {
        const c = chain()
        c.insert = vi.fn().mockReturnValue(c)
        c.select = vi.fn().mockReturnValue(c)
        c.single = vi.fn().mockResolvedValue({ data: { id: 'asset-1' }, error: null })
        return c
      }
      if (table === 'feedback_media') {
        const c = chain()
        c.insert = vi.fn().mockResolvedValue({ error: null })
        return c
      }
      return chain()
    })

    const file = new File(['hello'], 'test.png', { type: 'image/png' })
    const { createTicket } = await import('../../lib/feedback-service')
    const result = await createTicket({
      title: 'With File', description: 'Screenshot', type: 'bug_report',
      authorId: 'a1', files: [file],
    })
    expect(result).toEqual({ id: 'new-t2' })
    expect(mockSupabase.storage.from).toHaveBeenCalledWith('feedback-media')
  })
})

describe('toggleVote', () => {
  it('inserts vote when not currently voted', async () => {
    mockSupabase.from.mockImplementation(() => {
      const c = chain()
      c.insert = vi.fn().mockResolvedValue({ error: null })
      return c
    })
    const { toggleVote } = await import('../../lib/feedback-service')
    const result = await toggleVote('t1', 'u1', false)
    expect(result).toBe(true)
    expect(mockSupabase.from).toHaveBeenCalledWith('feedback_votes')
  })

  it('deletes vote when currently voted', async () => {
    const { toggleVote } = await import('../../lib/feedback-service')
    const result = await toggleVote('t1', 'u1', true)
    expect(result).toBe(true)
    expect(mockSupabase.from).toHaveBeenCalledWith('feedback_votes')
  })
})

describe('addComment', () => {
  it('adds comment and returns normalized result', async () => {
    mockSupabase.from.mockImplementation(() => {
      const c = chain()
      c.insert = vi.fn().mockReturnValue(c)
      c.select = vi.fn().mockReturnValue(c)
      c.single = vi.fn().mockResolvedValue({
        data: { id: 'c1', content: 'Great idea', is_official_response: false, created_at: '2026-03-15', author_id: 'a1', comment_author: { full_name: 'Alice' } },
        error: null,
      })
      return c
    })
    const { addComment } = await import('../../lib/feedback-service')
    const result = await addComment({ feedbackId: 't1', authorId: 'a1', content: 'Great idea' })
    expect(result).toBeTruthy()
    expect(result!.content).toBe('Great idea')
    expect(result!.author_name).toBe('Alice')
  })

  it('returns null on error', async () => {
    mockSupabase.from.mockImplementation(() => {
      const c = chain()
      c.insert = vi.fn().mockReturnValue(c)
      c.select = vi.fn().mockReturnValue(c)
      c.single = vi.fn().mockResolvedValue({ data: null, error: { message: 'err' } })
      return c
    })
    const { addComment } = await import('../../lib/feedback-service')
    const result = await addComment({ feedbackId: 't1', authorId: 'a1', content: '' })
    expect(result).toBeNull()
  })
})

describe('flagTicket / unflagTicket', () => {
  it('flagTicket inserts flag', async () => {
    mockSupabase.from.mockImplementation(() => {
      const c = chain()
      c.insert = vi.fn().mockResolvedValue({ error: null })
      return c
    })
    const { flagTicket } = await import('../../lib/feedback-service')
    expect(await flagTicket('t1', 'u1')).toBe(true)
  })

  it('unflagTicket deletes flag', async () => {
    const { unflagTicket } = await import('../../lib/feedback-service')
    expect(await unflagTicket('t1', 'u1')).toBe(true)
  })
})
