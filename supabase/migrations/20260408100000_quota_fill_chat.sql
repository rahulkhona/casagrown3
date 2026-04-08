-- =============================================================================
-- Dynamic Geographic Quota Fill for Community Chat
-- Replaces rigid 'buzz_scope' boundaries with a dynamic water-fill algorithm
-- that prioritizes Local (H3) > Zip > Global up to the requested request limit.
-- =============================================================================

-- 1. Redefine the get_community_chat_messages RPC using Quota Fill strategy
CREATE OR REPLACE FUNCTION public.get_community_chat_messages(
    p_h3_index text,
    p_cursor timestamptz DEFAULT NULL,
    p_limit integer DEFAULT 50
)
RETURNS TABLE (
    id uuid,
    community_h3_index text,
    author_id uuid,
    author_name text,
    author_avatar_url text,
    parent_id uuid,
    content text,
    media jsonb,
    product_listing_id uuid,
    is_system boolean,
    is_pinned boolean,
    edited_at timestamptz,
    created_at timestamptz,
    bumped_at timestamptz,
    reaction_counts jsonb,
    reply_count bigint,
    user_reactions text[],
    flag_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    v_zip5 text;
BEGIN
    -- Get the 5-digit zip from the calling user's profile for Tier 2 evaluation
    SELECT LEFT(pr.zip_code, 5) INTO v_zip5
    FROM public.profiles pr
    WHERE pr.id = auth.uid();

    RETURN QUERY
    WITH scoped_messages AS (
        -- Tier 1: Local (H3)
        SELECT 
            m.*,
            1 as tier_rank
        FROM public.community_chat_messages m
        WHERE m.parent_id IS NULL 
          AND m.community_h3_index = p_h3_index
          AND (p_cursor IS NULL OR COALESCE(m.bumped_at, m.created_at) < p_cursor)
        ORDER BY COALESCE(m.bumped_at, m.created_at) DESC
        LIMIT p_limit
    ), zip_messages AS (
        -- Tier 2: Zip code
        SELECT 
            m.*,
            2 as tier_rank
        FROM public.community_chat_messages m
        WHERE m.parent_id IS NULL 
          AND m.id NOT IN (SELECT sm.id FROM scoped_messages sm)
          AND m.author_id IN (
              SELECT pr2.id FROM public.profiles pr2
              WHERE LEFT(pr2.zip_code, 5) = v_zip5
          )
          AND (p_cursor IS NULL OR COALESCE(m.bumped_at, m.created_at) < p_cursor)
        ORDER BY COALESCE(m.bumped_at, m.created_at) DESC
        LIMIT p_limit
    ), global_messages AS (
        -- Tier 3: Global
        SELECT 
            m.*,
            3 as tier_rank
        FROM public.community_chat_messages m
        WHERE m.parent_id IS NULL 
          AND m.id NOT IN (SELECT sm.id FROM scoped_messages sm UNION SELECT zm.id FROM zip_messages zm)
          AND (p_cursor IS NULL OR COALESCE(m.bumped_at, m.created_at) < p_cursor)
        ORDER BY COALESCE(m.bumped_at, m.created_at) DESC
        LIMIT p_limit
    ),
    combined AS (
        SELECT * FROM scoped_messages
        UNION ALL
        SELECT * FROM zip_messages
        UNION ALL
        SELECT * FROM global_messages
    ),
    prioritized AS (
        -- Combine all tiers and slice exactly to the quota count,
        -- prioritizing Tier 1 over Tier 2 over Tier 3.
        SELECT * FROM combined c
        ORDER BY c.tier_rank ASC, COALESCE(c.bumped_at, c.created_at) DESC
        LIMIT p_limit
    )
    SELECT
        p.id,
        p.community_h3_index,
        p.author_id,
        pr.full_name AS author_name,
        pr.avatar_url AS author_avatar_url,
        p.parent_id,
        p.content,
        p.media,
        p.product_listing_id,
        p.is_system,
        p.is_pinned,
        p.edited_at,
        p.created_at,
        p.bumped_at,
        COALESCE(
            (SELECT jsonb_object_agg(r.emoji, r.cnt)
             FROM (SELECT emoji, COUNT(*) AS cnt FROM public.community_chat_reactions WHERE message_id = p.id GROUP BY emoji) r),
            '{}'::jsonb
        ) AS reaction_counts,
        (SELECT COUNT(*) FROM public.community_chat_messages child WHERE child.parent_id = p.id) AS reply_count,
        ARRAY(
            SELECT emoji FROM public.community_chat_reactions
            WHERE message_id = p.id AND user_id = auth.uid()
        ) AS user_reactions,
        (SELECT COUNT(*) FROM public.community_chat_flags WHERE message_id = p.id) AS flag_count
    FROM prioritized p
    JOIN public.profiles pr ON pr.id = p.author_id
    -- Final pass: sort the unified quota chronological feed exactly by time for the UI
    ORDER BY COALESCE(p.bumped_at, p.created_at) DESC;
END;
$$;

COMMENT ON FUNCTION public.get_community_chat_messages IS 'Fetch paginated community chat messages using a dynamic Geographic Quota-Fill algorithm. Prioritizes up to limit Local H3, then Zip, then Global.';

-- 2. Update unread count RPC to be strictly local
-- Since feeds theoretically include national messages, we don't want "unread" badges for national activity.
-- We must restrict badges to hyper-local (H3) interaction only.
CREATE OR REPLACE FUNCTION public.get_community_chat_unread_count(
    p_h3_index text,
    p_last_seen_at timestamptz
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    v_count bigint;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM public.community_chat_messages
    WHERE parent_id IS NULL
      AND created_at > p_last_seen_at
      AND author_id != auth.uid()
      AND community_h3_index = p_h3_index;

    RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.get_community_chat_unread_count IS 'Get unread chat count restricted strictly to local H3 cell activity.';
