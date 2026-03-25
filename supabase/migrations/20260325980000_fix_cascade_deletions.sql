-- Fix Voice Portal Cascading Delete Locks
-- When a staff member deletes a `user_feedback` ticket, Postgres natively cascades
-- the deletion row-by-row into `feedback_votes` and `feedback_status_history`.
-- However, because these tables lacked `DELETE` policies explicitly mapping `is_staff()`,
-- RLS inherently evaluated the cascade to FALSE, instantly aborting the entire ticket deletion.

-- 1. Patch `feedback_votes` to allow Staff to cascade-delete community votes
DROP POLICY IF EXISTS "Users can remove own votes" ON public.feedback_votes;

CREATE POLICY "Users can remove own votes and staff can cascade delete"
  ON public.feedback_votes FOR DELETE
  USING (
    user_id = auth.uid()
    OR is_staff(auth.uid())
  );

-- 2. Add entirely missing `DELETE` policy to `feedback_status_history`
-- Since status history is heavily mapped, tickets couldn't be deleted after states changed!
DROP POLICY IF EXISTS "Staff can delete status history" ON public.feedback_status_history;

CREATE POLICY "Staff can delete status history"
  ON public.feedback_status_history FOR DELETE
  USING (is_staff(auth.uid()));
