-- Helper RPCs for tests that need auth.users records without going through GoTrue.
-- GoTrue in newer Supabase CLI versions requires ES256 JWKS for admin operations,
-- which breaks the old HS256 service_role JWT used by tests.

CREATE OR REPLACE FUNCTION create_test_auth_user(p_id uuid, p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role,
    email, encrypted_password,
    email_confirmed_at, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    p_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    p_email, crypt('test-password-123', gen_salt('bf')),
    now(), '{"full_name":"Test User"}'::jsonb,
    now(), now(),
    '', '', '', ''
  ) ON CONFLICT (id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION delete_test_auth_user(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM auth.users WHERE id = p_id;
END;
$$;
