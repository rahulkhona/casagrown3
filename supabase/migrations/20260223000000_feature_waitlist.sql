-- Feature Waitlist table for tracking user interest in upcoming features (e.g., 529 plans)
CREATE TABLE IF NOT EXISTS feature_waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  feature TEXT NOT NULL DEFAULT '529',
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, feature)
);

-- RLS: users can insert their own rows and read their own rows
ALTER TABLE feature_waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can join waitlist"
  ON feature_waitlist FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own waitlist entries"
  ON feature_waitlist FOR SELECT
  USING (auth.uid() = user_id);
