/**
 * Feed Cache - Local persistence for feed posts
 *
 * Uses AsyncStorage (native) / localStorage (web) to cache feed data.
 * Enables instant display on screen re-entry and conditional server refresh.
 */

import { Platform } from "react-native";
import type { FeedPost } from "./feed-service";

// =============================================================================
// Types
// =============================================================================

export interface CachedFeed {
    posts: FeedPost[];
    /** ISO timestamp of the newest post — used for freshness checks */
    latestCreatedAt: string | null;
    /** When the cache was written (ISO) */
    cachedAt: string;
}

// =============================================================================
// Storage abstraction
// =============================================================================

const CACHE_KEY_PREFIX = "casagrown_feed_cache_";

function cacheKey(communityH3Index: string): string {
    return `${CACHE_KEY_PREFIX}${communityH3Index}`;
}

async function storageGet(key: string): Promise<string | null> {
    if (Platform.OS === "web") {
        try {
            return localStorage.getItem(key);
        } catch {
            return null;
        }
    }
    const AsyncStorage =
        require("@react-native-async-storage/async-storage").default;
    return AsyncStorage.getItem(key);
}

async function storageSet(key: string, value: string): Promise<void> {
    if (Platform.OS === "web") {
        try {
            localStorage.setItem(key, value);
        } catch {
            // localStorage full or unavailable — silently skip
        }
        return;
    }
    const AsyncStorage =
        require("@react-native-async-storage/async-storage").default;
    await AsyncStorage.setItem(key, value);
}

async function storageRemove(key: string): Promise<void> {
    if (Platform.OS === "web") {
        try {
            localStorage.removeItem(key);
        } catch {
            // ignore
        }
        return;
    }
    const AsyncStorage =
        require("@react-native-async-storage/async-storage").default;
    await AsyncStorage.removeItem(key);
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Retrieve cached feed posts for a community.
 * Returns null if no cache exists or on parse error.
 */
export async function getCachedFeed(
    communityH3Index: string,
): Promise<CachedFeed | null> {
    try {
        const raw = await storageGet(cacheKey(communityH3Index));
        if (!raw) return null;
        const parsed: CachedFeed = JSON.parse(raw);
        // Basic validation
        if (!Array.isArray(parsed.posts)) return null;
        return parsed;
    } catch {
        return null;
    }
}

/**
 * Store feed posts in local cache.
 * Automatically records the latest created_at timestamp for freshness checks.
 */
export async function setCachedFeed(
    communityH3Index: string,
    posts: FeedPost[],
): Promise<void> {
    const latestCreatedAt = posts.length > 0
        ? posts.reduce(
            (latest, p) => p.created_at > latest ? p.created_at : latest,
            posts[0]!.created_at,
        )
        : null;

    const cached: CachedFeed = {
        posts,
        latestCreatedAt,
        cachedAt: new Date().toISOString(),
    };

    try {
        await storageSet(cacheKey(communityH3Index), JSON.stringify(cached));
    } catch {
        // Storage write failed — non-critical
    }
}

/**
 * Clear all feed cache entries. Useful on logout.
 */
export async function clearFeedCache(
    communityH3Index?: string,
): Promise<void> {
    if (communityH3Index) {
        await storageRemove(cacheKey(communityH3Index));
    }
    // If no specific index, we can't enumerate AsyncStorage keys efficiently,
    // so callers should pass the known community index.
}
