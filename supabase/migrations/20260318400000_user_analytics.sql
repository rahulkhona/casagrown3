-- ============================================================================
-- User Analytics: lightweight event tracking for alpha
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_analytics (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES profiles(id),
  session_id  TEXT NOT NULL,
  txn_id      TEXT NOT NULL,
  event_type  TEXT NOT NULL,  -- page_view | button_click | form_submit | error
  event_name  TEXT NOT NULL,  -- e.g. "buy_button", "market_page"
  page_path   TEXT,
  metadata    JSONB DEFAULT '{}',
  user_agent  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_user ON user_analytics(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_txn ON user_analytics(txn_id);

ALTER TABLE user_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users insert own events" ON user_analytics FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users read own events" ON user_analytics FOR SELECT USING (auth.uid() = user_id);
