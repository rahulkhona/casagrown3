-- Migration: RLS policies for all Community Voice feedback tables
-- Uses is_staff() helper from 20260220400000_staff_members.sql
-- Visibility rules: public tickets visible to all authenticated,
-- private tickets visible only to author + ALL staff members.

-------------------------------------------------------------------
-- Helper: check if a user can read a feedback ticket
-- (public = anyone authenticated, private = author or staff)
-------------------------------------------------------------------
CREATE OR REPLACE FUNCTION can_read_feedback(feedback_row user_feedback)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    feedback_row.visibility = 'public'
    OR feedback_row.author_id = auth.uid()
    OR is_staff(auth.uid());
$$;

-------------------------------------------------------------------
-- 1. user_feedback
-------------------------------------------------------------------
ALTER TABLE user_feedback ENABLE ROW LEVEL SECURITY;

-- Read: public visible to all authenticated; private to author + staff
CREATE POLICY "Feedback readable based on visibility"
  ON user_feedback FOR SELECT
  USING (
    visibility = 'public'
    OR author_id = auth.uid()
    OR is_staff(auth.uid())
  );

-- Insert: any authenticated user can create feedback
CREATE POLICY "Users can create feedback"
  ON user_feedback FOR INSERT
  WITH CHECK (author_id = auth.uid());

-- Update: author can update own (title/description); staff can update status/assignment
CREATE POLICY "Authors and staff can update feedback"
  ON user_feedback FOR UPDATE
  USING (
    author_id = auth.uid()
    OR is_staff(auth.uid())
  );

-- Delete: only author or admin staff
CREATE POLICY "Authors and admins can delete feedback"
  ON user_feedback FOR DELETE
  USING (
    author_id = auth.uid()
    OR has_staff_role(auth.uid(), 'admin')
  );

-------------------------------------------------------------------
-- 2. feedback_votes (only on public tickets)
-------------------------------------------------------------------
ALTER TABLE feedback_votes ENABLE ROW LEVEL SECURITY;

-- Read: all authenticated can see votes on public tickets
CREATE POLICY "Votes are readable on public feedback"
  ON feedback_votes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_feedback f
      WHERE f.id = feedback_id
      AND f.visibility = 'public'
    )
  );

-- Insert: users can vote on public tickets
CREATE POLICY "Users can vote on public feedback"
  ON feedback_votes FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM user_feedback f
      WHERE f.id = feedback_id
      AND f.visibility = 'public'
    )
  );

-- Delete: users can remove own vote
CREATE POLICY "Users can remove own votes"
  ON feedback_votes FOR DELETE
  USING (user_id = auth.uid());

-------------------------------------------------------------------
-- 3. feedback_comments
-------------------------------------------------------------------
ALTER TABLE feedback_comments ENABLE ROW LEVEL SECURITY;

-- Read: follows parent ticket visibility
CREATE POLICY "Comments readable if ticket is accessible"
  ON feedback_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_feedback f
      WHERE f.id = feedback_id
      AND (
        f.visibility = 'public'
        OR f.author_id = auth.uid()
        OR is_staff(auth.uid())
      )
    )
  );

-- Insert: user can comment on accessible tickets
CREATE POLICY "Users can comment on accessible tickets"
  ON feedback_comments FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM user_feedback f
      WHERE f.id = feedback_id
      AND (
        f.visibility = 'public'
        OR f.author_id = auth.uid()
        OR is_staff(auth.uid())
      )
    )
  );

-- Update: own comments only
CREATE POLICY "Users can update own comments"
  ON feedback_comments FOR UPDATE
  USING (author_id = auth.uid());

-- Delete: own comments or staff
CREATE POLICY "Users and staff can delete comments"
  ON feedback_comments FOR DELETE
  USING (
    author_id = auth.uid()
    OR is_staff(auth.uid())
  );

-------------------------------------------------------------------
-- 4. feedback_media
-------------------------------------------------------------------
ALTER TABLE feedback_media ENABLE ROW LEVEL SECURITY;

-- Read: follows parent ticket visibility
CREATE POLICY "Feedback media readable if ticket accessible"
  ON feedback_media FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_feedback f
      WHERE f.id = feedback_id
      AND (
        f.visibility = 'public'
        OR f.author_id = auth.uid()
        OR is_staff(auth.uid())
      )
    )
  );

-- Insert: ticket author can attach media
CREATE POLICY "Authors can attach media to own feedback"
  ON feedback_media FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_feedback f
      WHERE f.id = feedback_id
      AND f.author_id = auth.uid()
    )
  );

-- Delete: ticket author or staff
CREATE POLICY "Authors and staff can remove feedback media"
  ON feedback_media FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_feedback f
      WHERE f.id = feedback_id
      AND (f.author_id = auth.uid() OR is_staff(auth.uid()))
    )
  );

-------------------------------------------------------------------
-- 5. feedback_comment_media
-------------------------------------------------------------------
ALTER TABLE feedback_comment_media ENABLE ROW LEVEL SECURITY;

-- Read: follows parent comment → parent ticket visibility
CREATE POLICY "Comment media readable if ticket accessible"
  ON feedback_comment_media FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM feedback_comments c
      JOIN user_feedback f ON f.id = c.feedback_id
      WHERE c.id = comment_id
      AND (
        f.visibility = 'public'
        OR f.author_id = auth.uid()
        OR is_staff(auth.uid())
      )
    )
  );

-- Insert: comment author can attach
CREATE POLICY "Comment authors can attach media"
  ON feedback_comment_media FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM feedback_comments c
      WHERE c.id = comment_id
      AND c.author_id = auth.uid()
    )
  );

-- Delete: comment author or staff
CREATE POLICY "Comment authors and staff can remove media"
  ON feedback_comment_media FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM feedback_comments c
      WHERE c.id = comment_id
      AND (c.author_id = auth.uid() OR is_staff(auth.uid()))
    )
  );

-------------------------------------------------------------------
-- 6. feedback_status_history
-------------------------------------------------------------------
ALTER TABLE feedback_status_history ENABLE ROW LEVEL SECURITY;

-- Read: follows parent ticket visibility
CREATE POLICY "Status history readable if ticket accessible"
  ON feedback_status_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_feedback f
      WHERE f.id = feedback_id
      AND (
        f.visibility = 'public'
        OR f.author_id = auth.uid()
        OR is_staff(auth.uid())
      )
    )
  );

-- Insert: auto-inserted by trigger (SECURITY DEFINER), no direct user insert
-- But staff may also insert manually with a note
CREATE POLICY "Staff can insert status history"
  ON feedback_status_history FOR INSERT
  WITH CHECK (is_staff(auth.uid()));
