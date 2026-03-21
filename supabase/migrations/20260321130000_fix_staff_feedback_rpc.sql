-- Fix staff_update_feedback_status RPC to reference correct staff_members table
-- and add RLS update policy for staff members on user_feedback

-- Recreate the RPC with correct table reference
CREATE OR REPLACE FUNCTION staff_update_feedback_status(
  p_feedback_id uuid,
  p_new_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if caller is a staff member
  IF NOT EXISTS (
    SELECT 1 FROM staff_members sm
    WHERE sm.user_id = auth.uid()
       OR sm.email = (SELECT email FROM auth.users WHERE id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Not authorized: staff only';
  END IF;

  UPDATE user_feedback
  SET status = p_new_status,
      updated_at = now()
  WHERE id = p_feedback_id;
END;
$$;

-- Also add RLS UPDATE policy so direct .update() works for staff
DROP POLICY IF EXISTS "staff_can_update_feedback" ON user_feedback;

CREATE POLICY "staff_can_update_feedback"
  ON user_feedback
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM staff_members sm
      WHERE sm.user_id = auth.uid()
         OR sm.email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM staff_members sm
      WHERE sm.user_id = auth.uid()
         OR sm.email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );
