-- Migration: Move Voice Portal 'Delete Feedback' logic into a SECURITY DEFINER RPC
-- Context: Since PostgREST processes direct `.delete()` REST API calls natively 
-- traversing `ON DELETE CASCADE` tables (like `feedback_votes`, `feedback_status_history`),
-- relying purely on RLS across the entire dependency tree proved hypersensitive and structurally
-- swallowed exceptions based on strictly cached Vercel Auth Keys dynamically.

-- Creating a native Postgres RPC forces the operation to completely bypass RLS child-table 
-- cascaded policy evaluations, relying on a unified mathematically identical Admin check natively!

CREATE OR REPLACE FUNCTION staff_delete_feedback(
  p_feedback_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Strict explicit Admin authorization evaluating Auth payloads instantly
  IF NOT EXISTS (
    SELECT 1 FROM staff_members sm
    WHERE sm.user_id = auth.uid()
       OR sm.email = lower(auth.jwt() ->> 'email')
  ) THEN
    RAISE EXCEPTION 'Not authorized: staff only';
  END IF;

  -- Destroy the ticket statically. `SECURITY DEFINER` guarantees PostgREST 
  -- cascading dependencies inherently execute seamlessly under postgres rights.
  DELETE FROM public.user_feedback
  WHERE id = p_feedback_id;

  RETURN true;
END;
$$;
