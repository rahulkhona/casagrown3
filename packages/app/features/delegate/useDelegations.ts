import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../auth/auth-hook";

export interface DelegationRecord {
    id: string;
    delegator_id: string;
    delegatee_id: string | null;
    status:
        | "pending"
        | "pending_pairing"
        | "active"
        | "rejected"
        | "revoked"
        | "inactive";
    delegation_code: string | null;
    pairing_code: string | null;
    pairing_expires_at: string | null;
    message: string | null;
    created_at: string;
    // Joined profile data
    delegator_profile?: { full_name: string | null; avatar_url: string | null };
    delegatee_profile?: { full_name: string | null; avatar_url: string | null };
    /** True when the delegation is revoked/inactive but the delegate still has active posts for this delegator */
    hasActivePosts?: boolean;
}

export interface UserSearchResult {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    community_name: string | null;
}

export interface GeneratedLink {
    delegationCode: string;
    pairingCode: string;
    expiresAt: string;
}

export function useDelegations() {
    const [myDelegates, setMyDelegates] = useState<DelegationRecord[]>([]);
    const [delegatingFor, setDelegatingFor] = useState<DelegationRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const isInitialLoad = useRef(true);

    // Get current user
    useEffect(() => {
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (user) setCurrentUserId(user.id);
        });
    }, []);

    // Fetch delegations
    const fetchDelegations = useCallback(async () => {
        if (!currentUserId) return;
        if (isInitialLoad.current) setLoading(true);
        setError(null);

        try {
            // My delegates: where I'm the delegator (excluding pending_pairing — those are
            // outstanding invitation links with no delegatee yet, not actual delegations).
            // Include revoked/inactive so we can show "winding down" when posts are still live.
            const { data: myDelegatesData, error: err1 } = await supabase
                .from("delegations")
                .select(`
                    *,
                    delegatee_profile:profiles!delegations_delegatee_id_fkey(full_name, avatar_url)
                `)
                .eq("delegator_id", currentUserId)
                .in("status", ["pending", "active", "revoked", "inactive"])
                .order("created_at", { ascending: false });

            if (err1) throw err1;

            // Delegating for: where I'm the delegatee
            const { data: delegatingForData, error: err2 } = await supabase
                .from("delegations")
                .select(`
                    *,
                    delegator_profile:profiles!delegations_delegator_id_fkey(full_name, avatar_url)
                `)
                .eq("delegatee_id", currentUserId)
                .in("status", ["pending", "active", "revoked", "inactive"])
                .order("created_at", { ascending: false });

            if (err2) throw err2;

            // For revoked/inactive delegations, check if there are still active posts
            // (posts where on_behalf_of = delegator_id, meaning the delegation has
            // outstanding work). We query once for all delegator IDs to avoid N+1.
            const endedDelegations = [
                ...(myDelegatesData || []),
                ...(delegatingForData || []),
            ].filter((d) => d.status === "revoked" || d.status === "inactive");

            const delegatorIdsToCheck = [
                ...new Set(endedDelegations.map((d) => d.delegator_id)),
            ];

            let activePostDelegatorIds = new Set<string>();
            if (delegatorIdsToCheck.length > 0) {
                const { data: postsWithDelegator } = await supabase
                    .from("posts")
                    .select("on_behalf_of")
                    .in("on_behalf_of", delegatorIdsToCheck);

                activePostDelegatorIds = new Set(
                    (postsWithDelegator || []).map(
                        (p: { on_behalf_of: string }) => p.on_behalf_of,
                    ),
                );
            }

            // Annotate records and filter out fully-ended delegations (no active posts)
            const annotate = (d: DelegationRecord): DelegationRecord => {
                if (d.status === "revoked" || d.status === "inactive") {
                    return {
                        ...d,
                        hasActivePosts: activePostDelegatorIds.has(
                            d.delegator_id,
                        ),
                    };
                }
                return d;
            };

            const filterEnded = (d: DelegationRecord) =>
                d.status === "active" ||
                d.status === "pending" ||
                d.hasActivePosts;

            setMyDelegates(
                (myDelegatesData || []).map(annotate).filter(filterEnded),
            );
            setDelegatingFor(
                (delegatingForData || []).map(annotate).filter(filterEnded),
            );
        } catch (err: any) {
            setError(err.message || "Failed to fetch delegations");
        } finally {
            isInitialLoad.current = false;
            setLoading(false);
        }
    }, [currentUserId]);

    useEffect(() => {
        fetchDelegations();
    }, [fetchDelegations]);

    // Poll for changes every 10s so updates from other devices are reflected
    useEffect(() => {
        if (!currentUserId) return;
        const interval = setInterval(() => {
            fetchDelegations();
        }, 10_000);
        return () => clearInterval(interval);
    }, [currentUserId, fetchDelegations]);

    // Generate delegation link (new link-based flow)
    // Note: does NOT refetch delegations — generating a link creates a pending_pairing
    // row which shouldn't count as a delegate until someone accepts.
    const generateDelegationLink = useCallback(
        async (
            message?: string,
        ): Promise<GeneratedLink | { error: string }> => {
            const {
                data: { session },
            } = await supabase.auth.getSession();
            if (!session) return { error: "Not authenticated" };

            const response = await supabase.functions.invoke(
                "pair-delegation",
                {
                    body: { action: "generate-link", message: message || null },
                },
            );

            if (response.error) return { error: response.error.message };
            if (response.data.error) return { error: response.data.error };

            return {
                delegationCode: response.data.delegationCode,
                pairingCode: response.data.pairingCode,
                expiresAt: response.data.expiresAt,
            };
        },
        [],
    );

    // Accept delegation by code (from link or clipboard)
    const acceptDelegationByCode = useCallback(
        async (
            code: string,
        ): Promise<{ delegation?: DelegationRecord; error?: string }> => {
            const {
                data: { session },
            } = await supabase.auth.getSession();
            if (!session) return { error: "Not authenticated" };

            const response = await supabase.functions.invoke(
                "pair-delegation",
                {
                    body: { action: "accept-link", code },
                },
            );

            if (response.error) return { error: response.error.message };
            if (response.data.error) return { error: response.data.error };

            await fetchDelegations();
            return { delegation: response.data.delegation };
        },
        [fetchDelegations],
    );

    // Accept by 6-digit pairing code (manual entry fallback)
    const acceptPairingCode = useCallback(
        async (
            code: string,
        ): Promise<{ delegation?: DelegationRecord; error?: string }> => {
            const {
                data: { session },
            } = await supabase.auth.getSession();
            if (!session) return { error: "Not authenticated" };

            const response = await supabase.functions.invoke(
                "pair-delegation",
                {
                    body: { action: "accept", code },
                },
            );

            if (response.error) return { error: response.error.message };
            if (response.data.error) return { error: response.data.error };

            await fetchDelegations();
            return { delegation: response.data.delegation };
        },
        [fetchDelegations],
    );

    // Accept a delegation request (non-link)
    const acceptRequest = useCallback(
        async (delegationId: string) => {
            const { error } = await supabase
                .from("delegations")
                .update({ status: "active" })
                .eq("id", delegationId);

            if (error) return { error: error.message };
            await fetchDelegations();
            return { error: null };
        },
        [fetchDelegations],
    );

    // Reject a delegation request
    const rejectRequest = useCallback(
        async (delegationId: string) => {
            const { error } = await supabase
                .from("delegations")
                .update({ status: "rejected" })
                .eq("id", delegationId);

            if (error) return { error: error.message };
            await fetchDelegations();
            return { error: null };
        },
        [fetchDelegations],
    );

    // Revoke delegation (delegator action)
    const revokeDelegation = useCallback(
        async (delegationId: string) => {
            const { error } = await supabase
                .from("delegations")
                .update({ status: "revoked" })
                .eq("id", delegationId);

            if (error) return { error: error.message };
            await fetchDelegations();
            return { error: null };
        },
        [fetchDelegations],
    );

    // Inactivate delegation (delegatee action)
    const inactivateDelegation = useCallback(
        async (delegationId: string) => {
            const { error } = await supabase
                .from("delegations")
                .update({ status: "inactive" })
                .eq("id", delegationId);

            if (error) return { error: error.message };
            await fetchDelegations();
            return { error: null };
        },
        [fetchDelegations],
    );

    return {
        myDelegates,
        delegatingFor,
        loading,
        error,
        generateDelegationLink,
        acceptDelegationByCode,
        acceptPairingCode,
        acceptRequest,
        rejectRequest,
        revokeDelegation,
        inactivateDelegation,
        refresh: fetchDelegations,
    };
}
