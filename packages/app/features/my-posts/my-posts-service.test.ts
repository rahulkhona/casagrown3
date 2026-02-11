/**
 * My Posts Service Unit Tests
 *
 * Tests all exported functions in my-posts-service.ts:
 * - getUserPosts
 * - deletePost
 * - repostPost
 * - clonePostData
 */

// ---------------------------------------------------------------------------
// Configurable supabase mock — same chain pattern as post-service.test.ts
// ---------------------------------------------------------------------------

const mockDeleteChain = () => ({
    eq: jest.fn().mockResolvedValue({ error: null }),
});

const mockUpdateChain = () => ({
    eq: jest.fn().mockResolvedValue({ error: null }),
});

const mockFrom = jest.fn();

jest.mock("../auth/auth-hook", () => ({
    supabase: {
        from: (...args: any[]) => mockFrom(...args),
    },
}));

// Import after mocks
import {
    clonePostData,
    deletePost,
    getUserPosts,
    repostPost,
} from "./my-posts-service";

// ---------------------------------------------------------------------------
// Test Data
// ---------------------------------------------------------------------------

const mockPostRow = {
    id: "post-1",
    author_id: "user-123",
    type: "want_to_sell",
    reach: "community",
    content: JSON.stringify({ description: "Fresh tomatoes" }),
    created_at: "2026-02-01T10:00:00Z",
    updated_at: "2026-02-01T10:00:00Z",
    community_h3_index: "872834461ffffff",
    community: { name: "Oak Street" },
    want_to_sell_details: [{
        category: "vegetables",
        produce_name: "Tomatoes",
        unit: "lbs",
        total_quantity_available: 10,
        price_per_unit: 3.5,
    }],
    want_to_buy_details: [],
    post_media: [{
        position: 0,
        media_asset: {
            storage_path: "user-123/photo.jpg",
            media_type: "image",
        },
    }],
};

const mockBuyPostRow = {
    ...mockPostRow,
    id: "post-2",
    type: "want_to_buy",
    content: JSON.stringify({ description: "Looking for lemons" }),
    want_to_sell_details: [],
    want_to_buy_details: [{
        category: "fruits",
        produce_names: ["Lemons", "Limes"],
        need_by_date: "2026-02-20",
    }],
    post_media: [],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("my-posts-service", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // =========================================================================
    // getUserPosts
    // =========================================================================

    describe("getUserPosts", () => {
        it("fetches posts for a given user and maps them correctly", async () => {
            mockFrom.mockImplementation((table: string) => {
                if (table === "posts") {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                order: jest.fn().mockResolvedValue({
                                    data: [mockPostRow, mockBuyPostRow],
                                    error: null,
                                }),
                            }),
                        }),
                    };
                }
                return {};
            });

            const posts = await getUserPosts("user-123");

            expect(mockFrom).toHaveBeenCalledWith("posts");
            expect(posts).toHaveLength(2);

            // Check sell post mapping
            expect(posts[0].id).toBe("post-1");
            expect(posts[0].type).toBe("want_to_sell");
            expect(posts[0].community_name).toBe("Oak Street");
            expect(posts[0].sell_details).toBeTruthy();
            expect(posts[0].sell_details!.produce_name).toBe("Tomatoes");
            expect(posts[0].sell_details!.price_per_unit).toBe(3.5);
            expect(posts[0].media).toHaveLength(1);
            expect(posts[0].media[0].storage_path).toBe("user-123/photo.jpg");

            // Check buy post mapping
            expect(posts[1].id).toBe("post-2");
            expect(posts[1].type).toBe("want_to_buy");
            expect(posts[1].buy_details).toBeTruthy();
            expect(posts[1].buy_details!.produce_names).toEqual([
                "Lemons",
                "Limes",
            ]);
            expect(posts[1].media).toHaveLength(0);
        });

        it("returns empty array when no posts exist", async () => {
            mockFrom.mockImplementation((table: string) => ({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        order: jest.fn().mockResolvedValue({
                            data: [],
                            error: null,
                        }),
                    }),
                }),
            }));

            const posts = await getUserPosts("user-456");
            expect(posts).toHaveLength(0);
        });

        it("returns empty array when data is null", async () => {
            mockFrom.mockImplementation(() => ({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        order: jest.fn().mockResolvedValue({
                            data: null,
                            error: null,
                        }),
                    }),
                }),
            }));

            const posts = await getUserPosts("user-456");
            expect(posts).toHaveLength(0);
        });

        it("throws when query fails", async () => {
            mockFrom.mockImplementation(() => ({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        order: jest.fn().mockResolvedValue({
                            data: null,
                            error: { message: "Query failed", code: "42501" },
                        }),
                    }),
                }),
            }));

            await expect(getUserPosts("user-123")).rejects.toEqual(
                expect.objectContaining({ message: "Query failed" }),
            );
        });

        it("handles posts without community correctly", async () => {
            const postWithoutCommunity = { ...mockPostRow, community: null };
            mockFrom.mockImplementation(() => ({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        order: jest.fn().mockResolvedValue({
                            data: [postWithoutCommunity],
                            error: null,
                        }),
                    }),
                }),
            }));

            const posts = await getUserPosts("user-123");
            expect(posts[0].community_name).toBeNull();
        });

        it("handles posts without sell/buy details", async () => {
            const generalPost = {
                ...mockPostRow,
                type: "general_info",
                want_to_sell_details: null,
                want_to_buy_details: null,
            };
            mockFrom.mockImplementation(() => ({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        order: jest.fn().mockResolvedValue({
                            data: [generalPost],
                            error: null,
                        }),
                    }),
                }),
            }));

            const posts = await getUserPosts("user-123");
            expect(posts[0].sell_details).toBeNull();
            expect(posts[0].buy_details).toBeNull();
        });

        it("sorts media by position", async () => {
            const postWithMedia = {
                ...mockPostRow,
                post_media: [
                    {
                        position: 2,
                        media_asset: {
                            storage_path: "c.jpg",
                            media_type: "image",
                        },
                    },
                    {
                        position: 0,
                        media_asset: {
                            storage_path: "a.jpg",
                            media_type: "image",
                        },
                    },
                    {
                        position: 1,
                        media_asset: {
                            storage_path: "b.jpg",
                            media_type: "image",
                        },
                    },
                ],
            };
            mockFrom.mockImplementation(() => ({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        order: jest.fn().mockResolvedValue({
                            data: [postWithMedia],
                            error: null,
                        }),
                    }),
                }),
            }));

            const posts = await getUserPosts("user-123");
            expect(posts[0].media[0].storage_path).toBe("a.jpg");
            expect(posts[0].media[1].storage_path).toBe("b.jpg");
            expect(posts[0].media[2].storage_path).toBe("c.jpg");
        });

        it("filters out media with empty storage_path", async () => {
            const postWithBrokenMedia = {
                ...mockPostRow,
                post_media: [
                    {
                        position: 0,
                        media_asset: { storage_path: "", media_type: "image" },
                    },
                    { position: 1, media_asset: null },
                    {
                        position: 2,
                        media_asset: {
                            storage_path: "valid.jpg",
                            media_type: "image",
                        },
                    },
                ],
            };
            mockFrom.mockImplementation(() => ({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        order: jest.fn().mockResolvedValue({
                            data: [postWithBrokenMedia],
                            error: null,
                        }),
                    }),
                }),
            }));

            const posts = await getUserPosts("user-123");
            expect(posts[0].media).toHaveLength(1);
            expect(posts[0].media[0].storage_path).toBe("valid.jpg");
        });
    });

    // =========================================================================
    // deletePost
    // =========================================================================

    describe("deletePost", () => {
        it("verifies ownership before deleting", async () => {
            const deleteFn = jest.fn().mockReturnValue(mockDeleteChain());
            mockFrom.mockImplementation((table: string) => {
                if (table === "posts") {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({
                                    data: {
                                        id: "post-1",
                                        author_id: "user-123",
                                    },
                                    error: null,
                                }),
                            }),
                        }),
                        delete: deleteFn,
                    };
                }
                return { delete: jest.fn().mockReturnValue(mockDeleteChain()) };
            });

            await deletePost("post-1", "user-123");

            // Should have called from('posts') for both select and delete
            expect(mockFrom).toHaveBeenCalledWith("posts");
        });

        it("throws when post is not found", async () => {
            mockFrom.mockImplementation((table: string) => ({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({
                            data: null,
                            error: { message: "Not found" },
                        }),
                    }),
                }),
            }));

            await expect(deletePost("post-999", "user-123")).rejects.toThrow(
                "Post not found",
            );
        });

        it("throws when user does not own the post", async () => {
            mockFrom.mockImplementation(() => ({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({
                            data: { id: "post-1", author_id: "other-user" },
                            error: null,
                        }),
                    }),
                }),
            }));

            await expect(deletePost("post-1", "user-123")).rejects.toThrow(
                "Not authorized",
            );
        });

        it("deletes related rows before deleting the post", async () => {
            const tablesAccessed: string[] = [];
            mockFrom.mockImplementation((table: string) => {
                tablesAccessed.push(table);
                if (table === "posts") {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({
                                    data: {
                                        id: "post-1",
                                        author_id: "user-123",
                                    },
                                    error: null,
                                }),
                            }),
                        }),
                        delete: jest.fn().mockReturnValue(mockDeleteChain()),
                    };
                }
                return { delete: jest.fn().mockReturnValue(mockDeleteChain()) };
            });

            await deletePost("post-1", "user-123");

            // Should have accessed related tables
            expect(tablesAccessed).toContain("delivery_dates");
            expect(tablesAccessed).toContain("want_to_sell_details");
            expect(tablesAccessed).toContain("want_to_buy_details");
            expect(tablesAccessed).toContain("post_media");
        });
    });

    // =========================================================================
    // repostPost
    // =========================================================================

    describe("repostPost", () => {
        it("updates created_at and updated_at when user owns the post", async () => {
            const updateFn = jest.fn().mockReturnValue(mockUpdateChain());
            // Need to return different objects for different calls
            let callCount = 0;
            mockFrom.mockImplementation((table: string) => {
                callCount++;
                if (table === "posts" && callCount === 1) {
                    // First call: select for ownership check
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({
                                    data: {
                                        id: "post-1",
                                        author_id: "user-123",
                                    },
                                    error: null,
                                }),
                            }),
                        }),
                    };
                }
                if (table === "posts" && callCount === 2) {
                    // Second call: update
                    return { update: updateFn };
                }
                return {};
            });

            await repostPost("post-1", "user-123");

            expect(updateFn).toHaveBeenCalledWith(
                expect.objectContaining({
                    created_at: expect.any(String),
                    updated_at: expect.any(String),
                }),
            );
        });

        it("throws when post not found", async () => {
            mockFrom.mockImplementation(() => ({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({
                            data: null,
                            error: { message: "Not found" },
                        }),
                    }),
                }),
            }));

            await expect(repostPost("post-999", "user-123")).rejects.toThrow(
                "Post not found",
            );
        });

        it("throws when user does not own the post", async () => {
            mockFrom.mockImplementation(() => ({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({
                            data: { id: "post-1", author_id: "other-user" },
                            error: null,
                        }),
                    }),
                }),
            }));

            await expect(repostPost("post-1", "user-123")).rejects.toThrow(
                "Not authorized",
            );
        });

        it("throws when update fails", async () => {
            let callCount = 0;
            mockFrom.mockImplementation((table: string) => {
                callCount++;
                if (table === "posts" && callCount === 1) {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({
                                    data: {
                                        id: "post-1",
                                        author_id: "user-123",
                                    },
                                    error: null,
                                }),
                            }),
                        }),
                    };
                }
                if (table === "posts" && callCount === 2) {
                    return {
                        update: jest.fn().mockReturnValue({
                            eq: jest.fn().mockResolvedValue({
                                error: { message: "Update failed" },
                            }),
                        }),
                    };
                }
                return {};
            });

            await expect(repostPost("post-1", "user-123")).rejects.toEqual(
                expect.objectContaining({ message: "Update failed" }),
            );
        });
    });

    // =========================================================================
    // clonePostData
    // =========================================================================

    describe("clonePostData", () => {
        it("returns post data formatted for pre-filling a form", async () => {
            mockFrom.mockImplementation((table: string) => ({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({
                            data: {
                                type: "want_to_sell",
                                content: JSON.stringify({
                                    description: "Fresh tomatoes",
                                }),
                                community_h3_index: "872834461ffffff",
                                want_to_sell_details: [{
                                    category: "vegetables",
                                    produce_name: "Tomatoes",
                                    unit: "lbs",
                                    total_quantity_available: 10,
                                    price_per_unit: 3.5,
                                }],
                                want_to_buy_details: [],
                            },
                            error: null,
                        }),
                    }),
                }),
            }));

            const result = await clonePostData("post-1");

            expect(result.type).toBe("want_to_sell");
            expect(result.community_h3_index).toBe("872834461ffffff");
            expect(result.sell_details).toBeTruthy();
            expect(result.sell_details!.produce_name).toBe("Tomatoes");
            expect(result.buy_details).toBeNull();
        });

        it("throws when post not found", async () => {
            mockFrom.mockImplementation(() => ({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({
                            data: null,
                            error: { message: "Not found" },
                        }),
                    }),
                }),
            }));

            await expect(clonePostData("post-999")).rejects.toThrow(
                "Post not found",
            );
        });

        it("handles buy post data correctly", async () => {
            mockFrom.mockImplementation(() => ({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({
                            data: {
                                type: "want_to_buy",
                                content: JSON.stringify({
                                    description: "Looking for lemons",
                                }),
                                community_h3_index: "872834461ffffff",
                                want_to_sell_details: [],
                                want_to_buy_details: [{
                                    category: "fruits",
                                    produce_names: ["Lemons", "Limes"],
                                    need_by_date: "2026-02-20",
                                }],
                            },
                            error: null,
                        }),
                    }),
                }),
            }));

            const result = await clonePostData("post-2");
            expect(result.type).toBe("want_to_buy");
            expect(result.buy_details!.produce_names).toEqual([
                "Lemons",
                "Limes",
            ]);
            expect(result.sell_details).toBeNull();
        });

        it("includes delivery_dates in clone result", async () => {
            mockFrom.mockImplementation(() => ({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({
                            data: {
                                type: "want_to_sell",
                                content: JSON.stringify({
                                    description: "Tomatoes with dates",
                                }),
                                community_h3_index: "872834461ffffff",
                                want_to_sell_details: [{
                                    category: "vegetables",
                                    produce_name: "Tomatoes",
                                    unit: "lbs",
                                    total_quantity_available: 5,
                                    price_per_unit: 2.0,
                                }],
                                want_to_buy_details: [],
                                delivery_dates: [
                                    { delivery_date: "2026-03-05" },
                                    { delivery_date: "2026-03-06" },
                                ],
                            },
                            error: null,
                        }),
                    }),
                }),
            }));

            const result = await clonePostData("post-1");
            expect(result.delivery_dates).toEqual(["2026-03-05", "2026-03-06"]);
        });
    });
});
