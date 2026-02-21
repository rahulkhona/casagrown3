-- Migration: Email-based staff lookup
-- Switches staff_members from UUID-only to email-based identification.
-- This allows pre-registering staff by email before they create accounts.

-- 1. Drop existing RLS policies (they reference the old schema)
DROP POLICY IF EXISTS "Staff can read all staff members" ON staff_members;
DROP POLICY IF EXISTS "Admins can insert staff members" ON staff_members;
DROP POLICY IF EXISTS "Admins can update staff members" ON staff_members;
DROP POLICY IF EXISTS "Admins can delete staff members" ON staff_members;

-- 2. Drop existing primary key and make user_id nullable
ALTER TABLE staff_members DROP CONSTRAINT staff_members_pkey;
ALTER TABLE staff_members ALTER COLUMN user_id DROP NOT NULL;

-- 3. Add new columns
ALTER TABLE staff_members
  ADD COLUMN id    uuid DEFAULT gen_random_uuid(),
  ADD COLUMN email text;

-- 4. Backfill email from profiles for any existing rows
UPDATE staff_members sm
SET email = p.email
FROM auth.users p
WHERE sm.user_id = p.id AND sm.email IS NULL;

-- 5. Now enforce constraints
ALTER TABLE staff_members
  ALTER COLUMN email SET NOT NULL,
  ADD CONSTRAINT staff_members_pkey PRIMARY KEY (id),
  ADD CONSTRAINT staff_members_email_unique UNIQUE (email);

-- 6. Index on email for fast lookups
CREATE INDEX idx_staff_members_email ON staff_members(email);

-- 7. Update is_staff() to use email from JWT
CREATE OR REPLACE FUNCTION is_staff(uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM staff_members
    WHERE email = (SELECT email FROM auth.users WHERE id = uid)
  );
$$;

-- 8. Update has_staff_role() similarly
CREATE OR REPLACE FUNCTION has_staff_role(uid uuid, required_role staff_role)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM staff_members
    WHERE email = (SELECT email FROM auth.users WHERE id = uid)
      AND required_role = ANY(roles)
  );
$$;

-- 9. Convenience: check staff by email directly (for login flow)
CREATE OR REPLACE FUNCTION is_staff_email(check_email text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM staff_members WHERE email = check_email);
$$;

-- 10. Recreate RLS policies
CREATE POLICY "Staff can read all staff members"
  ON staff_members FOR SELECT
  USING (is_staff(auth.uid()));

CREATE POLICY "Admins can insert staff members"
  ON staff_members FOR INSERT
  WITH CHECK (has_staff_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update staff members"
  ON staff_members FOR UPDATE
  USING (has_staff_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete staff members"
  ON staff_members FOR DELETE
  USING (has_staff_role(auth.uid(), 'admin'));
