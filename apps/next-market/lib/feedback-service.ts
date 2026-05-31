/**
 * Feedback Service — lightweight Supabase client for Community Voice in market app.
 * Uses the same tables (user_feedback, feedback_votes, feedback_comments, feedback_flags)
 * as the community app's shared feedback service.
 */

import { createClient } from './supabase'

// Types
export type FeedbackType = 'feature_request' | 'bug_report' | 'support_request'
export type FeedbackStatus = 'open' | 'under_review' | 'planned' | 'in_progress' | 'completed' | 'rejected' | 'duplicate'

export interface FeedbackTicket {
  id: string
  title: string
  description: string
  type: FeedbackType
  status: FeedbackStatus
  visibility: 'public' | 'private'
  created_at: string
  author_id: string
  author_name: string
  vote_count: number
  comment_count: number
  is_voted: boolean
  flag_count: number
  is_flagged: boolean
}

export interface FeedbackComment {
  id: string
  content: string
  is_official_response: boolean
  created_at: string
  author_id: string
  author_name: string
}

export interface FeedbackDetail extends FeedbackTicket {
  comments: FeedbackComment[]
  attachments: { id: string; storage_path: string; media_type: string }[]
}

// Fetch tickets with search/filter/sort/pagination
export async function fetchTickets(params: {
  search?: string
  type?: string
  status?: string
  sort?: 'newest' | 'oldest' | 'most_votes'
  page?: number
  pageSize?: number
  currentUserId?: string
}) {
  const supabase = createClient()
  const { search = '', type = 'all', status = 'all', sort = 'newest', page = 1, pageSize = 20 } = params

  let query = supabase
    .from('user_feedback')
    .select(`
      id, title, description, type, status, visibility, created_at, author_id,
      author:profiles!author_id(full_name),
      feedback_votes(count),
      feedback_comments(count)
    `, { count: 'exact' })
    .eq('visibility', 'public')

  if (type !== 'all') query = query.eq('type', type)
  if (status !== 'all') query = query.eq('status', status)
  if (search.trim()) {
    query = query.or(`title.ilike.%${search.trim()}%,description.ilike.%${search.trim()}%`)
  }

  query = query.order('created_at', { ascending: sort === 'oldest' })

  const from = (page - 1) * pageSize
  query = query.range(from, from + pageSize - 1)

  const { data, error, count } = await query
  if (error) { console.error('fetchTickets:', error); return { tickets: [], totalCount: 0 } }

  let tickets: FeedbackTicket[] = (data || []).map((row: any) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    type: row.type,
    status: row.status,
    visibility: row.visibility,
    created_at: row.created_at,
    author_id: row.author_id,
    author_name: row.author?.full_name || 'Anonymous',
    vote_count: row.feedback_votes?.[0]?.count || 0,
    comment_count: row.feedback_comments?.[0]?.count || 0,
    is_voted: false,
    flag_count: 0,
    is_flagged: false,
  }))

  // Check user votes
  if (params.currentUserId && tickets.length > 0) {
    const ids = tickets.map(t => t.id)
    const { data: votes } = await supabase
      .from('feedback_votes')
      .select('feedback_id')
      .eq('user_id', params.currentUserId)
      .in('feedback_id', ids)
    if (votes) {
      const votedIds = new Set(votes.map((v: any) => v.feedback_id))
      tickets = tickets.map(t => ({ ...t, is_voted: votedIds.has(t.id) }))
    }
  }

  if (sort === 'most_votes') tickets.sort((a, b) => b.vote_count - a.vote_count)

  return { tickets, totalCount: count || 0 }
}

// Fetch single ticket with comments
export async function fetchTicketById(id: string, currentUserId?: string): Promise<FeedbackDetail | null> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('user_feedback')
    .select(`
      id, title, description, type, status, visibility, created_at, author_id,
      author:profiles!author_id(full_name),
      feedback_votes(count),
      feedback_comments(
        id, content, is_official_response, created_at, author_id,
        comment_author:profiles!author_id(full_name)
      )
    `)
    .eq('id', id)
    .single()

  if (error || !data) return null
  const row = data as any

  let isVoted = false
  if (currentUserId) {
    const { data: vote } = await supabase
      .from('feedback_votes')
      .select('feedback_id')
      .eq('feedback_id', id)
      .eq('user_id', currentUserId)
      .maybeSingle()
    isVoted = !!vote
  }

  // Fetch ticket media
  const { data: ticketMedia } = await supabase
    .from('feedback_media')
    .select('media:media_assets(id, storage_path, media_type)')
    .eq('feedback_id', id)
    .order('display_order')

  const attachments = (ticketMedia || []).map((m: any) => m.media).filter(Boolean)

  // Flag info
  let flagCount = 0, isFlagged = false
  const { data: flags } = await supabase.from('feedback_flags').select('user_id').eq('feedback_id', id)
  if (flags) {
    flagCount = flags.length
    if (currentUserId) isFlagged = flags.some((f: any) => f.user_id === currentUserId)
  }

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    type: row.type,
    status: row.status,
    visibility: row.visibility,
    created_at: row.created_at,
    author_id: row.author_id,
    author_name: row.author?.full_name || 'Anonymous',
    vote_count: row.feedback_votes?.[0]?.count || 0,
    comment_count: row.feedback_comments?.length || 0,
    is_voted: isVoted,
    flag_count: flagCount,
    is_flagged: isFlagged,
    attachments,
    comments: (row.feedback_comments || []).map((c: any) => ({
      id: c.id,
      content: c.content,
      is_official_response: c.is_official_response,
      created_at: c.created_at,
      author_id: c.author_id,
      author_name: c.comment_author?.full_name || 'Anonymous',
    })),
  }
}

// Create ticket
export async function createTicket(data: {
  title: string
  description: string
  type: FeedbackType
  authorId: string
  files?: File[]
}) {
  const supabase = createClient()
  const visibility = data.type === 'support_request' ? 'private' : 'public'

  const { data: row, error } = await supabase
    .from('user_feedback')
    .insert({
      title: data.title,
      description: data.description,
      type: data.type,
      author_id: data.authorId,
      visibility,
    })
    .select('id')
    .single()

  if (error) { console.error('createTicket error:', error); return null }

  // Upload attachments
  if (data.files && data.files.length > 0 && row) {
    for (let i = 0; i < data.files.length; i++) {
      const file = data.files[i]!
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${data.authorId}/${row.id}/${Date.now()}_${safeName}`

      const { error: uploadErr } = await supabase.storage.from('feedback-media').upload(path, file)
      if (uploadErr) continue

      const { data: urlData } = supabase.storage.from('feedback-media').getPublicUrl(path)
      const mediaType = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'document'

      const { data: asset, error: assetErr } = await supabase
        .from('media_assets')
        .insert({
          owner_id: data.authorId,
          storage_path: urlData.publicUrl,
          media_type: mediaType,
          mime_type: file.type,
          metadata: { original_name: file.name, size: file.size },
        })
        .select('id')
        .single()

      if (assetErr) continue

      await supabase.from('feedback_media').insert({
        feedback_id: row.id,
        media_id: asset.id,
        display_order: i,
      })
    }
  }

  return { id: row.id }
}

// Toggle vote
export async function toggleVote(feedbackId: string, userId: string, currentlyVoted: boolean) {
  const supabase = createClient()
  if (currentlyVoted) {
    await supabase.from('feedback_votes').delete().eq('feedback_id', feedbackId).eq('user_id', userId)
  } else {
    await supabase.from('feedback_votes').insert({ feedback_id: feedbackId, user_id: userId })
  }
  return true
}

// Add comment
export async function addComment(data: { feedbackId: string; authorId: string; content: string }) {
  const supabase = createClient()
  const { data: row, error } = await supabase
    .from('feedback_comments')
    .insert({
      feedback_id: data.feedbackId,
      author_id: data.authorId,
      content: data.content,
      is_official_response: false,
    })
    .select(`id, content, is_official_response, created_at, author_id, comment_author:profiles!author_id(full_name)`)
    .single()

  if (error) { console.error('addComment error:', error); return null }
  const r = row as any
  return {
    id: r.id,
    content: r.content,
    is_official_response: r.is_official_response,
    created_at: r.created_at,
    author_id: r.author_id,
    author_name: r.comment_author?.full_name || 'Anonymous',
  }
}

// Flag/unflag
export async function flagTicket(feedbackId: string, userId: string) {
  const supabase = createClient()
  await supabase.from('feedback_flags').insert({ feedback_id: feedbackId, user_id: userId })
  return true
}

export async function unflagTicket(feedbackId: string, userId: string) {
  const supabase = createClient()
  await supabase.from('feedback_flags').delete().eq('feedback_id', feedbackId).eq('user_id', userId)
  return true
}
