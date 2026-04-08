// Framework-agnostic Supabase instance passed in directly

// =============================================================================
// Types
// =============================================================================

export interface CommunityChatMessageMedia {
  url?: string
  storage_path: string
  media_type: string
}

export interface CommunityChatMessage {
  id: string
  community_h3_index: string
  author_id: string
  author_name: string | null
  author_avatar_url: string | null
  parent_id: string | null
  content: string
  media: CommunityChatMessageMedia[]
  product_listing_id: string | null
  is_system: boolean
  is_pinned: boolean
  edited_at: string | null
  created_at: string
  bumped_at: string | null
  reaction_counts: Record<string, number>
  reply_count: number
  user_reactions: string[]
  flag_count: number
}

// =============================================================================
// Fetch Data
// =============================================================================

/**
 * Fetch paginated top-level messages for a community
 */
export async function fetchCommunityMessages(
  supabase: any,
  h3Index: string,
  cursor: string | null = null,
  limit: number = 50
): Promise<CommunityChatMessage[]> {
  const { data, error } = await supabase
    .rpc('get_community_chat_messages', {
      p_h3_index: h3Index,
      p_cursor: cursor,
      p_limit: limit,
    })

  if (error) {
    console.error('Error fetching community messages:', error)
    throw error
  }

  // Hydrate media URLs
  return hydrateMediaUrls(supabase, data || [])
}

/**
 * Fetch thread replies for a specific message
 */
export async function fetchCommunityReplies(
  supabase: any,
  parentId: string,
  limit: number = 50
): Promise<CommunityChatMessage[]> {
  const { data, error } = await supabase
    .rpc('get_community_chat_replies', {
      p_parent_id: parentId,
      p_limit: limit,
    })

  if (error) {
    console.error('Error fetching community replies:', error)
    throw error
  }

  // Hydrate media URLs and add missing fields from RPC for type safety
  const rows = (data || []).map((row: any) => ({
    ...row,
    parent_id: parentId,
    community_h3_index: '', // Not returned by replies RPC since it's implied
    product_listing_id: null,
    is_pinned: false,
    reply_count: 0,
    bumped_at: null,
    flag_count: 0
  }))

  return hydrateMediaUrls(supabase, rows)
}

/**
 * Fetch unread message count for badge
 */
export async function getCommunityUnreadCount(
  supabase: any,
  h3Index: string,
  lastSeenAt: string
): Promise<number> {
  const { data, error } = await supabase
    .rpc('get_community_chat_unread_count', {
      p_h3_index: h3Index,
      p_last_seen_at: lastSeenAt,
    })

  if (error) {
    console.error('Error getting unread count:', error)
    return 0
  }

  return Number(data || 0)
}

/**
 * Search messages within a community
 */
export async function searchCommunityMessages(
  supabase: any,
  h3Index: string,
  query: string,
  limit: number = 20
) {
  const { data, error } = await supabase
    .rpc('search_community_chat', {
      p_h3_index: h3Index,
      p_query: query,
      p_limit: limit,
    })

  if (error) {
    console.error('Error searching messages:', error)
    throw error
  }

  return data || []
}

// =============================================================================
// Mutations
// =============================================================================

/**
 * Send a new message or reply
 */
export async function sendCommunityMessage(
  supabase: any,
  params: {
    h3Index: string
    content: string
    authorId: string
    parentId?: string
    media?: CommunityChatMessageMedia[]
    mentions?: { id: string, name: string }[]
  }
): Promise<string> {
  const { data, error } = await supabase
    .from('community_chat_messages')
    .insert({
      community_h3_index: params.h3Index,
      content: params.content,
      author_id: params.authorId,
      parent_id: params.parentId || null,
      media: params.media || [],
    })
    .select('id')
    .single()

  if (error) {
    console.error('Error sending message:', error)
    throw error
  }

  // If this is a reply, bump the parent thread so it surfaces to the top of the feed
  if (params.parentId) {
    await supabase
      .from('community_chat_messages')
      .update({ bumped_at: new Date().toISOString() })
      .eq('id', params.parentId)
  }

  // Handle @mentions by inserting notifications + push delivery
  if (params.mentions && params.mentions.length > 0) {
    // We need the author's name for the notification
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', params.authorId)
      .single()
      
    const authorName = profile?.full_name || 'A neighbor'
    const preview = params.content.substring(0, 50) + (params.content.length > 50 ? '...' : '')
    
    // Use notify_market_event RPC for each mentioned user
    // This handles both in-app notification AND push delivery via send_push_via_edge()
    for (const mentionedUser of params.mentions) {
      await supabase.rpc('notify_market_event', {
        p_user_id: mentionedUser.id,
        p_content: `${authorName} mentioned you in the community chat: "${preview}"`,
        p_link_url: '/community',
      })
    }
  }

  return data.id
}

/**
 * Edit an existing message
 */
export async function editCommunityMessage(
  supabase: any,
  messageId: string,
  content: string
): Promise<void> {
  const { error } = await supabase
    .from('community_chat_messages')
    .update({
      content,
      edited_at: new Date().toISOString(),
    })
    .eq('id', messageId)

  if (error) {
    console.error('Error editing message:', error)
    throw error
  }
}

/**
 * Delete a message
 */
export async function deleteCommunityMessage(supabase: any, messageId: string): Promise<void> {
  const { error } = await supabase
    .from('community_chat_messages')
    .delete()
    .eq('id', messageId)

  if (error) {
    console.error('Error deleting message:', error)
    throw error
  }
}

// =============================================================================
// Reactions & Flags
// =============================================================================

/**
 * Toggle an emoji reaction on a message
 */
export async function toggleMessageReaction(
  supabase: any,
  messageId: string,
  userId: string,
  emoji: string,
  isAdding: boolean
): Promise<void> {
  if (isAdding) {
    const { error } = await supabase
      .from('community_chat_reactions')
      .insert({ message_id: messageId, user_id: userId, emoji })
    
    // Ignore duplicate key errors (user already reacted with this emoji)
    if (error && error.code !== '23505') {
      console.error('Error adding reaction:', error)
      throw error
    }
  } else {
    const { error } = await supabase
      .from('community_chat_reactions')
      .delete()
      .match({ message_id: messageId, user_id: userId, emoji })
      
    if (error) {
      console.error('Error removing reaction:', error)
      throw error
    }
  }
}

/**
 * Flag a message as inappropriate
 */
export async function flagMessage(
  supabase: any,
  messageId: string,
  userId: string,
  reason: string = 'inappropriate'
): Promise<void> {
  const { error } = await supabase
    .from('community_chat_flags')
    .insert({ message_id: messageId, user_id: userId, reason })

  // Ignore duplicate key errors (user already flagged this)
  if (error && error.code !== '23505') {
    console.error('Error flagging message:', error)
    throw error
  }
}

// =============================================================================
// Staff/Admin Actions
// =============================================================================

/**
 * Staff: Toggle pinned status of a message
 */
export async function toggleMessagePin(
  supabase: any,
  messageId: string,
  isPinned: boolean
): Promise<void> {
  const { error } = await supabase
    .from('community_chat_messages')
    .update({ is_pinned: isPinned })
    .eq('id', messageId)

  if (error) {
    console.error('Error pinning message:', error)
    throw error
  }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Upload an image to the chat media bucket
 */
export async function uploadChatImage(
  supabase: any,
  userId: string,
  file: File | Blob,
  fileName: string
): Promise<CommunityChatMessageMedia> {
  // Sanitize filename to prevent Supabase "Invalid key" errors (spaces, unicode)
  const cleanName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_')
  
  // Store in user-namespaced folder
  const storagePath = `${userId}/${Date.now()}-${cleanName}`
  
  const { data, error } = await supabase.storage
    .from('community-chat-media')
    .upload(storagePath, file, { cacheControl: '31536000' })

  if (error) {
    console.error('Error uploading chat image:', error)
    throw error
  }

  return {
    storage_path: data.path,
    media_type: file.type.startsWith('image/') ? 'image' : 'document'
  }
}

/**
 * Resolves storage paths to public URLs for media
 */
function hydrateMediaUrls(supabase: any, messages: any[]): CommunityChatMessage[] {
  return messages.map(msg => {
    let media = msg.media || []
    if (typeof media === 'string') {
      try { media = JSON.parse(media) } catch (e) { media = [] }
    }
    
    // Add public URL for each media item
    const hydratedMedia = Array.isArray(media) ? media.map(m => {
      if (m.storage_path && !m.url) {
        const { data } = supabase.storage
          .from('community-chat-media')
          .getPublicUrl(m.storage_path)
        return { ...m, url: data.publicUrl }
      }
      return m
    }) : []

    return {
      ...msg,
      media: hydratedMedia
    }
  })
}
