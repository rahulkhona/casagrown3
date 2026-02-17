/**
 * Chat Service Tests
 *
 * Comprehensive unit tests for all chat-service.ts functions:
 * - getOrCreateConversation
 * - getConversationWithDetails
 * - getUserConversations (incl. unread sorting + dedup)
 * - getConversationMessages
 * - sendMessage
 * - markMessagesAsDelivered
 * - markMessagesAsRead
 * - getUnreadChatCount
 * - createPresenceChannel (broadcast-based typing + presence)
 */

import {
    createPresenceChannel,
    getConversationMessages,
    getConversationWithDetails,
    getOrCreateConversation,
    getUnreadChatCount,
    getUserConversations,
    markMessagesAsDelivered,
    markMessagesAsRead,
    sendMessage,
} from "./chat-service";

// =============================================================================
// Mock setup — mirrors existing pattern from feed-service.test.ts
// =============================================================================

const mockFrom = jest.fn();
const mockStorage = {
    from: jest.fn().mockReturnValue({
        getPublicUrl: jest.fn().mockReturnValue({
            data: { publicUrl: "https://storage.test/chat-media/photo.jpg" },
        }),
    }),
};

// Channel mock for Realtime (presence + broadcast)
const mockChannelSend = jest.fn();
const mockChannelTrack = jest.fn().mockResolvedValue("ok");
const mockChannelUntrack = jest.fn();
let mockChannelListeners: Map<string, Function> = new Map();
let mockChannelSubscribeCallback: Function | null = null;

const mockChannel = {
    on: jest.fn().mockImplementation(function (
        this: any,
        type: string,
        filter: any,
        callback: Function,
    ) {
        const key = `${type}:${filter.event || ""}`;
        mockChannelListeners.set(key, callback);
        return mockChannel;
    }),
    subscribe: jest.fn().mockImplementation((callback?: Function) => {
        mockChannelSubscribeCallback = callback || null;
        // Auto-call with SUBSCRIBED status
        if (callback) callback("SUBSCRIBED");
        return mockChannel;
    }),
    send: mockChannelSend,
    track: mockChannelTrack,
    untrack: mockChannelUntrack,
    presenceState: jest.fn().mockReturnValue({}),
};

const mockRemoveChannel = jest.fn();

jest.mock("../auth/auth-hook", () => ({
    supabase: {
        from: (...args: any[]) => mockFrom(...args),
        storage: {
            from: (...args: any[]) => mockStorage.from(...args),
        },
        channel: (...args: any[]) => mockChannel,
        removeChannel: (...args: any[]) => mockRemoveChannel(...args),
    },
}));

beforeEach(() => {
    jest.clearAllMocks();
    mockChannelListeners = new Map();
    mockChannelSubscribeCallback = null;
    // Re-setup mockChannel methods after clearAllMocks
    mockChannel.on.mockImplementation(function (
        this: any,
        type: string,
        filter: any,
        callback: Function,
    ) {
        const key = `${type}:${filter.event || ""}`;
        mockChannelListeners.set(key, callback);
        return mockChannel;
    });
    mockChannel.subscribe.mockImplementation((callback?: Function) => {
        mockChannelSubscribeCallback = callback || null;
        if (callback) callback("SUBSCRIBED");
        return mockChannel;
    });
    mockChannelTrack.mockResolvedValue("ok");
    mockChannel.presenceState.mockReturnValue({});
});

// =============================================================================
// Helpers for building chainable Supabase mock responses
// =============================================================================

/**
 * Build a chainable mock that resolves to { data, error } at the end of any
 * method chain. Every method returns the same object so calls like
 * `.eq().eq().maybeSingle()` all resolve correctly.
 */
function chainable(resolvedValue: { data: any; error: any }) {
    const self: Record<string, jest.Mock> = {};
    const handler: ProxyHandler<any> = {
        get(_target, prop) {
            if (typeof prop === "string") {
                if (!self[prop]) {
                    self[prop] = jest.fn().mockReturnValue(
                        new Proxy({}, handler),
                    );
                }
                // Terminal methods resolve the value
                if (
                    [
                        "maybeSingle",
                        "single",
                        "then",
                    ].includes(prop)
                ) {
                    if (prop === "then") {
                        // Make the object thenable (awaitable)
                        return (
                            resolve: (v: any) => void,
                            reject: (e: any) => void,
                        ) => {
                            if (resolvedValue.error && !resolvedValue.data) {
                                return resolve(resolvedValue);
                            }
                            return resolve(resolvedValue);
                        };
                    }
                    self[prop] = jest.fn().mockResolvedValue(resolvedValue);
                }
                return self[prop];
            }
        },
    };
    return new Proxy({}, handler);
}

/**
 * Simpler helper: a chainable mock where every method returns the same proxy
 * and calling `await` on it resolves to the given value.
 */
function mockChain(resolvedValue: { data: any; error: any }) {
    const methods = [
        "select",
        "insert",
        "update",
        "delete",
        "eq",
        "neq",
        "or",
        "in",
        "is",
        "order",
        "maybeSingle",
        "single",
    ];
    const obj: any = {};
    for (const m of methods) {
        obj[m] = jest.fn().mockReturnValue(obj);
    }
    // Make it thenable
    obj.then = (resolve: any) => resolve(resolvedValue);
    return obj;
}

// =============================================================================
// getOrCreateConversation
// =============================================================================

describe("getOrCreateConversation", () => {
    it("returns existing conversation ID when conversation exists", async () => {
        const chain = mockChain({ data: { id: "conv-existing" }, error: null });
        mockFrom.mockReturnValue(chain);

        const id = await getOrCreateConversation(
            "post-1",
            "buyer-1",
            "seller-1",
        );
        expect(id).toBe("conv-existing");
        expect(mockFrom).toHaveBeenCalledWith("conversations");
    });

    it("returns reversed conversation when roles are swapped", async () => {
        let callCount = 0;
        mockFrom.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
                // First query: no match
                return mockChain({ data: null, error: null });
            }
            // Second query: reversed match
            return mockChain({ data: { id: "conv-reversed" }, error: null });
        });

        const id = await getOrCreateConversation(
            "post-1",
            "buyer-1",
            "seller-1",
        );
        expect(id).toBe("conv-reversed");
    });

    it("creates new conversation when none exists", async () => {
        let callCount = 0;
        mockFrom.mockImplementation(() => {
            callCount++;
            if (callCount <= 2) {
                // First two queries: no existing conversation
                return mockChain({ data: null, error: null });
            }
            // Third call: insert succeeds
            return mockChain({ data: { id: "conv-new" }, error: null });
        });

        const id = await getOrCreateConversation(
            "post-1",
            "buyer-1",
            "seller-1",
        );
        expect(id).toBe("conv-new");
    });

    it("handles unique constraint violation by retrying", async () => {
        let callCount = 0;
        mockFrom.mockImplementation(() => {
            callCount++;
            if (callCount <= 2) {
                // No existing conversation
                return mockChain({ data: null, error: null });
            }
            if (callCount === 3) {
                // Insert fails with unique constraint
                return mockChain({
                    data: null,
                    error: { code: "23505", message: "Unique violation" },
                });
            }
            // Retry fetch succeeds
            return mockChain({ data: { id: "conv-retry" }, error: null });
        });

        const id = await getOrCreateConversation(
            "post-1",
            "buyer-1",
            "seller-1",
        );
        expect(id).toBe("conv-retry");
    });

    it("throws on non-unique-constraint insert error", async () => {
        let callCount = 0;
        mockFrom.mockImplementation(() => {
            callCount++;
            if (callCount <= 2) {
                return mockChain({ data: null, error: null });
            }
            return mockChain({
                data: null,
                error: { code: "42P01", message: "Table not found" },
            });
        });

        await expect(
            getOrCreateConversation("post-1", "buyer-1", "seller-1"),
        ).rejects.toEqual({ code: "42P01", message: "Table not found" });
    });
});

// =============================================================================
// getUserConversations
// =============================================================================

describe("getUserConversations", () => {
    const userId = "user-me";

    it("returns empty array when no conversations", async () => {
        mockFrom.mockReturnValue(
            mockChain({ data: [], error: null }),
        );

        const result = await getUserConversations(userId);
        expect(result).toEqual([]);
    });

    it("throws on database error", async () => {
        mockFrom.mockReturnValue(
            mockChain({ data: null, error: { message: "DB down" } }),
        );

        await expect(getUserConversations(userId)).rejects.toEqual({
            message: "DB down",
        });
    });

    it("returns sorted conversations with unread first", async () => {
        let callCount = 0;
        mockFrom.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
                // Conversations query
                return mockChain({
                    data: [
                        {
                            id: "conv-1",
                            post_id: "post-1",
                            buyer_id: userId,
                            seller_id: "user-other-1",
                            created_at: "2026-02-10T00:00:00Z",
                            post: { type: "want_to_sell", content: "Tomatoes" },
                            buyer: {
                                id: userId,
                                full_name: "Me",
                                avatar_url: null,
                            },
                            seller: {
                                id: "user-other-1",
                                full_name: "Alice",
                                avatar_url: "https://avatar.test/alice.jpg",
                            },
                        },
                        {
                            id: "conv-2",
                            post_id: "post-2",
                            buyer_id: userId,
                            seller_id: "user-other-2",
                            created_at: "2026-02-11T00:00:00Z",
                            post: {
                                type: "want_to_buy",
                                content: "Looking for herbs",
                            },
                            buyer: {
                                id: userId,
                                full_name: "Me",
                                avatar_url: null,
                            },
                            seller: {
                                id: "user-other-2",
                                full_name: "Bob",
                                avatar_url: null,
                            },
                        },
                    ],
                    error: null,
                });
            }
            if (callCount === 2) {
                // Last messages query
                return mockChain({
                    data: [
                        {
                            conversation_id: "conv-2",
                            content: "Sure, I have herbs",
                            type: "text",
                            created_at: "2026-02-12T10:00:00Z",
                        },
                        {
                            conversation_id: "conv-1",
                            content: "How much?",
                            type: "text",
                            created_at: "2026-02-12T08:00:00Z",
                        },
                    ],
                    error: null,
                });
            }
            if (callCount === 3) {
                // Unread messages query — conv-1 has 2 unread, conv-2 has 0
                return mockChain({
                    data: [
                        {
                            conversation_id: "conv-1",
                            id: "msg-unread-1",
                        },
                        {
                            conversation_id: "conv-1",
                            id: "msg-unread-2",
                        },
                    ],
                    error: null,
                });
            }
            return mockChain({ data: [], error: null });
        });

        const result = await getUserConversations(userId);

        expect(result).toHaveLength(2);
        // conv-1 should be first (has unread), conv-2 second (no unread)
        expect(result[0].id).toBe("conv-1");
        expect(result[0].unread_count).toBe(2);
        expect(result[0].other_user_name).toBe("Alice");

        expect(result[1].id).toBe("conv-2");
        expect(result[1].unread_count).toBe(0);
        expect(result[1].other_user_name).toBe("Bob");
    });

    it("deduplicates conversations by (post_id, other_user_id)", async () => {
        let callCount = 0;
        mockFrom.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
                // Two conversations for same post+user pair (reversed roles)
                return mockChain({
                    data: [
                        {
                            id: "conv-a",
                            post_id: "post-1",
                            buyer_id: userId,
                            seller_id: "user-alice",
                            created_at: "2026-02-10T00:00:00Z",
                            post: {
                                type: "want_to_sell",
                                content: "Tomatoes",
                            },
                            buyer: {
                                id: userId,
                                full_name: "Me",
                                avatar_url: null,
                            },
                            seller: {
                                id: "user-alice",
                                full_name: "Alice",
                                avatar_url: null,
                            },
                        },
                        {
                            id: "conv-b",
                            post_id: "post-1",
                            buyer_id: "user-alice",
                            seller_id: userId,
                            created_at: "2026-02-10T01:00:00Z",
                            post: {
                                type: "want_to_sell",
                                content: "Tomatoes",
                            },
                            buyer: {
                                id: "user-alice",
                                full_name: "Alice",
                                avatar_url: null,
                            },
                            seller: {
                                id: userId,
                                full_name: "Me",
                                avatar_url: null,
                            },
                        },
                    ],
                    error: null,
                });
            }
            if (callCount === 2) {
                // Only conv-b has messages
                return mockChain({
                    data: [
                        {
                            conversation_id: "conv-b",
                            content: "Hello!",
                            type: "text",
                            created_at: "2026-02-11T00:00:00Z",
                        },
                    ],
                    error: null,
                });
            }
            return mockChain({ data: [], error: null });
        });

        const result = await getUserConversations(userId);

        // Should deduplicate to 1 entry, keeping conv-b (has messages)
        expect(result).toHaveLength(1);
    });
});

// =============================================================================
// getConversationMessages
// =============================================================================

describe("getConversationMessages", () => {
    it("returns mapped messages with media URLs", async () => {
        mockFrom.mockReturnValue(
            mockChain({
                data: [
                    {
                        id: "msg-1",
                        conversation_id: "conv-1",
                        sender_id: "user-1",
                        content: "Check this out",
                        media_id: "media-1",
                        type: "mixed",
                        metadata: {},
                        created_at: "2026-02-10T00:00:00Z",
                        delivered_at: "2026-02-10T00:01:00Z",
                        read_at: null,
                        sender: {
                            full_name: "Alice",
                            avatar_url: "https://avatar.test/alice.jpg",
                        },
                        media: {
                            storage_path: "uploads/photo.jpg",
                            media_type: "image",
                        },
                    },
                    {
                        id: "msg-2",
                        conversation_id: "conv-1",
                        sender_id: "user-2",
                        content: "Cool!",
                        media_id: null,
                        type: "text",
                        metadata: {},
                        created_at: "2026-02-10T00:05:00Z",
                        delivered_at: null,
                        read_at: null,
                        sender: {
                            full_name: "Bob",
                            avatar_url: null,
                        },
                        media: null,
                    },
                ],
                error: null,
            }),
        );

        const messages = await getConversationMessages("conv-1");

        expect(messages).toHaveLength(2);

        // First message has media
        expect(messages[0].id).toBe("msg-1");
        expect(messages[0].sender_name).toBe("Alice");
        expect(messages[0].media_url).toBe(
            "https://storage.test/chat-media/photo.jpg",
        );
        expect(messages[0].media_type).toBe("image");
        expect(messages[0].delivered_at).toBe("2026-02-10T00:01:00Z");

        // Second message is text-only
        expect(messages[1].id).toBe("msg-2");
        expect(messages[1].sender_name).toBe("Bob");
        expect(messages[1].media_url).toBeNull();
        expect(messages[1].content).toBe("Cool!");
    });

    it("throws on error", async () => {
        mockFrom.mockReturnValue(
            mockChain({
                data: null,
                error: { message: "Query failed" },
            }),
        );

        await expect(getConversationMessages("conv-1")).rejects.toEqual({
            message: "Query failed",
        });
    });

    it("returns empty array when no messages", async () => {
        mockFrom.mockReturnValue(
            mockChain({ data: [], error: null }),
        );

        const messages = await getConversationMessages("conv-1");
        expect(messages).toHaveLength(0);
    });
});

// =============================================================================
// sendMessage
// =============================================================================

describe("sendMessage", () => {
    it("sends text message and returns ChatMessage", async () => {
        mockFrom.mockReturnValue(
            mockChain({
                data: {
                    id: "msg-new",
                    created_at: "2026-02-12T12:00:00Z",
                },
                error: null,
            }),
        );

        const msg = await sendMessage(
            "conv-1",
            "user-1",
            "Hello!",
            "text",
        );

        expect(msg.id).toBe("msg-new");
        expect(msg.conversation_id).toBe("conv-1");
        expect(msg.sender_id).toBe("user-1");
        expect(msg.content).toBe("Hello!");
        expect(msg.type).toBe("text");
        expect(msg.delivered_at).toBeNull();
        expect(msg.read_at).toBeNull();
    });

    it("sends media message with mediaId", async () => {
        mockFrom.mockReturnValue(
            mockChain({
                data: {
                    id: "msg-media",
                    created_at: "2026-02-12T12:00:00Z",
                },
                error: null,
            }),
        );

        const msg = await sendMessage(
            "conv-1",
            "user-1",
            null,
            "media",
            "media-123",
        );

        expect(msg.id).toBe("msg-media");
        expect(msg.type).toBe("media");
        expect(msg.content).toBeNull();
        expect(mockFrom).toHaveBeenCalledWith("chat_messages");
    });

    it("sends mixed message with content + media + metadata", async () => {
        mockFrom.mockReturnValue(
            mockChain({
                data: {
                    id: "msg-mixed",
                    created_at: "2026-02-12T12:00:00Z",
                },
                error: null,
            }),
        );

        const meta = { location: "40.7,-74.0" };
        const msg = await sendMessage(
            "conv-1",
            "user-1",
            "Here's the spot",
            "mixed",
            "media-456",
            meta,
        );

        expect(msg.type).toBe("mixed");
        expect(msg.content).toBe("Here's the spot");
        expect(msg.metadata).toEqual(meta);
    });

    it("throws on insert error", async () => {
        mockFrom.mockReturnValue(
            mockChain({
                data: null,
                error: { message: "Insert failed" },
            }),
        );

        await expect(
            sendMessage("conv-1", "user-1", "Hello", "text"),
        ).rejects.toEqual({ message: "Insert failed" });
    });
});

// =============================================================================
// markMessagesAsDelivered
// =============================================================================

describe("markMessagesAsDelivered", () => {
    it("updates undelivered messages from opposite user", async () => {
        const chain = mockChain({ data: null, error: null });
        mockFrom.mockReturnValue(chain);

        await markMessagesAsDelivered("conv-1", "user-me");

        expect(mockFrom).toHaveBeenCalledWith("chat_messages");
        expect(chain.update).toHaveBeenCalled();
        expect(chain.eq).toHaveBeenCalledWith(
            "conversation_id",
            "conv-1",
        );
        expect(chain.neq).toHaveBeenCalledWith("sender_id", "user-me");
        expect(chain.is).toHaveBeenCalledWith("delivered_at", null);
    });

    it("does not throw on error (logs only)", async () => {
        const consoleSpy = jest
            .spyOn(console, "error")
            .mockImplementation();

        mockFrom.mockReturnValue(
            mockChain({
                data: null,
                error: { message: "Update failed" },
            }),
        );

        // Should NOT throw
        await markMessagesAsDelivered("conv-1", "user-me");
        expect(consoleSpy).toHaveBeenCalled();

        consoleSpy.mockRestore();
    });
});

// =============================================================================
// markMessagesAsRead
// =============================================================================

describe("markMessagesAsRead", () => {
    it("updates unread messages from opposite user with both timestamps", async () => {
        const chain = mockChain({ data: null, error: null });
        mockFrom.mockReturnValue(chain);

        await markMessagesAsRead("conv-1", "user-me");

        expect(mockFrom).toHaveBeenCalledWith("chat_messages");
        expect(chain.update).toHaveBeenCalled();
        // Verify update payload includes both delivered_at and read_at
        const updatePayload = chain.update.mock.calls[0][0];
        expect(updatePayload).toHaveProperty("delivered_at");
        expect(updatePayload).toHaveProperty("read_at");
        expect(chain.is).toHaveBeenCalledWith("read_at", null);
    });

    it("does not throw on error (logs only)", async () => {
        const consoleSpy = jest
            .spyOn(console, "error")
            .mockImplementation();

        mockFrom.mockReturnValue(
            mockChain({
                data: null,
                error: { message: "Update failed" },
            }),
        );

        await markMessagesAsRead("conv-1", "user-me");
        expect(consoleSpy).toHaveBeenCalled();

        consoleSpy.mockRestore();
    });
});

// =============================================================================
// getUnreadChatCount
// =============================================================================

describe("getUnreadChatCount", () => {
    it("returns 0 when user has no conversations", async () => {
        mockFrom.mockReturnValue(
            mockChain({ data: [], error: null }),
        );

        const count = await getUnreadChatCount("user-1");
        expect(count).toBe(0);
    });

    it("returns 0 when all messages are read", async () => {
        let callCount = 0;
        mockFrom.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
                // Conversations
                return mockChain({
                    data: [{ id: "conv-1" }, { id: "conv-2" }],
                    error: null,
                });
            }
            // Unread messages — none
            return mockChain({ data: [], error: null });
        });

        const count = await getUnreadChatCount("user-1");
        expect(count).toBe(0);
    });

    it("counts distinct conversations with unread messages", async () => {
        let callCount = 0;
        mockFrom.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
                return mockChain({
                    data: [
                        { id: "conv-1" },
                        { id: "conv-2" },
                        { id: "conv-3" },
                    ],
                    error: null,
                });
            }
            // 3 unread messages spread across 2 conversations
            return mockChain({
                data: [
                    { conversation_id: "conv-1" },
                    { conversation_id: "conv-1" },
                    { conversation_id: "conv-3" },
                ],
                error: null,
            });
        });

        const count = await getUnreadChatCount("user-1");
        // 2 distinct conversations have unread messages
        expect(count).toBe(2);
    });

    it("returns 0 when unread query returns null", async () => {
        let callCount = 0;
        mockFrom.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
                return mockChain({
                    data: [{ id: "conv-1" }],
                    error: null,
                });
            }
            return mockChain({ data: null, error: null });
        });

        const count = await getUnreadChatCount("user-1");
        expect(count).toBe(0);
    });
});

// =============================================================================
// createPresenceChannel
// =============================================================================

describe("createPresenceChannel", () => {
    const conversationId = "conv-test";
    const userId = "user-me";
    const otherUserId = "user-other";
    // Keep track of created channels for cleanup (prevents setInterval from hanging Jest)
    const channels: Array<{ destroy: () => void }> = [];

    const createAndTrack = (
        cId: string,
        uId: string,
        cb: jest.Mock,
    ) => {
        const result = createPresenceChannel(cId, uId, cb);
        channels.push(result);
        return result;
    };

    afterEach(() => {
        for (const ch of channels) {
            try {
                ch.destroy();
            } catch (_) { /* ignore */ }
        }
        channels.length = 0;
    });

    it("creates channel and returns expected API shape", () => {
        const onPresenceChange = jest.fn();
        const result = createAndTrack(
            conversationId,
            userId,
            onPresenceChange,
        );

        expect(result).toHaveProperty("channel");
        expect(result).toHaveProperty("setTyping");
        expect(result).toHaveProperty("destroy");
        expect(typeof result.setTyping).toBe("function");
        expect(typeof result.destroy).toBe("function");
    });

    it("tracks online status on subscribe", () => {
        const onPresenceChange = jest.fn();
        createAndTrack(conversationId, userId, onPresenceChange);

        // subscribe callback fires automatically with "SUBSCRIBED"
        expect(mockChannelTrack).toHaveBeenCalledWith({ online: true });
    });

    it("registers presence and broadcast listeners", () => {
        const onPresenceChange = jest.fn();
        createAndTrack(conversationId, userId, onPresenceChange);

        // Should register: presence:sync, presence:join, presence:leave, broadcast:heartbeat, broadcast:typing
        expect(mockChannel.on).toHaveBeenCalledTimes(5);
        expect(mockChannelListeners.has("presence:sync")).toBe(true);
        expect(mockChannelListeners.has("presence:join")).toBe(true);
        expect(mockChannelListeners.has("presence:leave")).toBe(true);
        expect(mockChannelListeners.has("broadcast:heartbeat")).toBe(true);
        expect(mockChannelListeners.has("broadcast:typing")).toBe(true);
    });

    it("sends typing broadcast via channel.send()", () => {
        const onPresenceChange = jest.fn();
        const { setTyping } = createAndTrack(
            conversationId,
            userId,
            onPresenceChange,
        );

        setTyping(true);

        expect(mockChannelSend).toHaveBeenCalledWith({
            type: "broadcast",
            event: "typing",
            payload: { user_id: userId, is_typing: true },
        });
    });

    it("sends stop-typing broadcast", () => {
        const onPresenceChange = jest.fn();
        const { setTyping } = createAndTrack(
            conversationId,
            userId,
            onPresenceChange,
        );

        setTyping(false);

        expect(mockChannelSend).toHaveBeenCalledWith({
            type: "broadcast",
            event: "typing",
            payload: { user_id: userId, is_typing: false },
        });
    });

    it("calls onPresenceChange when receiving broadcast typing from other user", () => {
        const onPresenceChange = jest.fn();
        createAndTrack(conversationId, userId, onPresenceChange);

        // Simulate broadcast typing event from other user
        const broadcastHandler = mockChannelListeners.get("broadcast:typing");
        broadcastHandler!({
            payload: { user_id: otherUserId, is_typing: true },
        });

        expect(onPresenceChange).toHaveBeenCalledWith({
            online: false, // not tracked via presence yet
            typing: true,
        });
    });

    it("ignores own typing broadcasts", () => {
        const onPresenceChange = jest.fn();
        createAndTrack(conversationId, userId, onPresenceChange);

        // Clear any calls from subscribe/init
        onPresenceChange.mockClear();

        // Simulate broadcast typing event from self
        const broadcastHandler = mockChannelListeners.get("broadcast:typing");
        broadcastHandler!({
            payload: { user_id: userId, is_typing: true },
        });

        // Should NOT have called onPresenceChange
        expect(onPresenceChange).not.toHaveBeenCalled();
    });

    it("reports other user as online on presence join", () => {
        const onPresenceChange = jest.fn();
        createAndTrack(conversationId, userId, onPresenceChange);
        onPresenceChange.mockClear();

        const joinHandler = mockChannelListeners.get("presence:join");
        joinHandler!({ key: otherUserId });

        expect(onPresenceChange).toHaveBeenCalledWith({
            online: true,
            typing: false,
        });
    });

    it("does NOT immediately mark offline on presence leave (defers to heartbeat timeout)", () => {
        const onPresenceChange = jest.fn();
        createAndTrack(conversationId, userId, onPresenceChange);
        onPresenceChange.mockClear();

        const leaveHandler = mockChannelListeners.get("presence:leave");
        leaveHandler!({ key: otherUserId });

        // With the heartbeat system, leave no longer immediately sets offline
        // It defers to the heartbeat timeout to prevent flicker
        expect(onPresenceChange).not.toHaveBeenCalled();
    });

    it("cleans up channel on destroy", () => {
        const onPresenceChange = jest.fn();
        const { destroy } = createAndTrack(
            conversationId,
            userId,
            onPresenceChange,
        );

        destroy();

        expect(mockChannelUntrack).toHaveBeenCalled();
        expect(mockRemoveChannel).toHaveBeenCalledWith(mockChannel);
    });

    // ── Heartbeat tests ──

    it("sends heartbeat broadcast immediately on subscribe", async () => {
        const onPresenceChange = jest.fn();
        createAndTrack(conversationId, userId, onPresenceChange);

        // startHeartbeat() runs after `await channel.track()` in the async subscribe callback
        // Need to flush microtasks so the resolved promise completes
        await new Promise((r) => setTimeout(r, 0));

        expect(mockChannelSend).toHaveBeenCalledWith({
            type: "broadcast",
            event: "heartbeat",
            payload: { user_id: userId },
        });
    });

    it("marks other user online on heartbeat reception", () => {
        const onPresenceChange = jest.fn();
        createAndTrack(conversationId, userId, onPresenceChange);
        onPresenceChange.mockClear();

        const heartbeatHandler = mockChannelListeners.get(
            "broadcast:heartbeat",
        );
        heartbeatHandler!({
            payload: { user_id: otherUserId },
        });

        expect(onPresenceChange).toHaveBeenCalledWith({
            online: true,
            typing: false,
        });
    });

    it("ignores own heartbeat broadcasts", () => {
        const onPresenceChange = jest.fn();
        createAndTrack(conversationId, userId, onPresenceChange);
        onPresenceChange.mockClear();

        const heartbeatHandler = mockChannelListeners.get(
            "broadcast:heartbeat",
        );
        heartbeatHandler!({
            payload: { user_id: userId },
        });

        // Should NOT update presence for own heartbeat
        expect(onPresenceChange).not.toHaveBeenCalled();
    });
});
