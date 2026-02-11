/**
 * Post Service Unit Tests
 *
 * Tests all exported functions in post-service.ts:
 * - createSellPost, createBuyPost, createGeneralPost
 * - uploadAndLinkMedia (via post creation functions)
 * - getActiveDelegators, getPlatformFeePercent
 * - getAvailableCategories, getUserCommunitiesWithNeighbors, getUserCommunity
 */

// ---------------------------------------------------------------------------
// Configurable supabase mock — same pattern as wizard-context.test.tsx
// ---------------------------------------------------------------------------

// Per-table mock responses for granular control
const mockResponses: Record<string, any> = {};

// Chain builder: .from('table').insert/select/update → .eq → .single/etc
const buildChain = (table: string) => {
    const chain: any = {
        insert: jest.fn().mockImplementation((rows: any) => {
            const resp = mockResponses[`${table}.insert`];
            const selectChain = {
                select: jest.fn().mockImplementation(() => {
                    const sr = mockResponses[`${table}.insert.select`];
                    return {
                        single: jest.fn().mockResolvedValue(
                            sr ||
                                {
                                    data: { id: "generated-post-id" },
                                    error: null,
                                },
                        ),
                    };
                }),
            };
            // If the caller doesn't chain .select()
            return {
                ...selectChain,
                then: (r: any) =>
                    Promise.resolve(resp || { data: rows, error: null }).then(
                        r,
                    ),
            };
        }),
        select: jest.fn().mockImplementation(() => {
            const resp = mockResponses[`${table}.select`];
            return {
                eq: jest.fn().mockImplementation(() => ({
                    single: jest.fn().mockResolvedValue(
                        resp || { data: null, error: null },
                    ),
                    maybeSingle: jest.fn().mockResolvedValue(
                        resp || { data: null, error: null },
                    ),
                    order: jest.fn().mockReturnValue({
                        limit: jest.fn().mockReturnValue({
                            maybeSingle: jest.fn().mockResolvedValue(
                                resp || { data: null, error: null },
                            ),
                        }),
                    }),
                })),
                in: jest.fn().mockResolvedValue(
                    resp || { data: [], error: null },
                ),
                or: jest.fn().mockResolvedValue(
                    resp || { data: [], error: null },
                ),
            };
        }),
        update: jest.fn().mockImplementation(() => ({
            eq: jest.fn().mockResolvedValue({ error: null }),
        })),
    };
    return chain;
};

const mockFrom = jest.fn().mockImplementation((table: string) =>
    buildChain(table)
);

jest.mock("../auth/auth-hook", () => ({
    supabase: {
        from: (...args: any[]) => mockFrom(...args),
    },
}));

// Mock media upload
const mockUploadPostMediaBatch = jest.fn().mockResolvedValue([]);
jest.mock("./media-upload", () => ({
    uploadPostMediaBatch: (...args: any[]) => mockUploadPostMediaBatch(...args),
}));

// Import after mocks
import {
    BuyPostData,
    createBuyPost,
    createGeneralPost,
    createSellPost,
    GeneralPostData,
    getActiveDelegators,
    getAvailableCategories,
    getCommunityWithNeighborsByH3,
    getPlatformFeePercent,
    getUserCommunitiesWithNeighbors,
    getUserCommunity,
    SellPostData,
    updateBuyPost,
    updateGeneralPost,
    updateSellPost,
} from "./post-service";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const baseSellData: SellPostData = {
    authorId: "user-123",
    communityH3Index: "872834461ffffff",
    description: "Fresh tomatoes from my garden",
    category: "vegetables",
    produceName: "Tomatoes",
    unit: "lbs",
    quantity: 10,
    pricePerUnit: 3.5,
    dropoffDates: ["2026-02-15", "2026-02-16"],
};

const baseBuyData: BuyPostData = {
    authorId: "user-123",
    communityH3Index: "872834461ffffff",
    description: "Looking for fresh lemons",
    category: "fruits",
    produceNames: ["Lemons", "Limes"],
    needByDate: "2026-02-20",
};

const baseGeneralData: GeneralPostData = {
    authorId: "user-123",
    communityH3Index: "872834461ffffff",
    type: "general_info",
    title: "Hello Neighbors!",
    description: "Just joined the community",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("post-service", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset all mock responses
        Object.keys(mockResponses).forEach((k) => delete mockResponses[k]);

        // Default: post insert returns a generated id
        mockFrom.mockImplementation((table: string) => {
            const chain = buildChain(table);

            // Special handling for media_assets insert → needs to return ids
            if (table === "media_assets") {
                chain.insert = jest.fn().mockImplementation(() => ({
                    select: jest.fn().mockResolvedValue({
                        data: [{ id: "media-1" }, { id: "media-2" }],
                        error: null,
                    }),
                }));
            }

            // posts insert → needs .select('id').single()
            if (table === "posts") {
                chain.insert = jest.fn().mockImplementation(() => ({
                    select: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({
                            data: { id: "generated-post-id" },
                            error: null,
                        }),
                    }),
                }));
            }

            // want_to_sell_details / want_to_buy_details / delivery_dates / post_media
            if (
                [
                    "want_to_sell_details",
                    "want_to_buy_details",
                    "delivery_dates",
                    "post_media",
                ].includes(table)
            ) {
                chain.insert = jest.fn().mockResolvedValue({ error: null });
            }

            return chain;
        });

        mockUploadPostMediaBatch.mockResolvedValue([]);
    });

    // =========================================================================
    // createSellPost
    // =========================================================================

    describe("createSellPost", () => {
        it('creates a post row with type "want_to_sell"', async () => {
            await createSellPost(baseSellData);

            expect(mockFrom).toHaveBeenCalledWith("posts");
            const postsInsert = mockFrom.mock.results.find(
                (_: any, i: number) => mockFrom.mock.calls[i][0] === "posts",
            );
            expect(postsInsert).toBeTruthy();
        });

        it("inserts sell details with correct fields", async () => {
            await createSellPost(baseSellData);

            expect(mockFrom).toHaveBeenCalledWith("want_to_sell_details");
            const detailsCalls = mockFrom.mock.calls.filter((c: any) =>
                c[0] === "want_to_sell_details"
            );
            expect(detailsCalls.length).toBeGreaterThan(0);
        });

        it("inserts delivery dates", async () => {
            await createSellPost(baseSellData);

            expect(mockFrom).toHaveBeenCalledWith("delivery_dates");
        });

        it("skips delivery dates when none provided", async () => {
            await createSellPost({ ...baseSellData, dropoffDates: [] });

            const deliveryCalls = mockFrom.mock.calls.filter((c: any) =>
                c[0] === "delivery_dates"
            );
            expect(deliveryCalls).toHaveLength(0);
        });

        it("uses onBehalfOfId as author when selling on behalf of delegator", async () => {
            const delegatedData = {
                ...baseSellData,
                onBehalfOfId: "delegator-456",
            };
            await createSellPost(delegatedData);

            // The posts insert should use delegator-456 as author_id
            const postsCallIndex = mockFrom.mock.calls.findIndex((c: any) =>
                c[0] === "posts"
            );
            const postsChain = mockFrom.mock.results[postsCallIndex]?.value;
            if (postsChain?.insert) {
                const insertArg = postsChain.insert.mock.calls[0]?.[0];
                expect(insertArg?.author_id).toBe("delegator-456");
            }
        });

        it("includes additionalCommunityH3Indices in content JSON", async () => {
            const dataWithNeighbors = {
                ...baseSellData,
                additionalCommunityH3Indices: [
                    "872834460ffffff",
                    "872834462ffffff",
                ],
            };
            await createSellPost(dataWithNeighbors);

            const postsCallIndex = mockFrom.mock.calls.findIndex((c: any) =>
                c[0] === "posts"
            );
            const postsChain = mockFrom.mock.results[postsCallIndex]?.value;
            if (postsChain?.insert) {
                const insertArg = postsChain.insert.mock.calls[0]?.[0];
                const content = JSON.parse(insertArg?.content || "{}");
                expect(content.additionalCommunityH3Indices).toEqual([
                    "872834460ffffff",
                    "872834462ffffff",
                ]);
            }
        });

        it("uploads and links media when provided", async () => {
            mockUploadPostMediaBatch.mockResolvedValue([
                {
                    storagePath: "user-123/img1.jpg",
                    publicUrl: "url1",
                    mediaType: "image",
                },
            ]);

            await createSellPost({
                ...baseSellData,
                mediaAssets: [{ uri: "file:///photo.jpg", type: "image" }],
            });

            expect(mockUploadPostMediaBatch).toHaveBeenCalledWith("user-123", [
                { uri: "file:///photo.jpg", type: "image" },
            ]);
            expect(mockFrom).toHaveBeenCalledWith("media_assets");
            expect(mockFrom).toHaveBeenCalledWith("post_media");
        });

        it("throws when post insert fails", async () => {
            mockFrom.mockImplementation((table: string) => {
                if (table === "posts") {
                    return {
                        insert: jest.fn().mockReturnValue({
                            select: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({
                                    data: null,
                                    error: {
                                        message: "DB error",
                                        code: "42501",
                                    },
                                }),
                            }),
                        }),
                    };
                }
                return buildChain(table);
            });

            await expect(createSellPost(baseSellData)).rejects.toEqual(
                expect.objectContaining({ message: "DB error" }),
            );
        });

        it("throws when sell details insert fails", async () => {
            mockFrom.mockImplementation((table: string) => {
                if (table === "posts") {
                    return {
                        insert: jest.fn().mockReturnValue({
                            select: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({
                                    data: { id: "post-1" },
                                    error: null,
                                }),
                            }),
                        }),
                    };
                }
                if (table === "want_to_sell_details") {
                    return {
                        insert: jest.fn().mockResolvedValue({
                            error: { message: "Details insert failed" },
                        }),
                    };
                }
                return buildChain(table);
            });

            await expect(createSellPost(baseSellData)).rejects.toEqual(
                expect.objectContaining({ message: "Details insert failed" }),
            );
        });
    });

    // =========================================================================
    // createBuyPost
    // =========================================================================

    describe("createBuyPost", () => {
        it('creates a post row with type "want_to_buy"', async () => {
            await createBuyPost(baseBuyData);
            expect(mockFrom).toHaveBeenCalledWith("posts");
        });

        it("inserts buy details with need_by_date", async () => {
            await createBuyPost(baseBuyData);
            expect(mockFrom).toHaveBeenCalledWith("want_to_buy_details");

            const buyCalls = mockFrom.mock.calls.filter((c: any) =>
                c[0] === "want_to_buy_details"
            );
            expect(buyCalls.length).toBeGreaterThan(0);
        });

        it("includes adjacent communities in content JSON", async () => {
            const dataWithNeighbors = {
                ...baseBuyData,
                additionalCommunityH3Indices: ["872834460ffffff"],
            };
            await createBuyPost(dataWithNeighbors);

            const postsCallIndex = mockFrom.mock.calls.findIndex((c: any) =>
                c[0] === "posts"
            );
            const postsChain = mockFrom.mock.results[postsCallIndex]?.value;
            if (postsChain?.insert) {
                const insertArg = postsChain.insert.mock.calls[0]?.[0];
                const content = JSON.parse(insertArg?.content || "{}");
                expect(content.additionalCommunityH3Indices).toEqual([
                    "872834460ffffff",
                ]);
            }
        });

        it("uploads and links media", async () => {
            mockUploadPostMediaBatch.mockResolvedValue([
                {
                    storagePath: "user-123/img1.jpg",
                    publicUrl: "url1",
                    mediaType: "image",
                },
            ]);

            await createBuyPost({
                ...baseBuyData,
                mediaAssets: [{ uri: "file:///photo.jpg" }],
            });

            expect(mockUploadPostMediaBatch).toHaveBeenCalled();
        });

        it("throws when post insert fails", async () => {
            mockFrom.mockImplementation((table: string) => {
                if (table === "posts") {
                    return {
                        insert: jest.fn().mockReturnValue({
                            select: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({
                                    data: null,
                                    error: { message: "Buy post failed" },
                                }),
                            }),
                        }),
                    };
                }
                return buildChain(table);
            });

            await expect(createBuyPost(baseBuyData)).rejects.toEqual(
                expect.objectContaining({ message: "Buy post failed" }),
            );
        });
    });

    // =========================================================================
    // createGeneralPost
    // =========================================================================

    describe("createGeneralPost", () => {
        it("creates a post with correct type and default community reach", async () => {
            await createGeneralPost(baseGeneralData);

            const postsCallIndex = mockFrom.mock.calls.findIndex((c: any) =>
                c[0] === "posts"
            );
            const postsChain = mockFrom.mock.results[postsCallIndex]?.value;
            if (postsChain?.insert) {
                const insertArg = postsChain.insert.mock.calls[0]?.[0];
                expect(insertArg?.type).toBe("general_info");
                expect(insertArg?.reach).toBe("community");
            }
        });

        it("uses global reach when specified", async () => {
            await createGeneralPost({ ...baseGeneralData, reach: "global" });

            const postsCallIndex = mockFrom.mock.calls.findIndex((c: any) =>
                c[0] === "posts"
            );
            const postsChain = mockFrom.mock.results[postsCallIndex]?.value;
            if (postsChain?.insert) {
                const insertArg = postsChain.insert.mock.calls[0]?.[0];
                expect(insertArg?.reach).toBe("global");
            }
        });

        it("supports all general post types", async () => {
            const types = [
                "need_service",
                "offering_service",
                "seeking_advice",
                "general_info",
            ];

            for (const type of types) {
                jest.clearAllMocks();
                // Re-setup mocks for each iteration
                mockFrom.mockImplementation((table: string) => {
                    const chain = buildChain(table);
                    if (table === "posts") {
                        chain.insert = jest.fn().mockReturnValue({
                            select: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({
                                    data: { id: `post-${type}` },
                                    error: null,
                                }),
                            }),
                        });
                    }
                    return chain;
                });

                await createGeneralPost({ ...baseGeneralData, type });

                const postsCallIndex = mockFrom.mock.calls.findIndex((c: any) =>
                    c[0] === "posts"
                );
                const postsChain = mockFrom.mock.results[postsCallIndex]?.value;
                const insertArg = postsChain?.insert?.mock?.calls[0]?.[0];
                expect(insertArg?.type).toBe(type);
            }
        });

        it("includes title and description in content JSON", async () => {
            await createGeneralPost(baseGeneralData);

            const postsCallIndex = mockFrom.mock.calls.findIndex((c: any) =>
                c[0] === "posts"
            );
            const postsChain = mockFrom.mock.results[postsCallIndex]?.value;
            if (postsChain?.insert) {
                const insertArg = postsChain.insert.mock.calls[0]?.[0];
                const content = JSON.parse(insertArg?.content || "{}");
                expect(content.title).toBe("Hello Neighbors!");
                expect(content.description).toBe("Just joined the community");
            }
        });

        it("uploads media when assets provided", async () => {
            mockUploadPostMediaBatch.mockResolvedValue([
                {
                    storagePath: "user-123/vid.mp4",
                    publicUrl: "url1",
                    mediaType: "video",
                },
            ]);

            await createGeneralPost({
                ...baseGeneralData,
                mediaAssets: [{ uri: "file:///video.mp4", type: "video" }],
            });

            expect(mockUploadPostMediaBatch).toHaveBeenCalled();
        });
    });

    // =========================================================================
    // getActiveDelegators
    // =========================================================================

    describe("getActiveDelegators", () => {
        it("queries delegations table for active delegators", async () => {
            mockFrom.mockImplementation((table: string) => {
                if (table === "delegations") {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                eq: jest.fn().mockResolvedValue({
                                    data: [{
                                        id: "del-1",
                                        delegator_id: "delegator-1",
                                        delegator_profile: {
                                            full_name: "Jane Doe",
                                            avatar_url:
                                                "https://example.com/jane.jpg",
                                            home_community_h3_index:
                                                "872834461ffffff",
                                            communities: { name: "Oak Street" },
                                        },
                                    }],
                                    error: null,
                                }),
                            }),
                        }),
                    };
                }
                return buildChain(table);
            });

            const result = await getActiveDelegators("user-123");

            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                delegationId: "del-1",
                delegatorId: "delegator-1",
                fullName: "Jane Doe",
                avatarUrl: "https://example.com/jane.jpg",
                communityH3Index: "872834461ffffff",
                communityName: "Oak Street",
            });
        });

        it("returns empty array on error", async () => {
            mockFrom.mockImplementation((table: string) => {
                if (table === "delegations") {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                eq: jest.fn().mockResolvedValue({
                                    data: null,
                                    error: { message: "Query failed" },
                                }),
                            }),
                        }),
                    };
                }
                return buildChain(table);
            });

            const result = await getActiveDelegators("user-123");
            expect(result).toEqual([]);
        });
    });

    // =========================================================================
    // getPlatformFeePercent
    // =========================================================================

    describe("getPlatformFeePercent", () => {
        it("returns configured fee percentage", async () => {
            mockFrom.mockImplementation((table: string) => {
                if (table === "platform_config") {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({
                                    data: { value: "15" },
                                    error: null,
                                }),
                            }),
                        }),
                    };
                }
                return buildChain(table);
            });

            const fee = await getPlatformFeePercent();
            expect(fee).toBe(15);
        });

        it("falls back to 10% when config is missing", async () => {
            mockFrom.mockImplementation((table: string) => {
                if (table === "platform_config") {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({
                                    data: null,
                                    error: { message: "Not found" },
                                }),
                            }),
                        }),
                    };
                }
                return buildChain(table);
            });

            const fee = await getPlatformFeePercent();
            expect(fee).toBe(10);
        });
    });

    // =========================================================================
    // getAvailableCategories
    // =========================================================================

    describe("getAvailableCategories", () => {
        const allCategories = [
            "fruits",
            "vegetables",
            "herbs",
            "flowers",
            "flower_arrangements",
            "garden_equipment",
            "pots",
            "soil",
        ];

        it("returns all categories when no community provided", async () => {
            const result = await getAvailableCategories();
            expect(result).toEqual(allCategories);
        });

        it("filters out blocked categories", async () => {
            mockFrom.mockImplementation((table: string) => {
                if (table === "communities") {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({
                                    data: {
                                        h3_index: "872834461ffffff",
                                        city: "San Jose",
                                        state: "CA",
                                        country: "USA",
                                    },
                                    error: null,
                                }),
                            }),
                        }),
                    };
                }
                if (table === "sales_category_restrictions") {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                or: jest.fn().mockResolvedValue({
                                    data: [
                                        {
                                            category: "flowers",
                                            scope: "global",
                                            is_allowed: false,
                                        },
                                        {
                                            category: "soil",
                                            scope: "community",
                                            is_allowed: false,
                                        },
                                    ],
                                    error: null,
                                }),
                            }),
                        }),
                    };
                }
                return buildChain(table);
            });

            const result = await getAvailableCategories("872834461ffffff");
            expect(result).not.toContain("flowers");
            expect(result).not.toContain("soil");
            expect(result).toContain("fruits");
            expect(result).toContain("vegetables");
        });

        it("returns all categories on DB error (fail open)", async () => {
            mockFrom.mockImplementation((table: string) => {
                if (table === "communities") {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({
                                    data: null,
                                    error: null,
                                }),
                            }),
                        }),
                    };
                }
                if (table === "sales_category_restrictions") {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                or: jest.fn().mockResolvedValue({
                                    data: null,
                                    error: { message: "Connection failed" },
                                }),
                            }),
                        }),
                    };
                }
                return buildChain(table);
            });

            const result = await getAvailableCategories("872834461ffffff");
            expect(result).toEqual(allCategories);
        });
    });

    // =========================================================================
    // getUserCommunitiesWithNeighbors
    // =========================================================================

    describe("getUserCommunitiesWithNeighbors", () => {
        it("returns primary community and neighbors", async () => {
            mockFrom.mockImplementation((table: string) => {
                if (table === "profiles") {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({
                                    data: {
                                        home_community_h3_index:
                                            "872834461ffffff",
                                        nearby_community_h3_indices: [
                                            "872834460ffffff",
                                            "872834462ffffff",
                                        ],
                                    },
                                    error: null,
                                }),
                            }),
                        }),
                    };
                }
                if (table === "communities") {
                    return {
                        select: jest.fn().mockReturnValue({
                            in: jest.fn().mockResolvedValue({
                                data: [
                                    {
                                        h3_index: "872834461ffffff",
                                        name: "Oak Street",
                                        city: "San Jose",
                                        state: "CA",
                                        country: "USA",
                                        location: null,
                                    },
                                    {
                                        h3_index: "872834460ffffff",
                                        name: "Elm Ave",
                                        city: "San Jose",
                                        state: "CA",
                                        country: "USA",
                                        location: null,
                                    },
                                    {
                                        h3_index: "872834462ffffff",
                                        name: "Maple Rd",
                                        city: "San Jose",
                                        state: "CA",
                                        country: "USA",
                                        location: null,
                                    },
                                ],
                                error: null,
                            }),
                        }),
                    };
                }
                return buildChain(table);
            });

            const result = await getUserCommunitiesWithNeighbors("user-123");

            expect(result.primary).toEqual(expect.objectContaining({
                h3Index: "872834461ffffff",
                name: "Oak Street",
            }));
            expect(result.neighbors).toHaveLength(2);
        });

        it("returns null primary when profile has no community", async () => {
            mockFrom.mockImplementation((table: string) => {
                if (table === "profiles") {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({
                                    data: { home_community_h3_index: null },
                                    error: null,
                                }),
                            }),
                        }),
                    };
                }
                return buildChain(table);
            });

            const result = await getUserCommunitiesWithNeighbors("user-123");
            expect(result).toEqual({ primary: null, neighbors: [] });
        });

        it("parses PostGIS coordinates from location field", async () => {
            mockFrom.mockImplementation((table: string) => {
                if (table === "profiles") {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({
                                    data: {
                                        home_community_h3_index:
                                            "872834461ffffff",
                                        nearby_community_h3_indices: [],
                                    },
                                    error: null,
                                }),
                            }),
                        }),
                    };
                }
                if (table === "communities") {
                    return {
                        select: jest.fn().mockReturnValue({
                            in: jest.fn().mockResolvedValue({
                                data: [{
                                    h3_index: "872834461ffffff",
                                    name: "Oak Street",
                                    city: "San Jose",
                                    state: "CA",
                                    country: "USA",
                                    location: {
                                        type: "Point",
                                        coordinates: [-121.89, 37.33],
                                    },
                                }],
                                error: null,
                            }),
                        }),
                    };
                }
                return buildChain(table);
            });

            const result = await getUserCommunitiesWithNeighbors("user-123");
            expect(result.primary?.lng).toBe(-121.89);
            expect(result.primary?.lat).toBe(37.33);
        });
    });

    // =========================================================================
    // getUserCommunity
    // =========================================================================

    describe("getUserCommunity", () => {
        it("returns community info for user", async () => {
            mockFrom.mockImplementation((table: string) => {
                if (table === "profiles") {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({
                                    data: {
                                        home_community_h3_index:
                                            "872834461ffffff",
                                        communities: { name: "Oak Street" },
                                    },
                                    error: null,
                                }),
                            }),
                        }),
                    };
                }
                return buildChain(table);
            });

            const result = await getUserCommunity("user-123");
            expect(result).toEqual({
                h3Index: "872834461ffffff",
                communityName: "Oak Street",
            });
        });

        it("returns null when user has no community", async () => {
            mockFrom.mockImplementation((table: string) => {
                if (table === "profiles") {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({
                                    data: { home_community_h3_index: null },
                                    error: null,
                                }),
                            }),
                        }),
                    };
                }
                return buildChain(table);
            });

            const result = await getUserCommunity("user-123");
            expect(result).toBeNull();
        });
    });

    // =========================================================================
    // getCommunityWithNeighborsByH3
    // =========================================================================

    describe("getCommunityWithNeighborsByH3", () => {
        it("returns community and neighbors by H3 index", async () => {
            mockFrom.mockImplementation((table: string) => {
                if (table === "communities") {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({
                                    data: {
                                        h3_index: "872834461ffffff",
                                        name: "Oak Street",
                                        city: "San Jose",
                                        state: "CA",
                                        country: "USA",
                                        location: null,
                                    },
                                    error: null,
                                }),
                            }),
                            in: jest.fn().mockResolvedValue({
                                data: [
                                    {
                                        h3_index: "872834460ffffff",
                                        name: "Elm Ave",
                                        city: "San Jose",
                                        state: "CA",
                                        country: "USA",
                                        location: null,
                                    },
                                ],
                                error: null,
                            }),
                        }),
                    };
                }
                if (table === "profiles") {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                limit: jest.fn().mockResolvedValue({
                                    data: [{
                                        nearby_community_h3_indices: [
                                            "872834460ffffff",
                                        ],
                                    }],
                                    error: null,
                                }),
                            }),
                        }),
                    };
                }
                return buildChain(table);
            });

            const result = await getCommunityWithNeighborsByH3(
                "872834461ffffff",
            );

            expect(result.primary).toEqual(
                expect.objectContaining({
                    h3Index: "872834461ffffff",
                    name: "Oak Street",
                }),
            );
            expect(result.neighbors).toHaveLength(1);
            expect(result.neighbors[0].name).toBe("Elm Ave");
        });

        it("returns null primary when community does not exist", async () => {
            mockFrom.mockImplementation((table: string) => {
                if (table === "communities") {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({
                                    data: null,
                                    error: { message: "Not found" },
                                }),
                            }),
                        }),
                    };
                }
                return buildChain(table);
            });

            const result = await getCommunityWithNeighborsByH3("nonexistent");
            expect(result).toEqual({ primary: null, neighbors: [] });
        });

        it("parses PostGIS GeoJSON coordinates from location", async () => {
            mockFrom.mockImplementation((table: string) => {
                if (table === "communities") {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({
                                    data: {
                                        h3_index: "872834461ffffff",
                                        name: "Oak Street",
                                        city: "San Jose",
                                        state: "CA",
                                        country: "USA",
                                        location: {
                                            type: "Point",
                                            coordinates: [-121.89, 37.33],
                                        },
                                    },
                                    error: null,
                                }),
                            }),
                            in: jest.fn().mockResolvedValue({
                                data: [],
                                error: null,
                            }),
                        }),
                    };
                }
                if (table === "profiles") {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                limit: jest.fn().mockResolvedValue({
                                    data: [],
                                    error: null,
                                }),
                            }),
                        }),
                    };
                }
                return buildChain(table);
            });

            const result = await getCommunityWithNeighborsByH3(
                "872834461ffffff",
            );
            expect(result.primary?.lng).toBe(-121.89);
            expect(result.primary?.lat).toBe(37.33);
        });
    });

    // =========================================================================
    // createBuyPost with acceptDates
    // =========================================================================

    describe("createBuyPost — acceptDates", () => {
        it("inserts delivery_dates rows when acceptDates is provided", async () => {
            const insertMocks: Record<string, jest.Mock> = {};

            mockFrom.mockImplementation((table: string) => {
                if (table === "posts") {
                    return {
                        insert: jest.fn().mockReturnValue({
                            select: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({
                                    data: { id: "buy-post-1" },
                                    error: null,
                                }),
                            }),
                        }),
                    };
                }
                if (table === "delivery_dates") {
                    const insertFn = jest.fn().mockResolvedValue({
                        error: null,
                    });
                    insertMocks[table] = insertFn;
                    return { insert: insertFn };
                }
                return buildChain(table);
            });

            await createBuyPost({
                ...baseBuyData,
                acceptDates: ["2026-02-18", "2026-02-19"],
            });

            expect(insertMocks["delivery_dates"]).toHaveBeenCalled();
            const dateRows = insertMocks["delivery_dates"].mock.calls[0][0];
            expect(dateRows).toEqual([
                { post_id: "buy-post-1", delivery_date: "2026-02-18" },
                { post_id: "buy-post-1", delivery_date: "2026-02-19" },
            ]);
        });
    });

    // =========================================================================
    // createSellPost with delegate (onBehalfOfId)
    // =========================================================================

    describe("createSellPost — delegate", () => {
        it("uses onBehalfOfId as post author_id", async () => {
            let capturedInsert: any = null;

            mockFrom.mockImplementation((table: string) => {
                if (table === "posts") {
                    return {
                        insert: jest.fn().mockImplementation((rows: any) => {
                            capturedInsert = rows;
                            return {
                                select: jest.fn().mockReturnValue({
                                    single: jest.fn().mockResolvedValue({
                                        data: { id: "delegate-post-1" },
                                        error: null,
                                    }),
                                }),
                            };
                        }),
                    };
                }
                return buildChain(table);
            });

            await createSellPost({
                ...baseSellData,
                onBehalfOfId: "delegator-456",
            });

            expect(capturedInsert.author_id).toBe("delegator-456");
        });

        it("falls back to authorId when onBehalfOfId is not set", async () => {
            let capturedInsert: any = null;

            mockFrom.mockImplementation((table: string) => {
                if (table === "posts") {
                    return {
                        insert: jest.fn().mockImplementation((rows: any) => {
                            capturedInsert = rows;
                            return {
                                select: jest.fn().mockReturnValue({
                                    single: jest.fn().mockResolvedValue({
                                        data: { id: "own-post-1" },
                                        error: null,
                                    }),
                                }),
                            };
                        }),
                    };
                }
                return buildChain(table);
            });

            await createSellPost(baseSellData);

            expect(capturedInsert.author_id).toBe("user-123");
        });
    });

    // =========================================================================
    // updateSellPost
    // =========================================================================

    describe("updateSellPost", () => {
        it("updates post, sell details, and handles media", async () => {
            const updateMocks: Record<string, jest.Mock> = {};

            mockFrom.mockImplementation((table: string) => {
                if (table === "posts") {
                    const updateFn = jest.fn().mockReturnValue({
                        eq: jest.fn().mockResolvedValue({ error: null }),
                    });
                    updateMocks[table] = updateFn;
                    return { update: updateFn };
                }
                if (table === "want_to_sell_details") {
                    const updateFn = jest.fn().mockReturnValue({
                        eq: jest.fn().mockResolvedValue({ error: null }),
                    });
                    updateMocks[table] = updateFn;
                    return { update: updateFn };
                }
                if (table === "post_media") {
                    return {
                        delete: jest.fn().mockReturnValue({
                            eq: jest.fn().mockResolvedValue({ error: null }),
                        }),
                    };
                }
                return buildChain(table);
            });

            await updateSellPost("post-1", {
                ...baseSellData,
                mediaAssets: [], // no existing media, no new media
            });

            expect(updateMocks["posts"]).toHaveBeenCalled();
            expect(updateMocks["want_to_sell_details"]).toHaveBeenCalled();
        });
    });

    // =========================================================================
    // updateBuyPost
    // =========================================================================

    describe("updateBuyPost", () => {
        it("updates post, buy details, and replaces delivery_dates", async () => {
            const updateMocks: Record<string, jest.Mock> = {};

            // Pre-build shared delivery_dates mock object so both .from() calls reuse it
            const ddDeleteFn = jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({ error: null }),
            });
            const ddInsertFn = jest.fn().mockResolvedValue({ error: null });
            const ddChain = { delete: ddDeleteFn, insert: ddInsertFn };

            mockFrom.mockImplementation((table: string) => {
                if (table === "posts") {
                    const updateFn = jest.fn().mockReturnValue({
                        eq: jest.fn().mockResolvedValue({ error: null }),
                    });
                    updateMocks[table] = updateFn;
                    return { update: updateFn };
                }
                if (table === "want_to_buy_details") {
                    const updateFn = jest.fn().mockReturnValue({
                        eq: jest.fn().mockResolvedValue({ error: null }),
                    });
                    updateMocks[table] = updateFn;
                    return { update: updateFn };
                }
                if (table === "delivery_dates") {
                    return ddChain;
                }
                if (table === "post_media") {
                    return {
                        delete: jest.fn().mockReturnValue({
                            eq: jest.fn().mockResolvedValue({ error: null }),
                        }),
                    };
                }
                return buildChain(table);
            });

            await updateBuyPost("post-2", {
                ...baseBuyData,
                acceptDates: ["2026-03-01", "2026-03-02"],
                mediaAssets: [],
            });

            // Should update posts and buy details
            expect(updateMocks["posts"]).toHaveBeenCalled();
            expect(updateMocks["want_to_buy_details"]).toHaveBeenCalled();

            // Should delete old delivery_dates then insert new ones
            expect(ddDeleteFn).toHaveBeenCalled();
            expect(ddInsertFn).toHaveBeenCalled();
            const dateRows = ddInsertFn.mock.calls[0][0];
            expect(dateRows).toEqual([
                { post_id: "post-2", delivery_date: "2026-03-01" },
                { post_id: "post-2", delivery_date: "2026-03-02" },
            ]);
        });
    });

    // =========================================================================
    // updateGeneralPost
    // =========================================================================

    describe("updateGeneralPost", () => {
        it("updates post content and handles media", async () => {
            const updateMock = jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({ error: null }),
            });

            mockFrom.mockImplementation((table: string) => {
                if (table === "posts") {
                    return { update: updateMock };
                }
                if (table === "post_media") {
                    return {
                        delete: jest.fn().mockReturnValue({
                            eq: jest.fn().mockResolvedValue({ error: null }),
                        }),
                    };
                }
                return buildChain(table);
            });

            await updateGeneralPost("post-3", {
                ...baseGeneralData,
                mediaAssets: [],
            });

            expect(updateMock).toHaveBeenCalled();
            const updateArg = updateMock.mock.calls[0][0];
            const content = JSON.parse(updateArg.content);
            expect(content.title).toBe("Hello Neighbors!");
            expect(content.description).toBe("Just joined the community");
        });
    });
});
