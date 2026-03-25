-- Eliminate hidden PostgREST casing anomalies natively rejecting the Voice Portal Auth payloads
-- Supabase preserves literal string casing in standard `auth.jwt()` headers.
-- By injecting `lower()`, we mathematically guarantee mapping against the normalized `staff_members` table on Vercel.

CREATE OR REPLACE FUNCTION is_staff(uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM staff_members
    WHERE email = lower(auth.jwt() ->> 'email')
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
    WHERE (email = lower(auth.jwt() ->> 'email') OR user_id = uid)
      AND required_role = ANY(roles)
  );
$$;

CREATE OR REPLACE FUNCTION public.staff_update_feedback_status(
  p_feedback_id uuid,
  p_new_status public.feedback_status
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate staff identity explicitly using the hyper-optimized JWT extraction
  IF NOT EXISTS (
    SELECT 1 FROM staff_members sm
    WHERE sm.user_id = auth.uid()
       OR sm.email = lower(auth.jwt() ->> 'email')
  ) THEN
    RAISE EXCEPTION 'Not authorized: staff only';
  END IF;

  UPDATE user_feedback
  SET status = p_new_status,
      updated_at = now()
  WHERE id = p_feedback_id;
END;
$$;
