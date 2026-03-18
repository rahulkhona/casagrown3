-- =============================================================================
-- Community Chat Feature
-- Group chat scoped to H3 communities in the market app
-- =============================================================================

-- 1. community_chat_messages
CREATE TABLE public.community_chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    community_h3_index text NOT NULL REFERENCES public.communities(h3_index),
    author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    parent_id uuid REFERENCES public.community_chat_messages(id) ON DELETE CASCADE,
    content text NOT NULL CHECK (char_length(content) >= 1 AND char_length(content) <= 2000),
    media jsonb DEFAULT '[]'::jsonb,
    product_listing_id uuid,
    is_system boolean DEFAULT false,
    is_pinned boolean DEFAULT false,
    edited_at timestamptz,
    created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.community_chat_messages IS 'H3-community scoped group chat messages';
COMMENT ON COLUMN public.community_chat_messages.media IS 'Array of {url, storage_path, media_type}';
COMMENT ON COLUMN public.community_chat_messages.product_listing_id IS 'Links to a product listing for auto-posted messages';
COMMENT ON COLUMN public.community_chat_messages.is_system IS 'True for auto-generated product announcements';
COMMENT ON COLUMN public.community_chat_messages.is_pinned IS 'Staff-pinned messages exempt from auto-expiry';

CREATE INDEX idx_ccm_community_created ON public.community_chat_messages(community_h3_index, created_at DESC);
CREATE INDEX idx_ccm_parent ON public.community_chat_messages(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX idx_ccm_author ON public.community_chat_messages(author_id);
CREATE INDEX idx_ccm_product ON public.community_chat_messages(product_listing_id) WHERE product_listing_id IS NOT NULL;

-- 2. community_chat_reactions
CREATE TABLE public.community_chat_reactions (
    message_id uuid NOT NULL REFERENCES public.community_chat_messages(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    emoji text NOT NULL CHECK (emoji IN ('👍','❤️','🎉','😂','😮','🌱')),
    created_at timestamptz DEFAULT now(),
    PRIMARY KEY (message_id, user_id, emoji)
);

COMMENT ON TABLE public.community_chat_reactions IS 'Emoji reactions on community chat messages';

-- 3. community_chat_flags
CREATE TABLE public.community_chat_flags (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    message_id uuid NOT NULL REFERENCES public.community_chat_messages(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reason text NOT NULL DEFAULT 'inappropriate',
    created_at timestamptz DEFAULT now(),
    UNIQUE (message_id, user_id)
);

COMMENT ON TABLE public.community_chat_flags IS 'User flags on inappropriate chat messages; 3+ flags triggers auto-delete';

-- 4. community_chat_mutes
CREATE TABLE public.community_chat_mutes (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    community_h3_index text NOT NULL REFERENCES public.communities(h3_index),
    created_at timestamptz DEFAULT now(),
    PRIMARY KEY (user_id, community_h3_index)
);

COMMENT ON TABLE public.community_chat_mutes IS 'Users who have muted community chat notifications';

-- =============================================================================
-- RLS Policies
-- =============================================================================

ALTER TABLE public.community_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_chat_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_chat_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_chat_mutes ENABLE ROW LEVEL SECURITY;

-- Messages: read from own community
CREATE POLICY "Users can read messages from their community"
    ON public.community_chat_messages FOR SELECT TO authenticated
    USING (
        community_h3_index IN (
            SELECT home_community_h3_index FROM public.profiles WHERE id = auth.uid()
        )
    );

-- Messages: insert into own community (non-banned users only)
CREATE POLICY "Users can post messages to their community"
    ON public.community_chat_messages FOR INSERT TO authenticated
    WITH CHECK (
        author_id = auth.uid()
        AND community_h3_index IN (
            SELECT home_community_h3_index FROM public.profiles
            WHERE id = auth.uid() AND NOT is_banned AND NOT is_ghosted
        )
    );

-- Messages: update own messages only (for editing)
CREATE POLICY "Users can edit their own messages"
    ON public.community_chat_messages FOR UPDATE TO authenticated
    USING (author_id = auth.uid())
    WITH CHECK (author_id = auth.uid());

-- Messages: delete own messages or staff can delete any
CREATE POLICY "Users can delete their own messages"
    ON public.community_chat_messages FOR DELETE TO authenticated
    USING (
        author_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.staff_members
            WHERE user_id = auth.uid()
              AND ('admin' = ANY(roles) OR 'moderator' = ANY(roles))
        )
    );

-- Reactions: read
CREATE POLICY "Users can read reactions"
    ON public.community_chat_reactions FOR SELECT TO authenticated
    USING (true);

-- Reactions: insert own
CREATE POLICY "Users can add reactions"
    ON public.community_chat_reactions FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

-- Reactions: delete own
CREATE POLICY "Users can remove their reactions"
    ON public.community_chat_reactions FOR DELETE TO authenticated
    USING (user_id = auth.uid());

-- Flags: insert own (one per message per user enforced by UNIQUE)
CREATE POLICY "Users can flag messages"
    ON public.community_chat_flags FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

-- Flags: users can read their own flags
CREATE POLICY "Users can see their own flags"
    ON public.community_chat_flags FOR SELECT TO authenticated
    USING (user_id = auth.uid());

-- Mutes: users manage their own mutes
CREATE POLICY "Users can manage their mutes"
    ON public.community_chat_mutes FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- =============================================================================
-- Trigger: Auto-delete messages with 3+ flags
-- =============================================================================

CREATE OR REPLACE FUNCTION public.check_chat_flag_threshold()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_flag_count integer;
BEGIN
    SELECT COUNT(*) INTO v_flag_count
    FROM public.community_chat_flags
    WHERE message_id = NEW.message_id;

    IF v_flag_count >= 3 THEN
        -- Delete the message (CASCADE will remove replies, reactions, and flags)
        DELETE FROM public.community_chat_messages WHERE id = NEW.message_id;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_chat_flag_threshold
    AFTER INSERT ON public.community_chat_flags
    FOR EACH ROW
    EXECUTE FUNCTION public.check_chat_flag_threshold();

-- =============================================================================
-- RPC: Fetch paginated community chat messages with author info + counts
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
    WHERE m.community_h3_index = p_h3_index
      AND m.parent_id IS NULL  -- Only top-level messages
      AND (p_cursor IS NULL OR m.created_at < p_cursor)
    ORDER BY m.created_at DESC
    LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION public.get_community_chat_messages IS 'Fetch paginated top-level community chat messages with author info, reaction counts, and reply counts';

-- =============================================================================
-- RPC: Fetch thread replies for a message
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_community_chat_replies(
    p_parent_id uuid,
    p_limit integer DEFAULT 50
)
RETURNS TABLE (
    id uuid,
    author_id uuid,
    author_name text,
    author_avatar_url text,
    content text,
    media jsonb,
    is_system boolean,
    edited_at timestamptz,
    created_at timestamptz,
    reaction_counts jsonb,
    user_reactions text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        m.id,
        m.author_id,
        p.full_name AS author_name,
        p.avatar_url AS author_avatar_url,
        m.content,
        m.media,
        m.is_system,
        m.edited_at,
        m.created_at,
        COALESCE(
            (SELECT jsonb_object_agg(r.emoji, r.cnt)
             FROM (SELECT emoji, COUNT(*) AS cnt FROM public.community_chat_reactions WHERE message_id = m.id GROUP BY emoji) r),
            '{}'::jsonb
        ) AS reaction_counts,
        ARRAY(
            SELECT emoji FROM public.community_chat_reactions
            WHERE message_id = m.id AND user_id = auth.uid()
        ) AS user_reactions
    FROM public.community_chat_messages m
    JOIN public.profiles p ON p.id = m.author_id
    WHERE m.parent_id = p_parent_id
    ORDER BY m.created_at ASC
    LIMIT p_limit;
END;
$$;

-- =============================================================================
-- RPC: Get unread count for community chat badge
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_community_chat_unread_count(
    p_h3_index text,
    p_last_seen_at timestamptz
)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT COUNT(*)
    FROM public.community_chat_messages
    WHERE community_h3_index = p_h3_index
      AND parent_id IS NULL
      AND created_at > p_last_seen_at
      AND author_id != auth.uid();
$$;

-- =============================================================================
-- RPC: Search community chat messages
-- =============================================================================

CREATE OR REPLACE FUNCTION public.search_community_chat(
    p_h3_index text,
    p_query text,
    p_limit integer DEFAULT 20
)
RETURNS TABLE (
    id uuid,
    author_name text,
    author_avatar_url text,
    content text,
    created_at timestamptz,
    parent_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        m.id,
        p.full_name AS author_name,
        p.avatar_url AS author_avatar_url,
        m.content,
        m.created_at,
        m.parent_id
    FROM public.community_chat_messages m
    JOIN public.profiles p ON p.id = m.author_id
    WHERE m.community_h3_index = p_h3_index
      AND m.content ILIKE '%' || p_query || '%'
    ORDER BY m.created_at DESC
    LIMIT p_limit;
END;
$$;

-- =============================================================================
-- Function: Cleanup stale community chat messages (7-day expiry)
-- Called via pg_cron or edge function
-- =============================================================================

CREATE OR REPLACE FUNCTION public.cleanup_stale_chat_messages()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_deleted integer;
BEGIN
    -- Delete non-pinned, top-level messages older than 7 days
    -- CASCADE will remove their replies, reactions, and flags
    WITH deleted AS (
        DELETE FROM public.community_chat_messages
        WHERE created_at < now() - interval '7 days'
          AND is_pinned = false
          AND parent_id IS NULL  -- only top-level; replies cascade
        RETURNING id
    )
    SELECT COUNT(*) INTO v_deleted FROM deleted;

    -- Also delete orphaned replies (whose parent was already deleted)
    DELETE FROM public.community_chat_messages
    WHERE parent_id IS NOT NULL
      AND parent_id NOT IN (SELECT id FROM public.community_chat_messages);

    RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION public.cleanup_stale_chat_messages IS 'Deletes non-pinned community chat messages older than 7 days. Returns number of deleted messages.';

-- Schedule hourly cleanup via pg_cron (if extension available)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.schedule(
            'cleanup-stale-chat-messages',
            '0 * * * *',  -- every hour
            'SELECT public.cleanup_stale_chat_messages()'
        );
    END IF;
END;
$$;

-- =============================================================================
-- Trigger: Auto-post system message when a new product is listed
-- =============================================================================

CREATE OR REPLACE FUNCTION public.auto_post_product_to_chat()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_h3_index text;
    v_author_name text;
    v_message text;
    v_author_id uuid;
BEGIN
    -- Get the author_id from the parent post
    SELECT author_id INTO v_author_id
    FROM public.posts
    WHERE id = NEW.post_id;

    -- Get the community H3 index from the seller's profile
    SELECT home_community_h3_index, full_name
    INTO v_h3_index, v_author_name
    FROM public.profiles
    WHERE id = v_author_id;

    IF v_h3_index IS NOT NULL THEN
        v_message := v_author_name || ' just listed ' || NEW.produce_name ||
                     ' at their booth! Check it out when the market opens. 🛒';

        INSERT INTO public.community_chat_messages (
            community_h3_index, author_id, content,
            product_listing_id, is_system
        ) VALUES (
            v_h3_index, v_author_id, v_message,
            NEW.id, true
        );
    END IF;

    RETURN NEW;
END;
$$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'want_to_sell_details' AND table_schema = 'public') THEN
        CREATE TRIGGER trg_auto_post_product_to_chat
            AFTER INSERT ON public.want_to_sell_details
            FOR EACH ROW
            EXECUTE FUNCTION public.auto_post_product_to_chat();
    END IF;
END;
$$;

-- =============================================================================
-- Storage bucket for community chat media
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'community-chat-media',
    'community-chat-media',
    true,
    10485760,  -- 10MB
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Authenticated users can upload chat media"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'community-chat-media');

CREATE POLICY "Anyone can view chat media"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'community-chat-media');

CREATE POLICY "Users can delete their own chat media"
    ON storage.objects FOR DELETE TO authenticated
    USING (
        bucket_id = 'community-chat-media'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );
