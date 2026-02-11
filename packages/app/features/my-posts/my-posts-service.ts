/**
 * My Posts Service - Supabase data operations for viewing/managing user's posts
 *
 * Handles:
 * - Fetching all posts by a user (with details, media, community info)
 * - Soft-deleting a post
 * - Re-activating (reposting) a post by refreshing its created_at timestamp
 * - Cloning post data for pre-filling the create-post form
 */

import { supabase } from "../auth/auth-hook";

// =============================================================================
// Types
// =============================================================================

export interface UserPost {
    id: string;
    author_id: string;
    on_behalf_of: string | null;
    on_behalf_of_profile?: {
        full_name: string | null;
        avatar_url: string | null;
    } | null;
    type: string;
    reach: string;
    content: string;
    created_at: string;
    updated_at: string;
    community_h3_index: string | null;
    community_name: string | null;
    sell_details: {
        category: string;
        produce_name: string;
        unit: string;
        total_quantity_available: number;
        price_per_unit: number;
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
    delivery_dates: string[];
}

export interface CloneData {
    type: string;
    content: string;
    community_h3_index: string | null;
    sell_details: UserPost["sell_details"];
    buy_details: UserPost["buy_details"];
    delivery_dates: string[];
}

export interface PostTypePolicy {
    post_type: string;
    expiration_days: number;
}

// =============================================================================
// Fetch post type policies (expiration days per type)
// =============================================================================

let cachedPolicies: Record<string, number> | null = null;

export async function getPostTypePolicies(): Promise<Record<string, number>> {
    if (cachedPolicies) return cachedPolicies;

    const { data, error } = await supabase
        .from("post_type_policies")
        .select("post_type, expiration_days");

    if (error) {
        console.error("Error fetching post type policies:", error);
        // Fallback defaults
        return {
            want_to_sell: 14,
            want_to_buy: 7,
            offering_service: 30,
            need_service: 7,
            seeking_advice: 30,
            general_info: 30,
        };
    }

    const policies: Record<string, number> = {};
    for (const row of data || []) {
        policies[row.post_type] = row.expiration_days;
    }
    cachedPolicies = policies;
    return policies;
}

// =============================================================================
// Fetch user's posts
// =============================================================================

/**
 * Get all posts authored by the given user, with sell/buy details,
 * media assets, and community name.
 * Ordered by most recent first.
 */
export async function getUserPosts(userId: string): Promise<UserPost[]> {
    const { data, error } = await supabase
        .from("posts")
        .select(`
      id,
      author_id,
      type,
      reach,
      content,
      created_at,
      updated_at,
      community_h3_index,
      community:communities!posts_community_h3_index_fkey (
        name
      ),
      want_to_sell_details (
        category,
        produce_name,
        unit,
        total_quantity_available,
        price_per_unit
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
      delivery_dates (
        delivery_date
      )
    `)
        .eq("author_id", userId)
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Error fetching user posts:", error);
        throw error;
    }

    return (data || []).map((row: any) => ({
        id: row.id,
        author_id: row.author_id,
        type: row.type,
        reach: row.reach,
        content: row.content,
        created_at: row.created_at,
        updated_at: row.updated_at,
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
        delivery_dates: (row.delivery_dates || []).map((d: any) =>
            d.delivery_date
        ).filter(Boolean),
    }));
}

// =============================================================================
// Delete post (hard delete — removes from database)
// =============================================================================

/**
 * Delete a post. Validates ownership before deleting.
 * Cascading deletes will clean up related rows (details, media links, etc.)
 * if foreign keys are set to ON DELETE CASCADE.
 */
export async function deletePost(
    postId: string,
    userId: string,
): Promise<void> {
    // First verify ownership
    const { data: post, error: fetchError } = await supabase
        .from("posts")
        .select("id, author_id")
        .eq("id", postId)
        .single();

    if (fetchError || !post) {
        throw new Error("Post not found");
    }

    if (post.author_id !== userId) {
        throw new Error("Not authorized to delete this post");
    }

    // Delete related rows first (in case no CASCADE)
    await supabase.from("delivery_dates").delete().eq("post_id", postId);
    await supabase.from("want_to_sell_details").delete().eq("post_id", postId);
    await supabase.from("want_to_buy_details").delete().eq("post_id", postId);

    // Delete media links (but keep media_assets for potential reuse)
    await supabase.from("post_media").delete().eq("post_id", postId);

    // Delete the post itself
    const { error } = await supabase
        .from("posts")
        .delete()
        .eq("id", postId);

    if (error) {
        console.error("Error deleting post:", error);
        throw error;
    }

    console.log("✅ Deleted post:", postId);
}

// =============================================================================
// Repost — refresh timestamp to re-surface the post
// =============================================================================

/**
 * Re-activate a post by updating its created_at and updated_at to now.
 * This makes the post appear fresh in community feeds.
 */
export async function repostPost(
    postId: string,
    userId: string,
): Promise<void> {
    // Verify ownership
    const { data: post, error: fetchError } = await supabase
        .from("posts")
        .select("id, author_id")
        .eq("id", postId)
        .single();

    if (fetchError || !post) {
        throw new Error("Post not found");
    }

    if (post.author_id !== userId) {
        throw new Error("Not authorized to repost this post");
    }

    const now = new Date().toISOString();
    const { error } = await supabase
        .from("posts")
        .update({
            created_at: now,
            updated_at: now,
        })
        .eq("id", postId);

    if (error) {
        console.error("Error reposting:", error);
        throw error;
    }

    console.log("✅ Reposted:", postId);
}

// =============================================================================
// Clone — fetch full post data for pre-filling create form
// =============================================================================

/**
 * Returns a post's full data formatted for pre-filling a create-post form.
 */
/**
 * Fetch a single post by ID with all details for editing.
 * Returns the full UserPost object or null if not found.
 */
export async function getPostById(postId: string): Promise<UserPost | null> {
    const { data, error } = await supabase
        .from("posts")
        .select(`
      id,
      author_id,
      on_behalf_of,
      on_behalf_of_profile:profiles!posts_on_behalf_of_fkey (
        full_name,
        avatar_url
      ),
      type,
      reach,
      content,
      created_at,
      updated_at,
      community_h3_index,
      community:communities!posts_community_h3_index_fkey (
        name
      ),
      want_to_sell_details (
        category,
        produce_name,
        unit,
        total_quantity_available,
        price_per_unit
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
      delivery_dates (
        delivery_date
      )
    `)
        .eq("id", postId)
        .single();

    if (error || !data) {
        console.error("Error fetching post by ID:", error);
        return null;
    }

    const row = data as any;
    return {
        id: row.id,
        author_id: row.author_id,
        on_behalf_of: row.on_behalf_of || null,
        on_behalf_of_profile: row.on_behalf_of_profile || null,
        type: row.type,
        reach: row.reach,
        content: row.content,
        created_at: row.created_at,
        updated_at: row.updated_at,
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
        delivery_dates: (row.delivery_dates || []).map((d: any) =>
            d.delivery_date
        ).filter(Boolean),
    };
}

export async function clonePostData(postId: string): Promise<CloneData> {
    const { data, error } = await supabase
        .from("posts")
        .select(`
      type,
      content,
      community_h3_index,
      want_to_sell_details (
        category,
        produce_name,
        unit,
        total_quantity_available,
        price_per_unit
      ),
      want_to_buy_details (
        category,
        produce_names,
        need_by_date
      ),
      delivery_dates (
        delivery_date
      )
    `)
        .eq("id", postId)
        .single();

    if (error || !data) {
        throw new Error("Post not found");
    }

    return {
        type: data.type,
        content: data.content,
        community_h3_index: data.community_h3_index,
        sell_details: (data.want_to_sell_details as any)?.[0] || null,
        buy_details: (data.want_to_buy_details as any)?.[0] || null,
        delivery_dates: ((data as any).delivery_dates || []).map((d: any) =>
            d.delivery_date
        ).filter(Boolean),
    };
}
