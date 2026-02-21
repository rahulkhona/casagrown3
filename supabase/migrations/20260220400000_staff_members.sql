-- Migration: Staff Members table for Community Voice
-- Introduces a staff_role enum and staff_members table to track
-- which users have staff access and what roles they hold.

-- Enum for staff roles (used as array element type)
CREATE TYPE staff_role AS ENUM ('admin', 'moderator', 'support');

-- Staff members table
CREATE TABLE staff_members (
  user_id    uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  roles      staff_role[] NOT NULL DEFAULT '{support}',
  granted_at timestamptz  NOT NULL DEFAULT now(),
  granted_by uuid         REFERENCES profiles(id)
);

-- Index for checking staff membership quickly (used by is_staff() helper)
CREATE INDEX idx_staff_members_user_id ON staff_members(user_id);

-- Helper function: check if a user is a staff member
CREATE OR REPLACE FUNCTION is_staff(uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM staff_members WHERE user_id = uid);
$$;

-- Helper function: check if a user has a specific role
CREATE OR REPLACE FUNCTION has_staff_role(uid uuid, required_role staff_role)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM staff_members
    WHERE user_id = uid AND required_role = ANY(roles)
  );
$$;

-- RLS
ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;

-- All staff can read all staff rows
CREATE POLICY "Staff can read all staff members"
  ON staff_members FOR SELECT
  USING (is_staff(auth.uid()));

-- Only admins can insert new staff
CREATE POLICY "Admins can insert staff members"
  ON staff_members FOR INSERT
  WITH CHECK (has_staff_role(auth.uid(), 'admin'));

-- Only admins can update staff roles
CREATE POLICY "Admins can update staff members"
  ON staff_members FOR UPDATE
  USING (has_staff_role(auth.uid(), 'admin'));

-- Only admins can remove staff
CREATE POLICY "Admins can delete staff members"
  ON staff_members FOR DELETE
  USING (has_staff_role(auth.uid(), 'admin'));
