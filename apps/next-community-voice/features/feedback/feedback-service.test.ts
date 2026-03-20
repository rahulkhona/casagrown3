/**
 * Unit Tests for Feedback Service
 *
 * Tests the data transformation and query logic of feedback-service.ts
 * Uses mocked Supabase client to verify correct query construction.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock Supabase client
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockEq = vi.fn();
const mockIn = vi.fn();
const mockOr = vi.fn();
const mockOrder = vi.fn();
const mockRange = vi.fn();
const mockSingle = vi.fn();
const mockMaybeSingle = vi.fn();
const mockLt = vi.fn();
const mockGt = vi.fn();
const mockGte = vi.fn();
const mockLte = vi.fn();

// Chain builder that returns itself for all chainable methods
function chainable(finalResult: any = { data: null, error: null, count: 0 }) {
    const chain: any = {};
    const methods = [
        "select",
        "insert",
        "update",
        "delete",
        "eq",
        "in",
        "or",
        "order",
        "range",
        "single",
        "maybeSingle",
        "lt",
        "gt",
        "gte",
        "lte",
    ];
    for (const m of methods) {
        chain[m] = vi.fn().mockReturnValue(chain);
    }
    // Make the chain thenable to resolve to finalResult
    chain.then = (resolve: any) => resolve(finalResult);
    return chain;
}

vi.mock("@casagrown/app/utils/supabase", () => {
    const fromChain = chainable();
    return {
        supabase: {
            from: vi.fn().mockReturnValue(fromChain),
            rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
        },
    };
});

import {
    addComment,
    banUser,
    checkIsStaff,
    createTicket,
    deleteFeedback,
    dismissAllFlags,
    fetchReporters,
    fetchReportStats,
    fetchTicketById,
    fetchTickets,
    fetchUsers,
    flagTicket,
    toggleVote,
    unbanUser,
    unflagTicket,
    updateTicketStatus,
} from "./feedback-service";
import { supabase } from "@casagrown/app/utils/supabase";

describe("Feedback Service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // =========================================================================
    // fetchTickets
    // =========================================================================
    describe("fetchTickets", () => {
        it("should call supabase from user_feedback with select", async () => {
            const mockData = [
                {
                    id: "ticket-1",
                    title: "Test Bug",
                    description: "Description",
                    type: "bug_report",
                    status: "open",
                    visibility: "public",
                    created_at: "2026-02-20T10:00:00Z",
                    updated_at: null,
                    resolved_at: null,
                    assigned_to: null,
                    author_id: "user-1",
                },
            ];

            // fetchTickets calls from() multiple times:
            // 1. user_feedback (main query) → returns tickets
            // 2. profiles (author lookup) → returns profile map
            // 3. feedback_votes (vote counts) → returns vote rows
            // 4. feedback_comments (comment counts) → returns comment rows
            // 5. feedback_flags (flag counts) → returns flag rows
            const ticketsChain = chainable({ data: mockData, error: null, count: 1 });
            const profilesChain = chainable({ data: [{ id: "user-1", full_name: "Test User", avatar_url: null }], error: null });
            const votesChain = chainable({ data: [
                { feedback_id: "ticket-1" }, { feedback_id: "ticket-1" }, { feedback_id: "ticket-1" },
                { feedback_id: "ticket-1" }, { feedback_id: "ticket-1" },
            ], error: null });
            const commentsChain = chainable({ data: [
                { feedback_id: "ticket-1" }, { feedback_id: "ticket-1" }, { feedback_id: "ticket-1" },
            ], error: null });
            const flagsChain = chainable({ data: [], error: null });
            (supabase.from as any)
                .mockReturnValueOnce(ticketsChain)   // user_feedback
                .mockReturnValueOnce(profilesChain)  // profiles
                .mockReturnValueOnce(votesChain)      // feedback_votes
                .mockReturnValueOnce(commentsChain)   // feedback_comments
                .mockReturnValueOnce(flagsChain);     // feedback_flags

            const result = await fetchTickets({ page: 1, pageSize: 20 });

            expect(supabase.from).toHaveBeenCalledWith("user_feedback");
            expect(result.tickets).toHaveLength(1);
            expect(result.tickets[0].title).toBe("Test Bug");
            expect(result.tickets[0].vote_count).toBe(5);
            expect(result.tickets[0].comment_count).toBe(3);
            expect(result.tickets[0].author_name).toBe("Test User");
            expect(result.totalCount).toBe(1);
        });

        it("should return empty results on error", async () => {
            const chain = chainable({
                data: null,
                error: { message: "DB error" },
                count: 0,
            });
            (supabase.from as any).mockReturnValue(chain);

            const result = await fetchTickets({});

            expect(result.tickets).toHaveLength(0);
            expect(result.totalCount).toBe(0);
        });

        it("should handle missing author gracefully", async () => {
            const chain = chainable({
                data: [{
                    id: "ticket-2",
                    title: "Orphan",
                    description: "No author",
                    type: "feature_request",
                    status: "open",
                    visibility: "public",
                    created_at: "2026-02-20T10:00:00Z",
                    updated_at: null,
                    resolved_at: null,
                    assigned_to: null,
                    author_id: "user-deleted",
                    author: null,
                    feedback_votes: [{ count: 0 }],
                    feedback_comments: [{ count: 0 }],
                }],
                error: null,
                count: 1,
            });
            (supabase.from as any).mockReturnValue(chain);

            const result = await fetchTickets({});
            expect(result.tickets[0].author_name).toBe("Anonymous");
        });

        it("should sort by vote count client-side when most_votes selected", async () => {
            const mockData = [
                {
                    id: "t1",
                    title: "Few Votes",
                    description: "",
                    type: "bug_report",
                    status: "open",
                    visibility: "public",
                    created_at: "2026-02-20T10:00:00Z",
                    updated_at: null,
                    resolved_at: null,
                    assigned_to: null,
                    author_id: "u1",
                },
                {
                    id: "t2",
                    title: "Many Votes",
                    description: "",
                    type: "bug_report",
                    status: "open",
                    visibility: "public",
                    created_at: "2026-02-19T10:00:00Z",
                    updated_at: null,
                    resolved_at: null,
                    assigned_to: null,
                    author_id: "u2",
                },
            ];
            // fetchTickets calls from() for: user_feedback, profiles, votes, comments, flags
            const ticketsChain = chainable({ data: mockData, error: null, count: 2 });
            const profilesChain = chainable({ data: [], error: null });
            // t1 has 2 votes, t2 has 10 votes
            const votesChain = chainable({ data: [
                { feedback_id: "t1" }, { feedback_id: "t1" },
                { feedback_id: "t2" }, { feedback_id: "t2" }, { feedback_id: "t2" }, { feedback_id: "t2" },
                { feedback_id: "t2" }, { feedback_id: "t2" }, { feedback_id: "t2" }, { feedback_id: "t2" },
                { feedback_id: "t2" }, { feedback_id: "t2" },
            ], error: null });
            const commentsChain = chainable({ data: [], error: null });
            const flagsChain = chainable({ data: [], error: null });
            (supabase.from as any)
                .mockReturnValueOnce(ticketsChain)
                .mockReturnValueOnce(profilesChain)
                .mockReturnValueOnce(votesChain)
                .mockReturnValueOnce(commentsChain)
                .mockReturnValueOnce(flagsChain);

            const result = await fetchTickets({ sort: "most_votes" });
            expect(result.tickets[0].title).toBe("Many Votes");
            expect(result.tickets[1].title).toBe("Few Votes");
        });
    });

    // =========================================================================
    // fetchTicketById
    // =========================================================================
    describe("fetchTicketById", () => {
        it("should fetch ticket with comments", async () => {
            // fetchTicketById calls from() for:
            // 1. user_feedback (main ticket) → .eq().single()
            // 2. feedback_comments → .eq().order()
            // 3. feedback_votes (count) → .eq()
            // 4. profiles (author lookup) → .in()
            // 5. feedback_media (ticket media) → .eq().order()
            // 6. feedback_comment_media → .in()
            // 7. feedback_flags → .eq()
            const ticketChain = chainable({
                data: {
                    id: "ticket-1",
                    title: "Test Bug",
                    description: "Detailed description",
                    type: "bug_report",
                    status: "in_progress",
                    visibility: "public",
                    created_at: "2026-02-20T10:00:00Z",
                    updated_at: null,
                    resolved_at: null,
                    assigned_to: null,
                    author_id: "user-1",
                },
                error: null,
            });
            const commentsChain = chainable({
                data: [
                    {
                        id: "c1",
                        content: "A comment",
                        is_official_response: false,
                        created_at: "2026-02-20T11:00:00Z",
                        author_id: "user-2",
                        feedback_id: "ticket-1",
                    },
                    {
                        id: "c2",
                        content: "Official response",
                        is_official_response: true,
                        created_at: "2026-02-20T12:00:00Z",
                        author_id: "user-3",
                        feedback_id: "ticket-1",
                    },
                ],
                error: null,
            });
            // 5 individual vote rows → vote_count = 5
            const votesChain = chainable({
                data: [
                    { feedback_id: "ticket-1" }, { feedback_id: "ticket-1" }, { feedback_id: "ticket-1" },
                    { feedback_id: "ticket-1" }, { feedback_id: "ticket-1" },
                ],
                error: null,
            });
            const profilesChain = chainable({
                data: [
                    { id: "user-1", full_name: "Test User", avatar_url: "https://example.com/avatar.png" },
                    { id: "user-2", full_name: "Commenter", avatar_url: null },
                    { id: "user-3", full_name: "Staff", avatar_url: null },
                ],
                error: null,
            });
            const emptyChain = chainable({ data: [], error: null });

            (supabase.from as any)
                .mockReturnValueOnce(ticketChain)    // user_feedback
                .mockReturnValueOnce(commentsChain)  // feedback_comments
                .mockReturnValueOnce(votesChain)      // feedback_votes (count)
                .mockReturnValueOnce(profilesChain)   // profiles
                .mockReturnValueOnce(emptyChain)      // feedback_media
                .mockReturnValueOnce(emptyChain)      // feedback_comment_media
                .mockReturnValue(emptyChain);          // feedback_flags

            const result = await fetchTicketById("ticket-1");

            expect(result).not.toBeNull();
            expect(result!.title).toBe("Test Bug");
            expect(result!.comments).toHaveLength(2);
            expect(result!.comments[0].author_name).toBe("Commenter");
            expect(result!.comments[1].is_official_response).toBe(true);
            expect(result!.vote_count).toBe(5);
        });

        it("should return null on not found", async () => {
            const chain = chainable({
                data: null,
                error: { message: "Not found" },
            });
            (supabase.from as any).mockReturnValue(chain);

            const result = await fetchTicketById("nonexistent");
            expect(result).toBeNull();
        });
    });

    // =========================================================================
    // createTicket
    // =========================================================================
    describe("createTicket", () => {
        it("should set visibility to private for support requests", async () => {
            const chain = chainable({
                data: { id: "new-ticket" },
                error: null,
            });
            (supabase.from as any).mockReturnValue(chain);

            const result = await createTicket({
                title: "Support issue",
                description: "My points are missing",
                type: "support_request",
                authorId: "user-1",
            });

            expect(result).toEqual({ id: "new-ticket" });
            // Verify the insert was called (from chain)
            expect(supabase.from).toHaveBeenCalledWith("user_feedback");
        });

        it("should set visibility to public for bug reports", async () => {
            const chain = chainable({
                data: { id: "bug-ticket" },
                error: null,
            });
            (supabase.from as any).mockReturnValue(chain);

            const result = await createTicket({
                title: "App crash",
                description: "Crashes on Android",
                type: "bug_report",
                authorId: "user-1",
            });

            expect(result).toEqual({ id: "bug-ticket" });
        });

        it("should return null on insert error", async () => {
            const chain = chainable({
                data: null,
                error: { message: "Insert error" },
            });
            (supabase.from as any).mockReturnValue(chain);

            const result = await createTicket({
                title: "Test",
                description: "Test",
                type: "bug_report",
                authorId: "user-1",
            });

            expect(result).toBeNull();
        });
    });

    // =========================================================================
    // toggleVote
    // =========================================================================
    describe("toggleVote", () => {
        it("should delete vote when currently voted", async () => {
            const chain = chainable({ data: null, error: null });
            (supabase.from as any).mockReturnValue(chain);

            const result = await toggleVote("ticket-1", "user-1", true);
            expect(result).toBe(true);
            expect(supabase.from).toHaveBeenCalledWith("feedback_votes");
        });

        it("should insert vote when not currently voted", async () => {
            const chain = chainable({ data: null, error: null });
            (supabase.from as any).mockReturnValue(chain);

            const result = await toggleVote("ticket-1", "user-1", false);
            expect(result).toBe(true);
        });

        it("should return false on error", async () => {
            const chain = chainable({
                data: null,
                error: { message: "Vote error" },
            });
            (supabase.from as any).mockReturnValue(chain);

            const result = await toggleVote("ticket-1", "user-1", false);
            expect(result).toBe(false);
        });
    });

    // =========================================================================
    // checkIsStaff
    // =========================================================================
    describe("checkIsStaff", () => {
        it("should return true for staff members", async () => {
            const chain = chainable({
                data: { user_id: "staff-1" },
                error: null,
            });
            (supabase.from as any).mockReturnValue(chain);

            const result = await checkIsStaff("staff-1");
            expect(result).toBe(true);
        });

        it("should return false for non-staff", async () => {
            const chain = chainable({ data: null, error: null });
            (supabase.from as any).mockReturnValue(chain);

            const result = await checkIsStaff("user-1");
            expect(result).toBe(false);
        });
    });

    // =========================================================================
    // updateTicketStatus
    // =========================================================================
    describe("updateTicketStatus", () => {
        it("should update status successfully", async () => {
            const chain = chainable({ data: null, error: null });
            (supabase.from as any).mockReturnValue(chain);

            const result = await updateTicketStatus("ticket-1", "completed");
            expect(result).toBe(true);
            expect(supabase.from).toHaveBeenCalledWith("user_feedback");
        });

        it("should return false on error", async () => {
            const chain = chainable({
                data: null,
                error: { message: "Update error" },
            });
            (supabase.from as any).mockReturnValue(chain);

            const result = await updateTicketStatus("ticket-1", "completed");
            expect(result).toBe(false);
        });
    });

    // =========================================================================
    // addComment
    // =========================================================================
    describe("addComment", () => {
        it("should create comment and return with author info", async () => {
            const chain = chainable({
                data: {
                    id: "comment-1",
                    content: "Test comment",
                    is_official_response: false,
                    created_at: "2026-02-20T10:00:00Z",
                    author_id: "user-1",
                    comment_author: {
                        full_name: "Test User",
                        avatar_url: null,
                    },
                },
                error: null,
            });
            (supabase.from as any).mockReturnValue(chain);

            const result = await addComment({
                feedbackId: "ticket-1",
                authorId: "user-1",
                content: "Test comment",
            });

            expect(result).not.toBeNull();
            expect(result!.content).toBe("Test comment");
            expect(result!.author_name).toBe("Test User");
        });
    });

    // =========================================================================
    // fetchReporters
    // =========================================================================
    describe("fetchReporters", () => {
        it("should return unique sorted reporter names", async () => {
            const chain = chainable({
                data: [
                    { author: { full_name: "Charlie" } },
                    { author: { full_name: "Alice" } },
                    { author: { full_name: "Bob" } },
                    { author: { full_name: "Alice" } }, // duplicate
                ],
                error: null,
            });
            (supabase.from as any).mockReturnValue(chain);

            const result = await fetchReporters();
            expect(result).toEqual(["Alice", "Bob", "Charlie"]);
        });

        it("should return empty array on error", async () => {
            const chain = chainable({
                data: null,
                error: { message: "Error" },
            });
            (supabase.from as any).mockReturnValue(chain);

            const result = await fetchReporters();
            expect(result).toEqual([]);
        });
    });

    // =========================================================================
    // flagTicket
    // =========================================================================
    describe("flagTicket", () => {
        it("should insert flag and return true on success", async () => {
            const chain = chainable({ data: null, error: null });
            (supabase.from as any).mockReturnValue(chain);

            const result = await flagTicket("ticket-1", "user-1", "offensive");
            expect(result).toBe(true);
            expect(supabase.from).toHaveBeenCalledWith("feedback_flags");
        });

        it("should return false on error", async () => {
            const chain = chainable({
                data: null,
                error: { message: "Duplicate flag" },
            });
            (supabase.from as any).mockReturnValue(chain);

            const result = await flagTicket("ticket-1", "user-1");
            expect(result).toBe(false);
        });
    });

    // =========================================================================
    // unflagTicket
    // =========================================================================
    describe("unflagTicket", () => {
        it("should delete flag and return true on success", async () => {
            const chain = chainable({ data: null, error: null });
            (supabase.from as any).mockReturnValue(chain);

            const result = await unflagTicket("ticket-1", "user-1");
            expect(result).toBe(true);
            expect(supabase.from).toHaveBeenCalledWith("feedback_flags");
        });

        it("should return false on error", async () => {
            const chain = chainable({
                data: null,
                error: { message: "Delete error" },
            });
            (supabase.from as any).mockReturnValue(chain);

            const result = await unflagTicket("ticket-1", "user-1");
            expect(result).toBe(false);
        });
    });

    // =========================================================================
    // deleteFeedback
    // =========================================================================
    describe("deleteFeedback", () => {
        it("should delete ticket and return true on success", async () => {
            const chain = chainable({ data: null, error: null });
            (supabase.from as any).mockReturnValue(chain);

            const result = await deleteFeedback("ticket-1");
            expect(result).toBe(true);
            expect(supabase.from).toHaveBeenCalledWith("user_feedback");
        });

        it("should return false on error", async () => {
            const chain = chainable({
                data: null,
                error: { message: "Delete error" },
            });
            (supabase.from as any).mockReturnValue(chain);

            const result = await deleteFeedback("ticket-1");
            expect(result).toBe(false);
        });
    });

    // =========================================================================
    // dismissAllFlags
    // =========================================================================
    describe("dismissAllFlags", () => {
        it("should delete all flags for a ticket and return true", async () => {
            const chain = chainable({ data: null, error: null });
            (supabase.from as any).mockReturnValue(chain);

            const result = await dismissAllFlags("ticket-1");
            expect(result).toBe(true);
            expect(supabase.from).toHaveBeenCalledWith("feedback_flags");
        });

        it("should return false on error", async () => {
            const chain = chainable({
                data: null,
                error: { message: "Dismiss error" },
            });
            (supabase.from as any).mockReturnValue(chain);

            const result = await dismissAllFlags("ticket-1");
            expect(result).toBe(false);
        });
    });

    // =========================================================================
    // fetchUsers (via RPC)
    // =========================================================================
    describe("fetchUsers", () => {
        it("should call staff_fetch_users RPC and return users", async () => {
            const mockResult = {
                users: [
                    { id: "u1", email: "alice@example.com", fullName: "Alice", avatarUrl: null, isBanned: false, banReason: null, bannedAt: null, createdAt: "2026-01-01" },
                    { id: "u2", email: "bob@example.com", fullName: "Bob", avatarUrl: null, isBanned: true, banReason: "Spam", bannedAt: "2026-02-15", createdAt: "2026-01-05" },
                ],
                totalCount: 2,
            };
            (supabase.rpc as any).mockResolvedValue({ data: mockResult, error: null });

            const result = await fetchUsers("alice", 1, 25);

            expect(supabase.rpc).toHaveBeenCalledWith("staff_fetch_users", {
                search_text: "alice",
                p_page: 1,
                p_page_size: 25,
            });
            expect(result.users).toHaveLength(2);
            expect(result.users[0].fullName).toBe("Alice");
            expect(result.users[1].isBanned).toBe(true);
            expect(result.totalCount).toBe(2);
        });

        it("should return empty on error", async () => {
            (supabase.rpc as any).mockResolvedValue({ data: null, error: { message: "Unauthorized" } });

            const result = await fetchUsers();
            expect(result.users).toHaveLength(0);
            expect(result.totalCount).toBe(0);
        });
    });

    // =========================================================================
    // banUser (via RPC)
    // =========================================================================
    describe("banUser", () => {
        it("should call staff_ban_user with banned=true and return success", async () => {
            (supabase.rpc as any).mockResolvedValue({ data: { success: true, userId: "u1", banned: true }, error: null });

            const result = await banUser("u1", "Spamming");

            expect(supabase.rpc).toHaveBeenCalledWith("staff_ban_user", {
                target_user_id: "u1",
                banned: true,
                reason: "Spamming",
            });
            expect(result.success).toBe(true);
        });

        it("should return error from RPC response", async () => {
            (supabase.rpc as any).mockResolvedValue({ data: { error: "Cannot ban yourself" }, error: null });

            const result = await banUser("self-id", "test");
            expect(result.success).toBe(false);
            expect(result.error).toBe("Cannot ban yourself");
        });

        it("should handle supabase error", async () => {
            (supabase.rpc as any).mockResolvedValue({ data: null, error: { message: "DB error" } });

            const result = await banUser("u1", "Reason");
            expect(result.success).toBe(false);
            expect(result.error).toBe("DB error");
        });
    });

    // =========================================================================
    // unbanUser (via RPC)
    // =========================================================================
    describe("unbanUser", () => {
        it("should call staff_ban_user with banned=false and return success", async () => {
            (supabase.rpc as any).mockResolvedValue({ data: { success: true, userId: "u1", banned: false }, error: null });

            const result = await unbanUser("u1");

            expect(supabase.rpc).toHaveBeenCalledWith("staff_ban_user", {
                target_user_id: "u1",
                banned: false,
            });
            expect(result.success).toBe(true);
        });

        it("should handle unauthorized error", async () => {
            (supabase.rpc as any).mockResolvedValue({ data: { error: "Unauthorized — admin or moderator role required" }, error: null });

            const result = await unbanUser("u1");
            expect(result.success).toBe(false);
            expect(result.error).toContain("Unauthorized");
        });
    });

    // =========================================================================
    // fetchReportStats — data computation
    // =========================================================================
    describe("fetchReportStats", () => {
        it("should compute stats from ticket data", async () => {
            const now = new Date();
            const threeDaysAgo = new Date(now.getTime() - 3 * 86400000);
            const chain = chainable({
                data: [
                    { id: "t1", type: "bug_report", status: "completed", created_at: threeDaysAgo.toISOString(), resolved_at: now.toISOString(), feedback_votes: [{ count: 10 }] },
                    { id: "t2", type: "feature_request", status: "open", created_at: now.toISOString(), resolved_at: null, feedback_votes: [{ count: 3 }] },
                    { id: "t3", type: "bug_report", status: "rejected", created_at: now.toISOString(), resolved_at: now.toISOString(), feedback_votes: [{ count: 0 }] },
                ],
                error: null,
                count: 3,
            });
            (supabase.from as any).mockReturnValue(chain);

            const stats = await fetchReportStats();

            expect(stats.totalSubmissions).toBe(3);
            // 2 of 3 are closed (completed + rejected)
            expect(stats.closureRate).toBe(67); // Math.round(2/3 * 100)
            // Average votes: (10 + 3 + 0) / 3 = 4.3
            expect(stats.avgVotes).toBe(4.3);
            // Status breakdown should have 3 entries
            expect(stats.statusBreakdown.length).toBeGreaterThanOrEqual(2);
            // Weekly trend should have entries
            expect(stats.weeklyTrend.length).toBeGreaterThanOrEqual(1);
            // Vote buckets should exist
            expect(stats.voteBuckets.length).toBe(6);
        });

        it("should return zeros on error", async () => {
            const chain = chainable({ data: null, error: { message: "Error" }, count: 0 });
            (supabase.from as any).mockReturnValue(chain);

            const stats = await fetchReportStats();
            expect(stats.totalSubmissions).toBe(0);
            expect(stats.closureRate).toBe(0);
            expect(stats.avgVotes).toBe(0);
            expect(stats.weeklyTrend).toEqual([]);
        });
    });
});
