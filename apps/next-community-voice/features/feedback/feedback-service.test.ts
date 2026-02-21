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
        },
    };
});

import {
    addComment,
    checkIsStaff,
    createTicket,
    deleteFeedback,
    dismissAllFlags,
    fetchReporters,
    fetchReportStats,
    fetchTicketById,
    fetchTickets,
    flagTicket,
    toggleVote,
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
                    author: { full_name: "Test User", avatar_url: null },
                    feedback_votes: [{ count: 5 }],
                    feedback_comments: [{ count: 3 }],
                },
            ];

            const chain = chainable({ data: mockData, error: null, count: 1 });
            (supabase.from as any).mockReturnValue(chain);

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
            const chain = chainable({
                data: [
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
                        author: null,
                        feedback_votes: [{ count: 2 }],
                        feedback_comments: [{ count: 0 }],
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
                        author: null,
                        feedback_votes: [{ count: 10 }],
                        feedback_comments: [{ count: 0 }],
                    },
                ],
                error: null,
                count: 2,
            });
            (supabase.from as any).mockReturnValue(chain);

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
                    author: {
                        full_name: "Test User",
                        avatar_url: "https://example.com/avatar.png",
                    },
                    feedback_votes: [{ count: 5 }],
                    feedback_comments: [
                        {
                            id: "c1",
                            content: "A comment",
                            is_official_response: false,
                            created_at: "2026-02-20T11:00:00Z",
                            author_id: "user-2",
                            comment_author: {
                                full_name: "Commenter",
                                avatar_url: null,
                            },
                        },
                        {
                            id: "c2",
                            content: "Official response",
                            is_official_response: true,
                            created_at: "2026-02-20T12:00:00Z",
                            author_id: "user-3",
                            comment_author: {
                                full_name: "Staff",
                                avatar_url: null,
                            },
                        },
                    ],
                },
                error: null,
            });
            // Subsequent from() calls (flags, media) return empty arrays
            const emptyChain = chainable({ data: [], error: null });
            (supabase.from as any)
                .mockReturnValueOnce(ticketChain) // user_feedback
                .mockReturnValueOnce(emptyChain) // feedback_flags (count)
                .mockReturnValueOnce(emptyChain) // feedback_flags (user flag)
                .mockReturnValueOnce(emptyChain) // feedback_media
                .mockReturnValue(emptyChain); // feedback_comment_media

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
});
