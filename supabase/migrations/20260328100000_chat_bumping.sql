-- Add bumped_at to community chat messages
ALTER TABLE public.community_chat_messages
  ADD COLUMN IF NOT EXISTS bumped_at timestamptz;

-- Update the RPC to use bumped_at for sorting
DROP FUNCTION IF EXISTS public.get_community_chat_messages(text, timestamptz, integer);

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
    v_scope text;
    v_zip5 text;
BEGIN
    SELECT c.buzz_scope INTO v_scope
    FROM public.communities c
    WHERE c.h3_index = p_h3_index;

    v_scope := COALESCE(v_scope, 'global');

    IF v_scope = 'zip' THEN
        SELECT LEFT(pr.zip_code, 5) INTO v_zip5
        FROM public.profiles pr
        WHERE pr.id = auth.uid();
    END IF;

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
      AND (
          v_scope = 'global'
          OR (v_scope = 'h3' AND m.community_h3_index = p_h3_index)
          OR (v_scope = 'zip' AND m.author_id IN (
              SELECT pr2.id FROM public.profiles pr2
              WHERE LEFT(pr2.zip_code, 5) = v_zip5
          ))
      )
    ORDER BY COALESCE(m.bumped_at, m.created_at) DESC
    LIMIT p_limit;
END;
$$;
