-- Migration: Ensure GrowBot system user and profile exist unconditionally
-- This is critical for staging and production environments where seed data is not present

DO $$
BEGIN
    -- Clean up any conflicting records with the bot email under a different ID
    DELETE FROM public.profiles WHERE email = 'casabot@casagrown.com' AND id != 'a0000000-0000-0000-0000-00000ca5ab07';
    DELETE FROM auth.users WHERE email = 'casabot@casagrown.com' AND id != 'a0000000-0000-0000-0000-00000ca5ab07';
END $$;

-- 1. Ensure the user exists in auth.users
INSERT INTO auth.users (
    id, instance_id, email, encrypted_password,
    email_confirmed_at, role, aud, created_at, updated_at
) VALUES (
    'a0000000-0000-0000-0000-00000ca5ab07',
    '00000000-0000-0000-0000-000000000000',
    'casabot@casagrown.com',
    extensions.crypt('casabot-system-account-not-loginable', extensions.gen_salt('bf')),
    now(), 'authenticated', 'authenticated', now(), now()
) ON CONFLICT (id) DO NOTHING;

-- 2. Ensure identity exists in auth.identities
INSERT INTO auth.identities (
  id, user_id, provider_id, provider,
  identity_data, last_sign_in_at,
  created_at, updated_at
)
SELECT 
  'a0000000-0000-0000-0000-00000ca5ab07',
  'a0000000-0000-0000-0000-00000ca5ab07',
  'casabot@casagrown.com', 'email',
  jsonb_build_object('sub', 'a0000000-0000-0000-0000-00000ca5ab07', 'email', 'casabot@casagrown.com'),
  now(), now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM auth.identities 
  WHERE id = 'a0000000-0000-0000-0000-00000ca5ab07'
     OR (provider_id = 'casabot@casagrown.com' AND provider = 'email')
);

-- 3. Ensure the profile exists in public.profiles
INSERT INTO public.profiles (
    id, email, full_name, avatar_url, home_community_h3_index
) VALUES (
    'a0000000-0000-0000-0000-00000ca5ab07',
    'casabot@casagrown.com',
    'GrowBot',
    '/growbot-avatar-v3.png',
    NULL
) ON CONFLICT (id) DO UPDATE SET
    full_name = 'GrowBot',
    avatar_url = '/growbot-avatar-v3.png',
    email = 'casabot@casagrown.com';
