/**
 * Feed Service - Supabase data operations for the community feed
 *
 * Handles:
 * - Fetching posts from a community (with author, details, media, counts)
 * - Toggling post likes
 * - Flagging posts
 */

import { supabase } from "../auth/auth-hook";

// =============================================================================
// Types
// =============================================================================

/** Shape returned by the Supabase query with joins in getCommunityFeedPosts */
interface FeedQueryRow {
    id: string;
    author_id: string;
    type: string;
    reach: string;
    content: string;
    created_at: string;
    community_h3_index: string | null;
    author: {
        full_name: string | null;
        avatar_url: string | null;
        phone_verified: boolean;
    } | null;
    community: { name: string } | null;
    want_to_sell_details: Array<{
        category: string;
        produce_name: string;
        unit: string;
        total_quantity_available: number;
        points_per_unit: number;
    }>;
    want_to_buy_details: Array<{
        category: string;
        produce_names: string[];
        need_by_date: string | null;
        desired_quantity: number | null;
        desired_unit: string | null;
    }>;
    delivery_dates: Array<{
        delivery_date: string;
    }>;
    post_media: Array<{
        media_id: string;
        position: number;
        media_asset: { storage_path: string; media_type: string } | null;
    }>;
    post_likes: Array<{ user_id: string }>;
    post_comments: Array<{ id: string }>;
    post_flags: Array<{ user_id: string }>;
}

/** Shape returned by the Supabase query in getPostComments */
interface CommentQueryRow {
    id: string;
    user_id: string;
    content: string;
    created_at: string;
    author: { full_name: string | null; avatar_url: string | null } | null;
}

export interface FeedPost {
    id: string;
    author_id: string;
    author_name: string | null;
    author_avatar_url: string | null;
    author_phone_verified: boolean;
    type: string;
    reach: string;
    content: string;
    created_at: string;
    community_h3_index: string | null;
    community_name: string | null;
    sell_details: {
        category: string;
        produce_name: string;
        unit: string;
        total_quantity_available: number;
        points_per_unit: number;
        delivery_dates: string[];
    } | null;
    buy_details: {
        category: string;
        produce_names: string[];
        need_by_date: string | null;
        desired_quantity: number | null;
        desired_unit: string | null;
        delivery_dates: string[];
    } | null;
    media: Array<{
        storage_path: string;
        media_type: string;
    }>;
    like_count: number;
    comment_count: number;
    is_liked: boolean;
    is_flagged: boolean;
}

// =============================================================================
// Fetch community feed posts
// =============================================================================

/**
 * Get all active, non-expired posts for a community, newest first.
 * Uses the `get_filtered_feed` RPC which handles:
 * - Expiration filtering (via `expires_at` column, index-backed)
 * - Blocked category/product exclusion (by viewer's H3 zone)
 * - Ghosted user exclusion (shadow ban, viewer's own posts still visible)
 *
 * Then hydrates with sell/buy details, media, and interaction counts.
 */
export async function getCommunityFeedPosts(
    communityH3Index: string,
    currentUserId: string,
): Promise<FeedPost[]> {
    // 1. Get filtered post IDs + base data from RPC
    const { data: rpcData, error: rpcError } = await supabase
        .rpc('get_filtered_feed', {
            p_community_h3: communityH3Index,
            p_viewer_id: currentUserId,
        });

    if (rpcError) {
        console.error("Error fetching filtered feed:", rpcError);
        throw rpcError;
    }

    const baseRows = rpcData || [];
    if (baseRows.length === 0) return [];

    // 2. Fetch details for these post IDs
    const postIds = baseRows.map((r: { id: string }) => r.id);

    const { data: detailsData, error: detailsError } = await supabase
        .from("posts")
        .select(`
            id,
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
                need_by_date,
                desired_quantity,
                desired_unit
            ),
            delivery_dates (
                delivery_date
            ),
            post_media (
                media_id,
                position,
                media_asset:media_assets!post_media_media_id_fkey (
                    storage_path,
                    media_type
                )
            ),
            post_likes (
                user_id
            ),
            post_comments (
                id
            ),
            post_flags (
                user_id
            )
        `)
        .in("id", postIds);

    if (detailsError) {
        console.error("Error fetching feed details:", detailsError);
        throw detailsError;
    }

    // Build a lookup map for details
    const detailsMap = new Map<string, FeedQueryRow>();
    for (const row of (detailsData || []) as unknown as FeedQueryRow[]) {
        detailsMap.set(row.id, row);
    }

    // 3. Merge base data with details
    return baseRows.map((base: {
        id: string;
        author_id: string;
        author_full_name: string | null;
        author_avatar_url: string | null;
        author_phone_verified: boolean;
        type: string;
        reach: string;
        content: string;
        created_at: string;
        community_h3_index: string | null;
        community_name: string | null;
    }) => {
        const details = detailsMap.get(base.id);
        return {
            id: base.id,
            author_id: base.author_id,
            author_name: base.author_full_name || null,
            author_avatar_url: base.author_avatar_url || null,
            author_phone_verified: base.author_phone_verified ?? false,
            type: base.type,
            reach: base.reach,
            content: base.content,
            created_at: base.created_at,
            community_h3_index: base.community_h3_index,
            community_name: base.community_name || null,
            sell_details: details?.want_to_sell_details?.[0]
                ? {
                    ...details.want_to_sell_details[0],
                    delivery_dates: (details.delivery_dates || []).map((d) =>
                        d.delivery_date
                    ).sort(),
                }
                : null,
            buy_details: details?.want_to_buy_details?.[0]
                ? {
                    ...details.want_to_buy_details[0],
                    delivery_dates: (details.delivery_dates || []).map((d) =>
                        d.delivery_date
                    ).sort(),
                }
                : null,
            media: (details?.post_media || [])
                .sort((a, b) => (a.position || 0) - (b.position || 0))
                .map((pm) => ({
                    storage_path: pm.media_asset?.storage_path || "",
                    media_type: pm.media_asset?.media_type || "image",
                }))
                .filter((m) => m.storage_path),
            like_count: (details?.post_likes || []).length,
            comment_count: (details?.post_comments || []).length,
            is_liked: (details?.post_likes || []).some(
                (l) => l.user_id === currentUserId,
            ),
            is_flagged: (details?.post_flags || []).some(
                (f) => f.user_id === currentUserId,
            ),
        };
    });
}

// =============================================================================
// Freshness check — lightweight query for cache validation
// =============================================================================

/**
 * Fetch only the latest `created_at` timestamp from posts in a community.
 * Used to compare against the local cache and decide whether a full refetch
 * is necessary. This is a very cheap query (single row, single column, indexed).
 */
export async function getLatestPostTimestamp(
    communityH3Index: string,
): Promise<string | null> {
    const { data, error } = await supabase
        .from("posts")
        .select("created_at")
        .or(
            `community_h3_index.eq.${communityH3Index},community_h3_index.is.null`,
        )
        .eq("status", "available")
        .gte("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        console.warn("Error checking latest post timestamp:", error);
        // On error, return null so caller falls through to full refetch
        return null;
    }

    return data?.created_at || null;
}

// =============================================================================
// Toggle like
// =============================================================================

/**
 * Toggle a like on a post. Returns the new is_liked state.
 */
export async function togglePostLike(
    postId: string,
    userId: string,
    currentlyLiked: boolean,
): Promise<boolean> {
    if (currentlyLiked) {
        const { error } = await supabase
            .from("post_likes")
            .delete()
            .eq("post_id", postId)
            .eq("user_id", userId);

        if (error) {
            console.error("Error removing like:", error);
            throw error;
        }
        return false;
    } else {
        const { error } = await supabase
            .from("post_likes")
            .insert({ post_id: postId, user_id: userId });

        if (error) {
            console.error("Error adding like:", error);
            throw error;
        }
        return true;
    }
}

// =============================================================================
// Flag post
// =============================================================================

/**
 * Submit a report/flag for a post.
 */
export async function flagPost(
    postId: string,
    userId: string,
    reason: string,
): Promise<void> {
    const { error } = await supabase
        .from("post_flags")
        .insert({ post_id: postId, user_id: userId, reason });

    if (error) {
        console.error("Error flagging post:", error);
        throw error;
    }
}

// =============================================================================
// Comments
// =============================================================================

export interface PostComment {
    id: string;
    user_id: string;
    author_name: string | null;
    author_avatar_url: string | null;
    content: string;
    created_at: string;
}

/**
 * Fetch comments for a post, ordered oldest-first.
 */
export async function getPostComments(postId: string): Promise<PostComment[]> {
    const { data, error } = await supabase
        .from("post_comments")
        .select(`
            id,
            user_id,
            content,
            created_at,
            author:profiles!post_comments_user_id_fkey (
                full_name,
                avatar_url
            )
        `)
        .eq("post_id", postId)
        .order("created_at", { ascending: true });

    if (error) {
        console.error("Error fetching comments:", error);
        throw error;
    }

    return ((data || []) as unknown as CommentQueryRow[]).map((row) => ({
        id: row.id,
        user_id: row.user_id,
        author_name: row.author?.full_name || null,
        author_avatar_url: row.author?.avatar_url || null,
        content: row.content,
        created_at: row.created_at,
    }));
}

/**
 * Add a comment to a post. Returns the new comment with author info.
 */
export async function addComment(
    postId: string,
    userId: string,
    content: string,
    authorName: string | null,
): Promise<PostComment> {
    const { data, error } = await supabase
        .from("post_comments")
        .insert({ post_id: postId, user_id: userId, content })
        .select("id, created_at")
        .single();

    if (error) {
        console.error("Error adding comment:", error);
        throw error;
    }

    return {
        id: data.id,
        user_id: userId,
        author_name: authorName,
        author_avatar_url: null,
        content,
        created_at: data.created_at,
    };
}
