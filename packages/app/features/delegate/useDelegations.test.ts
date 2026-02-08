/**
 * useDelegations Hook — Unit Tests
 *
 * Tests the delegation management hook that powers the delegate screen.
 * Covers: fetchDelegations query filters, generateDelegationLink, acceptDelegationByCode,
 * acceptPairingCode, acceptRequest, rejectRequest, revokeDelegation, inactivateDelegation.
 */

import { act, renderHook, waitFor } from "@testing-library/react-native";
import { useDelegations } from "./useDelegations";

// ─── Mock Supabase ─────────────────────────────────────────────

// Build a chainable query mock that records calls
const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockIn = jest.fn();
const mockOrder = jest.fn();
const mockUpdate = jest.fn();

// Default successful query result
const defaultQueryResult = { data: [], error: null };

// Chain builder — each method returns the chain object
const buildChain = (result = defaultQueryResult) => {
    const chain: any = {
        select: mockSelect.mockReturnValue(undefined),
        eq: mockEq.mockReturnValue(undefined),
        in: mockIn.mockReturnValue(undefined),
        order: mockOrder.mockReturnValue(undefined),
        update: mockUpdate.mockReturnValue(undefined),
    };
    // Each method returns the chain itself
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    chain.in.mockReturnValue(chain);
    chain.order.mockReturnValue(Promise.resolve(result));
    chain.update.mockReturnValue(chain);
    return chain;
};

const mockFrom = jest.fn();
const mockInvoke = jest.fn();
const mockGetUser = jest.fn();
const mockGetSession = jest.fn();

jest.mock("../auth/auth-hook", () => ({
    supabase: {
        from: (...args: any[]) => mockFrom(...args),
        auth: {
            getUser: () => mockGetUser(),
            getSession: () => mockGetSession(),
        },
        functions: {
            invoke: (...args: any[]) => mockInvoke(...args),
        },
    },
}));

// ─── Test Data ─────────────────────────────────────────────────

const MOCK_USER_ID = "user-123";
const MOCK_OTHER_USER_ID = "user-456";

const mockActiveDelegation = {
    id: "del-1",
    delegator_id: MOCK_USER_ID,
    delegatee_id: MOCK_OTHER_USER_ID,
    status: "active",
    created_at: "2026-02-07T00:00:00Z",
    delegatee_profile: { full_name: "Jane Doe", avatar_url: null },
};

const mockPendingDelegation = {
    id: "del-2",
    delegator_id: MOCK_USER_ID,
    delegatee_id: null,
    status: "pending",
    created_at: "2026-02-06T00:00:00Z",
    delegatee_profile: null,
};

const mockDelegatingFor = {
    id: "del-3",
    delegator_id: MOCK_OTHER_USER_ID,
    delegatee_id: MOCK_USER_ID,
    status: "active",
    created_at: "2026-02-07T00:00:00Z",
    delegator_profile: { full_name: "John Smith", avatar_url: null },
};

// ─── Tests ─────────────────────────────────────────────────────

describe("useDelegations", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockGetUser.mockResolvedValue({ data: { user: { id: MOCK_USER_ID } } });
        mockGetSession.mockResolvedValue({
            data: { session: { access_token: "mock-jwt" } },
        });
    });

    // =========================================
    // fetchDelegations
    // =========================================

    describe("fetchDelegations", () => {
        it("queries only pending and active statuses (excludes pending_pairing)", async () => {
            const chain = buildChain({
                data: [mockActiveDelegation],
                error: null,
            });
            mockFrom.mockReturnValue(chain);

            renderHook(() => useDelegations());

            await waitFor(() => {
                // Should call .in with only 'pending' and 'active', never 'pending_pairing'
                const inCalls = mockIn.mock.calls;
                for (const call of inCalls) {
                    expect(call[0]).toBe("status");
                    expect(call[1]).toEqual(["pending", "active"]);
                    expect(call[1]).not.toContain("pending_pairing");
                }
            });
        });

        it("fetches myDelegates with delegator_id filter", async () => {
            const chain = buildChain({
                data: [mockActiveDelegation],
                error: null,
            });
            mockFrom.mockReturnValue(chain);

            renderHook(() => useDelegations());

            await waitFor(() => {
                expect(mockFrom).toHaveBeenCalledWith("delegations");
                // At least one eq call should filter by delegator_id
                const eqCalls = mockEq.mock.calls;
                const hasDelegatorFilter = eqCalls.some(
                    (call) =>
                        call[0] === "delegator_id" && call[1] === MOCK_USER_ID,
                );
                expect(hasDelegatorFilter).toBe(true);
            });
        });

        it("fetches delegatingFor with delegatee_id filter", async () => {
            const chain = buildChain({
                data: [mockDelegatingFor],
                error: null,
            });
            mockFrom.mockReturnValue(chain);

            renderHook(() => useDelegations());

            await waitFor(() => {
                const eqCalls = mockEq.mock.calls;
                const hasDelegateeFilter = eqCalls.some(
                    (call) =>
                        call[0] === "delegatee_id" && call[1] === MOCK_USER_ID,
                );
                expect(hasDelegateeFilter).toBe(true);
            });
        });

        it("sets data correctly after successful fetch", async () => {
            const chain = buildChain();
            // First query (myDelegates)
            chain.order
                .mockResolvedValueOnce({
                    data: [mockActiveDelegation, mockPendingDelegation],
                    error: null,
                })
                // Second query (delegatingFor)
                .mockResolvedValueOnce({
                    data: [mockDelegatingFor],
                    error: null,
                });
            mockFrom.mockReturnValue(chain);

            const { result } = renderHook(() => useDelegations());

            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });

            expect(result.current.myDelegates).toHaveLength(2);
            expect(result.current.delegatingFor).toHaveLength(1);
            expect(result.current.error).toBeNull();
        });

        it("sets error when query fails", async () => {
            const chain = buildChain();
            chain.order.mockResolvedValueOnce({
                data: null,
                error: { message: "Database error" },
            });
            mockFrom.mockReturnValue(chain);

            const { result } = renderHook(() => useDelegations());

            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });

            expect(result.current.error).toBe("Database error");
        });

        it("does not fetch if user is not authenticated", async () => {
            mockGetUser.mockResolvedValue({ data: { user: null } });

            renderHook(() => useDelegations());

            // Give time for useEffect to fire
            await new Promise((r) => setTimeout(r, 100));

            // from() should not be called when there's no currentUserId
            expect(mockFrom).not.toHaveBeenCalled();
        });
    });

    // =========================================
    // generateDelegationLink
    // =========================================

    describe("generateDelegationLink", () => {
        it("invokes pair-delegation with generate-link action", async () => {
            const chain = buildChain();
            mockFrom.mockReturnValue(chain);
            mockInvoke.mockResolvedValue({
                error: null,
                data: {
                    delegationCode: "d-abc12xyz",
                    pairingCode: "123456",
                    expiresAt: "2026-02-08T00:00:00Z",
                },
            });

            const { result } = renderHook(() => useDelegations());

            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });

            let linkResult: any;
            await act(async () => {
                linkResult = await result.current.generateDelegationLink(
                    "Hello!",
                );
            });

            expect(mockInvoke).toHaveBeenCalledWith("pair-delegation", {
                body: { action: "generate-link", message: "Hello!" },
            });
            expect(linkResult).toEqual({
                delegationCode: "d-abc12xyz",
                pairingCode: "123456",
                expiresAt: "2026-02-08T00:00:00Z",
            });
        });

        it("does not refetch delegations after generating link", async () => {
            const chain = buildChain();
            mockFrom.mockReturnValue(chain);
            mockInvoke.mockResolvedValue({
                error: null,
                data: {
                    delegationCode: "d-abc12xyz",
                    pairingCode: "123456",
                    expiresAt: "2026-02-08T00:00:00Z",
                },
            });

            const { result } = renderHook(() => useDelegations());

            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });

            const fromCallsBefore = mockFrom.mock.calls.length;

            await act(async () => {
                await result.current.generateDelegationLink();
            });

            // from() should NOT be called again — no refetch after generate
            expect(mockFrom.mock.calls.length).toBe(fromCallsBefore);
        });

        it("returns error when not authenticated", async () => {
            const chain = buildChain();
            mockFrom.mockReturnValue(chain);
            mockGetSession.mockResolvedValue({ data: { session: null } });

            const { result } = renderHook(() => useDelegations());

            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });

            let linkResult: any;
            await act(async () => {
                linkResult = await result.current.generateDelegationLink();
            });

            expect(linkResult).toEqual({ error: "Not authenticated" });
        });

        it("returns error from edge function response", async () => {
            const chain = buildChain();
            mockFrom.mockReturnValue(chain);
            mockInvoke.mockResolvedValue({
                error: null,
                data: { error: "Rate limited" },
            });

            const { result } = renderHook(() => useDelegations());

            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });

            let linkResult: any;
            await act(async () => {
                linkResult = await result.current.generateDelegationLink();
            });

            expect(linkResult).toEqual({ error: "Rate limited" });
        });
    });

    // =========================================
    // acceptDelegationByCode
    // =========================================

    describe("acceptDelegationByCode", () => {
        it("invokes pair-delegation with accept-link action", async () => {
            const chain = buildChain();
            mockFrom.mockReturnValue(chain);
            mockInvoke.mockResolvedValue({
                error: null,
                data: { delegation: mockActiveDelegation },
            });

            const { result } = renderHook(() => useDelegations());

            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });

            await act(async () => {
                await result.current.acceptDelegationByCode("d-abc12xyz");
            });

            expect(mockInvoke).toHaveBeenCalledWith("pair-delegation", {
                body: { action: "accept-link", code: "d-abc12xyz" },
            });
        });

        it("refetches delegations after successful accept", async () => {
            const chain = buildChain();
            mockFrom.mockReturnValue(chain);
            mockInvoke.mockResolvedValue({
                error: null,
                data: { delegation: mockActiveDelegation },
            });

            const { result } = renderHook(() => useDelegations());

            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });

            const fromCallsBefore = mockFrom.mock.calls.length;

            await act(async () => {
                await result.current.acceptDelegationByCode("d-abc12xyz");
            });

            // from() should be called again for refetch
            expect(mockFrom.mock.calls.length).toBeGreaterThan(fromCallsBefore);
        });
    });

    // =========================================
    // acceptPairingCode
    // =========================================

    describe("acceptPairingCode", () => {
        it("invokes pair-delegation with accept action and 6-digit code", async () => {
            const chain = buildChain();
            mockFrom.mockReturnValue(chain);
            mockInvoke.mockResolvedValue({
                error: null,
                data: { delegation: mockActiveDelegation },
            });

            const { result } = renderHook(() => useDelegations());

            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });

            await act(async () => {
                await result.current.acceptPairingCode("123456");
            });

            expect(mockInvoke).toHaveBeenCalledWith("pair-delegation", {
                body: { action: "accept", code: "123456" },
            });
        });
    });

    // =========================================
    // Status change operations
    // =========================================

    describe("status changes", () => {
        beforeEach(() => {
            const chain = buildChain();
            // Make update return a chain that resolves
            chain.update.mockReturnValue(chain);
            chain.eq.mockReturnValue(Promise.resolve({ error: null }));
            mockFrom.mockReturnValue(chain);
        });

        it("revokeDelegation updates status to revoked", async () => {
            const { result } = renderHook(() => useDelegations());

            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });

            await act(async () => {
                await result.current.revokeDelegation("del-1");
            });

            expect(mockUpdate).toHaveBeenCalledWith({ status: "revoked" });
        });

        it("acceptRequest updates status to active", async () => {
            const { result } = renderHook(() => useDelegations());

            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });

            await act(async () => {
                await result.current.acceptRequest("del-2");
            });

            expect(mockUpdate).toHaveBeenCalledWith({ status: "active" });
        });

        it("rejectRequest updates status to rejected", async () => {
            const { result } = renderHook(() => useDelegations());

            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });

            await act(async () => {
                await result.current.rejectRequest("del-2");
            });

            expect(mockUpdate).toHaveBeenCalledWith({ status: "rejected" });
        });

        it("inactivateDelegation updates status to inactive", async () => {
            const { result } = renderHook(() => useDelegations());

            await waitFor(() => {
                expect(result.current.loading).toBe(false);
            });

            await act(async () => {
                await result.current.inactivateDelegation("del-3");
            });

            expect(mockUpdate).toHaveBeenCalledWith({ status: "inactive" });
        });
    });
});
