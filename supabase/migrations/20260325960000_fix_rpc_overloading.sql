-- 1. Drop all overloaded variations of the RPC to wipe the namespace cleanly
DROP FUNCTION IF EXISTS public.staff_update_feedback_status(uuid, text);
DROP FUNCTION IF EXISTS public.staff_update_feedback_status(uuid, public.feedback_status);

-- 2. Recreate the singular definitive function using the exact ENUM signature natively expected by the initial schema
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
