-- 1. Create market_blocks (Trust & Safety)
CREATE TABLE public.market_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blocker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(blocker_id, blocked_id)
);

ALTER TABLE public.market_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own blocks" ON public.market_blocks FOR SELECT USING (blocker_id = auth.uid() OR blocked_id = auth.uid());
CREATE POLICY "Users can create blocks" ON public.market_blocks FOR INSERT WITH CHECK (blocker_id = auth.uid());
CREATE POLICY "Users can manage their own blocks" ON public.market_blocks FOR DELETE USING (blocker_id = auth.uid());

-- 2. Create market_conversations
CREATE TABLE public.market_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_a UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    participant_b UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    unread_count_a INTEGER NOT NULL DEFAULT 0,
    unread_count_b INTEGER NOT NULL DEFAULT 0,
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(participant_a, participant_b)
);

ALTER TABLE public.market_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own conversations" ON public.market_conversations 
FOR SELECT USING (auth.uid() = participant_a OR auth.uid() = participant_b);

CREATE POLICY "Users can create conversations" ON public.market_conversations 
FOR INSERT WITH CHECK (
  (auth.uid() = participant_a OR auth.uid() = participant_b) AND
  -- Safety clause: prevent creation if blocked
  NOT EXISTS (
    SELECT 1 FROM public.market_blocks b 
    WHERE b.blocker_id = (CASE WHEN auth.uid() = participant_a THEN participant_b ELSE participant_a END)
      AND b.blocked_id = auth.uid()
  )
);

CREATE POLICY "Users can update their conversations" ON public.market_conversations 
FOR UPDATE USING (auth.uid() = participant_a OR auth.uid() = participant_b);

-- 3. Create market_chat_messages
CREATE TABLE public.market_chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.market_conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES public.market_chat_messages(id) ON DELETE CASCADE,
    content TEXT NOT NULL CHECK (char_length(content) >= 1 AND char_length(content) <= 2000),
    media JSONB DEFAULT '[]'::jsonb,
    offer_product_id UUID REFERENCES public.market_products(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.market_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view messages in their conversations" ON public.market_chat_messages 
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.market_conversations c
    WHERE c.id = conversation_id AND (c.participant_a = auth.uid() OR c.participant_b = auth.uid())
  )
);

CREATE POLICY "Users can insert messages" ON public.market_chat_messages 
FOR INSERT WITH CHECK (
  sender_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM public.market_conversations c
    WHERE c.id = conversation_id AND (c.participant_a = auth.uid() OR c.participant_b = auth.uid())
  ) AND
  -- Safety clause: check if the recipient blocked the sender
  NOT EXISTS (
    SELECT 1 FROM public.market_conversations c
    JOIN public.market_blocks b ON (b.blocker_id = (CASE WHEN c.participant_a = auth.uid() THEN c.participant_b ELSE c.participant_a END) AND b.blocked_id = auth.uid())
    WHERE c.id = conversation_id
  )
);

-- Trigger to auto-update market_conversations on new messages
CREATE OR REPLACE FUNCTION public.update_market_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.market_conversations
  SET last_message_at = NEW.created_at, 
      updated_at = NOW(),
      unread_count_a = CASE WHEN participant_b = NEW.sender_id THEN unread_count_a + 1 ELSE unread_count_a END,
      unread_count_b = CASE WHEN participant_a = NEW.sender_id THEN unread_count_b + 1 ELSE unread_count_b END
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_new_market_chat_message
  AFTER INSERT ON public.market_chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_market_conversation_timestamp();


--------------------------------------------------------------------------------

-- 4. Search RPC prioritizing Buzz, Network, and Proximity
CREATE OR REPLACE FUNCTION public.search_dm_users(
  p_query TEXT,
  p_user_lat DOUBLE PRECISION,
  p_user_lng DOUBLE PRECISION,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  avatar_url TEXT,
  h3_index TEXT,
  priority_score INTEGER
) AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH matching_profiles AS (
    SELECT p.id as pid, p.full_name, p.avatar_url, p.home_community_h3_index
    FROM public.profiles p
    WHERE p.id != v_user_id
      AND p.full_name ILIKE p_query || '%'
      AND NOT p.is_banned
  ),
  priority_checks AS (
    SELECT m.*,
      -- Priority 1: Recent Buzz Poster
      (CASE WHEN EXISTS (
         SELECT 1 FROM public.community_chat_messages ccm 
         WHERE ccm.author_id = m.pid AND ccm.created_at > NOW() - INTERVAL '1 day'
       ) THEN 1000 ELSE 0 END) +
      
      -- Priority 2: Existing Network
      (CASE WHEN EXISTS (
         SELECT 1 FROM public.market_booth_favorites mbf
         JOIN public.market_booths mb ON mb.id = mbf.booth_id
         WHERE mbf.user_id = v_user_id AND mb.owner_id = m.pid
       ) OR EXISTS (
         SELECT 1 FROM public.market_conversations c
         WHERE (c.participant_a = v_user_id AND c.participant_b = m.pid)
            OR (c.participant_b = v_user_id AND c.participant_a = m.pid)
       ) THEN 500 ELSE 0 END) +
       
      -- Priority 3: Local Sellers (25 mi radius)
      (CASE WHEN p_user_lng IS NOT NULL AND p_user_lat IS NOT NULL AND EXISTS (
         SELECT 1 FROM public.market_booths mb
         WHERE mb.owner_id = m.pid AND mb.is_open 
           AND mb.pickup_location IS NOT NULL
           AND ST_DWithin(mb.pickup_location::geography, ST_SetSRID(ST_MakePoint(p_user_lng, p_user_lat), 4326)::geography, 25 * 1609.34)
       ) THEN 250 ELSE 0 END) AS score
    FROM matching_profiles m
  )
  SELECT pc.pid, pc.full_name, pc.avatar_url, pc.home_community_h3_index, pc.score
  FROM priority_checks pc
  WHERE pc.score > 0
  ORDER BY pc.score DESC, pc.full_name ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


--------------------------------------------------------------------------------

-- 5. Notification Trigger (Push Notifications)
CREATE OR REPLACE FUNCTION public.trg_notify_dm_inserted_webhook()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Fire the edge function via pg_net for push notifications
  PERFORM net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/notify-dm-message',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := jsonb_build_object(
      'messageId', NEW.id,
      'conversationId', NEW.conversation_id,
      'senderId', NEW.sender_id
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'DM notify fail: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_dm_inserted ON public.market_chat_messages;
CREATE TRIGGER trg_notify_dm_inserted
  AFTER INSERT ON public.market_chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_notify_dm_inserted_webhook();
