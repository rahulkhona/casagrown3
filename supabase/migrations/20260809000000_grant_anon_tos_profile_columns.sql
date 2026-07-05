-- Fix: "permission denied for table profiles" errors for anon users
--
-- ROOT CAUSE: The anon role has column-level SELECT grants on profiles
-- (set in 20260517000000_explicit_data_api_grants.sql), but tos_accepted_at
-- and profile_completed_at were not included. Auth flows (auth-hook.ts,
-- login-screen.tsx, QuickSetupModal.tsx) query these columns immediately
-- after getSession(), which reads from the local cookie. If the JWT is
-- stale/expired, PostgREST treats the request as anon and the query fails
-- with "permission denied for table profiles".
--
-- Both columns are safe non-PII timestamps — no risk in exposing to anon.

GRANT SELECT (
  id,
  full_name,
  avatar_url,
  home_community_h3_index,
  phone_verified,
  created_at,
  closure_status,
  tos_accepted_at,
  profile_completed_at
) ON profiles TO anon;
