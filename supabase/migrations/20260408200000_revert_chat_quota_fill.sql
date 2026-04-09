-- =============================================================================
-- Global Flat Feed Community Chat Architecture
-- Drops all community.buzz_scope evaluations (zip/h3/global) to ensure
-- ALL messages are natively returned chronologically in a massive global feed.
-- =============================================================================

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
BEGIN
    RETURN QUERY
    SELECT
        m.id,
        m.community_h3_index,
        m.author_id,
        p.full_name AS author_name,
        p.avatar_url AS author_avatar_url,
        m.parent_id,
        m.content,
        m.media,
        m.product_listing_id,
        m.is_system,
        m.is_pinned,
        m.edited_at,
        m.created_at,
        m.bumped_at,
        COALESCE(
            (SELECT jsonb_object_agg(r.emoji, r.cnt)
             FROM (SELECT emoji, COUNT(*) AS cnt FROM public.community_chat_reactions WHERE message_id = m.id GROUP BY emoji) r),
            '{}'::jsonb
        ) AS reaction_counts,
        (SELECT COUNT(*) FROM public.community_chat_messages child WHERE child.parent_id = m.id) AS reply_count,
        ARRAY(
            SELECT emoji FROM public.community_chat_reactions
            WHERE message_id = m.id AND user_id = auth.uid()
        ) AS user_reactions,
        (SELECT COUNT(*) FROM public.community_chat_flags WHERE message_id = m.id) AS flag_count
    FROM public.community_chat_messages m
    JOIN public.profiles p ON p.id = m.author_id
    WHERE m.parent_id IS NULL
      AND (p_cursor IS NULL OR COALESCE(m.bumped_at, m.created_at) < p_cursor)
    ORDER BY COALESCE(m.bumped_at, m.created_at) DESC
    LIMIT p_limit;
END;
$$;

-- =============================================================================
-- Global Flat Feed Unread Count Sync
-- Drops scope checks to evaluate unread messages globally across the entire app.
-- =============================================================================
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
    FROM public.community_chat_messages m
    WHERE m.parent_id IS NULL
      AND m.created_at > p_last_seen_at
      AND m.author_id != auth.uid();

    RETURN v_count;
END;
$$;
