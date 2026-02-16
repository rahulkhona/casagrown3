/**
 * Chat Service - Supabase data operations for messaging
 *
 * Handles:
 * - Finding or creating conversations between post parties
 * - Fetching and sending messages
 * - Realtime subscriptions for messages and presence
 * - Media upload for chat attachments
 */

import { supabase } from "../auth/auth-hook";
import type { RealtimeChannel } from "@supabase/supabase-js";

// =============================================================================
// Types
// =============================================================================

export interface ChatMessage {
    id: string;
    conversation_id: string;
    sender_id: string | null;
    sender_name: string | null;
    sender_avatar_url: string | null;
    content: string | null;
    media_url: string | null;
    media_type: string | null;
    type: "text" | "media" | "mixed" | "system";
    metadata: Record<string, unknown>;
    created_at: string;
    delivered_at: string | null;
    read_at: string | null;
}

export interface ConversationParticipant {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
}

export interface ConversationPost {
    id: string;
    type: string;
    content: string;
    created_at: string;
    author_id: string;
    author_name: string | null;
    author_avatar_url: string | null;
    community_name: string | null;
    sell_details: {
        category: string;
        produce_name: string;
        unit: string;
        total_quantity_available: number;
        points_per_unit: number;
    } | null;
    buy_details: {
        category: string;
        produce_names: string[];
        need_by_date: string | null;
    } | null;
    media: Array<{
        storage_path: string;
        media_type: string;
    }>;
}

export interface ConversationWithDetails {
    id: string;
    post_id: string;
    buyer_id: string;
    seller_id: string;
    created_at: string;
    post: ConversationPost;
    buyer: ConversationParticipant;
    seller: ConversationParticipant;
}

export interface PresenceState {
    online: boolean;
    typing: boolean;
}

// -- Internal row types for Supabase join queries (not exported) --
interface ConversationQueryRow {
    id: string;
    post_id: string;
    buyer_id: string;
    seller_id: string;
    created_at: string;
    post: {
        id: string;
        type: string;
        content: string;
        created_at: string;
        author_id: string;
        author: { full_name: string | null; avatar_url: string | null } | null;
        community: { name: string | null } | null;
        want_to_sell_details:
            | Array<
                {
                    category: string;
                    produce_name: string;
                    unit: string;
                    total_quantity_available: number;
                    points_per_unit: number;
                }
            >
            | null;
        want_to_buy_details:
            | Array<
                {
                    category: string;
                    produce_names: string[];
                    need_by_date: string | null;
                }
            >
            | null;
        post_media:
            | Array<
                {
                    position: number;
                    media_asset:
                        | { storage_path: string; media_type: string }
                        | null;
                }
            >
            | null;
    };
    buyer: ConversationParticipant;
    seller: ConversationParticipant;
}

interface ConversationListRow {
    id: string;
    post_id: string;
    buyer_id: string;
    seller_id: string;
    created_at: string;
    post: { type: string; content: string } | null;
    buyer: ConversationParticipant | null;
    seller: ConversationParticipant | null;
}

interface ChatMessageRow {
    id: string;
    conversation_id: string;
    sender_id: string | null;
    content: string | null;
    media_id: string | null;
    type: ChatMessage["type"];
    metadata: Record<string, unknown> | null;
    created_at: string;
    delivered_at: string | null;
    read_at: string | null;
    sender: { full_name: string | null; avatar_url: string | null } | null;
    media: { storage_path: string; media_type: string } | null;
}

interface ChatMessageRealtimeRow {
    id: string;
    conversation_id: string;
    sender_id: string | null;
    content: string | null;
    media_id: string | null;
    type: ChatMessage["type"];
    metadata: Record<string, unknown> | null;
    created_at: string;
    delivered_at: string | null;
    read_at: string | null;
}

// =============================================================================
// Get or create conversation
// =============================================================================

/**
 * Find an existing conversation between a buyer and seller for a given post,
 * or create a new one. The unique constraint on (post_id, buyer_id, seller_id)
 * ensures we don't create duplicates.
 *
 * The "buyer" is the viewer/initiator and "seller" is the post author for
 * service posts. We reuse the terminology from the DB schema even though
 * for services it's more like "requester" and "provider".
 */
export async function getOrCreateConversation(
    postId: string,
    buyerId: string,
    sellerId: string,
): Promise<string> {
    // 1. Try to find existing conversation with given roles
    const { data: existing } = await supabase
        .from("conversations")
        .select("id")
        .eq("post_id", postId)
        .eq("buyer_id", buyerId)
        .eq("seller_id", sellerId)
        .maybeSingle();

    if (existing) return existing.id;

    // 2. Also check reversed roles — the other party may have created it first
    //    e.g. post author opening a chat initiated by someone else
    const { data: reversed } = await supabase
        .from("conversations")
        .select("id")
        .eq("post_id", postId)
        .eq("buyer_id", sellerId)
        .eq("seller_id", buyerId)
        .maybeSingle();

    if (reversed) return reversed.id;

    // 2. Create new conversation
    const { data, error } = await supabase
        .from("conversations")
        .insert({ post_id: postId, buyer_id: buyerId, seller_id: sellerId })
        .select("id")
        .single();

    if (error) {
        // If unique constraint violation, another request created it — fetch it
        if (error.code === "23505") {
            const { data: retry } = await supabase
                .from("conversations")
                .select("id")
                .eq("post_id", postId)
                .eq("buyer_id", buyerId)
                .eq("seller_id", sellerId)
                .single();
            if (retry) return retry.id;
        }
        console.error("Error creating conversation:", error);
        throw error;
    }

    return data.id;
}

// =============================================================================
// Fetch conversation with details
// =============================================================================

/**
 * Fetch a conversation with its post details and participant info.
 */
export async function getConversationWithDetails(
    conversationId: string,
): Promise<ConversationWithDetails> {
    const { data, error } = await supabase
        .from("conversations")
        .select(`
      id,
      post_id,
      buyer_id,
      seller_id,
      created_at,
      post:posts!conversations_post_id_fkey (
        id,
        type,
        content,
        created_at,
        author_id,
        author:profiles!posts_author_id_fkey (
          full_name,
          avatar_url
        ),
        community:communities!posts_community_h3_index_fkey (
          name
        ),
        want_to_sell_details (
          category,
          produce_name,
          unit,
          total_quantity_available,
          points_per_unit
        ),
        want_to_buy_details (
          category,
          produce_names,
          need_by_date
        ),
        post_media (
          media_id,
          position,
          media_asset:media_assets!post_media_media_id_fkey (
            storage_path,
            media_type
          )
        )
      ),
      buyer:profiles!conversations_buyer_id_fkey (
        id,
        full_name,
        avatar_url
      ),
      seller:profiles!conversations_seller_id_fkey (
        id,
        full_name,
        avatar_url
      )
    `)
        .eq("id", conversationId)
        .single();

    if (error) {
        console.error("Error fetching conversation:", error);
        throw error;
    }

    const row = data as unknown as ConversationQueryRow;

    return {
        id: row.id,
        post_id: row.post_id,
        buyer_id: row.buyer_id,
        seller_id: row.seller_id,
        created_at: row.created_at,
        post: {
            id: row.post.id,
            type: row.post.type,
            content: row.post.content,
            created_at: row.post.created_at,
            author_id: row.post.author_id,
            author_name: row.post.author?.full_name || null,
            author_avatar_url: row.post.author?.avatar_url || null,
            community_name: row.post.community?.name || null,
            sell_details: row.post.want_to_sell_details?.[0] || null,
            buy_details: row.post.want_to_buy_details?.[0] || null,
            media: (row.post.post_media || [])
                .sort((a, b) => (a.position || 0) - (b.position || 0))
                .map((pm) => ({
                    storage_path: pm.media_asset?.storage_path || "",
                    media_type: pm.media_asset?.media_type || "image",
                }))
                .filter((m) => m.storage_path),
        },
        buyer: {
            id: row.buyer.id,
            full_name: row.buyer.full_name,
            avatar_url: row.buyer.avatar_url,
        },
        seller: {
            id: row.seller.id,
            full_name: row.seller.full_name,
            avatar_url: row.seller.avatar_url,
        },
    };
}

// =============================================================================
// List user conversations (inbox)
// =============================================================================

export interface ConversationSummary {
    id: string;
    post_id: string;
    post_type: string;
    post_content: string;
    other_user_id: string;
    other_user_name: string | null;
    other_user_avatar: string | null;
    last_message_content: string | null;
    last_message_type: string;
    last_message_at: string;
    created_at: string;
    unread_count: number;
}

/**
 * Fetch all conversations for the current user, with the other participant's
 * info and the last message. Sorted most-recent first.
 */
export async function getUserConversations(
    userId: string,
): Promise<ConversationSummary[]> {
    // Fetch conversations where user is buyer or seller
    const { data, error } = await supabase
        .from("conversations")
        .select(`
      id,
      post_id,
      buyer_id,
      seller_id,
      created_at,
      post:posts!conversations_post_id_fkey (
        type,
        content
      ),
      buyer:profiles!conversations_buyer_id_fkey (
        id,
        full_name,
        avatar_url
      ),
      seller:profiles!conversations_seller_id_fkey (
        id,
        full_name,
        avatar_url
      )
    `)
        .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`);

    if (error) {
        console.error("Error fetching user conversations:", error);
        throw error;
    }

    if (!data || data.length === 0) return [];

    // Fetch last message for each conversation
    const rows = data as unknown as ConversationListRow[];
    const conversationIds = rows.map((c) => c.id);
    const { data: lastMessages } = await supabase
        .from("chat_messages")
        .select("conversation_id, content, type, created_at")
        .in("conversation_id", conversationIds)
        .order("created_at", { ascending: false });

    // Build a map: conversation_id -> latest message
    const latestMessageMap = new Map<
        string,
        { content: string | null; type: string; created_at: string }
    >();
    for (const msg of lastMessages || []) {
        if (!latestMessageMap.has(msg.conversation_id)) {
            latestMessageMap.set(msg.conversation_id, msg);
        }
    }

    // Fetch unread counts: messages not from me that haven't been read
    const { data: unreadMessages } = await supabase
        .from("chat_messages")
        .select("conversation_id, id")
        .in("conversation_id", conversationIds)
        .neq("sender_id", userId)
        .is("read_at", null);

    // Build a map: conversation_id -> unread count
    const unreadCountMap = new Map<string, number>();
    for (const msg of unreadMessages || []) {
        unreadCountMap.set(
            msg.conversation_id,
            (unreadCountMap.get(msg.conversation_id) || 0) + 1,
        );
    }

    const summaries: ConversationSummary[] = rows.map((row) => {
        const isBuyer = row.buyer_id === userId;
        const otherUser = isBuyer ? row.seller : row.buyer;
        const lastMsg = latestMessageMap.get(row.id);

        return {
            id: row.id,
            post_id: row.post_id,
            post_type: row.post?.type || "unknown",
            post_content: row.post?.content || "",
            other_user_id: otherUser?.id || "",
            other_user_name: otherUser?.full_name || null,
            other_user_avatar: otherUser?.avatar_url || null,
            last_message_content: lastMsg?.content || null,
            last_message_type: lastMsg?.type || "text",
            last_message_at: lastMsg?.created_at || row.created_at,
            created_at: row.created_at,
            unread_count: unreadCountMap.get(row.id) || 0,
        };
    });

    // Sort: unread conversations first, then by last message time (newest first)
    summaries.sort((a, b) => {
        // Unread first
        if (a.unread_count > 0 && b.unread_count === 0) return -1;
        if (a.unread_count === 0 && b.unread_count > 0) return 1;
        // Then by recency
        return (
            new Date(b.last_message_at).getTime() -
            new Date(a.last_message_at).getTime()
        );
    });

    // Deduplicate: keep only one conversation per (post, other_user) pair
    // If duplicates exist from reversed buyer/seller, keep the one with messages
    const seen = new Map<string, ConversationSummary>();
    for (const s of summaries) {
        const key = `${s.post_id}:${s.other_user_id}`;
        if (!seen.has(key)) {
            seen.set(key, s);
        } else {
            // Keep the one with a real message
            const existing = seen.get(key)!;
            if (!existing.last_message_content && s.last_message_content) {
                seen.set(key, s);
            }
        }
    }

    return Array.from(seen.values());
}

// =============================================================================
// Messages
// =============================================================================

/**
 * Fetch all messages for a conversation, ordered oldest-first.
 */
export async function getConversationMessages(
    conversationId: string,
): Promise<ChatMessage[]> {
    const { data, error } = await supabase
        .from("chat_messages")
        .select(`
      id,
      conversation_id,
      sender_id,
      content,
      media_id,
      type,
      metadata,
      created_at,
      delivered_at,
      read_at,
      sender:profiles!chat_messages_sender_id_fkey (
        full_name,
        avatar_url
      ),
      media:media_assets!chat_messages_media_id_fkey (
        storage_path,
        media_type
      )
    `)
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

    if (error) {
        console.error("Error fetching messages:", error);
        throw error;
    }

    const rows = (data || []) as unknown as ChatMessageRow[];
    return rows.map((row) => {
        let mediaUrl: string | null = null;
        if (row.media?.storage_path) {
            const { data: urlData } = supabase.storage
                .from("chat-media")
                .getPublicUrl(row.media.storage_path);
            mediaUrl = urlData?.publicUrl || null;
        }

        return {
            id: row.id,
            conversation_id: row.conversation_id,
            sender_id: row.sender_id,
            sender_name: row.sender?.full_name || null,
            sender_avatar_url: row.sender?.avatar_url || null,
            content: row.content,
            media_url: mediaUrl,
            media_type: row.media?.media_type || null,
            type: row.type,
            metadata: row.metadata || {},
            created_at: row.created_at,
            delivered_at: row.delivered_at || null,
            read_at: row.read_at || null,
        };
    });
}

/**
 * Send a message in a conversation.
 */
export async function sendMessage(
    conversationId: string,
    senderId: string,
    content: string | null,
    type: "text" | "media" | "mixed" | "system" = "text",
    mediaId?: string,
    metadata?: Record<string, unknown>,
): Promise<ChatMessage> {
    const { data, error } = await supabase
        .from("chat_messages")
        .insert({
            conversation_id: conversationId,
            sender_id: senderId,
            content,
            type,
            media_id: mediaId || null,
            metadata: metadata || {},
        })
        .select("id, created_at")
        .single();

    if (error) {
        console.error("Error sending message:", error);
        throw error;
    }

    return {
        id: data.id,
        conversation_id: conversationId,
        sender_id: senderId,
        sender_name: null, // Caller can fill this from local state
        sender_avatar_url: null,
        content,
        media_url: null,
        media_type: null,
        type,
        metadata: metadata || {},
        created_at: data.created_at,
        delivered_at: null,
        read_at: null,
    };
}

// =============================================================================
// Message delivery & read status
// =============================================================================

/**
 * Mark all messages from the OTHER user as delivered.
 * Called when the current user opens the chat.
 */
export async function markMessagesAsDelivered(
    conversationId: string,
    currentUserId: string,
): Promise<void> {
    const { error } = await supabase
        .from("chat_messages")
        .update({ delivered_at: new Date().toISOString() })
        .eq("conversation_id", conversationId)
        .neq("sender_id", currentUserId)
        .is("delivered_at", null);

    if (error) {
        console.error("Error marking messages as delivered:", error);
    }
}

/**
 * Mark all messages from the OTHER user as read.
 * Called when the chat is visible and the user views messages.
 */
export async function markMessagesAsRead(
    conversationId: string,
    currentUserId: string,
): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await supabase
        .from("chat_messages")
        .update({ delivered_at: now, read_at: now })
        .eq("conversation_id", conversationId)
        .neq("sender_id", currentUserId)
        .is("read_at", null);

    if (error) {
        console.error("Error marking messages as read:", error);
    }
}

/**
 * Subscribe to delivery/read status updates on messages.
 * The sender uses this to see checkmarks change in real time.
 */
export function subscribeToMessageUpdates(
    conversationId: string,
    onMessageUpdated: (
        messageId: string,
        deliveredAt: string | null,
        readAt: string | null,
    ) => void,
): RealtimeChannel {
    const channel = supabase
        .channel(`chat-status:${conversationId}`)
        .on(
            "postgres_changes",
            {
                event: "UPDATE",
                schema: "public",
                table: "chat_messages",
                filter: `conversation_id=eq.${conversationId}`,
            },
            (payload) => {
                const row = payload.new as ChatMessageRealtimeRow;
                onMessageUpdated(
                    row.id,
                    row.delivered_at || null,
                    row.read_at || null,
                );
            },
        )
        .subscribe();

    return channel;
}

// =============================================================================
// Realtime subscriptions
// =============================================================================

/**
 * Subscribe to new messages in a conversation via Supabase Realtime.
 * Returns the channel so the caller can unsubscribe on cleanup.
 */
export function subscribeToMessages(
    conversationId: string,
    onNewMessage: (message: ChatMessage) => void,
): RealtimeChannel {
    const channel = supabase
        .channel(`chat:${conversationId}`)
        .on(
            "postgres_changes",
            {
                event: "INSERT",
                schema: "public",
                table: "chat_messages",
                filter: `conversation_id=eq.${conversationId}`,
            },
            async (payload) => {
                const row = payload.new as ChatMessageRealtimeRow;
                // Fetch sender details for the new message
                let senderName: string | null = null;
                let senderAvatarUrl: string | null = null;
                if (row.sender_id) {
                    const { data: sender } = await supabase
                        .from("profiles")
                        .select("full_name, avatar_url")
                        .eq("id", row.sender_id)
                        .maybeSingle();
                    senderName = sender?.full_name || null;
                    senderAvatarUrl = sender?.avatar_url || null;
                }

                let mediaUrl: string | null = null;
                let mediaType: string | null = null;
                if (row.media_id) {
                    const { data: media } = await supabase
                        .from("media_assets")
                        .select("storage_path, media_type")
                        .eq("id", row.media_id)
                        .maybeSingle();
                    if (media?.storage_path) {
                        const { data: urlData } = supabase.storage
                            .from("chat-media")
                            .getPublicUrl(media.storage_path);
                        mediaUrl = urlData?.publicUrl || null;
                        mediaType = media.media_type || null;
                    }
                }

                onNewMessage({
                    id: row.id,
                    conversation_id: row.conversation_id,
                    sender_id: row.sender_id,
                    sender_name: senderName,
                    sender_avatar_url: senderAvatarUrl,
                    content: row.content,
                    media_url: mediaUrl,
                    media_type: mediaType,
                    type: row.type,
                    metadata: row.metadata || {},
                    created_at: row.created_at,
                    delivered_at: row.delivered_at || null,
                    read_at: row.read_at || null,
                });
            },
        )
        .subscribe();

    return channel;
}

/**
 * Create a presence channel for online/typing status.
 * Uses Presence for online/offline detection and Broadcast for typing events.
 * Broadcast is more reliable than Presence for ephemeral state like typing
 * across different platforms (web, iOS, Android).
 */
export function createPresenceChannel(
    conversationId: string,
    userId: string,
    onPresenceChange: (otherUserState: PresenceState) => void,
): {
    channel: RealtimeChannel;
    setTyping: (isTyping: boolean) => void;
    destroy: () => void;
} {
    const channelName = `presence:${conversationId}`;
    const channel = supabase.channel(channelName, {
        config: { presence: { key: userId } },
    });

    // Track the latest known state so we can merge presence + broadcast
    let otherOnline = false;
    let otherTyping = false;

    const emitState = () => {
        onPresenceChange({ online: otherOnline, typing: otherTyping });
    };

    channel
        // ── Presence: online/offline ──
        .on("presence", { event: "sync" }, () => {
            const state = channel.presenceState();
            let found = false;
            for (const key of Object.keys(state)) {
                if (key !== userId) {
                    const presences = state[key] as Record<string, unknown>[];
                    if (presences && presences.length > 0) {
                        otherOnline = true;
                        found = true;
                        break;
                    }
                }
            }
            if (!found) {
                otherOnline = false;
                otherTyping = false; // If they left, they're not typing
            }
            emitState();
        })
        .on("presence", { event: "join" }, ({ key }) => {
            if (key !== userId) {
                otherOnline = true;
                emitState();
            }
        })
        .on("presence", { event: "leave" }, ({ key }) => {
            if (key !== userId) {
                otherOnline = false;
                otherTyping = false;
                emitState();
            }
        })
        // ── Broadcast: typing events (reliable across all platforms) ──
        .on("broadcast", { event: "typing" }, (payload) => {
            const msg = payload.payload as Record<string, unknown>;
            if (msg?.user_id !== userId) {
                otherTyping = !!msg?.is_typing;
                emitState();
            }
        })
        .subscribe(async (status) => {
            if (status === "SUBSCRIBED") {
                await channel.track({ online: true });
            }
        });

    const setTyping = (isTyping: boolean) => {
        // Use broadcast for typing — more reliable than presence.track()
        channel.send({
            type: "broadcast",
            event: "typing",
            payload: { user_id: userId, is_typing: isTyping },
        });
    };

    const destroy = () => {
        channel.untrack();
        supabase.removeChannel(channel);
    };

    return { channel, setTyping, destroy };
}

// =============================================================================
// Unread chat count (for nav badge)
// =============================================================================

/**
 * Get the total number of conversations with unread messages for the current
 * user. Counts conversations where at least one message from the other user
 * has read_at = null.
 */
export async function getUnreadChatCount(userId: string): Promise<number> {
    // Get all conversation IDs for this user
    const { data: conversations } = await supabase
        .from("conversations")
        .select("id")
        .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`);

    if (!conversations || conversations.length === 0) return 0;

    const conversationIds = conversations.map((c: { id: string }) => c.id);

    // Count distinct conversations with unread messages from others
    const { data: unreadMessages } = await supabase
        .from("chat_messages")
        .select("conversation_id")
        .in("conversation_id", conversationIds)
        .neq("sender_id", userId)
        .is("read_at", null);

    if (!unreadMessages) return 0;

    // Count distinct conversations
    const unreadConversations = new Set(
        unreadMessages.map((m: any) => m.conversation_id),
    );
    return unreadConversations.size;
}
