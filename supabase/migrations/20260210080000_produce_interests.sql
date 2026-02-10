-- Produce Interests table
-- Stores produce items that users are interested in (from the wizard intro step).
-- Used to notify sellers when someone near them wants their produce.

CREATE TABLE produce_interests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  produce_name text NOT NULL,
  is_custom boolean DEFAULT false,  -- true if user typed a custom produce name
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, produce_name)     -- prevent duplicate entries per user
);

-- Index for looking up all users interested in a specific produce
CREATE INDEX idx_produce_interests_produce ON produce_interests(produce_name);
-- Index for looking up a specific user's interests
CREATE INDEX idx_produce_interests_user ON produce_interests(user_id);

-- RLS Policies
ALTER TABLE produce_interests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all produce interests"
  ON produce_interests FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can add their own produce interests"
  ON produce_interests FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own produce interests"
  ON produce_interests FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can remove their own produce interests"
  ON produce_interests FOR DELETE TO authenticated
  USING (user_id = auth.uid());
