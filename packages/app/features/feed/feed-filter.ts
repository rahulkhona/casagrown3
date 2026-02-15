/**
 * feed-filter.ts — Pure utility for filtering and searching feed posts.
 *
 * Extracted from FeedScreen's useMemo to enable direct unit testing.
 */

import type { FeedPost } from "./feed-service";

export type PostTypeFilter =
    | "all"
    | "want_to_sell"
    | "want_to_buy"
    | "services"
    | "seeking_advice"
    | "general_info";

/**
 * Filter posts by type and search query.
 *
 * - `filter === 'all'` → no type filtering
 * - `filter === 'services'` → matches both `offering_service` and `need_service`
 * - Search matches against produce name, content (plain or JSON), author name, category
 */
export function filterPosts(
    posts: FeedPost[],
    filter: PostTypeFilter,
    searchQuery: string,
): FeedPost[] {
    let result = posts;

    // Type filter
    if (filter !== "all") {
        if (filter === "services") {
            result = result.filter(
                (p) =>
                    p.type === "offering_service" || p.type === "need_service",
            );
        } else {
            result = result.filter((p) => p.type === filter);
        }
    }

    // Text search
    if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        result = result.filter((p) => {
            const title = p.sell_details?.produce_name ||
                (p.buy_details?.produce_names || []).join(" ") ||
                "";

            // Parse JSON content for search
            let contentText = p.content || "";
            try {
                const parsed = JSON.parse(p.content);
                contentText = [parsed.title, parsed.description]
                    .filter(Boolean)
                    .join(" ");
            } catch {
                // plain text, use as-is
            }

            return (
                title.toLowerCase().includes(q) ||
                contentText.toLowerCase().includes(q) ||
                (p.author_name || "").toLowerCase().includes(q) ||
                (p.sell_details?.category || "").toLowerCase().includes(q) ||
                (p.buy_details?.category || "").toLowerCase().includes(q)
            );
        });
    }

    return result;
}
