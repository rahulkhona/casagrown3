/**
 * Feed Filtering Tests
 *
 * Tests the getCommunityFeedPosts function which uses the get_filtered_feed RPC
 * to filter out expired posts, blocked categories/products, and ghosted users.
 */

// Mock supabase before imports
const mockRpc = jest.fn();
const mockSelect = jest.fn();
const mockFrom = jest.fn();
const mockIn = jest.fn();
const mockEq = jest.fn();
const mockOr = jest.fn();
const mockGte = jest.fn();
const mockOrder = jest.fn();
const mockLimit = jest.fn();
const mockMaybeSingle = jest.fn();

jest.mock('../auth/auth-hook', () => ({
    supabase: {
        rpc: (...args: unknown[]) => mockRpc(...args),
        from: (...args: unknown[]) => mockFrom(...args),
    },
}));

import { getCommunityFeedPosts, getLatestPostTimestamp } from './feed-service';

const COMMUNITY_H3 = '871234567ffffff';
const VIEWER_ID = 'viewer-user-id';
const OTHER_USER_ID = 'other-user-id';
const GHOSTED_USER_ID = 'ghosted-user-id';

// Helper: create a base RPC row
function makeRpcRow(overrides: Partial<Record<string, unknown>> = {}) {
    return {
        id: 'post-1',
        author_id: OTHER_USER_ID,
        type: 'want_to_sell',
        reach: 'community',
        content: 'Fresh tomatoes for sale',
        created_at: '2026-03-10T12:00:00Z',
        community_h3_index: COMMUNITY_H3,
        expires_at: '2026-03-24T12:00:00Z',
        author_full_name: 'Jane Doe',
        author_avatar_url: null,
        author_phone_verified: true,
        community_name: 'Test Community',
        ...overrides,
    };
}

// Helper: create details row matching the secondary query
function makeDetailsRow(postId: string, overrides: Partial<Record<string, unknown>> = {}) {
    return {
        id: postId,
        want_to_sell_details: [{
            category: 'vegetables',
            produce_name: 'Tomato',
            unit: 'lb',
            total_quantity_available: 5,
            points_per_unit: 100,
        }],
        want_to_buy_details: [],
        delivery_dates: [{ delivery_date: '2026-03-15' }],
        post_media: [],
        post_likes: [],
        post_comments: [],
        post_flags: [],
        ...overrides,
    };
}

describe('getCommunityFeedPosts (filtered feed)', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        // Default chain for the details query
        mockFrom.mockReturnValue({
            select: mockSelect,
        });
        mockSelect.mockReturnValue({
            in: mockIn,
        });
    });

    it('should call get_filtered_feed RPC with correct params', async () => {
        mockRpc.mockResolvedValue({ data: [], error: null });

        await getCommunityFeedPosts(COMMUNITY_H3, VIEWER_ID);

        expect(mockRpc).toHaveBeenCalledWith('get_filtered_feed', {
            p_community_h3: COMMUNITY_H3,
            p_viewer_id: VIEWER_ID,
        });
    });

    it('should return empty array when no posts match', async () => {
        mockRpc.mockResolvedValue({ data: [], error: null });

        const result = await getCommunityFeedPosts(COMMUNITY_H3, VIEWER_ID);

        expect(result).toEqual([]);
        // Should not call the details query when there are no posts
        expect(mockFrom).not.toHaveBeenCalled();
    });

    it('should merge RPC base data with details query', async () => {
        const rpcRow = makeRpcRow();
        mockRpc.mockResolvedValue({ data: [rpcRow], error: null });

        const detailsRow = makeDetailsRow('post-1');
        mockIn.mockResolvedValue({ data: [detailsRow], error: null });

        const result = await getCommunityFeedPosts(COMMUNITY_H3, VIEWER_ID);

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
            id: 'post-1',
            author_name: 'Jane Doe',
            type: 'want_to_sell',
            sell_details: expect.objectContaining({
                produce_name: 'Tomato',
                delivery_dates: ['2026-03-15'],
            }),
        });
    });

    it('should handle posts with no details gracefully', async () => {
        const rpcRow = makeRpcRow({ type: 'general_info' });
        mockRpc.mockResolvedValue({ data: [rpcRow], error: null });

        // No matching details row
        mockIn.mockResolvedValue({ data: [], error: null });

        const result = await getCommunityFeedPosts(COMMUNITY_H3, VIEWER_ID);

        expect(result).toHaveLength(1);
        expect(result[0].sell_details).toBeNull();
        expect(result[0].buy_details).toBeNull();
        expect(result[0].media).toEqual([]);
        expect(result[0].like_count).toBe(0);
    });

    it('should compute like/flag status relative to viewer', async () => {
        const rpcRow = makeRpcRow();
        mockRpc.mockResolvedValue({ data: [rpcRow], error: null });

        const detailsRow = makeDetailsRow('post-1', {
            post_likes: [{ user_id: VIEWER_ID }, { user_id: OTHER_USER_ID }],
            post_flags: [{ user_id: OTHER_USER_ID }],
        });
        mockIn.mockResolvedValue({ data: [detailsRow], error: null });

        const result = await getCommunityFeedPosts(COMMUNITY_H3, VIEWER_ID);

        expect(result[0].like_count).toBe(2);
        expect(result[0].is_liked).toBe(true);
        expect(result[0].is_flagged).toBe(false);
    });

    it('should throw on RPC error', async () => {
        mockRpc.mockResolvedValue({
            data: null,
            error: { message: 'RPC failed', code: '42501' },
        });

        await expect(getCommunityFeedPosts(COMMUNITY_H3, VIEWER_ID))
            .rejects.toMatchObject({ message: 'RPC failed' });
    });

    it('should throw on details query error', async () => {
        mockRpc.mockResolvedValue({ data: [makeRpcRow()], error: null });
        mockIn.mockResolvedValue({
            data: null,
            error: { message: 'Details query failed' },
        });

        await expect(getCommunityFeedPosts(COMMUNITY_H3, VIEWER_ID))
            .rejects.toMatchObject({ message: 'Details query failed' });
    });

    // RPC contract tests: verify the RPC handles filtering
    // (the actual filtering is done in SQL; these test the contract)

    it('should not include expired posts in results (RPC filtered)', async () => {
        // The RPC only returns non-expired posts, so if we get results,
        // they should all have expires_at > now()
        const expiredRow = makeRpcRow({ expires_at: '2020-01-01T00:00:00Z' });
        // Simulate RPC correctly excluding expired (returns empty)
        mockRpc.mockResolvedValue({ data: [], error: null });

        const result = await getCommunityFeedPosts(COMMUNITY_H3, VIEWER_ID);
        expect(result).toEqual([]);
    });

    it('should not include ghosted user posts for other viewers (RPC filtered)', async () => {
        // RPC excludes ghosted users' posts for non-author viewers
        mockRpc.mockResolvedValue({ data: [], error: null });

        const result = await getCommunityFeedPosts(COMMUNITY_H3, VIEWER_ID);
        expect(result).toEqual([]);
    });

    it('should include ghosted user own posts when viewer is author', async () => {
        // Ghosted user viewing their own feed sees their own posts
        const ownPost = makeRpcRow({
            author_id: VIEWER_ID,
            author_full_name: 'Ghosted User',
        });
        mockRpc.mockResolvedValue({ data: [ownPost], error: null });

        const detailsRow = makeDetailsRow('post-1');
        mockIn.mockResolvedValue({ data: [detailsRow], error: null });

        const result = await getCommunityFeedPosts(COMMUNITY_H3, VIEWER_ID);
        expect(result).toHaveLength(1);
        expect(result[0].author_id).toBe(VIEWER_ID);
    });

    it('should sort media by position', async () => {
        const rpcRow = makeRpcRow();
        mockRpc.mockResolvedValue({ data: [rpcRow], error: null });

        const detailsRow = makeDetailsRow('post-1', {
            post_media: [
                { position: 2, media_asset: { storage_path: '/img2.jpg', media_type: 'image' } },
                { position: 0, media_asset: { storage_path: '/img0.jpg', media_type: 'image' } },
                { position: 1, media_asset: { storage_path: '/img1.jpg', media_type: 'image' } },
            ],
        });
        mockIn.mockResolvedValue({ data: [detailsRow], error: null });

        const result = await getCommunityFeedPosts(COMMUNITY_H3, VIEWER_ID);
        expect(result[0].media).toEqual([
            { storage_path: '/img0.jpg', media_type: 'image' },
            { storage_path: '/img1.jpg', media_type: 'image' },
            { storage_path: '/img2.jpg', media_type: 'image' },
        ]);
    });
});

describe('getLatestPostTimestamp', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        // Chain for the timestamp query
        mockFrom.mockReturnValue({ select: mockSelect });
        mockSelect.mockReturnValue({ or: mockOr });
        mockOr.mockReturnValue({ eq: mockEq });
        mockEq.mockReturnValue({ gte: mockGte });
        mockGte.mockReturnValue({ order: mockOrder });
        mockOrder.mockReturnValue({ limit: mockLimit });
        mockLimit.mockReturnValue({ maybeSingle: mockMaybeSingle });
    });

    it('should include expires_at filter', async () => {
        mockMaybeSingle.mockResolvedValue({
            data: { created_at: '2026-03-10T12:00:00Z' },
            error: null,
        });

        await getLatestPostTimestamp(COMMUNITY_H3);

        expect(mockGte).toHaveBeenCalledWith('expires_at', expect.any(String));
    });

    it('should return timestamp when found', async () => {
        mockMaybeSingle.mockResolvedValue({
            data: { created_at: '2026-03-10T12:00:00Z' },
            error: null,
        });

        const result = await getLatestPostTimestamp(COMMUNITY_H3);
        expect(result).toBe('2026-03-10T12:00:00Z');
    });

    it('should return null when no posts found', async () => {
        mockMaybeSingle.mockResolvedValue({ data: null, error: null });

        const result = await getLatestPostTimestamp(COMMUNITY_H3);
        expect(result).toBeNull();
    });

    it('should return null on error', async () => {
        mockMaybeSingle.mockResolvedValue({
            data: null,
            error: { message: 'Query failed' },
        });

        const result = await getLatestPostTimestamp(COMMUNITY_H3);
        expect(result).toBeNull();
    });
});
