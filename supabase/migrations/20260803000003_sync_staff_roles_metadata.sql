-- Migration: Sync staff_members.roles to auth.users.raw_user_meta_data
-- This allows reading user roles instantly from JWT user_metadata on the client,
-- bypassing the need for slow RPC database calls on every page load.

CREATE OR REPLACE FUNCTION sync_staff_roles_to_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    UPDATE auth.users
    SET raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('roles', to_jsonb(NEW.roles))
    WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_staff_roles_to_metadata ON staff_members;
CREATE TRIGGER trg_sync_staff_roles_to_metadata
  AFTER INSERT OR UPDATE OF roles, user_id ON staff_members
  FOR EACH ROW
  EXECUTE FUNCTION sync_staff_roles_to_metadata();

-- Backfill existing staff members
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT user_id, roles FROM staff_members WHERE user_id IS NOT NULL LOOP
    UPDATE auth.users
    SET raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('roles', to_jsonb(r.roles))
    WHERE id = r.user_id;
  END LOOP;
END;
$$;
