-- Grower produces: what each user grows in their backyard
CREATE TABLE IF NOT EXISTS grower_produces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  produce_name text NOT NULL,
  category text,
  notify_on_search boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, produce_name)
);

ALTER TABLE grower_produces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read grower produces" ON grower_produces FOR SELECT USING (true);
CREATE POLICY "Users manage own produces" ON grower_produces FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Track welcome completion on profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS buzz_welcomed_at timestamptz;

-- Notification digest: queues search matches for batch delivery
CREATE TABLE IF NOT EXISTS grower_search_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grower_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  keyword text NOT NULL,
  searcher_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  community_h3 text,
  notified_at timestamptz,         -- NULL = pending, set when batched
  created_at timestamptz DEFAULT now()
);
ALTER TABLE grower_search_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own notifications" ON grower_search_notifications FOR SELECT USING (auth.uid() = grower_id);

CREATE INDEX IF NOT EXISTS idx_grower_produces_name ON grower_produces(lower(produce_name));
CREATE INDEX IF NOT EXISTS idx_grower_search_notif_pending ON grower_search_notifications(grower_id, notified_at) WHERE notified_at IS NULL;

-- RPC: Queue search matches for growers who grow what a buyer is searching for
-- Called from FindPanel after each search. Notifications are batched by cron.
CREATE OR REPLACE FUNCTION queue_grower_search_match(
  p_keywords text,
  p_community_h3 text,
  p_searcher_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  word text;
  matched_grower record;
BEGIN
  -- Split keywords into individual words
  FOR word IN SELECT unnest(string_to_array(lower(trim(p_keywords)), ' '))
  LOOP
    IF length(word) < 2 THEN CONTINUE; END IF;

    -- Find growers who grow this produce, are in same/nearby community,
    -- opted into notifications, and are NOT the searcher
    FOR matched_grower IN
      SELECT DISTINCT gp.user_id
      FROM grower_produces gp
      JOIN profiles p ON p.id = gp.user_id
      WHERE lower(gp.produce_name) ILIKE '%' || word || '%'
        AND gp.notify_on_search = true
        AND gp.user_id != p_searcher_id
        AND (p.home_community_h3_index = p_community_h3
             OR p_community_h3 = ANY(p.nearby_community_h3_indices))
        -- Skip if grower has an active product matching this keyword
        AND NOT EXISTS (
          SELECT 1 FROM market_products mp
          WHERE mp.seller_id = gp.user_id
            AND mp.is_active = true
            AND mp.is_draft = false
            AND (lower(mp.name) ILIKE '%' || word || '%'
                 OR lower(mp.description) ILIKE '%' || word || '%')
        )
        -- Skip if already queued for this keyword in last 24h
        AND NOT EXISTS (
          SELECT 1 FROM grower_search_notifications gsn
          WHERE gsn.grower_id = gp.user_id
            AND lower(gsn.keyword) = word
            AND gsn.created_at > now() - interval '24 hours'
        )
    LOOP
      INSERT INTO grower_search_notifications (grower_id, keyword, searcher_id, community_h3)
      VALUES (matched_grower.user_id, word, p_searcher_id, p_community_h3)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END;
$$;
