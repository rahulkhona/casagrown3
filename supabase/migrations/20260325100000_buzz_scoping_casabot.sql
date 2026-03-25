-- =============================================================================
-- Buzz Global Scoping, Demo Messages, and CasaBot
-- =============================================================================

-- 1. Add buzz_scope column to communities
ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS buzz_scope text NOT NULL DEFAULT 'global';

COMMENT ON COLUMN public.communities.buzz_scope IS 'Controls message visibility: global=all messages, zip=same 5-digit zip from profiles, h3=own cell only. Auto-adjusts based on membership.';

-- 2. Open RLS SELECT on community_chat_messages for all authenticated users
--    (was restricted to own h3 community only)
DROP POLICY IF EXISTS "Users can read messages from their community"
  ON public.community_chat_messages;

CREATE POLICY "Authenticated users can read all community messages"
  ON public.community_chat_messages FOR SELECT TO authenticated
  USING (true);

-- 3. Update get_community_chat_messages RPC to support scope-based filtering
--    Scope levels: global (show all), zip (same 5-digit zip), h3 (own cell)
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
DECLARE
    v_scope text;
    v_zip5 text;
BEGIN
    -- Look up the buzz_scope for the user's community
    SELECT c.buzz_scope INTO v_scope
    FROM public.communities c
    WHERE c.h3_index = p_h3_index;

    -- Default to global if community not found
    v_scope := COALESCE(v_scope, 'global');

    -- If scope is 'zip', get the 5-digit zip from the calling user's profile
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
    WHERE m.parent_id IS NULL  -- Only top-level messages
      AND (p_cursor IS NULL OR m.created_at < p_cursor)
      -- Scope-based filtering:
      AND (
          v_scope = 'global'                                          -- show all messages
          OR (v_scope = 'h3' AND m.community_h3_index = p_h3_index)  -- own H3 cell only
          OR (v_scope = 'zip' AND m.author_id IN (
              -- Authors whose 5-digit zip matches the calling user's zip
              SELECT pr2.id FROM public.profiles pr2
              WHERE LEFT(pr2.zip_code, 5) = v_zip5
          ))
      )
    ORDER BY m.created_at DESC
    LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION public.get_community_chat_messages IS 'Fetch paginated community chat messages with scope-based filtering (global/zip/h3). Zip scope uses first 5 digits of profiles.zip_code (zip+4 format).';

-- 4. Update unread count RPC for scope awareness
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
    v_scope text;
    v_zip5 text;
    v_count bigint;
BEGIN
    SELECT c.buzz_scope INTO v_scope
    FROM public.communities c WHERE c.h3_index = p_h3_index;
    v_scope := COALESCE(v_scope, 'global');

    IF v_scope = 'zip' THEN
        SELECT LEFT(pr.zip_code, 5) INTO v_zip5
        FROM public.profiles pr WHERE pr.id = auth.uid();
    END IF;

    SELECT COUNT(*) INTO v_count
    FROM public.community_chat_messages
    WHERE parent_id IS NULL
      AND created_at > p_last_seen_at
      AND author_id != auth.uid()
      AND (
          v_scope = 'global'
          OR (v_scope = 'h3' AND community_h3_index = p_h3_index)
          OR (v_scope = 'zip' AND author_id IN (
              SELECT pr2.id FROM public.profiles pr2
              WHERE LEFT(pr2.zip_code, 5) = v_zip5
          ))
      );

    RETURN v_count;
END;
$$;

-- 5. Create CasaBot system user and profile
DO $$
DECLARE
    v_bot_id uuid := 'a0000000-0000-0000-0000-00000ca5ab07';
    v_h3 text;
BEGIN
    -- Get a valid h3_index from existing communities
    SELECT h3_index INTO v_h3 FROM public.communities LIMIT 1;

    -- If no community exists, skip CasaBot creation
    IF v_h3 IS NULL THEN
        RAISE NOTICE 'No communities found — skipping CasaBot seed';
        RETURN;
    END IF;

    -- Insert into auth.users if not exists
    INSERT INTO auth.users (
        id, instance_id, email, encrypted_password,
        email_confirmed_at, role, aud, created_at, updated_at
    ) VALUES (
        v_bot_id,
        '00000000-0000-0000-0000-000000000000',
        'casabot@casagrown.com',
        extensions.crypt('casabot-system-account-not-loginable', extensions.gen_salt('bf')),
        now(), 'authenticated', 'authenticated', now(), now()
    ) ON CONFLICT (id) DO NOTHING;

    -- Create profile for CasaBot
    INSERT INTO public.profiles (
        id, email, full_name, avatar_url, home_community_h3_index
    ) VALUES (
        v_bot_id,
        'casabot@casagrown.com',
        'CasaBot 🌱',
        '/logo.png',
        v_h3
    ) ON CONFLICT (id) DO UPDATE SET
        full_name = 'CasaBot 🌱',
        avatar_url = '/logo.png',
        email = 'casabot@casagrown.com';

    -- 6. Seed demo community messages (only if no messages exist yet)
    IF NOT EXISTS (SELECT 1 FROM public.community_chat_messages LIMIT 1) THEN
        INSERT INTO public.community_chat_messages (community_h3_index, author_id, content, is_system, is_pinned)
        VALUES (v_h3, v_bot_id,
            '👋 Welcome to CasaGrown Community! Share gardening tips, trade produce, and connect with neighbors. Say hello! 🌿',
            true, true);

        INSERT INTO public.community_chat_messages (community_h3_index, author_id, content, is_system)
        VALUES (v_h3, v_bot_id,
            '🌱 **Gardening Tip**: March is perfect for starting tomato seedlings indoors! They need 6-8 weeks before transplanting. Keep soil around 70-75°F for fastest germination.',
            true);

        INSERT INTO public.community_chat_messages (community_h3_index, author_id, content, is_system)
        VALUES (v_h3, v_bot_id,
            '🐝 Did you know? Planting marigolds near your vegetable garden repels pests naturally and attracts pollinators!',
            true);

        INSERT INTO public.community_chat_messages (community_h3_index, author_id, content, is_system)
        VALUES (v_h3, v_bot_id,
            '💡 Have excess produce? Tap "📸 Sell Excess Produce" on the market page to share with neighbors!',
            true);

        INSERT INTO public.community_chat_messages (community_h3_index, author_id, content, is_system)
        VALUES (v_h3, v_bot_id,
            '🌻 Ask me anything about gardening! Mention @CasaBot for planting schedules, pest control, soil tips, and more.',
            true);
    END IF;
END;
$$;
