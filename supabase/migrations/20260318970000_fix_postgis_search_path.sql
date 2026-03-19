-- Fix PostGIS "operator is not unique" error on profile updates
-- The trg_profile_audit function uses IS DISTINCT FROM on geometry columns
-- but its search_path only includes 'public', missing the 'extensions' schema
-- where PostGIS operators are defined.

ALTER FUNCTION trg_profile_audit() SET search_path = public, extensions;

-- Also fix clear_phone_verification trigger which fires BEFORE UPDATE on profiles
-- and may encounter the same issue
ALTER FUNCTION clear_phone_verification() SET search_path = public, extensions;
