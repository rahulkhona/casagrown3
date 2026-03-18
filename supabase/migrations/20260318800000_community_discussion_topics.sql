-- ============================================================================
-- Community Discussion Topics — Admin-curated conversation starters
-- Posted as system messages by CasaGrown Bot (1-2 per day)
-- ============================================================================

-- Table for admin-managed discussion topics
CREATE TABLE IF NOT EXISTS community_discussion_topics (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  content       text NOT NULL,
  category      text NOT NULL DEFAULT 'general',   -- gardening, recipes, services, seasonal, fun
  season        text,                               -- spring, summer, fall, winter (null = any)
  posted_count  int  NOT NULL DEFAULT 0,            -- how many times this has been posted
  last_posted_at timestamptz,                       -- when it was last posted
  is_active     boolean NOT NULL DEFAULT true,       -- admin can disable topics
  created_at    timestamptz DEFAULT now()
);

-- Index for picking unposted/least-posted topics
CREATE INDEX IF NOT EXISTS idx_discussion_topics_active
  ON community_discussion_topics (is_active, posted_count, last_posted_at);

-- Enable RLS
ALTER TABLE community_discussion_topics ENABLE ROW LEVEL SECURITY;

-- Anyone can read topics (for admin dashboard)
CREATE POLICY "Anyone can read discussion topics"
  ON community_discussion_topics FOR SELECT
  USING (true);

-- Only service role (admin) can insert/update
CREATE POLICY "Service role manages discussion topics"
  ON community_discussion_topics FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- RPC: post_daily_discussion
-- Called by pg_cron or Edge Function to post 1-2 system messages per day
-- Picks the least-posted active topic and inserts it into all communities
-- ============================================================================

CREATE OR REPLACE FUNCTION post_daily_discussion(
  p_h3_indexes text[] DEFAULT NULL  -- null = post to all active communities
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_topic    record;
  v_h3_list  text[];
  v_h3       text;
  v_count    int := 0;
BEGIN
  -- 1. Pick the least-posted active topic
  SELECT id, content, category
    INTO v_topic
    FROM community_discussion_topics
   WHERE is_active = true
   ORDER BY posted_count ASC, last_posted_at ASC NULLS FIRST, random()
   LIMIT 1;

  IF v_topic IS NULL THEN
    RETURN jsonb_build_object('status', 'no_topics', 'posted', 0);
  END IF;

  -- 2. Get target H3 communities
  IF p_h3_indexes IS NOT NULL THEN
    v_h3_list := p_h3_indexes;
  ELSE
    -- Post to all communities that have had recent activity (last 30 days)
    SELECT array_agg(DISTINCT community_h3_index)
      INTO v_h3_list
      FROM community_chat_messages
     WHERE created_at > now() - interval '30 days'
       AND community_h3_index IS NOT NULL;
  END IF;

  IF v_h3_list IS NULL OR array_length(v_h3_list, 1) IS NULL THEN
    RETURN jsonb_build_object('status', 'no_communities', 'posted', 0);
  END IF;

  -- 3. Post the topic as a system message in each community
  FOREACH v_h3 IN ARRAY v_h3_list LOOP
    INSERT INTO community_chat_messages (
      community_h3_index,
      author_id,
      content,
      is_system
    ) VALUES (
      v_h3,
      '00000000-0000-0000-0000-000000000000',  -- system user UUID
      '🐝 ' || v_topic.content,
      true
    );
    v_count := v_count + 1;
  END LOOP;

  -- 4. Update the topic's posted stats
  UPDATE community_discussion_topics
     SET posted_count = posted_count + 1,
         last_posted_at = now()
   WHERE id = v_topic.id;

  RETURN jsonb_build_object(
    'status', 'posted',
    'topic_id', v_topic.id,
    'content', v_topic.content,
    'communities', v_count
  );
END;
$$;

-- ============================================================================
-- Seed initial discussion topics (admin can add more via dashboard or SQL)
-- ============================================================================

INSERT INTO community_discussion_topics (content, category, season) VALUES
  -- Gardening
  ('What''s the best thing you''ve grown this year? Share a photo! 📸', 'gardening', NULL),
  ('Spring planting season is here! What''s going in the ground this week? 🌱', 'gardening', 'spring'),
  ('What''s your #1 tip for new gardeners?', 'gardening', NULL),
  ('Container gardening vs. raised beds — what''s your preference and why?', 'gardening', NULL),
  ('What''s the easiest vegetable to grow for beginners?', 'gardening', NULL),
  ('Show us your garden setup! Drop a photo 🏡', 'gardening', NULL),
  ('What gardening mistake taught you the most?', 'gardening', NULL),
  ('Does anyone do permaculture? Would love to learn more!', 'gardening', NULL),

  -- Recipes
  ('What''s the best dish you''ve made with homegrown produce this week? 🍳', 'recipes', NULL),
  ('Share your favorite preserving or canning recipe! 🫙', 'recipes', 'fall'),
  ('Quick weeknight dinner using garden veggies — go!', 'recipes', NULL),
  ('Best smoothie recipe using garden ingredients? 🥤', 'recipes', 'summer'),
  ('Favorite herbs to add to everything? Mine is rosemary!', 'recipes', NULL),
  ('What''s a dish from your culture made with garden-fresh ingredients?', 'recipes', NULL),

  -- Services & Help
  ('Who''s your go-to for yard work recommendations?', 'services', NULL),
  ('Anyone need help with their garden this weekend? Let''s collaborate! 🤝', 'services', NULL),
  ('Looking for irrigation system recommendations — what do you use?', 'services', NULL),
  ('Anyone have a good soil testing kit recommendation?', 'services', NULL),

  -- Sustainability
  ('What''s one thing you do to garden more sustainably? 🌍', 'sustainability', NULL),
  ('How do you reduce food waste at home?', 'sustainability', NULL),
  ('Rainwater collection — anyone doing it? Tips?', 'sustainability', NULL),
  ('Best plants for attracting bees and butterflies? 🦋', 'sustainability', NULL),

  -- Seasonal
  ('Summer heat wave survival tips for your garden? ☀️🌡️', 'seasonal', 'summer'),
  ('What are you harvesting right now? 🧺', 'seasonal', NULL),
  ('Getting ready for fall — what''s your end-of-season routine? 🍂', 'seasonal', 'fall'),
  ('Winter garden plans? Or taking a break? ❄️', 'seasonal', 'winter'),

  -- Fun & Community
  ('If you could only eat one homegrown food for a month, what would it be?', 'fun', NULL),
  ('Garden pet peeve? Mine is squirrels stealing tomatoes 🐿️', 'fun', NULL),
  ('What song do you listen to while gardening? 🎵', 'fun', NULL),
  ('Rate your neighbor''s garden on a scale of 1–10 (just kidding 😄)', 'fun', NULL),
  ('What''s the most surprising thing you''ve found growing in your yard?', 'fun', NULL),
  ('Show us your "garden helper" — pets welcome! 🐕🐈', 'fun', NULL),
  ('Sunrise or sunset gardening? Which do you prefer? 🌅', 'fun', NULL),
  ('What would your dream backyard look like?', 'fun', NULL)
ON CONFLICT DO NOTHING;
