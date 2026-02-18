/**
 * Feed Service Tests
 *
 * Tests for getCommunityFeedPosts, togglePostLike, and flagPost.
 */

import {
    flagPost,
    getCommunityFeedPosts,
    togglePostLike,
} from "./feed-service";

// Mock supabase
const mockSelect = jest.fn();
const mockFrom = jest.fn();
const mockEq = jest.fn();
const mockOrder = jest.fn();
const mockDelete = jest.fn();
const mockInsert = jest.fn();

jest.mock("../auth/auth-hook", () => ({
    supabase: {
        from: (...args: any[]) => mockFrom(...args),
    },
}));

beforeEach(() => {
    jest.clearAllMocks();
});

// =============================================================================
// getCommunityFeedPosts
// =============================================================================

describe("getCommunityFeedPosts", () => {
    it("returns correctly mapped posts", async () => {
        const mockData = [
            {
                id: "post-1",
                author_id: "user-1",
                type: "want_to_sell",
                reach: "community",
                content: "Fresh tomatoes",
                created_at: "2026-02-10T00:00:00Z",
                community_h3_index: "h3-abc",
                author: { full_name: "Alice", avatar_url: "http://avatar.png" },
                community: { name: "Sunset Park" },
                want_to_sell_details: [
                    {
                        category: "vegetables",
                        produce_name: "Tomatoes",
                        unit: "box",
                        total_quantity_available: 10,
                        points_per_unit: 5,
                    },
                ],
                want_to_buy_details: [],
                delivery_dates: [],
                post_media: [],
                post_likes: [{ user_id: "current-user" }],
                post_comments: [{ id: "c1" }, { id: "c2" }],
                post_flags: [],
            },
        ];

        mockFrom.mockReturnValue({
            select: jest.fn().mockReturnValue({
                or: jest.fn().mockReturnValue({
                    order: jest.fn().mockResolvedValue({
                        data: mockData,
                        error: null,
                    }),
                }),
            }),
        });

        const posts = await getCommunityFeedPosts("h3-abc", "current-user");

        expect(posts).toHaveLength(1);
        expect(posts[0].id).toBe("post-1");
        expect(posts[0].author_name).toBe("Alice");
        expect(posts[0].author_avatar_url).toBe("http://avatar.png");
        expect(posts[0].community_name).toBe("Sunset Park");
        expect(posts[0].sell_details?.produce_name).toBe("Tomatoes");
        expect(posts[0].like_count).toBe(1);
        expect(posts[0].comment_count).toBe(2);
        expect(posts[0].is_liked).toBe(true);
    });

    it("returns empty array when no posts", async () => {
        mockFrom.mockReturnValue({
            select: jest.fn().mockReturnValue({
                or: jest.fn().mockReturnValue({
                    order: jest.fn().mockResolvedValue({
                        data: [],
                        error: null,
                    }),
                }),
            }),
        });

        const posts = await getCommunityFeedPosts("h3-abc", "user-1");
        expect(posts).toHaveLength(0);
    });

    it("throws on error", async () => {
        mockFrom.mockReturnValue({
            select: jest.fn().mockReturnValue({
                or: jest.fn().mockReturnValue({
                    order: jest.fn().mockResolvedValue({
                        data: null,
                        error: { message: "DB error" },
                    }),
                }),
            }),
        });

        await expect(
            getCommunityFeedPosts("h3-abc", "user-1"),
        ).rejects.toEqual({ message: "DB error" });
    });

    it("sets is_liked to false when user has not liked", async () => {
        const mockData = [
            {
                id: "post-2",
                author_id: "user-2",
                type: "want_to_buy",
                reach: "community",
                content: "Looking for apples",
                created_at: "2026-02-10T00:00:00Z",
                community_h3_index: "h3-abc",
                author: { full_name: "Bob", avatar_url: null },
                community: { name: "Sunset Park" },
                want_to_sell_details: [],
                want_to_buy_details: [
                    {
                        category: "fruits",
                        produce_names: ["apples"],
                        need_by_date: "2026-03-01",
                        desired_quantity: 5,
                        desired_unit: "box",
                    },
                ],
                delivery_dates: [
                    { delivery_date: "2026-02-25" },
                    { delivery_date: "2026-02-28" },
                ],
                post_media: [],
                post_likes: [],
                post_comments: [],
                post_flags: [],
            },
        ];

        mockFrom.mockReturnValue({
            select: jest.fn().mockReturnValue({
                or: jest.fn().mockReturnValue({
                    order: jest.fn().mockResolvedValue({
                        data: mockData,
                        error: null,
                    }),
                }),
            }),
        });

        const posts = await getCommunityFeedPosts("h3-abc", "other-user");
        expect(posts[0].is_liked).toBe(false);
        expect(posts[0].buy_details?.produce_names).toEqual(["apples"]);
        expect(posts[0].buy_details?.desired_quantity).toBe(5);
        expect(posts[0].buy_details?.desired_unit).toBe("box");
        expect(posts[0].buy_details?.delivery_dates).toEqual([
            "2026-02-25",
            "2026-02-28",
        ]);
    });
});

// =============================================================================
// togglePostLike
// =============================================================================

describe("togglePostLike", () => {
    it("removes like when currently liked", async () => {
        mockFrom.mockReturnValue({
            delete: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                    eq: jest.fn().mockResolvedValue({ error: null }),
                }),
            }),
        });

        const result = await togglePostLike("post-1", "user-1", true);
        expect(result).toBe(false);
        expect(mockFrom).toHaveBeenCalledWith("post_likes");
    });

    it("adds like when not currently liked", async () => {
        mockFrom.mockReturnValue({
            insert: jest.fn().mockResolvedValue({ error: null }),
        });

        const result = await togglePostLike("post-1", "user-1", false);
        expect(result).toBe(true);
        expect(mockFrom).toHaveBeenCalledWith("post_likes");
    });

    it("throws when delete fails", async () => {
        mockFrom.mockReturnValue({
            delete: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                    eq: jest.fn().mockResolvedValue({
                        error: { message: "Error" },
                    }),
                }),
            }),
        });

        await expect(
            togglePostLike("post-1", "user-1", true),
        ).rejects.toEqual({ message: "Error" });
    });
});

// =============================================================================
// flagPost
// =============================================================================

describe("flagPost", () => {
    it("inserts flag record", async () => {
        const mockInsertFn = jest.fn().mockResolvedValue({ error: null });
        mockFrom.mockReturnValue({
            insert: mockInsertFn,
        });

        await flagPost("post-1", "user-1", "Spam");
        expect(mockFrom).toHaveBeenCalledWith("post_flags");
        expect(mockInsertFn).toHaveBeenCalledWith({
            post_id: "post-1",
            user_id: "user-1",
            reason: "Spam",
        });
    });

    it("throws on error", async () => {
        mockFrom.mockReturnValue({
            insert: jest.fn().mockResolvedValue({
                error: { message: "Error" },
            }),
        });

        await expect(flagPost("post-1", "user-1", "Spam")).rejects.toEqual({
            message: "Error",
        });
    });
});
