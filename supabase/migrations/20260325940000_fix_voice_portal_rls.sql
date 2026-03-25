-- Migration: Fix Voice Portal RLS policies for Staff
-- Context: The previous `staff_can_update_feedback` policy attempted to natively query `staff_members` 
-- and `auth.users` in a non-Security Definer context. Because Row Level Security explicitly blocks 
-- authenticated users from reading `auth.users` or `staff_members` generically, Postgres threw 
-- silent boundary constraint errors blocking all status updates and post deletions.

-- This migration securely routes the identity evaluations natively through the `is_staff()` 
-- SECURITY DEFINER hook, cleanly granting `UPDATE` and `DELETE` rights safely.

-- 1. Fix UPDATE Policy
DROP POLICY IF EXISTS "staff_can_update_feedback" ON public.user_feedback;

CREATE POLICY "staff_can_update_feedback"
  ON public.user_feedback
  FOR UPDATE
  TO authenticated
  USING (is_staff(auth.uid()))
  WITH CHECK (is_staff(auth.uid()));

-- 2. Add Missing DELETE Policy
DROP POLICY IF EXISTS "staff_can_delete_feedback" ON public.user_feedback;

CREATE POLICY "staff_can_delete_feedback"
  ON public.user_feedback
  FOR DELETE
  TO authenticated
  USING (is_staff(auth.uid()));
