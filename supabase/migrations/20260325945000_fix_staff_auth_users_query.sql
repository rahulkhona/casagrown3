-- Securely replace all Staff authentication lookup queries to bypass the highly restricted `auth.users` table.
-- We extract the physical `email` identity rapidly directly from the native `auth.jwt()` token sequence.

CREATE OR REPLACE FUNCTION is_staff(uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM staff_members
    WHERE email = (auth.jwt() ->> 'email')
       OR user_id = uid
  );
$$;

CREATE OR REPLACE FUNCTION has_staff_role(uid uuid, required_role staff_role)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM staff_members
    WHERE (email = (auth.jwt() ->> 'email') OR user_id = uid)
      AND required_role = ANY(roles)
  );
$$;

-- Fix the direct RPC used for changing status on `next-community-voice`
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
  -- Check if caller is a staff member cleanly
  IF NOT EXISTS (
    SELECT 1 FROM staff_members sm
    WHERE sm.user_id = auth.uid()
       OR sm.email = (auth.jwt() ->> 'email')
  ) THEN
    RAISE EXCEPTION 'Not authorized: staff only';
  END IF;

  UPDATE user_feedback
  SET status = p_new_status,
      updated_at = now()
  WHERE id = p_feedback_id;
END;
$$;
