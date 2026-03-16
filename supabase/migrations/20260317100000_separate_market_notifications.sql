-- ============================================================================
-- Migration: Separate Market Notifications Table
--
-- Creates a dedicated `market_notifications` table so the market app's
-- notification system is fully isolated from the community app's
-- `notifications` table. Updates `notify_market_event()` to insert
-- into the new table. Also re-points the 7-day cleanup cron.
-- ============================================================================

-- 1. Create market_notifications table (same schema as notifications)
CREATE TABLE IF NOT EXISTS market_notifications (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  link_url   TEXT,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for user lookups (most common query)
CREATE INDEX idx_market_notifications_user ON market_notifications (user_id, created_at DESC);

-- 2. RLS policies — same pattern as notifications table
ALTER TABLE market_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own market notifications"
  ON market_notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own market notifications"
  ON market_notifications FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own market notifications"
  ON market_notifications FOR DELETE
  USING (auth.uid() = user_id);

-- Service role can insert (from triggers / edge functions)
CREATE POLICY "Service role can insert market notifications"
  ON market_notifications FOR INSERT
  WITH CHECK (true);

-- 3. Update notify_market_event() to use market_notifications
CREATE OR REPLACE FUNCTION notify_market_event(
  p_user_id  UUID,
  p_content  TEXT,
  p_link_url TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- In-app notification (market-specific table)
  INSERT INTO market_notifications (user_id, content, link_url)
  VALUES (p_user_id, p_content, p_link_url);

  -- Push notification (async via edge function)
  PERFORM send_push_via_edge(
    ARRAY[p_user_id],
    'CasaGrown Market',
    p_content,
    p_link_url
  );
END;
$$;

-- 4. Update the auto-cleanup cron to target market_notifications
SELECT cron.unschedule('cleanup-old-notifications');
SELECT cron.schedule(
  'cleanup-old-market-notifications',
  '0 3 * * *',
  $$DELETE FROM market_notifications WHERE created_at < NOW() - INTERVAL '7 days'$$
);

-- 5. Copy existing market notifications from notifications table
--    (only those with market-specific content patterns)
INSERT INTO market_notifications (user_id, content, link_url, read_at, created_at)
SELECT user_id, content, link_url, read_at, created_at
FROM notifications
WHERE content LIKE '%order%'
   OR content LIKE '%Order%'
   OR content LIKE '%settlement%'
   OR content LIKE '%Settlement%'
   OR content LIKE '%dispute%'
   OR content LIKE '%Dispute%'
   OR content LIKE '%booth%'
   OR content LIKE '%1099%'
   OR content LIKE '%follower%'
   OR content LIKE '%rating%'
   OR content LIKE '%delivered%'
   OR content LIKE '%cashout%'
   OR content LIKE '%gift card%'
   OR content LIKE '%Gift Card%'
   OR content LIKE '%PayPal%'
   OR content LIKE '%🛒%'
   OR content LIKE '%✅%'
   OR content LIKE '%🚚%'
   OR content LIKE '%💰%'
   OR content LIKE '%⭐%'
   OR content LIKE '%📋%'
   OR content LIKE '%🌱%'
ON CONFLICT DO NOTHING;
