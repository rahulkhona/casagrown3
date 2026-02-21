-- Migration: feedback_flags table for content flagging
-- Community users can flag offensive/inappropriate content
-- Staff can filter flagged tickets and delete them

CREATE TABLE IF NOT EXISTS feedback_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id uuid NOT NULL REFERENCES user_feedback(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text, -- optional reason for flagging
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(feedback_id, user_id) -- one flag per user per ticket
);

-- RLS
ALTER TABLE feedback_flags ENABLE ROW LEVEL SECURITY;

-- Read: staff can see all flags, users can see their own flags
CREATE POLICY "Users can see own flags, staff see all"
  ON feedback_flags FOR SELECT
  USING (
    user_id = auth.uid()
    OR is_staff(auth.uid())
  );

-- Insert: any authenticated user can flag
CREATE POLICY "Authenticated users can flag content"
  ON feedback_flags FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Delete: users can unflag their own, staff can delete any flag
CREATE POLICY "Users can unflag own, staff can delete any"
  ON feedback_flags FOR DELETE
  USING (
    user_id = auth.uid()
    OR is_staff(auth.uid())
  );
