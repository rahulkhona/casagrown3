-- Migration: Add RPC to lookup staff member details by email bypassing RLS
-- This prevents race conditions during login where client session is not fully set up.

CREATE OR REPLACE FUNCTION get_staff_member_by_email(check_email text)
RETURNS TABLE (id uuid, roles staff_role[])
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT id, roles FROM staff_members WHERE email = lower(check_email);
$$;
