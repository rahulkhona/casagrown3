-- Insert the auth user and profile for the reviewer before creating their virtual subscription
INSERT INTO auth.users (
  id, instance_id, aud, role,
  email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES (
  'a0000000-0000-0000-0000-00000000000c',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'reviewer@test.local',
  -- 'TestPassword123!' encrypted using bcrypt
  '$2a$10$wO3oI.P/1xR9L9Xn/fA24.o7Z9UaA0w4wXb9t9t9t9t9t9t9t9t9t',
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"FB Reviewer"}',
  now(), now(),
  '', '', '', ''
) ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (
  id, user_id, provider_id, provider,
  identity_data, last_sign_in_at,
  created_at, updated_at
) VALUES (
  'a0000000-0000-0000-0000-00000000000c',
  'a0000000-0000-0000-0000-00000000000c',
  'reviewer@test.local', 'email',
  jsonb_build_object('sub', 'a0000000-0000-0000-0000-00000000000c', 'email', 'reviewer@test.local'),
  now(), now(), now()
) ON CONFLICT (provider_id, provider) DO NOTHING;

INSERT INTO public.profiles (
  id, email, full_name, avatar_url, home_community_h3_index
) VALUES (
  'a0000000-0000-0000-0000-00000000000c',
  'reviewer@test.local',
  'FB Reviewer',
  '/logo.png',
  '89283470c2fffff'
) ON CONFLICT (id) DO NOTHING;

-- Insert a virtual subscription for the pro_tester Facebook reviewer account
-- This allows all edge functions to work without modifying each one's subscription check
INSERT INTO public.seller_subscriptions (user_id, plan, status, current_period_start, current_period_end)
VALUES (
  'a0000000-0000-0000-0000-00000000000c',
  'elite',
  'active',
  NOW(),
  NOW() + INTERVAL '1 year'
)
ON CONFLICT (user_id) DO UPDATE SET plan = 'elite', status = 'active', current_period_end = NOW() + INTERVAL '1 year';
