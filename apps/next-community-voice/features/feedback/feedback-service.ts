"use client";

/**
 * Feedback Service — Supabase data operations for Community Voice
 *
 * All search, sort, filter, and pagination runs server-side via PostgREST.
 * The board never loads all tickets at once.
 */

import { supabase } from "@casagrown/app/utils/supabase";

// =============================================================================
// Types
// =============================================================================

export type FeedbackType = "feature_request" | "bug_report" | "support_request";
export type FeedbackStatus =
    | "open"
    | "under_review"
    | "planned"
    | "in_progress"
    | "completed"
    | "rejected"
    | "duplicate";
export type FeedbackVisibility = "public" | "private";

export interface FeedbackTicket {
    id: string;
    title: string;
    description: string;
    type: FeedbackType;
    status: FeedbackStatus;
    visibility: FeedbackVisibility;
    created_at: string;
    updated_at: string | null;
    resolved_at: string | null;
    assigned_to: string | null;
    author_id: string;
    author_name: string | null;
    author_avatar: string | null;
    vote_count: number;
    comment_count: number;
    is_voted: boolean;
    flag_count: number;
    is_flagged: boolean;
}

export interface MediaAttachment {
    id: string;
    storage_path: string;
    media_type: "image" | "video" | "document";
    mime_type: string | null;
    metadata: { original_name?: string; size?: number } | null;
}

export interface FeedbackComment {
    id: string;
    content: string;
    is_official_response: boolean;
    created_at: string;
    author_id: string;
    author_name: string | null;
    author_avatar: string | null;
    attachments: MediaAttachment[];
}

export interface FeedbackDetail extends FeedbackTicket {
    comments: FeedbackComment[];
    attachments: MediaAttachment[];
}

export interface FetchTicketsParams {
    search?: string;
    type?: string; // 'all' or FeedbackType
    status?: string; // 'all' or FeedbackStatus
    reporter?: string; // 'all' or author name
    sort?: "newest" | "oldest" | "most_votes" | "least_votes";
    createdDateOp?: "any" | "before" | "after" | "on";
    createdDateVal?: string;
    resolvedDateOp?: "any" | "before" | "after" | "on";
    resolvedDateVal?: string;
    visibility?: FeedbackVisibility | "all";
    page?: number;
    pageSize?: number;
    currentUserId?: string;
}

export interface FetchTicketsResult {
    tickets: FeedbackTicket[];
    totalCount: number;
}

export interface ReportStats {
    avgResolutionDays: number;
    totalSubmissions: number;
    closureRate: number;
    avgVotes: number;
    statusBreakdown: { status: string; count: number }[];
    weeklyTrend: { week: string; bugs: number; features: number }[];
    voteBuckets: { range: string; count: number }[];
}

// =============================================================================
// Fetch paginated tickets with server-side search, filter, sort
// =============================================================================

export async function fetchTickets(
    params: FetchTicketsParams,
    currentUserId?: string,
): Promise<FetchTicketsResult> {
    const {
        search = "",
        type = "all",
        status = "all",
        reporter = "all",
        sort = "newest",
        createdDateOp = "any",
        createdDateVal = "",
        resolvedDateOp = "any",
        resolvedDateVal = "",
        visibility = "all",
        page = 1,
        pageSize = 20,
    } = params;

    // Build query — select only needed columns + counts
    let query = supabase
        .from("user_feedback")
        .select(
            `
      id,
      title,
      description,
      type,
      status,
      visibility,
      created_at,
      updated_at,
      resolved_at,
      assigned_to,
      author_id,
      author:profiles!author_id(full_name, avatar_url),
      feedback_votes(count),
      feedback_comments(count)
    `,
            { count: "exact" },
        );

    // --- Filters ---

    // Visibility filter
    if (visibility !== "all") {
        query = query.eq("visibility", visibility);
    }

    // Type filter
    if (type !== "all") {
        query = query.eq("type", type);
    }

    // Status filter
    if (status !== "all") {
        query = query.eq("status", status);
    }

    // Search (title or description)
    if (search.trim()) {
        query = query.or(
            `title.ilike.%${search.trim()}%,description.ilike.%${search.trim()}%`,
        );
    }

    // Created date filter
    if (createdDateOp !== "any" && createdDateVal) {
        if (createdDateOp === "before") {
            query = query.lt("created_at", createdDateVal);
        } else if (createdDateOp === "after") {
            query = query.gt("created_at", createdDateVal + "T23:59:59");
        } else if (createdDateOp === "on") {
            query = query.gte("created_at", createdDateVal + "T00:00:00");
            query = query.lte("created_at", createdDateVal + "T23:59:59");
        }
    }

    // Resolved date filter
    if (resolvedDateOp !== "any" && resolvedDateVal) {
        if (resolvedDateOp === "before") {
            query = query.lt("resolved_at", resolvedDateVal);
        } else if (resolvedDateOp === "after") {
            query = query.gt("resolved_at", resolvedDateVal + "T23:59:59");
        } else if (resolvedDateOp === "on") {
            query = query.gte("resolved_at", resolvedDateVal + "T00:00:00");
            query = query.lte("resolved_at", resolvedDateVal + "T23:59:59");
        }
    }

    // --- Sort ---
    switch (sort) {
        case "oldest":
            query = query.order("created_at", { ascending: true });
            break;
        case "most_votes":
            // Sort by vote count requires a different approach — we'll sort client-side for vote sorts
            query = query.order("created_at", { ascending: false });
            break;
        case "least_votes":
            query = query.order("created_at", { ascending: false });
            break;
        default: // newest
            query = query.order("created_at", { ascending: false });
    }

    // --- Pagination ---
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
        console.error("fetchTickets error:", error);
        return { tickets: [], totalCount: 0 };
    }

    // Transform response
    let tickets: FeedbackTicket[] = (data || []).map((row: any) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        type: row.type,
        status: row.status,
        visibility: row.visibility,
        created_at: row.created_at,
        updated_at: row.updated_at,
        resolved_at: row.resolved_at,
        assigned_to: row.assigned_to,
        author_id: row.author_id,
        author_name: row.author?.full_name || "Anonymous",
        author_avatar: row.author?.avatar_url || null,
        vote_count: row.feedback_votes?.[0]?.count || 0,
        comment_count: row.feedback_comments?.[0]?.count || 0,
        is_voted: false,
        flag_count: 0,
        is_flagged: false,
    }));

    // Check if current user has voted (batch query)
    if (currentUserId && tickets.length > 0) {
        const ticketIds = tickets.map((t) => t.id);
        const { data: votes } = await supabase
            .from("feedback_votes")
            .select("feedback_id")
            .eq("user_id", currentUserId)
            .in("feedback_id", ticketIds);

        if (votes) {
            const votedIds = new Set(votes.map((v) => v.feedback_id));
            tickets = tickets.map((t) => ({
                ...t,
                is_voted: votedIds.has(t.id),
            }));
        }
    }

    // Check flag counts (batch query)
    if (tickets.length > 0) {
        const ticketIds = tickets.map((t) => t.id);
        const { data: flags } = await supabase
            .from("feedback_flags")
            .select("feedback_id")
            .in("feedback_id", ticketIds);

        if (flags) {
            const flagCounts: Record<string, number> = {};
            flags.forEach((f) => {
                flagCounts[f.feedback_id] = (flagCounts[f.feedback_id] || 0) +
                    1;
            });
            tickets = tickets.map((t) => ({
                ...t,
                flag_count: flagCounts[t.id] || 0,
            }));
        }

        // Check if current user has flagged
        if (currentUserId) {
            const { data: userFlags } = await supabase
                .from("feedback_flags")
                .select("feedback_id")
                .eq("user_id", currentUserId)
                .in("feedback_id", ticketIds);
            if (userFlags) {
                const flaggedIds = new Set(userFlags.map((f) => f.feedback_id));
                tickets = tickets.map((t) => ({
                    ...t,
                    is_flagged: flaggedIds.has(t.id),
                }));
            }
        }
    }

    // Client-side sort for vote-based ordering (PostgREST can't sort on aggregated counts)
    if (sort === "most_votes") {
        tickets.sort((a, b) => b.vote_count - a.vote_count);
    } else if (sort === "least_votes") {
        tickets.sort((a, b) => a.vote_count - b.vote_count);
    }

    return { tickets, totalCount: count || 0 };
}

// =============================================================================
// Fetch single ticket with comments
// =============================================================================

export async function fetchTicketById(
    id: string,
    currentUserId?: string,
): Promise<FeedbackDetail | null> {
    const { data, error } = await supabase
        .from("user_feedback")
        .select(`
      id,
      title,
      description,
      type,
      status,
      visibility,
      created_at,
      updated_at,
      resolved_at,
      assigned_to,
      author_id,
      author:profiles!author_id(full_name, avatar_url),
      feedback_votes(count),
      feedback_comments(
        id,
        content,
        is_official_response,
        created_at,
        author_id,
        comment_author:profiles!author_id(full_name, avatar_url)
      )
    `)
        .eq("id", id)
        .single();

    if (error || !data) {
        console.error("fetchTicketById error:", error);
        return null;
    }

    const row = data as any;

    // Check user vote
    let isVoted = false;
    if (currentUserId) {
        const { data: vote } = await supabase
            .from("feedback_votes")
            .select("feedback_id")
            .eq("feedback_id", id)
            .eq("user_id", currentUserId)
            .maybeSingle();
        isVoted = !!vote;
    }

    // Fetch ticket-level media
    const { data: ticketMedia } = await supabase
        .from("feedback_media")
        .select(
            "media:media_assets(id, storage_path, media_type, mime_type, metadata)",
        )
        .eq("feedback_id", id)
        .order("display_order");

    const ticketAttachments: MediaAttachment[] = (ticketMedia || [])
        .map((m: any) => m.media)
        .filter(Boolean);

    // Fetch comment-level media
    const commentIds = (row.feedback_comments || []).map((c: any) => c.id);
    let commentMediaMap: Record<string, MediaAttachment[]> = {};
    if (commentIds.length > 0) {
        const { data: commentMedia } = await supabase
            .from("feedback_comment_media")
            .select(
                "comment_id, media:media_assets(id, storage_path, media_type, mime_type, metadata)",
            )
            .in("comment_id", commentIds);
        for (const cm of (commentMedia || []) as any[]) {
            if (!cm.media) continue;
            if (!commentMediaMap[cm.comment_id]) {
                commentMediaMap[cm.comment_id] = [];
            }
            commentMediaMap[cm.comment_id].push(cm.media);
        }
    }

    const result: FeedbackDetail = {
        id: row.id,
        title: row.title,
        description: row.description,
        type: row.type,
        status: row.status,
        visibility: row.visibility,
        created_at: row.created_at,
        updated_at: row.updated_at,
        resolved_at: row.resolved_at,
        assigned_to: row.assigned_to,
        author_id: row.author_id,
        author_name: row.author?.full_name || "Anonymous",
        author_avatar: row.author?.avatar_url || null,
        vote_count: row.feedback_votes?.[0]?.count || 0,
        comment_count: row.feedback_comments?.length || 0,
        is_voted: isVoted,
        flag_count: 0,
        is_flagged: false,
        attachments: ticketAttachments,
        comments: (row.feedback_comments || []).map((c: any) => ({
            id: c.id,
            content: c.content,
            is_official_response: c.is_official_response,
            created_at: c.created_at,
            author_id: c.author_id,
            author_name: c.comment_author?.full_name || "Anonymous",
            author_avatar: c.comment_author?.avatar_url || null,
            attachments: commentMediaMap[c.id] || [],
        })),
    };

    // Fetch flag count and user flag status
    const { data: flags } = await supabase
        .from("feedback_flags")
        .select("user_id")
        .eq("feedback_id", id);
    if (flags) {
        result.flag_count = flags.length;
        if (currentUserId) {
            result.is_flagged = flags.some((f) => f.user_id === currentUserId);
        }
    }

    return result;
}

// =============================================================================
// Create ticket
// =============================================================================

export async function createTicket(data: {
    title: string;
    description: string;
    type: FeedbackType;
    authorId: string;
    files?: File[];
}): Promise<{ id: string } | null> {
    const visibility: FeedbackVisibility = data.type === "support_request"
        ? "private"
        : "public";

    const { data: row, error } = await supabase
        .from("user_feedback")
        .insert({
            title: data.title,
            description: data.description,
            type: data.type,
            author_id: data.authorId,
            visibility,
        })
        .select("id")
        .single();

    if (error) {
        console.error(
            "createTicket error:",
            error.message,
            error.code,
            error.details,
            error.hint,
        );
        return null;
    }

    // Upload attachments if any
    if (data.files && data.files.length > 0 && row) {
        for (let i = 0; i < data.files.length; i++) {
            const file = data.files[i]!;
            const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
            const path = `${data.authorId}/${row.id}/${Date.now()}_${safeName}`;

            const { error: uploadErr } = await supabase.storage
                .from("feedback-media")
                .upload(path, file);

            if (uploadErr) {
                console.error("File upload error:", uploadErr.message);
                continue;
            }

            const { data: urlData } = supabase.storage
                .from("feedback-media")
                .getPublicUrl(path);

            const mediaType = file.type.startsWith("image/")
                ? "image"
                : file.type.startsWith("video/")
                ? "video"
                : "document";

            const { data: asset, error: assetErr } = await supabase
                .from("media_assets")
                .insert({
                    owner_id: data.authorId,
                    storage_path: urlData.publicUrl,
                    media_type: mediaType,
                    mime_type: file.type,
                    metadata: { original_name: file.name, size: file.size },
                })
                .select("id")
                .single();

            if (assetErr) {
                console.error("media_assets insert error:", assetErr.message);
                continue;
            }

            await supabase.from("feedback_media").insert({
                feedback_id: row.id,
                media_id: asset.id,
                display_order: i,
            });
        }
    }

    return { id: row.id };
}

// =============================================================================
// Update ticket status (staff only)
// =============================================================================

export async function updateTicketStatus(
    ticketId: string,
    newStatus: FeedbackStatus,
): Promise<boolean> {
    const { error } = await supabase
        .from("user_feedback")
        .update({ status: newStatus })
        .eq("id", ticketId);

    if (error) {
        console.error("updateTicketStatus error:", error);
        return false;
    }

    return true;
}

// =============================================================================
// Add comment
// =============================================================================

export async function addComment(data: {
    feedbackId: string;
    authorId: string;
    content: string;
    isOfficial?: boolean;
    files?: File[];
}): Promise<FeedbackComment | null> {
    const { data: row, error } = await supabase
        .from("feedback_comments")
        .insert({
            feedback_id: data.feedbackId,
            author_id: data.authorId,
            content: data.content,
            is_official_response: data.isOfficial || false,
        })
        .select(`
      id,
      content,
      is_official_response,
      created_at,
      author_id,
      comment_author:profiles!author_id(full_name, avatar_url)
    `)
        .single();

    if (error) {
        console.error(
            "addComment error:",
            error.message,
            error.code,
            error.details,
            error.hint,
        );
        return null;
    }

    // Upload attachments if any
    if (data.files && data.files.length > 0 && row) {
        for (const file of data.files) {
            const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
            const path = `${data.authorId}/${row.id}/${Date.now()}_${safeName}`;

            // 1) Upload to storage
            const { error: uploadErr } = await supabase.storage
                .from("feedback-media")
                .upload(path, file);

            if (uploadErr) {
                console.error("File upload error:", uploadErr.message);
                continue;
            }

            // 2) Get the public URL
            const { data: urlData } = supabase.storage
                .from("feedback-media")
                .getPublicUrl(path);

            // 3) Determine media type
            const mediaType = file.type.startsWith("image/")
                ? "image"
                : file.type.startsWith("video/")
                ? "video"
                : "document";

            // 4) Create media_assets row
            const { data: asset, error: assetErr } = await supabase
                .from("media_assets")
                .insert({
                    owner_id: data.authorId,
                    storage_path: urlData.publicUrl,
                    media_type: mediaType,
                    mime_type: file.type,
                    metadata: { original_name: file.name, size: file.size },
                })
                .select("id")
                .single();

            if (assetErr) {
                console.error("media_assets insert error:", assetErr.message);
                continue;
            }

            // 5) Link to comment
            await supabase.from("feedback_comment_media").insert({
                comment_id: row.id,
                media_id: asset.id,
            });
        }
    }

    const r = row as any;
    return {
        id: r.id,
        content: r.content,
        is_official_response: r.is_official_response,
        created_at: r.created_at,
        author_id: r.author_id,
        author_name: r.comment_author?.full_name || "Anonymous",
        author_avatar: r.comment_author?.avatar_url || null,
        attachments: [],
    };
}

// =============================================================================
// Toggle vote
// =============================================================================

export async function toggleVote(
    feedbackId: string,
    userId: string,
    currentlyVoted: boolean,
): Promise<boolean> {
    if (currentlyVoted) {
        const { error } = await supabase
            .from("feedback_votes")
            .delete()
            .eq("feedback_id", feedbackId)
            .eq("user_id", userId);
        if (error) {
            console.error("removeVote error:", error);
            return false;
        }
    } else {
        const { error } = await supabase
            .from("feedback_votes")
            .insert({ feedback_id: feedbackId, user_id: userId });
        if (error) {
            console.error("addVote error:", error);
            return false;
        }
    }
    return true;
}

// =============================================================================
// Staff types
// =============================================================================

export type StaffRole = "admin" | "moderator" | "support";

export interface StaffMember {
    id: string;
    email: string;
    user_id: string | null;
    roles: StaffRole[];
    granted_at: string;
    granted_by: string | null;
}

export interface StaffCheckResult {
    isStaff: boolean;
    roles: StaffRole[];
    staffId: string | null;
}

// =============================================================================
// Check staff membership (by email — primary method)
// =============================================================================

export async function checkIsStaffByEmail(
    email: string,
): Promise<StaffCheckResult> {
    // Use SECURITY DEFINER RPC — works before auth (bypasses RLS)
    const { data: isStaff, error: rpcError } = await supabase
        .rpc("is_staff_email", { check_email: email.toLowerCase() });

    if (rpcError) {
        console.error("checkIsStaffByEmail rpc error:", rpcError.message);
        return { isStaff: false, roles: [], staffId: null };
    }

    if (!isStaff) {
        return { isStaff: false, roles: [], staffId: null };
    }

    // Try to get roles (may fail if not authed yet — that's ok for pre-login check)
    const { data } = await supabase
        .from("staff_members")
        .select("id, roles")
        .eq("email", email.toLowerCase())
        .maybeSingle();

    return {
        isStaff: true,
        roles: data?.roles || [],
        staffId: data?.id || null,
    };
}

// Legacy: check by user_id (for backward compat)
export async function checkIsStaff(userId: string): Promise<boolean> {
    const { data, error } = await supabase
        .from("staff_members")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

    if (error) {
        console.error("checkIsStaff error:", error);
        return false;
    }

    return !!data;
}

// =============================================================================
// Link user_id to staff member on first login
// =============================================================================

export async function linkStaffUserId(
    email: string,
    userId: string,
): Promise<boolean> {
    const { error } = await supabase
        .from("staff_members")
        .update({ user_id: userId })
        .eq("email", email.toLowerCase())
        .is("user_id", null);

    if (error) {
        console.error("linkStaffUserId error:", error);
        return false;
    }
    return true;
}

// =============================================================================
// Fetch all staff members (admin-only, gated by RLS)
// =============================================================================

export async function fetchStaffMembers(): Promise<StaffMember[]> {
    const { data, error } = await supabase
        .from("staff_members")
        .select("id, email, user_id, roles, granted_at, granted_by")
        .order("granted_at", { ascending: true });

    if (error) {
        console.error("fetchStaffMembers error:", error);
        return [];
    }

    return (data || []) as StaffMember[];
}

// =============================================================================
// Add staff member (admin-only, gated by RLS)
// =============================================================================

export async function addStaffMember(
    email: string,
    roles: StaffRole[],
): Promise<{ data: StaffMember | null; error: string | null }> {
    const { data, error } = await supabase
        .from("staff_members")
        .insert({
            email: email.toLowerCase().trim(),
            roles,
        })
        .select("id, email, user_id, roles, granted_at, granted_by")
        .single();

    if (error) {
        console.error(
            "addStaffMember error:",
            error.message,
            error.code,
            error.details,
            error.hint,
        );
        return {
            data: null,
            error: error.message || error.details || "Unknown error",
        };
    }

    return { data: data as StaffMember, error: null };
}

// =============================================================================
// Update staff roles (admin-only)
// =============================================================================

export async function updateStaffRoles(
    staffId: string,
    roles: StaffRole[],
): Promise<boolean> {
    const { error } = await supabase
        .from("staff_members")
        .update({ roles })
        .eq("id", staffId);

    if (error) {
        console.error("updateStaffRoles error:", error);
        return false;
    }

    return true;
}

// =============================================================================
// Remove staff member (admin-only)
// =============================================================================

export async function removeStaffMember(staffId: string): Promise<boolean> {
    const { error } = await supabase
        .from("staff_members")
        .delete()
        .eq("id", staffId);

    if (error) {
        console.error("removeStaffMember error:", error);
        return false;
    }

    return true;
}

// =============================================================================
// Fetch report stats (for date range)
// =============================================================================

export async function fetchReportStats(
    startDate?: string,
    endDate?: string,
): Promise<ReportStats> {
    // Build date filter
    let query = supabase.from("user_feedback").select(
        "id, type, status, created_at, resolved_at, feedback_votes(count)",
        { count: "exact" },
    );

    if (startDate) {
        query = query.gte("created_at", startDate + "T00:00:00");
    }
    if (endDate) {
        query = query.lte("created_at", endDate + "T23:59:59");
    }

    const { data, error, count: totalCount } = await query;

    if (error || !data) {
        console.error("fetchReportStats error:", error);
        return {
            avgResolutionDays: 0,
            totalSubmissions: 0,
            closureRate: 0,
            avgVotes: 0,
            statusBreakdown: [],
            weeklyTrend: [],
            voteBuckets: [],
        };
    }

    const total = data.length;

    // Avg resolution time
    const resolved = data.filter((d: any) => d.resolved_at);
    const avgResolutionDays = resolved.length > 0
        ? resolved.reduce((sum: number, d: any) => {
            const created = new Date(d.created_at).getTime();
            const resolvedAt = new Date(d.resolved_at).getTime();
            return sum + (resolvedAt - created) / (1000 * 60 * 60 * 24);
        }, 0) / resolved.length
        : 0;

    // Closure rate
    const closedCount =
        data.filter((d: any) =>
            d.status === "completed" || d.status === "rejected"
        ).length;
    const closureRate = total > 0 ? Math.round((closedCount / total) * 100) : 0;

    // Avg votes
    const totalVotes = data.reduce(
        (sum: number, d: any) => sum + (d.feedback_votes?.[0]?.count || 0),
        0,
    );
    const avgVotes = total > 0 ? Math.round((totalVotes / total) * 10) / 10 : 0;

    // Status breakdown
    const statusMap: Record<string, number> = {};
    data.forEach((d: any) => {
        statusMap[d.status] = (statusMap[d.status] || 0) + 1;
    });
    const statusBreakdown = Object.entries(statusMap).map((
        [status, count],
    ) => ({ status, count }));

    // Weekly trend (group by ISO week)
    const weekMap: Record<string, { bugs: number; features: number }> = {};
    data.forEach((d: any) => {
        const date = new Date(d.created_at);
        const week = `W${Math.ceil((date.getDate()) / 7)}`;
        if (!weekMap[week]) weekMap[week] = { bugs: 0, features: 0 };
        if (d.type === "bug_report") weekMap[week].bugs++;
        else weekMap[week].features++;
    });
    const weeklyTrend = Object.entries(weekMap).map(([week, data]) => ({
        week,
        ...data,
    }));

    // Vote distribution buckets
    const voteCounts = data.map((d: any) => d.feedback_votes?.[0]?.count || 0);
    const buckets = [
        { range: "0", min: 0, max: 0 },
        { range: "1-5", min: 1, max: 5 },
        { range: "6-10", min: 6, max: 10 },
        { range: "11-25", min: 11, max: 25 },
        { range: "26-50", min: 26, max: 50 },
        { range: "50+", min: 51, max: Infinity },
    ];
    const voteBuckets = buckets.map((b) => ({
        range: b.range,
        count: voteCounts.filter((v) => v >= b.min && v <= b.max).length,
    }));

    return {
        avgResolutionDays: Math.round(avgResolutionDays * 10) / 10,
        totalSubmissions: total,
        closureRate,
        avgVotes,
        statusBreakdown,
        weeklyTrend,
        voteBuckets,
    };
}

// =============================================================================
// Fetch unique reporters (for filter dropdown)
// =============================================================================

export async function fetchReporters(): Promise<string[]> {
    const { data, error } = await supabase
        .from("user_feedback")
        .select("author:profiles!author_id(full_name)");

    if (error || !data) return [];

    const names = new Set<string>();
    data.forEach((d: any) => {
        if (d.author?.full_name) names.add(d.author.full_name);
    });
    return Array.from(names).sort();
}

// =============================================================================
// Flag / Unflag / Delete Feedback
// =============================================================================

export async function flagTicket(
    feedbackId: string,
    userId: string,
    reason?: string,
): Promise<boolean> {
    const { error } = await supabase
        .from("feedback_flags")
        .insert({
            feedback_id: feedbackId,
            user_id: userId,
            reason: reason || null,
        });
    if (error) {
        console.error("flagTicket error:", error);
        return false;
    }
    return true;
}

export async function unflagTicket(
    feedbackId: string,
    userId: string,
): Promise<boolean> {
    const { error } = await supabase
        .from("feedback_flags")
        .delete()
        .eq("feedback_id", feedbackId)
        .eq("user_id", userId);
    if (error) {
        console.error("unflagTicket error:", error);
        return false;
    }
    return true;
}

export async function deleteFeedback(feedbackId: string): Promise<boolean> {
    const { error } = await supabase
        .from("user_feedback")
        .delete()
        .eq("id", feedbackId);
    if (error) {
        console.error("deleteFeedback error:", error);
        return false;
    }
    return true;
}

export async function dismissAllFlags(feedbackId: string): Promise<boolean> {
    const { error } = await supabase
        .from("feedback_flags")
        .delete()
        .eq("feedback_id", feedbackId);
    if (error) {
        console.error("dismissAllFlags error:", error);
        return false;
    }
    return true;
}
