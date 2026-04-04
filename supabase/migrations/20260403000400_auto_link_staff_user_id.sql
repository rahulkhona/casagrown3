-- Migration: Auto-link staff_members.user_id when a user signs up or logs in
-- with an email that matches a staff_members row.
--
-- This eliminates the need to manually populate user_id on staff_members.
-- The staff_members table is keyed by email, but all RPC staff checks use
-- `WHERE user_id = auth.uid()`. This trigger bridges the gap automatically.

-- 1. Function: link staff user_id on profile creation (triggered when a new user signs up)
CREATE OR REPLACE FUNCTION link_staff_user_id_on_profile()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_email TEXT;
BEGIN
  -- Lookup the user's email from auth.users
  SELECT email INTO v_email FROM auth.users WHERE id = NEW.id;
  
  IF v_email IS NOT NULL THEN
    UPDATE staff_members
    SET user_id = NEW.id
    WHERE email = lower(v_email)
      AND (user_id IS NULL OR user_id != NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger on profiles insert (fires when a new user completes signup)
DROP TRIGGER IF EXISTS trg_link_staff_on_profile_insert ON profiles;
CREATE TRIGGER trg_link_staff_on_profile_insert
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION link_staff_user_id_on_profile();

-- 2. Also backfill any existing staff_members that have NULL user_id
-- by matching email against auth.users
DO $$
BEGIN
  UPDATE staff_members sm
  SET user_id = u.id
  FROM auth.users u
  WHERE lower(u.email) = lower(sm.email)
    AND sm.user_id IS NULL;
  
  RAISE NOTICE 'Backfilled staff_members user_id for existing users';
END;
$$;

-- 3. Also trigger when a staff member is inserted via the admin portal
-- (auto-populate user_id if the email already has an auth.users account)
CREATE OR REPLACE FUNCTION link_staff_user_id_on_staff_insert()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_auth_id UUID;
BEGIN
  -- Check if a user with this email already exists
  SELECT id INTO v_auth_id FROM auth.users WHERE lower(email) = lower(NEW.email);
  
  IF v_auth_id IS NOT NULL AND (NEW.user_id IS NULL OR NEW.user_id != v_auth_id) THEN
    NEW.user_id := v_auth_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_link_staff_on_insert ON staff_members;
CREATE TRIGGER trg_link_staff_on_insert
  BEFORE INSERT ON staff_members
  FOR EACH ROW
  EXECUTE FUNCTION link_staff_user_id_on_staff_insert();
