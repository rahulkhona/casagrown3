import { useState } from "react";
import { supabase } from "../auth/auth-hook";

export type ResolvedCommunity = {
    h3_index: string;
    name: string;
    city: string;
    location: string; // WKT
};

export type NeighborCommunity = {
    h3_index: string;
    name: string;
    status: "active" | "unexplored";
};

export type ResolveResponse = {
    primary: ResolvedCommunity;
    neighbors: NeighborCommunity[];
    resolved_location: { lat: number; lng: number };
    hex_boundaries?: Record<string, number[][]>;
};

// Client-side cache to avoid redundant edge function calls for the same lookups.
// Fallback "Zone …" names use a TTL so enriched names propagate without an app
// restart. Enriched names are cached permanently (they don't change).
const FALLBACK_TTL_MS = 5 * 60 * 1000; // 5 minutes
const communityCache = new Map<string, { data: ResolveResponse; ts: number }>();

function hasFallbackName(res: ResolveResponse): boolean {
    return res.primary.name.startsWith("Zone ");
}

function getCached(key: string): ResolveResponse | undefined {
    const entry = communityCache.get(key);
    if (!entry) return undefined;
    // Only expire entries whose primary name is still a fallback "Zone …" name
    if (
        hasFallbackName(entry.data) && Date.now() - entry.ts > FALLBACK_TTL_MS
    ) {
        communityCache.delete(key);
        return undefined;
    }
    return entry.data;
}

function setCache(key: string, data: ResolveResponse) {
    communityCache.set(key, { data, ts: Date.now() });
}

export const useResolveCommunity = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const resolveAddress = async (
        address: string,
    ): Promise<ResolveResponse | null> => {
        const cacheKey = `addr:${address.toLowerCase().trim()}`;
        const cached = getCached(cacheKey);
        if (cached) {
            console.log("📦 Community cache hit for address:", address);
            return cached;
        }

        setLoading(true);
        setError(null);
        try {
            const { data, error: fnError } = await supabase.functions.invoke(
                "resolve-community",
                {
                    body: { address },
                },
            );

            if (fnError) {
                console.error(
                    "Supabase Function Error Details:",
                    JSON.stringify(fnError, null, 2),
                );
                throw fnError;
            }
            const result = data as ResolveResponse;
            setCache(cacheKey, result);
            return result;
        } catch (err: any) {
            console.error("Error resolving community (Full Catch):", err);
            setError(err.message || "Failed to find community");
            return null;
        } finally {
            setLoading(false);
        }
    };

    const resolveLocation = async (
        lat: number,
        lng: number,
    ): Promise<ResolveResponse | null> => {
        // Round to 4 decimal places (~11m accuracy) for cache key stability
        const cacheKey = `loc:${lat.toFixed(4)},${lng.toFixed(4)}`;
        const cached = getCached(cacheKey);
        if (cached) {
            console.log("📦 Community cache hit for location:", lat, lng);
            return cached;
        }

        setLoading(true);
        setError(null);
        try {
            const { data, error: fnError } = await supabase.functions.invoke(
                "resolve-community",
                {
                    body: { lat, lng },
                },
            );

            if (fnError) throw fnError;
            const result = data as ResolveResponse;
            setCache(cacheKey, result);
            return result;
        } catch (err: any) {
            console.error("Error resolving community:", err);
            setError(err.message || "Failed to find community");
            return null;
        } finally {
            setLoading(false);
        }
    };

    return {
        resolveAddress,
        resolveLocation,
        loading,
        error,
    };
};
