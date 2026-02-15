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

export interface FeedPost {
    id: string;
    author_id: string;
    author_name: string | null;
    author_avatar_url: string | null;
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
    like_count: number;
    comment_count: number;
    is_liked: boolean;
    is_flagged: boolean;
}

// =============================================================================
// Fetch community feed posts
// =============================================================================

/**
 * Get all active posts for a community, newest first.
 * Includes author info, sell/buy details, media, and like/comment counts.
 */
export async function getCommunityFeedPosts(
    communityH3Index: string,
    currentUserId: string,
): Promise<FeedPost[]> {
    const { data, error } = await supabase
        .from("posts")
        .select(`
            id,
            author_id,
            type,
            reach,
            content,
            created_at,
            community_h3_index,
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
        .or(`community_h3_index.eq.${communityH3Index},community_h3_index.is.null`)
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Error fetching feed posts:", error);
        throw error;
    }

    return (data || []).map((row: any) => ({
        id: row.id,
        author_id: row.author_id,
        author_name: row.author?.full_name || null,
        author_avatar_url: row.author?.avatar_url || null,
        type: row.type,
        reach: row.reach,
        content: row.content,
        created_at: row.created_at,
        community_h3_index: row.community_h3_index,
        community_name: row.community?.name || null,
        sell_details: row.want_to_sell_details?.[0] || null,
        buy_details: row.want_to_buy_details?.[0] || null,
        media: (row.post_media || [])
            .sort((a: any, b: any) => (a.position || 0) - (b.position || 0))
            .map((pm: any) => ({
                storage_path: pm.media_asset?.storage_path || "",
                media_type: pm.media_asset?.media_type || "image",
            }))
            .filter((m: any) => m.storage_path),
        like_count: (row.post_likes || []).length,
        comment_count: (row.post_comments || []).length,
        is_liked: (row.post_likes || []).some(
            (l: any) => l.user_id === currentUserId,
        ),
        is_flagged: (row.post_flags || []).some(
            (f: any) => f.user_id === currentUserId,
        ),
    }));
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

    return (data || []).map((row: any) => ({
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
