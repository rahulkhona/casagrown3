-- Enable pg_net if not already (needed for net.http_post)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Helper: Look up user email from auth.users
CREATE OR REPLACE FUNCTION get_user_email(p_user_id uuid)
RETURNS text
LANGUAGE sql SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT email FROM auth.users WHERE id = p_user_id;
$$;
