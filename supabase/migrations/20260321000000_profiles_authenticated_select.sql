-- ============================================================================
-- Migration: Add authenticated SELECT policy on profiles
-- 
-- ROOT CAUSE: The profiles table had RLS enabled with only an anon SELECT
-- policy ("Anonymous can view profiles"). Authenticated users could NOT read
-- profiles at all. This caused the my-booth query to fail silently because
-- it JOINs booth_helpers → profiles, and the profiles RLS blocked the read
-- for authenticated users.
-- ============================================================================

-- Allow authenticated users to read all profiles (needed for JOINs, helper names, etc.)
CREATE POLICY "Authenticated users can view profiles"
  ON profiles FOR SELECT TO authenticated
  USING (true);
