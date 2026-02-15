/**
 * Tests for feed-filter.ts — pure filter/search logic.
 */

import { filterPosts, type PostTypeFilter } from "./feed-filter";
import type { FeedPost } from "./feed-service";

// ── Test data factory ───────────────────────────────────────────────────────

function makePost(overrides: Partial<FeedPost> = {}): FeedPost {
    return {
        id: "post-1",
        author_id: "user-1",
        author_name: "Alice",
        author_avatar_url: null,
        type: "want_to_sell",
        reach: "community",
        content: "Fresh tomatoes",
        created_at: "2025-01-01T00:00:00Z",
        community_h3_index: "abc123",
        community_name: "Downtown",
        sell_details: {
            category: "Vegetables",
            produce_name: "Tomatoes",
            unit: "lb",
            total_quantity_available: 10,
            points_per_unit: 5,
        },
        buy_details: null,
        media: [],
        like_count: 0,
        comment_count: 0,
        is_liked: false,
        is_flagged: false,
        ...overrides,
    };
}

const SELL_POST = makePost();
const BUY_POST = makePost({
    id: "post-2",
    type: "want_to_buy",
    author_name: "Bob",
    content: "Looking for herbs",
    sell_details: null,
    buy_details: {
        category: "Herbs",
        produce_names: ["Basil", "Mint"],
        need_by_date: "2025-03-01",
    },
});
const SERVICE_OFFERING = makePost({
    id: "post-3",
    type: "offering_service",
    author_name: "Carol",
    content: "Garden design",
    sell_details: null,
});
const SERVICE_NEED = makePost({
    id: "post-4",
    type: "need_service",
    author_name: "Dave",
    content: "Need lawn mowing",
    sell_details: null,
});
const ADVICE_POST = makePost({
    id: "post-5",
    type: "seeking_advice",
    author_name: "Eve",
    content: "How to grow squash?",
    sell_details: null,
});
const GENERAL_POST = makePost({
    id: "post-6",
    type: "general_info",
    author_name: "Frank",
    content: JSON.stringify({
        title: "Community Event",
        description: "BBQ this Saturday",
    }),
    sell_details: null,
});

const ALL_POSTS = [
    SELL_POST,
    BUY_POST,
    SERVICE_OFFERING,
    SERVICE_NEED,
    ADVICE_POST,
    GENERAL_POST,
];

// ── Type filtering ──────────────────────────────────────────────────────────

describe("filterPosts — type filtering", () => {
    it('returns all posts when filter is "all"', () => {
        expect(filterPosts(ALL_POSTS, "all", "")).toHaveLength(6);
    });

    it("filters to want_to_sell only", () => {
        const result = filterPosts(ALL_POSTS, "want_to_sell", "");
        expect(result).toHaveLength(1);
        expect(result[0]!.id).toBe("post-1");
    });

    it("filters to want_to_buy only", () => {
        const result = filterPosts(ALL_POSTS, "want_to_buy", "");
        expect(result).toHaveLength(1);
        expect(result[0]!.id).toBe("post-2");
    });

    it("services filter matches both offering_service and need_service", () => {
        const result = filterPosts(ALL_POSTS, "services", "");
        expect(result).toHaveLength(2);
        expect(result.map((p) => p.id).sort()).toEqual(["post-3", "post-4"]);
    });

    it("filters to seeking_advice only", () => {
        const result = filterPosts(ALL_POSTS, "seeking_advice", "");
        expect(result).toHaveLength(1);
        expect(result[0]!.id).toBe("post-5");
    });

    it("filters to general_info only", () => {
        const result = filterPosts(ALL_POSTS, "general_info", "");
        expect(result).toHaveLength(1);
        expect(result[0]!.id).toBe("post-6");
    });
});

// ── Search ──────────────────────────────────────────────────────────────────

describe("filterPosts — search", () => {
    it("searches by produce name (sell)", () => {
        const result = filterPosts(ALL_POSTS, "all", "tomatoes");
        expect(result).toHaveLength(1);
        expect(result[0]!.id).toBe("post-1");
    });

    it("searches by produce names (buy)", () => {
        const result = filterPosts(ALL_POSTS, "all", "basil");
        expect(result).toHaveLength(1);
        expect(result[0]!.id).toBe("post-2");
    });

    it("searches by plain text content", () => {
        const result = filterPosts(ALL_POSTS, "all", "lawn mowing");
        expect(result).toHaveLength(1);
        expect(result[0]!.id).toBe("post-4");
    });

    it("searches by author name", () => {
        const result = filterPosts(ALL_POSTS, "all", "carol");
        expect(result).toHaveLength(1);
        expect(result[0]!.id).toBe("post-3");
    });

    it("searches by category", () => {
        const result = filterPosts(ALL_POSTS, "all", "vegetables");
        expect(result).toHaveLength(1);
        expect(result[0]!.id).toBe("post-1");
    });

    it("searches by buy_details category", () => {
        const result = filterPosts(ALL_POSTS, "all", "herbs");
        expect(result).toHaveLength(1);
        expect(result[0]!.id).toBe("post-2");
    });

    it("parses JSON content and searches title + description", () => {
        const result = filterPosts(ALL_POSTS, "all", "bbq");
        expect(result).toHaveLength(1);
        expect(result[0]!.id).toBe("post-6");
    });

    it("search is case-insensitive", () => {
        expect(filterPosts(ALL_POSTS, "all", "TOMATOES")).toHaveLength(1);
        expect(filterPosts(ALL_POSTS, "all", "Alice")).toHaveLength(1);
    });

    it("whitespace-only search returns all posts", () => {
        expect(filterPosts(ALL_POSTS, "all", "   ")).toHaveLength(6);
    });
});

// ── Combined filter + search ────────────────────────────────────────────────

describe("filterPosts — combined", () => {
    it("filters by type and then searches within results", () => {
        // Filter to services, then search for "garden"
        const result = filterPosts(ALL_POSTS, "services", "garden");
        expect(result).toHaveLength(1);
        expect(result[0]!.id).toBe("post-3");
    });

    it("returns empty when search has no matches within filtered type", () => {
        const result = filterPosts(ALL_POSTS, "want_to_sell", "basil");
        expect(result).toHaveLength(0);
    });
});

// ── Edge cases ──────────────────────────────────────────────────────────────

describe("filterPosts — edge cases", () => {
    it("handles empty posts array", () => {
        expect(filterPosts([], "all", "")).toEqual([]);
        expect(filterPosts([], "want_to_sell", "test")).toEqual([]);
    });

    it("handles post with null content", () => {
        const post = makePost({ content: "" });
        expect(filterPosts([post], "all", "xyz")).toHaveLength(0);
    });

    it("handles post with null sell_details and buy_details", () => {
        const post = makePost({ sell_details: null, buy_details: null });
        // Should still match on content or author name
        const result = filterPosts([post], "all", "alice");
        expect(result).toHaveLength(1);
    });
});
