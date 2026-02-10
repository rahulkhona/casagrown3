/**
 * Post Service - Supabase data operations for creating posts
 *
 * Handles:
 * - Creating posts (sell/buy/general) with correct H3 community references
 * - Delegate seller lookup (who the logged-in user can sell on behalf of)
 * - Community + adjacent communities for drop-off visualization
 * - Dynamic sales categories filtered by restriction rules
 */

import { supabase } from "../auth/auth-hook";
import { UploadedMedia, uploadPostMediaBatch } from "./media-upload";

// =============================================================================
// Types
// =============================================================================

export interface SellPostData {
    authorId: string;
    /** If selling on behalf of a delegator, this is the delegator's user ID */
    onBehalfOfId?: string;
    communityH3Index?: string;
    /** Additional adjacent community H3 indices the seller wants to post to */
    additionalCommunityH3Indices?: string[];
    description: string;
    category: string;
    produceName: string;
    unit: string;
    quantity: number;
    pricePerUnit: number;
    dropoffDates: string[];
    /** Media assets to upload (local URIs from camera/gallery) */
    mediaAssets?: Array<{ uri: string; type?: string }>;
}

export interface BuyPostData {
    authorId: string;
    communityH3Index?: string;
    /** Adjacent community H3 indices the buyer can accept delivery from */
    additionalCommunityH3Indices?: string[];
    description: string;
    category: string;
    produceNames: string[];
    needByDate?: string;
    /** Media assets to upload (local URIs from camera/gallery) */
    mediaAssets?: Array<{ uri: string; type?: string }>;
}

export interface GeneralPostData {
    authorId: string;
    communityH3Index?: string;
    /** Adjacent community H3 indices (for offering_service) */
    additionalCommunityH3Indices?: string[];
    type: string;
    title: string;
    description: string;
    /** 'community' (default) or 'global' (for seeking_advice, general_info) */
    reach?: "community" | "global";
    /** Media assets to upload (local URIs from camera/gallery) */
    mediaAssets?: Array<{ uri: string; type?: string }>;
}

export interface DelegatorInfo {
    delegationId: string;
    delegatorId: string;
    fullName: string | null;
    avatarUrl: string | null;
    communityH3Index: string | null;
    communityName: string | null;
}

export interface CommunityInfo {
    h3Index: string;
    name: string;
    city: string | null;
    state: string | null;
    country: string | null;
    lat?: number;
    lng?: number;
}

export interface UserCommunitiesResult {
    primary: CommunityInfo | null;
    neighbors: CommunityInfo[];
}

// =============================================================================
// Media Upload + Link Helper
// =============================================================================

/**
 * Upload media assets to storage, create media_asset records, and link to post.
 * Handles both native (file://, content://) and web (blob:, data:) URIs.
 */
async function uploadAndLinkMedia(
    postId: string,
    authorId: string,
    assets?: Array<{ uri: string; type?: string }>,
) {
    if (!assets || assets.length === 0) return;

    const uploaded = await uploadPostMediaBatch(authorId, assets);
    if (uploaded.length === 0) {
        console.warn("⚠️ No media uploaded successfully");
        return;
    }

    // Insert into media_assets table
    const mediaRows = uploaded.map((m) => ({
        owner_id: authorId,
        storage_path: m.storagePath,
        media_type: m.mediaType,
        mime_type: m.mediaType === "video" ? "video/mp4" : "image/jpeg",
    }));

    const { data: insertedMedia, error: mediaError } = await supabase
        .from("media_assets")
        .insert(mediaRows)
        .select("id");

    if (mediaError) {
        console.error("Error inserting media_assets:", mediaError);
        return;
    }

    if (!insertedMedia || insertedMedia.length === 0) return;

    // Link media to post via post_media junction table
    const linkRows = insertedMedia.map((m, i) => ({
        post_id: postId,
        media_id: m.id,
        position: i,
    }));

    const { error: linkError } = await supabase
        .from("post_media")
        .insert(linkRows);

    if (linkError) {
        console.error("Error linking post_media:", linkError);
    } else {
        console.log(
            `✅ Linked ${insertedMedia.length} media to post ${postId}`,
        );
    }
}

// =============================================================================
// Delegations — who am I selling on behalf of?
// =============================================================================

/**
 * Fetch active delegators for the logged-in user.
 * Returns the list of people whose produce this user can sell.
 */
export async function getActiveDelegators(
    userId: string,
): Promise<DelegatorInfo[]> {
    const { data, error } = await supabase
        .from("delegations")
        .select(`
            id,
            delegator_id,
            delegator_profile:profiles!delegations_delegator_id_fkey (
                full_name,
                avatar_url,
                home_community_h3_index,
                communities:home_community_h3_index (
                    name
                )
            )
        `)
        .eq("delegatee_id", userId)
        .eq("status", "active");

    if (error) {
        console.error("Error fetching delegators:", error);
        return [];
    }

    return (data || []).map((d: any) => ({
        delegationId: d.id,
        delegatorId: d.delegator_id,
        fullName: d.delegator_profile?.full_name || null,
        avatarUrl: d.delegator_profile?.avatar_url || null,
        communityH3Index: d.delegator_profile?.home_community_h3_index || null,
        communityName: d.delegator_profile?.communities?.name || null,
    }));
}

// =============================================================================
// Platform Configuration
// =============================================================================

/**
 * Fetch the platform fee percentage from the database config.
 * Falls back to 10 if the config row is missing.
 */
export async function getPlatformFeePercent(): Promise<number> {
    const { data, error } = await supabase
        .from("platform_config")
        .select("value")
        .eq("key", "platform_fee_percent")
        .single();

    if (error || !data?.value) {
        return 10; // Default fallback
    }
    return parseFloat(data.value) || 10;
}

// =============================================================================
// Community + Adjacent Communities
// =============================================================================

/**
 * Fetch the user's home community and nearby communities.
 * Uses profiles.home_community_h3_index + profiles.nearby_community_h3_indices.
 */
export async function getUserCommunitiesWithNeighbors(
    userId: string,
): Promise<UserCommunitiesResult> {
    // 1. Get the user's community H3 index and nearby indices
    const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("home_community_h3_index, nearby_community_h3_indices")
        .eq("id", userId)
        .single();

    if (profileError || !profile?.home_community_h3_index) {
        return { primary: null, neighbors: [] };
    }

    const allH3Indices = [
        profile.home_community_h3_index,
        ...(profile.nearby_community_h3_indices || []),
    ];

    // 2. Bulk-fetch community data for all indices
    const { data: communities, error: commError } = await supabase
        .from("communities")
        .select("h3_index, name, city, state, country, location")
        .in("h3_index", allH3Indices);

    if (commError || !communities) {
        return { primary: null, neighbors: [] };
    }

    // Build lookup map
    const communityMap = new Map<string, CommunityInfo>();
    for (const c of communities) {
        const info: CommunityInfo = {
            h3Index: c.h3_index,
            name: c.name,
            city: c.city,
            state: c.state,
            country: c.country,
        };
        // Parse lat/lng from PostGIS geometry
        if (
            c.location && typeof c.location === "object" &&
            c.location.coordinates
        ) {
            info.lng = c.location.coordinates[0];
            info.lat = c.location.coordinates[1];
        }
        communityMap.set(c.h3_index, info);
    }

    const primary = communityMap.get(profile.home_community_h3_index) || null;
    const neighbors = (profile.nearby_community_h3_indices || [])
        .map((idx: string) => communityMap.get(idx))
        .filter(Boolean) as CommunityInfo[];

    return { primary, neighbors };
}

/**
 * Simpler helper: get just the community name for a user.
 */
export async function getUserCommunity(
    userId: string,
): Promise<{ h3Index: string; communityName: string } | null> {
    const { data: profile } = await supabase
        .from("profiles")
        .select(`
            home_community_h3_index,
            communities:home_community_h3_index (name)
        `)
        .eq("id", userId)
        .single();

    if (!profile?.home_community_h3_index) return null;

    return {
        h3Index: profile.home_community_h3_index,
        communityName: (profile.communities as any)?.name ||
            profile.home_community_h3_index,
    };
}

// =============================================================================
// Dynamic Categories
// =============================================================================

/** All possible sales categories (mirrors the Postgres enum) */
const ALL_CATEGORIES = [
    "fruits",
    "vegetables",
    "herbs",
    "flowers",
    "flower_arrangements",
    "garden_equipment",
    "pots",
    "soil",
];

/**
 * Returns allowed sales categories for a given community.
 * Starts with all categories, then removes any that are restricted at any
 * scope level (global, country, state, city, zip, community).
 *
 * The restriction model: if `is_allowed = false` for a category at any
 * applicable scope, that category is excluded.
 */
export async function getAvailableCategories(
    communityH3Index?: string,
): Promise<string[]> {
    // If no community, return all (no filtering possible)
    if (!communityH3Index) return [...ALL_CATEGORIES];

    // Get the community's location details for hierarchical filtering
    const { data: community } = await supabase
        .from("communities")
        .select("h3_index, city, state, country")
        .eq("h3_index", communityH3Index)
        .single();

    // Build the restriction query — fetch all restrictions that could apply
    let query = supabase
        .from("sales_category_restrictions")
        .select("category, scope, is_allowed")
        .eq("is_allowed", false); // Only need to find blocked categories

    if (community) {
        // In the H3 community schema, city/state/country are plain text names,
        // NOT UUID/ISO-3 FKs that match sales_category_restrictions columns.
        // Only filter by global scope and community-specific restrictions.
        query = query.or(
            `scope.eq.global,and(scope.eq.community,community_h3_index.eq.${communityH3Index})`,
        );
    } else {
        // No community metadata — only check global + community-specific
        query = query.or(
            `scope.eq.global,and(scope.eq.community,community_h3_index.eq.${communityH3Index})`,
        );
    }

    const { data: restrictions, error } = await query;

    if (error) {
        console.error(
            "Error fetching category restrictions:",
            JSON.stringify(error),
        );
        return [...ALL_CATEGORIES]; // Fail open
    }

    // Collect blocked categories
    const blocked = new Set(
        (restrictions || []).map((r: any) => r.category),
    );

    return ALL_CATEGORIES.filter((cat) => !blocked.has(cat));
}

// =============================================================================
// Create Sell Post
// =============================================================================

export async function createSellPost(data: SellPostData) {
    // Build content - include additional community info if present
    const contentObj: Record<string, unknown> = {
        produceName: data.produceName,
        description: data.description,
    };
    if (
        data.additionalCommunityH3Indices &&
        data.additionalCommunityH3Indices.length > 0
    ) {
        contentObj.additionalCommunityH3Indices =
            data.additionalCommunityH3Indices;
    }
    const content = JSON.stringify(contentObj);

    // If selling on behalf of someone, use their ID as author
    const authorId = data.onBehalfOfId || data.authorId;

    // 1. Insert post
    const { data: post, error: postError } = await supabase
        .from("posts")
        .insert({
            author_id: authorId,
            community_h3_index: data.communityH3Index || null,
            type: "want_to_sell",
            reach: "community",
            content,
        })
        .select("id")
        .single();

    if (postError) throw postError;
    if (!post) throw new Error("Failed to create post");

    // 2. Insert sell details
    const { error: detailError } = await supabase
        .from("want_to_sell_details")
        .insert({
            post_id: post.id,
            category: data.category,
            produce_name: data.produceName,
            unit: data.unit,
            total_quantity_available: data.quantity,
            price_per_unit: data.pricePerUnit,
        });

    if (detailError) throw detailError;

    // 3. Insert delivery dates
    if (data.dropoffDates.length > 0) {
        const dateRows = data.dropoffDates.map((date) => ({
            post_id: post.id,
            delivery_date: date,
        }));

        const { error: dateError } = await supabase
            .from("delivery_dates")
            .insert(dateRows);

        if (dateError) throw dateError;
    }

    // 4. Upload and link media
    await uploadAndLinkMedia(post.id, data.authorId, data.mediaAssets);

    return post;
}

// =============================================================================
// Create Buy Post
// =============================================================================

export async function createBuyPost(data: BuyPostData) {
    // Build content JSON with optional adjacent community info
    const contentObj: Record<string, unknown> = {
        produceNames: data.produceNames,
        description: data.description,
    };
    if (
        data.additionalCommunityH3Indices &&
        data.additionalCommunityH3Indices.length > 0
    ) {
        contentObj.additionalCommunityH3Indices =
            data.additionalCommunityH3Indices;
    }
    const content = JSON.stringify(contentObj);

    const { data: post, error: postError } = await supabase
        .from("posts")
        .insert({
            author_id: data.authorId,
            community_h3_index: data.communityH3Index || null,
            type: "want_to_buy",
            reach: "community",
            content,
        })
        .select("id")
        .single();

    if (postError) throw postError;
    if (!post) throw new Error("Failed to create post");

    const { error: detailError } = await supabase
        .from("want_to_buy_details")
        .insert({
            post_id: post.id,
            category: data.category,
            produce_names: data.produceNames,
            need_by_date: data.needByDate || null,
        });

    if (detailError) throw detailError;

    // 3. Upload and link media
    await uploadAndLinkMedia(post.id, data.authorId, data.mediaAssets);

    return post;
}

// =============================================================================
// Create General Post (services, advice, show & tell)
// =============================================================================

export async function createGeneralPost(data: GeneralPostData) {
    const contentObj: Record<string, unknown> = {
        title: data.title,
        description: data.description,
    };
    if (
        data.additionalCommunityH3Indices &&
        data.additionalCommunityH3Indices.length > 0
    ) {
        contentObj.additionalCommunityH3Indices =
            data.additionalCommunityH3Indices;
    }
    const content = JSON.stringify(contentObj);

    const { data: post, error: postError } = await supabase
        .from("posts")
        .insert({
            author_id: data.authorId,
            community_h3_index: data.communityH3Index || null,
            type: data.type,
            reach: data.reach || "community",
            content,
        })
        .select("id")
        .single();

    if (postError) throw postError;
    if (!post) throw new Error("Failed to create post");

    // 2. Upload and link media
    await uploadAndLinkMedia(post.id, data.authorId, data.mediaAssets);

    return post;
}
