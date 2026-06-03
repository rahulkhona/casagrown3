-- Seed Data for E2E Testing and Local Development
-- Deterministic IDs used for reliability

-- Inject a validly-formatted dummy JWT for local Edge Functions
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'service_role_key') THEN
    PERFORM vault.create_secret('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU', 'service_role_key', 'Dummy key for local development');
  END IF;
  -- supabase_url is required by trg_notify_dm_inserted_webhook (and other triggers)
  -- to build the edge function URL. Without it, net.http_post gets NULL url → constraint error.
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'supabase_url') THEN
    PERFORM vault.create_secret('http://127.0.0.1:54321', 'supabase_url', 'Local Supabase URL for edge function calls');
  END IF;
END $$;

-- 1. Countries
insert into public.countries (iso_3, name, currency_symbol, phone_code)
values ('USA', 'United States', '$', '+1')
on conflict (iso_3) do nothing;

-- 2. States (California)
insert into public.states (id, country_iso_3, code, name)
values ('00000000-0000-0000-0000-000000000001', 'USA', 'CA', 'California')
on conflict (country_iso_3, code) do nothing;

-- 3. Cities (San Jose)
insert into public.cities (id, state_id, name)
values ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'San Jose')
on conflict (state_id, name) do nothing;

-- 4. Zip Codes (95125)
insert into public.zip_codes (zip_code, country_iso_3, city_id, latitude, longitude)
values ('95125', 'USA', '00000000-0000-0000-0000-000000000002', 37.30, -121.90)
on conflict (zip_code, country_iso_3) do nothing;

-- 5. Communities (Willow Glen - H3 Index)
-- Using a representative H3 index for Willow Glen, San Jose, CA
insert into public.communities (h3_index, name, city, state, country, location)
values (
  '89283470c2fffff', 
  'Willow Glen', 
  'San Jose', 
  'California', 
  'USA',
  'POINT(-121.90 37.30)'
)
on conflict (h3_index) do nothing;

-- Neighboring communities for delivery zone selection
insert into public.communities (h3_index, name, city, state, country, location)
values
  ('89283470c6fffff', 'Rose Garden', 'San Jose', 'California', 'USA', 'POINT(-121.93 37.33)'),
  ('89283470cafffff', 'Cambrian Park', 'San Jose', 'California', 'USA', 'POINT(-121.93 37.26)')
on conflict (h3_index) do nothing;

-- ============================================================================
-- Fresno Metro — Cities, ZIP Codes, Communities (CRM geo targeting seed)
-- ============================================================================

-- Cities in Fresno metro
insert into public.cities (id, state_id, name)
values
  ('f0000001-0001-0001-0001-000000000001', '00000000-0000-0000-0000-000000000001', 'Fresno'),
  ('f0000001-0001-0001-0001-000000000002', '00000000-0000-0000-0000-000000000001', 'Clovis'),
  ('f0000001-0001-0001-0001-000000000003', '00000000-0000-0000-0000-000000000001', 'Madera'),
  ('f0000001-0001-0001-0001-000000000004', '00000000-0000-0000-0000-000000000001', 'Visalia'),
  ('f0000001-0001-0001-0001-000000000005', '00000000-0000-0000-0000-000000000001', 'Tulare'),
  ('f0000001-0001-0001-0001-000000000006', '00000000-0000-0000-0000-000000000001', 'Hanford')
on conflict (state_id, name) do nothing;

-- Fresno ZIP codes
insert into public.zip_codes (zip_code, country_iso_3, city_id, latitude, longitude)
values
  ('93701', 'USA', 'f0000001-0001-0001-0001-000000000001', 36.7378, -119.7871),
  ('93702', 'USA', 'f0000001-0001-0001-0001-000000000001', 36.7363, -119.7650),
  ('93703', 'USA', 'f0000001-0001-0001-0001-000000000001', 36.7503, -119.7705),
  ('93704', 'USA', 'f0000001-0001-0001-0001-000000000001', 36.7892, -119.8174),
  ('93705', 'USA', 'f0000001-0001-0001-0001-000000000001', 36.7728, -119.8354),
  ('93710', 'USA', 'f0000001-0001-0001-0001-000000000001', 36.8057, -119.7707),
  ('93711', 'USA', 'f0000001-0001-0001-0001-000000000001', 36.8300, -119.8200),
  ('93720', 'USA', 'f0000001-0001-0001-0001-000000000002', 36.8628, -119.7432),
  ('93721', 'USA', 'f0000001-0001-0001-0001-000000000001', 36.7268, -119.7754),
  ('93722', 'USA', 'f0000001-0001-0001-0001-000000000001', 36.7727, -119.9005),
  ('93726', 'USA', 'f0000001-0001-0001-0001-000000000001', 36.8005, -119.8021),
  ('93728', 'USA', 'f0000001-0001-0001-0001-000000000001', 36.7606, -119.8302)
on conflict (zip_code, country_iso_3) do nothing;

-- Clovis ZIP
insert into public.zip_codes (zip_code, country_iso_3, city_id, latitude, longitude)
values
  ('93611', 'USA', 'f0000001-0001-0001-0001-000000000002', 36.8252, -119.6847),
  ('93612', 'USA', 'f0000001-0001-0001-0001-000000000002', 36.8077, -119.6929)
on conflict (zip_code, country_iso_3) do nothing;

-- Fresno Communities (named H3 zones used for CRM audience targeting)
insert into public.communities (h3_index, name, city, state, country, location)
values
  ('8928308280fffff', 'Tower District',        'Fresno', 'California', 'USA', 'POINT(-119.8021 36.8005)'),
  ('8928308281fffff', 'Fresno Downtown',       'Fresno', 'California', 'USA', 'POINT(-119.7871 36.7378)'),
  ('8928308282fffff', 'Fig Garden Village',    'Fresno', 'California', 'USA', 'POINT(-119.8174 36.7892)'),
  ('8928308283fffff', 'Sunnyside',             'Fresno', 'California', 'USA', 'POINT(-119.7650 36.7363)'),
  ('8928308284fffff', 'Old Fig Garden',        'Fresno', 'California', 'USA', 'POINT(-119.8354 36.7728)'),
  ('8928308285fffff', 'McLane Neighborhood',   'Fresno', 'California', 'USA', 'POINT(-119.7705 36.8057)'),
  ('8928308286fffff', 'North Fresno',          'Fresno', 'California', 'USA', 'POINT(-119.8200 36.8300)'),
  ('8928308287fffff', 'Bullard District',      'Fresno', 'California', 'USA', 'POINT(-119.9005 36.7727)'),
  ('8928308288fffff', 'Woodward Park Area',    'Fresno', 'California', 'USA', 'POINT(-119.7707 36.8057)'),
  ('8928308289fffff', 'Fresno South',          'Fresno', 'California', 'USA', 'POINT(-119.7754 36.7268)'),
  ('892830828afffff', 'Clovis Old Town',       'Clovis',  'California', 'USA', 'POINT(-119.6929 36.8077)'),
  ('892830828bfffff', 'Clovis North',          'Clovis',  'California', 'USA', 'POINT(-119.6847 36.8252)'),
  ('892830828cfffff', 'Loma Vista',            'Fresno', 'California', 'USA', 'POINT(-119.8302 36.7606)'),
  ('892830828dfffff', 'Fresno Fairgrounds',    'Fresno', 'California', 'USA', 'POINT(-119.7432 36.8628)'),
  ('892830828efffff', 'Roosevelt High Area',   'Fresno', 'California', 'USA', 'POINT(-119.8174 36.7892)')
on conflict (h3_index) do nothing;


-- 6. Launch Campaign (replaces legacy incentive_rules)
INSERT INTO public.incentive_campaigns (id, name, description, starts_at, ends_at, is_active)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Launch Campaign',
  'Welcome campaign rewarding early adopters for key actions',
  '2026-01-01T00:00:00Z',
  '2027-12-31T23:59:59Z',
  true
);

-- Campaign rewards for key behaviors
INSERT INTO public.campaign_rewards (campaign_id, behavior, points) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'signup', 100),
  ('a0000000-0000-0000-0000-000000000001', 'first_post', 75),
  ('a0000000-0000-0000-0000-000000000001', 'first_purchase', 150),
  ('a0000000-0000-0000-0000-000000000001', 'first_sale', 150),
  ('a0000000-0000-0000-0000-000000000001', 'per_referral', 50);

-- No zone restriction = global campaign (targets all communities)

-- 7. Category & Product Restrictions (for testing restriction enforcement)
-- No category restrictions by default.
-- Uncomment below to test category restriction behavior:
-- insert into public.category_restrictions (category_name, country_iso_3, state_id, county_id, city_id, reason)
-- values ('produce', NULL, NULL, NULL, NULL, 'Controlled substance regulations');

-- Blocked products (globally or by jurisdiction)
-- Global blocks (all jurisdiction columns NULL) are also filtered from the feed
-- by get_filtered_feed RPC. The create_order_atomic function provides a backup
-- check at order time for defense-in-depth.
insert into public.blocked_products (product_name, country_iso_3, state_id, county_id, city_id, reason) values
  ('Marijuana', NULL, NULL, NULL, NULL, 'Controlled substance - federally prohibited'),
  ('Cannabis', NULL, NULL, NULL, NULL, 'Controlled substance - federally prohibited'),
  ('Tobacco', NULL, NULL, NULL, NULL, 'Regulated product'),
  ('Opium Poppy', NULL, NULL, NULL, NULL, 'Controlled substance'),
  ('Coca', NULL, NULL, NULL, NULL, 'Controlled substance')
on conflict do nothing;

-- 8. Storage Buckets & Policies
-- Everything in a single DO block to work with Supabase's prepared statement runner.
DO $$
BEGIN
  -- Create buckets
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('avatars', 'avatars', true)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO storage.buckets (id, name, public)
  VALUES ('post-media', 'post-media', true)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO storage.buckets (id, name, public)
  VALUES ('chat-media', 'chat-media', true)
  ON CONFLICT (id) DO NOTHING;

  -- Avatars policies
  BEGIN CREATE POLICY "Allow authenticated uploads" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars');
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE POLICY "Allow public read" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE POLICY "Allow owner updates" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'avatars');
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE POLICY "Allow owner deletes" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'avatars');
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  -- Post-media policies
  BEGIN CREATE POLICY "post_media_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'post-media');
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE POLICY "post_media_select" ON storage.objects FOR SELECT USING (bucket_id = 'post-media');
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE POLICY "post_media_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'post-media');
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE POLICY "post_media_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'post-media');
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  -- Chat-media policies
  BEGIN CREATE POLICY "chat_media_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'chat-media');
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE POLICY "chat_media_select" ON storage.objects FOR SELECT USING (bucket_id = 'chat-media');
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE POLICY "chat_media_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'chat-media');
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE POLICY "chat_media_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'chat-media');
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- =============================================================================
-- 10. Test Users (for E2E / Playwright / Maestro)
-- =============================================================================
-- Deterministic UUIDs for reliable test references
-- Passwords are hashed with bcrypt ('TestPassword123!')

-- Sam Seller
INSERT INTO auth.users (
  id, instance_id, aud, role,
  email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new,
  email_change
) VALUES (
  'a1111111-1111-1111-1111-111111111111',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'seller@test.local',
  '$2a$06$FbG0qaw0v4J3GOm/y5tduulnL0cYxDpju9ZoHH9mNJW.GgeaC.xve',
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Sam Seller"}',
  now(), now(),
  '', '', '', ''
) ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (
  id, user_id, provider_id, provider,
  identity_data, last_sign_in_at,
  created_at, updated_at
) VALUES (
  'a1111111-1111-1111-1111-111111111111',
  'a1111111-1111-1111-1111-111111111111',
  'seller@test.local', 'email',
  jsonb_build_object('sub', 'a1111111-1111-1111-1111-111111111111', 'email', 'seller@test.local'),
  now(), now(), now()
) ON CONFLICT (provider_id, provider) DO NOTHING;

-- Beth Buyer
INSERT INTO auth.users (
  id, instance_id, aud, role,
  email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new,
  email_change
) VALUES (
  'b2222222-2222-2222-2222-222222222222',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'buyer@test.local',
  '$2a$06$FbG0qaw0v4J3GOm/y5tduulnL0cYxDpju9ZoHH9mNJW.GgeaC.xve',
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Beth Buyer"}',
  now(), now(),
  '', '', '', ''
) ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (
  id, user_id, provider_id, provider,
  identity_data, last_sign_in_at,
  created_at, updated_at
) VALUES (
  'b2222222-2222-2222-2222-222222222222',
  'b2222222-2222-2222-2222-222222222222',
  'buyer@test.local', 'email',
  jsonb_build_object('sub', 'b2222222-2222-2222-2222-222222222222', 'email', 'buyer@test.local'),
  now(), now(), now()
) ON CONFLICT (provider_id, provider) DO NOTHING;

-- Maria Martinez
INSERT INTO auth.users (
  id, instance_id, aud, role,
  email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new,
  email_change
) VALUES (
  'c3333333-3333-3333-3333-333333333333',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'martinez@test.local',
  '$2a$06$FbG0qaw0v4J3GOm/y5tduulnL0cYxDpju9ZoHH9mNJW.GgeaC.xve',
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Maria Martinez"}',
  now(), now(),
  '', '', '', ''
) ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

INSERT INTO auth.identities (
  id, user_id, provider_id, provider,
  identity_data, last_sign_in_at,
  created_at, updated_at
) VALUES (
  'c3333333-3333-3333-3333-333333333333',
  'c3333333-3333-3333-3333-333333333333',
  'martinez@test.local', 'email',
  jsonb_build_object('sub', 'c3333333-3333-3333-3333-333333333333', 'email', 'martinez@test.local'),
  now(), now(), now()
) ON CONFLICT (provider_id, provider) DO NOTHING;

-- =============================================================================
-- 11. Test Profiles
-- =============================================================================

INSERT INTO public.profiles (
  id, email, full_name, home_community_h3_index, referral_code,
  phone_verified, tos_accepted_at, profile_completed_at,
  zip_code, street_address, city, state_code, phone_number,
  nearby_community_h3_indices, home_location
)
VALUES
  ('a1111111-1111-1111-1111-111111111111', 'seller@test.local', 'Sam Seller',
   '89283470c2fffff', 'SELLER01', true, NOW(), NOW(),
   '95125', '1168 Lincoln Ave', 'San Jose', 'CA', '+14085551234',
   ARRAY['89283470c6fffff', '89283470cafffff'],
   ST_SetSRID(ST_MakePoint(-121.8977, 37.3084), 4326)),
  ('b2222222-2222-2222-2222-222222222222', 'buyer@test.local', 'Beth Buyer',
   '89283470c2fffff', 'BUYER01', false, NOW(), NOW(),
   '95125', '1247 Minnesota Ave', 'San Jose', 'CA', '+14085555678',
   ARRAY['89283470c6fffff', '89283470cafffff'],
   ST_SetSRID(ST_MakePoint(-121.8983, 37.3068), 4326)),
  ('c3333333-3333-3333-3333-333333333333', 'martinez@test.local', 'Maria Martinez',
   '89283470c2fffff', 'MARIA01', true, NOW(), NOW(),
   '95123', '456 Oak Ave', 'San Jose', 'CA', '+14085559012',
   ARRAY['89283470c6fffff', '89283470cafffff'],
   ST_SetSRID(ST_MakePoint(-121.8820, 37.2290), 4326))
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  home_community_h3_index = EXCLUDED.home_community_h3_index,
  referral_code = EXCLUDED.referral_code,
  phone_verified = EXCLUDED.phone_verified,
  tos_accepted_at = EXCLUDED.tos_accepted_at,
  profile_completed_at = EXCLUDED.profile_completed_at,
  zip_code = EXCLUDED.zip_code,
  street_address = EXCLUDED.street_address,
  city = EXCLUDED.city,
  state_code = EXCLUDED.state_code,
  phone_number = EXCLUDED.phone_number,
  nearby_community_h3_indices = EXCLUDED.nearby_community_h3_indices,
  home_location = EXCLUDED.home_location;

-- Make seller@test.local a Pro user (needed for catalog/multi-stand E2E tests)
UPDATE profiles SET is_pro = true WHERE id = 'a1111111-1111-1111-1111-111111111111';

-- Pro subscription record (useSubscription hook queries this table)
INSERT INTO seller_subscriptions (
  user_id, plan, status, stripe_customer_id, stripe_subscription_id,
  current_period_start, current_period_end
) VALUES (
  'a1111111-1111-1111-1111-111111111111', 'pro', 'active',
  'cus_test_sam_seller', 'sub_test_sam_seller',
  now() - interval '15 days', now() + interval '15 days'
) ON CONFLICT (user_id) DO UPDATE SET
  plan = 'pro', status = 'active',
  current_period_start = now() - interval '15 days',
  current_period_end = now() + interval '15 days';

-- Facebook connection for Sam Seller (needed for facebook-autopost E2E tests)
INSERT INTO seller_fb_connections (
  user_id, fb_access_token, fb_page_id, fb_page_name,
  fb_page_access_token, auto_sync_enabled, status
) VALUES (
  'a1111111-1111-1111-1111-111111111111',
  'EAAtest_fake_token_for_e2e',
  '123456789012345',
  'Willow Glen Farm Stand',
  'EAAtest_fake_page_token_for_e2e',
  true, 'connected'
) ON CONFLICT (user_id) DO UPDATE SET
  status = 'connected', auto_sync_enabled = true,
  fb_page_name = 'Willow Glen Farm Stand';

-- Seed points for both users (enough for test transactions)
-- Using 2000 to ensure enough points after cashout test (−500 pts) for the
-- giftcards test (first Gaming card = ~3000 pts, need enough after order holds).
INSERT INTO public.point_ledger (user_id, type, amount, balance_after, created_at, metadata)
VALUES
  ('a1111111-1111-1111-1111-111111111111', 'reward', 5000, 5000, now() + interval '1 second', '{"reason":"E2E test seed"}'),
  ('b2222222-2222-2222-2222-222222222222', 'reward', 5000, 5000, now() + interval '1 second', '{"reason":"E2E test seed"}'),
  ('c3333333-3333-3333-3333-333333333333', 'reward', 5000, 5000, now() + interval '1 second', '{"reason":"E2E test seed"}');

-- =============================================================================
-- 11b. ORDER-TESTING USERS — Alex Adams & Taylor Torres
-- Both live on the same block in Willow Glen (1021 & 1045 Lincoln Ave, 95125).
-- Same H3 zone, same GPS point, 10mi delivery radius → always in range.
-- Login: alex@test.local / TestPassword123!
--        taylor@test.local / TestPassword123!
-- =============================================================================

-- Alex Adams — auth
INSERT INTO auth.users (
  id, instance_id, aud, role,
  email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES (
  'd4444444-4444-4444-4444-444444444444',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'alex@test.local',
  '$2a$06$FbG0qaw0v4J3GOm/y5tduulnL0cYxDpju9ZoHH9mNJW.GgeaC.xve',
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Alex Adams"}',
  now(), now(),
  '', '', '', ''
) ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (
  id, user_id, provider_id, provider,
  identity_data, last_sign_in_at, created_at, updated_at
) VALUES (
  'd4444444-4444-4444-4444-444444444444',
  'd4444444-4444-4444-4444-444444444444',
  'alex@test.local', 'email',
  jsonb_build_object('sub', 'd4444444-4444-4444-4444-444444444444', 'email', 'alex@test.local'),
  now(), now(), now()
) ON CONFLICT (provider_id, provider) DO NOTHING;

-- Taylor Torres — auth
INSERT INTO auth.users (
  id, instance_id, aud, role,
  email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES (
  'e5555555-5555-5555-5555-555555555555',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'taylor@test.local',
  '$2a$06$FbG0qaw0v4J3GOm/y5tduulnL0cYxDpju9ZoHH9mNJW.GgeaC.xve',
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Taylor Torres"}',
  now(), now(),
  '', '', '', ''
) ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (
  id, user_id, provider_id, provider,
  identity_data, last_sign_in_at, created_at, updated_at
) VALUES (
  'e5555555-5555-5555-5555-555555555555',
  'e5555555-5555-5555-5555-555555555555',
  'taylor@test.local', 'email',
  jsonb_build_object('sub', 'e5555555-5555-5555-5555-555555555555', 'email', 'taylor@test.local'),
  now(), now(), now()
) ON CONFLICT (provider_id, provider) DO NOTHING;

-- Alex & Taylor — profiles (same GPS point, same H3 zone)
INSERT INTO public.profiles (
  id, email, full_name, home_community_h3_index, referral_code,
  phone_verified, tos_accepted_at, profile_completed_at,
  zip_code, street_address, city, state_code, phone_number,
  nearby_community_h3_indices, home_location
) VALUES
  ('d4444444-4444-4444-4444-444444444444', 'alex@test.local', 'Alex Adams',
   '89283470c2fffff', 'ALEX01', true, NOW(), NOW(),
   '95125', '1021 Lincoln Ave', 'San Jose', 'CA', '+14085553456',
   ARRAY['89283470c6fffff', '89283470cafffff'],
   ST_SetSRID(ST_MakePoint(-121.8950, 37.3080), 4326)),
  ('e5555555-5555-5555-5555-555555555555', 'taylor@test.local', 'Taylor Torres',
   '89283470c2fffff', 'TAYLOR01', true, NOW(), NOW(),
   '95125', '1045 Lincoln Ave', 'San Jose', 'CA', '+14085554567',
   ARRAY['89283470c6fffff', '89283470cafffff'],
   ST_SetSRID(ST_MakePoint(-121.8952, 37.3079), 4326))
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  home_community_h3_index = EXCLUDED.home_community_h3_index,
  referral_code = EXCLUDED.referral_code,
  phone_verified = EXCLUDED.phone_verified,
  tos_accepted_at = EXCLUDED.tos_accepted_at,
  profile_completed_at = EXCLUDED.profile_completed_at,
  zip_code = EXCLUDED.zip_code,
  street_address = EXCLUDED.street_address,
  city = EXCLUDED.city,
  state_code = EXCLUDED.state_code,
  phone_number = EXCLUDED.phone_number,
  nearby_community_h3_indices = EXCLUDED.nearby_community_h3_indices,
  home_location = EXCLUDED.home_location;

-- Mark all test users as having completed the community welcome
UPDATE public.profiles SET buzz_welcomed_at = NOW()
WHERE id IN (
  'a1111111-1111-1111-1111-111111111111',
  'b2222222-2222-2222-2222-222222222222',
  'c3333333-3333-3333-3333-333333333333',
  'd4444444-4444-4444-4444-444444444444',
  'e5555555-5555-5555-5555-555555555555'
);

-- Re-set phone_verified AFTER profile inserts (the trg_clear_phone_verification
-- trigger resets it to false whenever phone_number changes, which includes the
-- initial NULL→value set during the profile upsert above).
UPDATE public.profiles SET phone_verified = true
WHERE id IN (
  'a1111111-1111-1111-1111-111111111111',   -- Sam Seller
  'c3333333-3333-3333-3333-333333333333',   -- Maria Martinez
  'd4444444-4444-4444-4444-444444444444',   -- Alex Adams
  'e5555555-5555-5555-5555-555555555555'    -- Taylor Torres
);

-- Alex & Taylor — points
INSERT INTO public.point_ledger (user_id, type, amount, balance_after, created_at, metadata)
VALUES
  ('d4444444-4444-4444-4444-444444444444', 'reward', 5000, 5000, now() + interval '1 second', '{"reason":"E2E test seed"}'),
  ('e5555555-5555-5555-5555-555555555555', 'reward', 5000, 5000, now() + interval '1 second', '{"reason":"E2E test seed"}');

-- Alex's booth — 10mi delivery radius, same GPS as profile
INSERT INTO market_booths (owner_id, name, description, decorative_theme,
  offers_delivery, offers_pickup, delivery_radius_miles, pickup_address,
  delivery_windows, pickup_windows, payment_method, pickup_location, is_default
) VALUES (
  'd4444444-4444-4444-4444-444444444444',
  'Alex''s Fresh Picks', 'Backyard garden produce — fresh daily in Willow Glen', 'harvest',
  true, true, 10, '1021 Lincoln Ave, San Jose, CA 95125',
  '[{"id":"8-10","start":"08:00","end":"10:00"},{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb,
  '[{"id":"9-11","start":"09:00","end":"11:00"}]'::jsonb,
  'automatic', ST_SetSRID(ST_MakePoint(-121.8950, 37.3080), 4326), true
) ON CONFLICT (owner_id) WHERE is_default = true DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description,
  offers_delivery = EXCLUDED.offers_delivery, offers_pickup = EXCLUDED.offers_pickup,
  delivery_radius_miles = EXCLUDED.delivery_radius_miles, pickup_address = EXCLUDED.pickup_address,
  delivery_windows = EXCLUDED.delivery_windows, pickup_windows = EXCLUDED.pickup_windows,
  pickup_location = EXCLUDED.pickup_location;

-- Taylor's booth — 10mi delivery radius, same GPS as profile
INSERT INTO market_booths (owner_id, name, description, decorative_theme,
  offers_delivery, offers_pickup, delivery_radius_miles, pickup_address,
  delivery_windows, pickup_windows, payment_method, pickup_location, is_default
) VALUES (
  'e5555555-5555-5555-5555-555555555555',
  'Taylor''s Garden Stand', 'Organic herbs and heirloom veggies from my patio garden', 'floral',
  true, true, 10, '1045 Lincoln Ave, San Jose, CA 95125',
  '[{"id":"8-10","start":"08:00","end":"10:00"},{"id":"14-16","start":"14:00","end":"16:00"}]'::jsonb,
  '[{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb,
  'automatic', ST_SetSRID(ST_MakePoint(-121.8952, 37.3079), 4326), true
) ON CONFLICT (owner_id) WHERE is_default = true DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description,
  offers_delivery = EXCLUDED.offers_delivery, offers_pickup = EXCLUDED.offers_pickup,
  delivery_radius_miles = EXCLUDED.delivery_radius_miles, pickup_address = EXCLUDED.pickup_address,
  delivery_windows = EXCLUDED.delivery_windows, pickup_windows = EXCLUDED.pickup_windows,
  pickup_location = EXCLUDED.pickup_location;

-- Alex's products (5 items) — with fulfillment windows (today + tomorrow)
INSERT INTO market_products (
  seller_id, market_date, name, description, category, price_usd, unit, inventory,
  photos, harvested_at, moderation_status,
  window_dates, product_delivery_windows, product_pickup_windows
) VALUES
  ('d4444444-4444-4444-4444-444444444444', CURRENT_DATE, 'Beefsteak Tomatoes',
   'Huge vine-ripened beefsteak tomatoes, 1 lb each', 'produce', 4.00, 'each', 15,
   '{}', now(), 'approved',
   jsonb_build_array(to_char(CURRENT_DATE,'YYYY-MM-DD'), to_char(CURRENT_DATE+1,'YYYY-MM-DD')),
   jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"},{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb),
   jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"9-11","start":"09:00","end":"11:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"9-11","start":"09:00","end":"11:00"}]'::jsonb)),
  ('d4444444-4444-4444-4444-444444444444', CURRENT_DATE, 'Sugar Snap Peas',
   'Crisp sweet sugar snap peas, perfect for snacking', 'produce', 5.00, 'bag', 12,
   '{}', now(), 'approved',
   jsonb_build_array(to_char(CURRENT_DATE,'YYYY-MM-DD'), to_char(CURRENT_DATE+1,'YYYY-MM-DD')),
   jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"},{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb),
   jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"9-11","start":"09:00","end":"11:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"9-11","start":"09:00","end":"11:00"}]'::jsonb)),
  ('d4444444-4444-4444-4444-444444444444', CURRENT_DATE, 'Garden Salad Mix',
   'Mixed greens with arugula, spinach, and butter lettuce', 'produce', 6.00, 'bag', 10,
   '{}', now(), 'approved',
   jsonb_build_array(to_char(CURRENT_DATE,'YYYY-MM-DD'), to_char(CURRENT_DATE+1,'YYYY-MM-DD')),
   jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"},{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb),
   jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"9-11","start":"09:00","end":"11:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"9-11","start":"09:00","end":"11:00"}]'::jsonb)),
  ('d4444444-4444-4444-4444-444444444444', CURRENT_DATE, 'Fresh Cilantro',
   'Aromatic cilantro bunches, great for salsa', 'produce', 2.00, 'bunch', 25,
   '{}', now(), 'approved',
   jsonb_build_array(to_char(CURRENT_DATE,'YYYY-MM-DD'), to_char(CURRENT_DATE+1,'YYYY-MM-DD')),
   jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"},{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb),
   jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"9-11","start":"09:00","end":"11:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"9-11","start":"09:00","end":"11:00"}]'::jsonb)),
  ('d4444444-4444-4444-4444-444444444444', CURRENT_DATE, 'Backyard Peaches',
   'Sweet O''Henry peaches from my backyard tree', 'produce', 5.50, 'bag', 8,
   '{}', now(), 'approved',
   jsonb_build_array(to_char(CURRENT_DATE,'YYYY-MM-DD'), to_char(CURRENT_DATE+1,'YYYY-MM-DD')),
   jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"},{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb),
   jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"9-11","start":"09:00","end":"11:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"9-11","start":"09:00","end":"11:00"}]'::jsonb))
ON CONFLICT DO NOTHING;

-- Taylor's products (5 items) — with fulfillment windows (today + tomorrow)
INSERT INTO market_products (
  seller_id, market_date, name, description, category, price_usd, unit, inventory,
  photos, harvested_at, moderation_status,
  window_dates, product_delivery_windows, product_pickup_windows
) VALUES
  ('e5555555-5555-5555-5555-555555555555', CURRENT_DATE, 'Italian Basil',
   'Large-leaf Genovese basil, just harvested', 'produce', 3.00, 'bunch', 20,
   '{}', now(), 'approved',
   jsonb_build_array(to_char(CURRENT_DATE,'YYYY-MM-DD'), to_char(CURRENT_DATE+1,'YYYY-MM-DD')),
   jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"},{"id":"14-16","start":"14:00","end":"16:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb),
   jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb)),
  ('e5555555-5555-5555-5555-555555555555', CURRENT_DATE, 'Cherry Peppers',
   'Sweet cherry peppers, red and yellow mix', 'produce', 4.50, 'bag', 14,
   '{}', now(), 'approved',
   jsonb_build_array(to_char(CURRENT_DATE,'YYYY-MM-DD'), to_char(CURRENT_DATE+1,'YYYY-MM-DD')),
   jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"},{"id":"14-16","start":"14:00","end":"16:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb),
   jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb)),
  ('e5555555-5555-5555-5555-555555555555', CURRENT_DATE, 'Heirloom Carrots',
   'Rainbow heirloom carrots — purple, orange, yellow', 'produce', 4.00, 'bunch', 16,
   '{}', now(), 'approved',
   jsonb_build_array(to_char(CURRENT_DATE,'YYYY-MM-DD'), to_char(CURRENT_DATE+1,'YYYY-MM-DD')),
   jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"},{"id":"14-16","start":"14:00","end":"16:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb),
   jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb)),
  ('e5555555-5555-5555-5555-555555555555', CURRENT_DATE, 'Fresh Rosemary',
   'Woody rosemary sprigs from my herb garden', 'produce', 2.50, 'bunch', 18,
   '{}', now(), 'approved',
   jsonb_build_array(to_char(CURRENT_DATE,'YYYY-MM-DD'), to_char(CURRENT_DATE+1,'YYYY-MM-DD')),
   jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"},{"id":"14-16","start":"14:00","end":"16:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb),
   jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb)),
  ('e5555555-5555-5555-5555-555555555555', CURRENT_DATE, 'Backyard Figs',
   'Sweet Black Mission figs, tree-ripened', 'produce', 7.00, 'pint', 6,
   '{}', now(), 'approved',
   jsonb_build_array(to_char(CURRENT_DATE,'YYYY-MM-DD'), to_char(CURRENT_DATE+1,'YYYY-MM-DD')),
   jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"},{"id":"14-16","start":"14:00","end":"16:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb),
   jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb))
ON CONFLICT DO NOTHING;

-- =============================================================================
-- 12. Test Posts (with complete detail rows)
-- =============================================================================

-- Sell Post 1: Tomatoes
INSERT INTO public.posts (id, author_id, community_h3_index, type, reach, content)
VALUES (
  'c3333333-3333-3333-3333-333333333333',
  'a1111111-1111-1111-1111-111111111111',
  '89283470c2fffff',
  'want_to_sell', 'community',
  '{"produceName":"Tomatoes","description":"Fresh organic tomatoes from my garden"}'
);

INSERT INTO public.want_to_sell_details (post_id, category, produce_name, unit, total_quantity_available, points_per_unit, is_produce, harvest_date)
VALUES ('c3333333-3333-3333-3333-333333333333', 'produce', 'Tomatoes', 'box', 10, 25, true, CURRENT_DATE);

INSERT INTO public.delivery_dates (post_id, delivery_date)
VALUES
  ('c3333333-3333-3333-3333-333333333333', CURRENT_DATE + interval '3 days'),
  ('c3333333-3333-3333-3333-333333333333', CURRENT_DATE + interval '7 days');

-- Sell Post: Tobacco (globally blocked — exists for jurisdiction blocks E2E test)
INSERT INTO public.posts (id, author_id, community_h3_index, type, reach, content)
VALUES (
  'c9999999-9999-9999-9999-999999999999',
  'a1111111-1111-1111-1111-111111111111',
  '89283470c2fffff',
  'want_to_sell', 'community',
  '{"produceName":"Tobacco","description":"Cured tobacco leaves for personal use"}'
);

INSERT INTO public.want_to_sell_details (post_id, category, produce_name, unit, total_quantity_available, points_per_unit, is_produce, harvest_date)
VALUES ('c9999999-9999-9999-9999-999999999999', 'produce', 'Tobacco', 'bag', 5, 10, false, CURRENT_DATE);

INSERT INTO public.delivery_dates (post_id, delivery_date)
VALUES
  ('c9999999-9999-9999-9999-999999999999', CURRENT_DATE + interval '5 days'),
  ('c9999999-9999-9999-9999-999999999999', CURRENT_DATE + interval '10 days');

-- Sell Post 2: Strawberries
INSERT INTO public.posts (id, author_id, community_h3_index, type, reach, content)
VALUES (
  'd4444444-4444-4444-4444-444444444444',
  'a1111111-1111-1111-1111-111111111111',
  '89283470c2fffff',
  'want_to_sell', 'community',
  '{"produceName":"Strawberries","description":"Sweet seasonal strawberries, picked fresh"}'
);

INSERT INTO public.want_to_sell_details (post_id, category, produce_name, unit, total_quantity_available, points_per_unit, is_produce, harvest_date)
VALUES ('d4444444-4444-4444-4444-444444444444', 'produce', 'Strawberries', 'box', 5, 40, true, CURRENT_DATE);

INSERT INTO public.delivery_dates (post_id, delivery_date)
VALUES ('d4444444-4444-4444-4444-444444444444', CURRENT_DATE + interval '5 days');

-- Buy Post: Looking for Basil
INSERT INTO public.posts (id, author_id, community_h3_index, type, reach, content)
VALUES (
  'e5555555-5555-5555-5555-555555555555',
  'b2222222-2222-2222-2222-222222222222',
  '89283470c2fffff',
  'want_to_buy', 'community',
  '{"description":"Looking for fresh basil for cooking"}'
);

INSERT INTO public.want_to_buy_details (post_id, category, produce_names, desired_quantity, desired_unit, need_by_date)
VALUES ('e5555555-5555-5555-5555-555555555555', 'produce', ARRAY['Basil', 'Thai Basil'], 3, 'bag', CURRENT_DATE + interval '14 days');

INSERT INTO public.delivery_dates (post_id, delivery_date)
VALUES
  ('e5555555-5555-5555-5555-555555555555', CURRENT_DATE + interval '10 days'),
  ('e5555555-5555-5555-5555-555555555555', CURRENT_DATE + interval '12 days');

-- General Post: Gardening Advice
INSERT INTO public.posts (id, author_id, community_h3_index, type, reach, content)
VALUES (
  'f6666666-6666-6666-6666-666666666666',
  'b2222222-2222-2222-2222-222222222222',
  '89283470c2fffff',
  'seeking_advice', 'community',
  '{"title":"Tomato growing tips","description":"Anyone have tips for growing tomatoes in raised beds?"}'
);

-- =============================================================================
-- 13. Buyer-Owned Sell Post (so Seller sees Chat/Order buttons in E2E tests)
-- =============================================================================

INSERT INTO public.posts (id, author_id, community_h3_index, type, reach, content)
VALUES (
  'a7777777-7777-7777-7777-777777777777',
  'b2222222-2222-2222-2222-222222222222',
  '89283470c2fffff',
  'want_to_sell', 'community',
  '{"produceName":"Peppers","description":"Fresh bell peppers, red and green"}'
);

INSERT INTO public.want_to_sell_details (post_id, category, produce_name, unit, total_quantity_available, points_per_unit, is_produce, harvest_date)
VALUES ('a7777777-7777-7777-7777-777777777777', 'produce', 'Peppers', 'bag', 8, 15, true, CURRENT_DATE);

INSERT INTO public.delivery_dates (post_id, delivery_date)
VALUES
  ('a7777777-7777-7777-7777-777777777777', CURRENT_DATE + interval '2 days'),
  ('a7777777-7777-7777-7777-777777777777', CURRENT_DATE + interval '6 days');

-- =============================================================================
-- 14. Pre-Existing Conversation + Order (for order action tests)
-- =============================================================================
-- Conversation between seller (as buyer) and buyer (as seller) on the Peppers post

INSERT INTO public.conversations (id, post_id, buyer_id, seller_id)
VALUES (
  'b8888888-8888-8888-8888-888888888888',
  'a7777777-7777-7777-7777-777777777777',
  'a1111111-1111-1111-1111-111111111111',  -- seller is the buyer here
  'b2222222-2222-2222-2222-222222222222'   -- buyer is the seller here
);

-- Auto-accepted offer for the order
INSERT INTO public.offers (id, conversation_id, created_by, quantity, points_per_unit, status)
VALUES (
  'c9999999-9999-9999-9999-999999999999',
  'b8888888-8888-8888-8888-888888888888',
  'a1111111-1111-1111-1111-111111111111',
  3, 15, 'accepted'
);

-- Pending order (seller placed an order on buyer's Peppers post)
INSERT INTO public.orders (
  id, offer_id, buyer_id, seller_id, category, product,
  quantity, points_per_unit, delivery_date,
  conversation_id, status, version
)
VALUES (
  'd0000000-0000-0000-0000-000000000001',
  'c9999999-9999-9999-9999-999999999999',
  'a1111111-1111-1111-1111-111111111111',
  'b2222222-2222-2222-2222-222222222222',
  'produce', 'Peppers',
  3, 15, CURRENT_DATE + interval '2 days',
  'b8888888-8888-8888-8888-888888888888',
  'pending', 1
);

-- Hold: debit buyer (seller account) 45 points for the order
INSERT INTO public.point_ledger (user_id, type, amount, balance_after, reference_id, created_at, metadata)
VALUES (
  'a1111111-1111-1111-1111-111111111111',
  'hold', -45, 955,
  'd0000000-0000-0000-0000-000000000001',
  now() + interval '2 seconds',
  '{"reason":"Order hold for Peppers","order_id":"d0000000-0000-0000-0000-000000000001"}'
);

-- System message in the conversation
INSERT INTO public.chat_messages (conversation_id, sender_id, content, type)
VALUES (
  'b8888888-8888-8888-8888-888888888888',
  null,
  'Order placed: 3 bags Peppers for 45 points.',
  'system'
);

-- =============================================================================
-- 14b. Additional Orders in Various States (for manual testing of Orders screen)
-- Each order needs its own post to avoid violating the conversations unique constraint
-- =============================================================================

-- Posts for additional orders
INSERT INTO public.posts (id, author_id, community_h3_index, type, reach, content)
VALUES
  ('f0000002-0000-0000-0000-000000000002', 'a1111111-1111-1111-1111-111111111111', '89283470c2fffff',
   'want_to_sell', 'community', '{"produceName":"Tomatoes","description":"Extra batch of tomatoes"}'),
  ('f0000003-0000-0000-0000-000000000003', 'a1111111-1111-1111-1111-111111111111', '89283470c2fffff',
   'want_to_sell', 'community', '{"produceName":"Strawberries","description":"Late season strawberries"}'),
  ('f0000004-0000-0000-0000-000000000004', 'b2222222-2222-2222-2222-222222222222', '89283470c2fffff',
   'want_to_sell', 'community', '{"produceName":"Basil","description":"Fresh basil from my garden"}'),
  ('f0000005-0000-0000-0000-000000000005', 'a1111111-1111-1111-1111-111111111111', '89283470c2fffff',
   'want_to_sell', 'community', '{"produceName":"Lemons","description":"Meyer lemons, organic"}'),
  ('f0000006-0000-0000-0000-000000000006', 'a1111111-1111-1111-1111-111111111111', '89283470c2fffff',
   'want_to_sell', 'community', '{"produceName":"Herbs Mix","description":"Mixed fresh herbs bundle"}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.want_to_sell_details (post_id, category, produce_name, unit, total_quantity_available, points_per_unit, is_produce, harvest_date)
VALUES
  ('f0000002-0000-0000-0000-000000000002', 'produce', 'Tomatoes', 'box', 10, 25, true, CURRENT_DATE),
  ('f0000003-0000-0000-0000-000000000003', 'produce', 'Strawberries', 'box', 5, 50, true, CURRENT_DATE),
  ('f0000004-0000-0000-0000-000000000004', 'produce', 'Basil', 'bag', 10, 8, true, CURRENT_DATE),
  ('f0000005-0000-0000-0000-000000000005', 'produce', 'Lemons', 'bag', 8, 20, true, CURRENT_DATE),
  ('f0000006-0000-0000-0000-000000000006', 'produce', 'Herbs Mix', 'bag', 6, 12, false, null);

-- Conversations for additional orders (each uses its own post_id → unique constraint satisfied)
INSERT INTO public.conversations (id, post_id, buyer_id, seller_id)
VALUES
  ('b8888888-8888-8888-8888-888888888802', 'f0000002-0000-0000-0000-000000000002',
   'b2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111'),
  ('b8888888-8888-8888-8888-888888888803', 'f0000003-0000-0000-0000-000000000003',
   'b2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111'),
  ('b8888888-8888-8888-8888-888888888804', 'f0000004-0000-0000-0000-000000000004',
   'a1111111-1111-1111-1111-111111111111', 'b2222222-2222-2222-2222-222222222222'),
  ('b8888888-8888-8888-8888-888888888805', 'f0000005-0000-0000-0000-000000000005',
   'b2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111'),
  ('b8888888-8888-8888-8888-888888888806', 'f0000006-0000-0000-0000-000000000006',
   'b2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111')
ON CONFLICT (id) DO NOTHING;

-- Offers for additional orders
INSERT INTO public.offers (id, conversation_id, created_by, quantity, points_per_unit, status)
VALUES
  ('c9999999-9999-9999-9999-999999999902', 'b8888888-8888-8888-8888-888888888802',
   'b2222222-2222-2222-2222-222222222222', 2, 25, 'accepted'),
  ('c9999999-9999-9999-9999-999999999903', 'b8888888-8888-8888-8888-888888888803',
   'b2222222-2222-2222-2222-222222222222', 1, 50, 'accepted'),
  ('c9999999-9999-9999-9999-999999999904', 'b8888888-8888-8888-8888-888888888804',
   'a1111111-1111-1111-1111-111111111111', 5, 8, 'accepted'),
  ('c9999999-9999-9999-9999-999999999905', 'b8888888-8888-8888-8888-888888888805',
   'b2222222-2222-2222-2222-222222222222', 4, 20, 'accepted'),
  ('c9999999-9999-9999-9999-999999999906', 'b8888888-8888-8888-8888-888888888806',
   'b2222222-2222-2222-2222-222222222222', 3, 12, 'accepted')
ON CONFLICT (id) DO NOTHING;

-- Accepted Order: Tomatoes (buyer=Test Buyer, seller=Test Seller)
INSERT INTO public.orders (
  id, offer_id, buyer_id, seller_id, category, product,
  quantity, points_per_unit, delivery_date, delivery_instructions,
  conversation_id, status, version
)
VALUES (
  'd0000000-0000-0000-0000-000000000002',
  'c9999999-9999-9999-9999-999999999902',
  'b2222222-2222-2222-2222-222222222222',
  'a1111111-1111-1111-1111-111111111111',
  'produce', 'Tomatoes',
  2, 25, CURRENT_DATE + interval '3 days', '456 Elm Street',
  'b8888888-8888-8888-8888-888888888802',
  'accepted', 1
) ON CONFLICT (id) DO NOTHING;

-- Delivered Order: Strawberries (buyer=Test Buyer, seller=Test Seller)
INSERT INTO public.orders (
  id, offer_id, buyer_id, seller_id, category, product,
  quantity, points_per_unit, delivery_date, delivery_instructions,
  conversation_id, status, version
)
VALUES (
  'd0000000-0000-0000-0000-000000000003',
  'c9999999-9999-9999-9999-999999999903',
  'b2222222-2222-2222-2222-222222222222',
  'a1111111-1111-1111-1111-111111111111',
  'produce', 'Strawberries',
  1, 50, CURRENT_DATE - interval '1 day', '789 Pine Road',
  'b8888888-8888-8888-8888-888888888803',
  'delivered', 2
) ON CONFLICT (id) DO NOTHING;

-- Disputed Order: Basil (buyer=Test Seller, seller=Test Buyer)
INSERT INTO public.orders (
  id, offer_id, buyer_id, seller_id, category, product,
  quantity, points_per_unit, delivery_date, delivery_instructions,
  conversation_id, status, version
)
VALUES (
  'd0000000-0000-0000-0000-000000000004',
  'c9999999-9999-9999-9999-999999999904',
  'a1111111-1111-1111-1111-111111111111',
  'b2222222-2222-2222-2222-222222222222',
  'produce', 'Basil',
  5, 8, CURRENT_DATE - interval '3 days', '321 Maple Lane',
  'b8888888-8888-8888-8888-888888888804',
  'disputed', 3
) ON CONFLICT (id) DO NOTHING;

-- Completed Order: Lemons (buyer=Test Buyer, seller=Test Seller)
INSERT INTO public.orders (
  id, offer_id, buyer_id, seller_id, category, product,
  quantity, points_per_unit, delivery_date, delivery_instructions,
  conversation_id, status, version,
  buyer_rating, buyer_feedback
)
VALUES (
  'd0000000-0000-0000-0000-000000000005',
  'c9999999-9999-9999-9999-999999999905',
  'b2222222-2222-2222-2222-222222222222',
  'a1111111-1111-1111-1111-111111111111',
  'produce', 'Lemons',
  4, 20, CURRENT_DATE - interval '7 days', '555 Oak Avenue',
  'b8888888-8888-8888-8888-888888888805',
  'completed', 4,
  '5', 'Excellent lemons, very fresh!'
) ON CONFLICT (id) DO NOTHING;

-- Cancelled Order: Herbs Mix (buyer=Test Buyer, seller=Test Seller)
INSERT INTO public.orders (
  id, offer_id, buyer_id, seller_id, category, product,
  quantity, points_per_unit, delivery_date,
  conversation_id, status, version
)
VALUES (
  'd0000000-0000-0000-0000-000000000006',
  'c9999999-9999-9999-9999-999999999906',
  'b2222222-2222-2222-2222-222222222222',
  'a1111111-1111-1111-1111-111111111111',
  'produce', 'Herbs Mix',
  3, 12, CURRENT_DATE + interval '5 days',
  'b8888888-8888-8888-8888-888888888806',
  'cancelled', 2
) ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 15. Standalone Offers (for Offers screen E2E tests)
-- =============================================================================
-- Creates buy posts + conversations + offers in various states so the Offers
-- screen can show Open (pending) and Past (accepted/rejected/withdrawn) tabs.

-- Buy Post 2: Looking for Cilantro (by Test Buyer)
INSERT INTO public.posts (id, author_id, community_h3_index, type, reach, content)
VALUES (
  'e5550001-0000-0000-0000-000000000001',
  'b2222222-2222-2222-2222-222222222222',
  '89283470c2fffff',
  'want_to_buy', 'community',
  '{"description":"Need fresh cilantro"}'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.want_to_buy_details (post_id, category, produce_names, desired_quantity, desired_unit, need_by_date)
VALUES ('e5550001-0000-0000-0000-000000000001', 'produce', ARRAY['Cilantro'], 5, 'bag', CURRENT_DATE + interval '7 days')
ON CONFLICT (post_id) DO NOTHING;

-- Buy Post 3: Looking for Mint (by Test Buyer)
INSERT INTO public.posts (id, author_id, community_h3_index, type, reach, content)
VALUES (
  'e5550002-0000-0000-0000-000000000002',
  'b2222222-2222-2222-2222-222222222222',
  '89283470c2fffff',
  'want_to_buy', 'community',
  '{"description":"Need fresh mint leaves"}'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.want_to_buy_details (post_id, category, produce_names, desired_quantity, desired_unit, need_by_date)
VALUES ('e5550002-0000-0000-0000-000000000002', 'produce', ARRAY['Mint'], 3, 'bag', CURRENT_DATE + interval '10 days')
ON CONFLICT (post_id) DO NOTHING;

-- Buy Post 4: Looking for Rosemary (by Test Buyer)
INSERT INTO public.posts (id, author_id, community_h3_index, type, reach, content)
VALUES (
  'e5550003-0000-0000-0000-000000000003',
  'b2222222-2222-2222-2222-222222222222',
  '89283470c2fffff',
  'want_to_buy', 'community',
  '{"description":"Looking for fresh rosemary sprigs"}'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.want_to_buy_details (post_id, category, produce_names, desired_quantity, desired_unit, need_by_date)
VALUES ('e5550003-0000-0000-0000-000000000003', 'produce', ARRAY['Rosemary'], 2, 'bag', CURRENT_DATE + interval '5 days')
ON CONFLICT (post_id) DO NOTHING;

-- Conversations for standalone offers (seller=Test Seller acting as offer maker)
INSERT INTO public.conversations (id, post_id, buyer_id, seller_id)
VALUES
  ('b8880001-0000-0000-0000-000000000001', 'e5550001-0000-0000-0000-000000000001',
   'b2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111'),
  ('b8880002-0000-0000-0000-000000000002', 'e5550002-0000-0000-0000-000000000002',
   'b2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111'),
  ('b8880003-0000-0000-0000-000000000003', 'e5550003-0000-0000-0000-000000000003',
   'b2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111')
ON CONFLICT (id) DO NOTHING;

-- Offer 1: Cilantro — PENDING (shows on Open tab)
INSERT INTO public.offers (id, conversation_id, created_by, post_id, quantity, points_per_unit, category, product, unit, delivery_date, status, version)
VALUES (
  'c9990001-0000-0000-0000-000000000001',
  'b8880001-0000-0000-0000-000000000001',
  'a1111111-1111-1111-1111-111111111111',
  'e5550001-0000-0000-0000-000000000001',
  5, 10, 'produce', 'Cilantro', 'bunch',
  CURRENT_DATE + interval '5 days',
  'pending', 1
) ON CONFLICT (id) DO NOTHING;

-- Offer 2: Mint — REJECTED (shows on Past tab)
INSERT INTO public.offers (id, conversation_id, created_by, post_id, quantity, points_per_unit, category, product, unit, delivery_date, status, version)
VALUES (
  'c9990002-0000-0000-0000-000000000002',
  'b8880002-0000-0000-0000-000000000002',
  'a1111111-1111-1111-1111-111111111111',
  'e5550002-0000-0000-0000-000000000002',
  3, 15, 'produce', 'Mint', 'bunch',
  CURRENT_DATE + interval '7 days',
  'rejected', 1
) ON CONFLICT (id) DO NOTHING;

-- Offer 3: Rosemary — WITHDRAWN (shows on Past tab)
INSERT INTO public.offers (id, conversation_id, created_by, post_id, quantity, points_per_unit, category, product, unit, delivery_date, status, version)
VALUES (
  'c9990003-0000-0000-0000-000000000003',
  'b8880003-0000-0000-0000-000000000003',
  'a1111111-1111-1111-1111-111111111111',
  'e5550003-0000-0000-0000-000000000003',
  2, 20, 'produce', 'Rosemary', 'bunch',
  CURRENT_DATE + interval '3 days',
  'withdrawn', 1
) ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 16. Delivery Proof Storage Bucket
-- =============================================================================
DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('delivery-proof-images', 'delivery-proof-images', true)
  ON CONFLICT (id) DO NOTHING;

  BEGIN CREATE POLICY "delivery_proof_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'delivery-proof-images');
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE POLICY "delivery_proof_select" ON storage.objects FOR SELECT USING (bucket_id = 'delivery-proof-images');
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- =============================================================================
-- 17. Test Delegations (pending so you can click Accept to test Toast!)
-- =============================================================================

INSERT INTO public.delegations (
  id,
  delegator_id,
  delegatee_id,
  status,
  delegate_pct
) VALUES (
  '12345678-1234-1234-1234-123456789012',
  'b2222222-2222-2222-2222-222222222222', -- Test Buyer (delegating their account)
  'a1111111-1111-1111-1111-111111111111', -- Test Seller (the designated delegate)
  'pending_pairing',
  15
) ON CONFLICT (id) DO NOTHING;
-- Mock the State Threshold for CA to $15.00
INSERT INTO small_balance_refund_thresholds (country_iso_3, state_id, threshold_cents)
VALUES ('USA', '00000000-0000-0000-0000-000000000001', 1500)
ON CONFLICT (COALESCE(country_iso_3, ''), COALESCE(state_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(county_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(city_id, '00000000-0000-0000-0000-000000000000'::uuid))
DO UPDATE SET threshold_cents = EXCLUDED.threshold_cents;

-- Mock an old points bucket by backdating a single bucket
-- This requires making the bucket's created_at more than 120 days old,
-- and the linked payment_transaction's created_at as well so they match up.

WITH to_mock AS (
  SELECT pb.id as bucket_id, pb.payment_transaction_id as pt_id
  FROM purchased_points_buckets pb
  WHERE pb.status IN ('active', 'partially_refunded')
  LIMIT 1
)
UPDATE payment_transactions
SET created_at = created_at - interval '130 days'
WHERE id IN (SELECT pt_id FROM to_mock);

WITH to_mock AS (
  SELECT pb.id as bucket_id, pb.payment_transaction_id as pt_id
  FROM purchased_points_buckets pb
  WHERE pb.status IN ('active', 'partially_refunded')
  LIMIT 1
)
UPDATE purchased_points_buckets
SET created_at = created_at - interval '130 days'
WHERE id IN (SELECT bucket_id FROM to_mock);

-- Add some dummy card data to the most recent bucket for UI testing
WITH recent_bucket AS (
  SELECT id
  FROM purchased_points_buckets
  WHERE status IN ('active', 'partially_refunded')
  ORDER BY created_at DESC
  LIMIT 1
)
UPDATE purchased_points_buckets
SET metadata = metadata || '{"card_brand": "visa", "card_last4": "4242"}'::jsonb
WHERE id IN (SELECT id FROM recent_bucket);

-- =============================================================================
-- 18. Community Voice Feedback Seed Data
-- =============================================================================
-- Seed Community Voice test data
DO $$
DECLARE
  v_user1 uuid;
  v_user2 uuid;
  v_user3 uuid;
  v_fb1 uuid;
  v_fb2 uuid;
  v_fb3 uuid;
  v_fb4 uuid;
  v_fb5 uuid;
  v_fb6 uuid;
  v_fb7 uuid;
  v_fb8 uuid;
BEGIN
  -- Make this script idempotent: clean existing feedback data first
  TRUNCATE feedback_comments, feedback_votes, feedback_media, feedback_comment_media,
           feedback_status_history, feedback_flags, user_feedback CASCADE;

  SELECT id INTO v_user1 FROM profiles ORDER BY created_at LIMIT 1;
  SELECT id INTO v_user2 FROM profiles ORDER BY created_at LIMIT 1 OFFSET 1;
  SELECT id INTO v_user3 FROM profiles ORDER BY created_at LIMIT 1 OFFSET 2;

  IF v_user1 IS NULL THEN
    RAISE EXCEPTION 'No users found in profiles table';
  END IF;

  v_user2 := COALESCE(v_user2, v_user1);
  v_user3 := COALESCE(v_user3, v_user1);

  -- Make seller@test.local a staff admin (deterministic, not ORDER BY dependent)
  INSERT INTO staff_members (email, user_id, roles, granted_at)
  VALUES ('seller@test.local', 'a1111111-1111-1111-1111-111111111111', '{admin,support}', now())
  ON CONFLICT (email) DO NOTHING;

  -- Bootstrap admin (always present for development)
  INSERT INTO staff_members (email, user_id, roles, granted_at)
  VALUES ('admin@casagrown.com', NULL, '{admin}', now())
  ON CONFLICT (email) DO NOTHING;

  -- Public feedback tickets
  INSERT INTO user_feedback (id, author_id, type, title, description, message, status, visibility, created_at)
  VALUES (gen_random_uuid(), v_user2, 'feature_request', 'Allow uploading videos in chat', 'It would be great to share short videos of produce condition directly in the chat.', 'It would be great to share short videos of produce condition directly in the chat.', 'planned', 'public', now() - interval '2 days')
  RETURNING id INTO v_fb1;

  INSERT INTO user_feedback (id, author_id, type, title, description, message, status, visibility, created_at)
  VALUES (gen_random_uuid(), v_user3, 'bug_report', 'App crashes when opening profile on Android', 'Every time I try to edit my bio, the app force closes. Samsung Galaxy S21.', 'Every time I try to edit my bio, the app force closes. Samsung Galaxy S21.', 'in_progress', 'public', now() - interval '1 day')
  RETURNING id INTO v_fb2;

  INSERT INTO user_feedback (id, author_id, type, title, description, message, status, visibility, created_at)
  VALUES (gen_random_uuid(), v_user2, 'feature_request', 'Dark mode support', 'My eyes hurt at night! Please add dark mode to the app.', 'My eyes hurt at night! Please add dark mode to the app.', 'open', 'public', now() - interval '5 days')
  RETURNING id INTO v_fb3;

  INSERT INTO user_feedback (id, author_id, type, title, description, message, status, visibility, created_at, resolved_at)
  VALUES (gen_random_uuid(), v_user3, 'bug_report', 'Notification badge not clearing', 'I have read all messages but the red dot persists.', 'I have read all messages but the red dot persists.', 'completed', 'public', now() - interval '3 days', now() - interval '1 day')
  RETURNING id INTO v_fb4;

  INSERT INTO user_feedback (id, author_id, type, title, description, message, status, visibility, created_at)
  VALUES (gen_random_uuid(), v_user2, 'feature_request', 'Points transaction history export', 'I want to export my points history as a CSV file for tax purposes.', 'I want to export my points history as a CSV file for tax purposes.', 'open', 'public', now() - interval '7 days')
  RETURNING id INTO v_fb5;

  INSERT INTO user_feedback (id, author_id, type, title, description, message, status, visibility, created_at, resolved_at)
  VALUES (gen_random_uuid(), v_user3, 'bug_report', 'Map not loading on slower connections', 'When on 3G, the map takes forever and sometimes shows blank.', 'When on 3G, the map takes forever and sometimes shows blank.', 'completed', 'public', now() - interval '10 days', now() - interval '4 days')
  RETURNING id INTO v_fb6;

  -- Private support tickets
  INSERT INTO user_feedback (id, author_id, type, title, description, message, status, visibility, created_at)
  VALUES (gen_random_uuid(), v_user2, 'support_request', 'Where did my points go?', 'I had 500 points yesterday but now I only see 200.', 'I had 500 points yesterday but now I only see 200.', 'open', 'private', now() - interval '1 day')
  RETURNING id INTO v_fb7;

  INSERT INTO user_feedback (id, author_id, type, title, description, message, status, visibility, created_at)
  VALUES (gen_random_uuid(), v_user3, 'support_request', 'Transaction failed but points deducted', 'I tried to buy tomatoes but the transaction shows failed. My points were still deducted.', 'I tried to buy tomatoes but the transaction shows failed. My points were still deducted.', 'under_review', 'private', now() - interval '6 hours')
  RETURNING id INTO v_fb8;

  -- Votes
  INSERT INTO feedback_votes (feedback_id, user_id) VALUES
    (v_fb1, v_user1), (v_fb1, v_user2), (v_fb1, v_user3),
    (v_fb2, v_user1), (v_fb2, v_user2),
    (v_fb3, v_user1), (v_fb3, v_user2), (v_fb3, v_user3),
    (v_fb4, v_user1),
    (v_fb5, v_user2), (v_fb5, v_user3),
    (v_fb6, v_user1), (v_fb6, v_user3)
  ON CONFLICT DO NOTHING;

  -- Comments
  INSERT INTO feedback_comments (feedback_id, author_id, content, is_official_response, created_at) VALUES
    (v_fb1, v_user3, 'Totally agree, this would help a lot!', false, now() - interval '1 day'),
    (v_fb1, v_user1, 'Great suggestion! Added to our Q2 roadmap.', true, now() - interval '12 hours'),
    (v_fb1, v_user2, 'Awesome! Can''t wait.', false, now() - interval '2 hours'),
    (v_fb2, v_user1, 'Investigating. Can you share your Android version?', true, now() - interval '20 hours'),
    (v_fb3, v_user3, '+1 for dark mode!', false, now() - interval '4 days'),
    (v_fb3, v_user1, 'Being considered for next major release.', true, now() - interval '3 days'),
    (v_fb7, v_user1, 'Looking into your account now.', true, now() - interval '12 hours');

  RAISE NOTICE 'Seeded 8 feedback tickets with votes and comments';
END $$;

-- ============================================================================
-- Charity Projects Cache (so Donate tab works without GlobalGiving API key)
-- ============================================================================
INSERT INTO public.charity_projects_cache (status, data, updated_at) VALUES (
  'active',
  '[
    {"id":1001,"title":"Feed the Hungry","organization":"Food for All","theme":"Hunger","imageUrl":"https://picsum.photos/seed/charity1/400/300","goal":50000,"raised":32000,"summary":"Providing nutritious meals to families in need across communities."},
    {"id":1002,"title":"Plant Trees for Tomorrow","organization":"GreenEarth Foundation","theme":"Environment","imageUrl":"https://picsum.photos/seed/charity2/400/300","goal":25000,"raised":18500,"summary":"Planting trees in deforested areas to combat climate change."},
    {"id":1003,"title":"Books for Every Child","organization":"Education First","theme":"Education","imageUrl":"https://picsum.photos/seed/charity3/400/300","goal":15000,"raised":9200,"summary":"Providing books and educational materials to underserved schools."},
    {"id":1004,"title":"Clean Water Initiative","organization":"WaterAid","theme":"Health","imageUrl":"https://picsum.photos/seed/charity4/400/300","goal":40000,"raised":27000,"summary":"Building wells and water purification systems in rural communities."},
    {"id":1005,"title":"Youth Sports Program","organization":"Play Together","theme":"Other","imageUrl":"https://picsum.photos/seed/charity5/400/300","goal":10000,"raised":6100,"summary":"Supporting youth sports programs and equipment for communities."}
  ]'::jsonb,
  now()
);

-- =============================================================================
-- 19. Market Seed Data (booths & products for browse testing)
-- =============================================================================
-- Seed Data: Test booths and products in 95120 area for Browse Market testing
DO $$
DECLARE
  s1 UUID := '11111111-1111-1111-1111-111111111111';
  s2 UUID := '22222222-2222-2222-2222-222222222222';
  s3 UUID := '33333333-3333-3333-3333-333333333333';
  s4 UUID := '44444444-4444-4444-4444-444444444444';
  s5 UUID := '55555555-5555-5555-5555-555555555555';
BEGIN
  -- Auth users
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, role, aud,
    instance_id, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES
    (s1,'maria@test.local',crypt('test1234',gen_salt('bf')),now(),'authenticated','authenticated','00000000-0000-0000-0000-000000000000','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()),
    (s2,'raj@test.local',crypt('test1234',gen_salt('bf')),now(),'authenticated','authenticated','00000000-0000-0000-0000-000000000000','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()),
    (s3,'chen@test.local',crypt('test1234',gen_salt('bf')),now(),'authenticated','authenticated','00000000-0000-0000-0000-000000000000','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()),
    (s4,'sofia@test.local',crypt('test1234',gen_salt('bf')),now(),'authenticated','authenticated','00000000-0000-0000-0000-000000000000','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()),
    (s5,'james@test.local',crypt('test1234',gen_salt('bf')),now(),'authenticated','authenticated','00000000-0000-0000-0000-000000000000','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now())
  ON CONFLICT (id) DO NOTHING;

  -- Auth identities (required for Supabase Auth login)
  INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  VALUES
    (s1, s1, 'maria@test.local', 'email', jsonb_build_object('sub', s1::text, 'email', 'maria@test.local'), now(), now(), now()),
    (s2, s2, 'raj@test.local', 'email', jsonb_build_object('sub', s2::text, 'email', 'raj@test.local'), now(), now(), now()),
    (s3, s3, 'chen@test.local', 'email', jsonb_build_object('sub', s3::text, 'email', 'chen@test.local'), now(), now(), now()),
    (s4, s4, 'sofia@test.local', 'email', jsonb_build_object('sub', s4::text, 'email', 'sofia@test.local'), now(), now(), now()),
    (s5, s5, 'james@test.local', 'email', jsonb_build_object('sub', s5::text, 'email', 'james@test.local'), now(), now(), now())
  ON CONFLICT (provider_id, provider) DO NOTHING;

  -- Update profiles (auth trigger already created them)
  UPDATE profiles SET full_name='Maria Garcia', email='maria@test.local', street_address='6449 Meridian Ave', city='San Jose', state_code='CA', zip_code='95120', zip_plus4='95120', home_community_h3_index='89283470c2fffff', nearby_community_h3_indices=ARRAY['89283470c6fffff','89283470cafffff'], home_location=ST_SetSRID(ST_MakePoint(-121.8825,37.2296),4326), phone_verified=true, tos_accepted_at=now(), profile_completed_at=now(), referral_code='SEEDMARIA1', buzz_welcomed_at=now() WHERE id=s1;
  UPDATE profiles SET full_name='Raj Patel', email='raj@test.local', street_address='1086 Foxchase Dr', city='San Jose', state_code='CA', zip_code='95120', zip_plus4='95120', home_community_h3_index='89283470c2fffff', nearby_community_h3_indices=ARRAY['89283470c6fffff','89283470cafffff'], home_location=ST_SetSRID(ST_MakePoint(-121.8607,37.2250),4326), phone_verified=true, tos_accepted_at=now(), profile_completed_at=now(), referral_code='SEEDRAJ1', buzz_welcomed_at=now() WHERE id=s2;
  UPDATE profiles SET full_name='Wei Chen', email='chen@test.local', street_address='1234 Hillsdale Ave', city='San Jose', state_code='CA', zip_code='95118', zip_plus4='95118', home_community_h3_index='89283470c2fffff', nearby_community_h3_indices=ARRAY['89283470c6fffff','89283470cafffff'], home_location=ST_SetSRID(ST_MakePoint(-121.8756,37.2523),4326), phone_verified=true, tos_accepted_at=now(), profile_completed_at=now(), referral_code='SEEDCHEN1', buzz_welcomed_at=now() WHERE id=s3;
  UPDATE profiles SET full_name='Sofia Rossi', email='sofia@test.local', street_address='5920 Cahalan Ave', city='San Jose', state_code='CA', zip_code='95123', zip_plus4='95123', home_community_h3_index='89283470c2fffff', nearby_community_h3_indices=ARRAY['89283470c6fffff','89283470cafffff'], home_location=ST_SetSRID(ST_MakePoint(-121.8430,37.2390),4326), phone_verified=true, tos_accepted_at=now(), profile_completed_at=now(), referral_code='SEEDSOFIA1', buzz_welcomed_at=now() WHERE id=s4;
  UPDATE profiles SET full_name='James Nguyen', email='james@test.local', street_address='2100 Camden Ave', city='San Jose', state_code='CA', zip_code='95124', zip_plus4='95124', home_community_h3_index='89283470c2fffff', nearby_community_h3_indices=ARRAY['89283470c6fffff','89283470cafffff'], home_location=ST_SetSRID(ST_MakePoint(-121.9150,37.2530),4326), phone_verified=true, tos_accepted_at=now(), profile_completed_at=now(), referral_code='SEEDJAMES1', buzz_welcomed_at=now() WHERE id=s5;

  -- Booths
  INSERT INTO market_booths (owner_id,name,description,decorative_theme,offers_delivery,offers_pickup,delivery_radius_miles,pickup_address,delivery_windows,pickup_windows,payment_method,pickup_location,is_default) VALUES
    (s1,'Maria''s Garden Fresh','Organic veggies from my backyard garden in Almaden. Grown with love, no pesticides!','floral',true,true,3,'6449 Meridian Ave, San Jose','[{"id":"8-10","start":"08:00","end":"10:00"},{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb,'[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb,'automatic',ST_SetSRID(ST_MakePoint(-121.8825,37.2296),4326),true),
    (s2,'Raj''s Tropical Orchard','Citrus and tropical fruits from my backyard orchard. Fresh-picked every market day!','tropical',true,true,5,'1086 Foxchase Dr, San Jose','[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb,'[{"id":"8-10","start":"08:00","end":"10:00"},{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb,'automatic',ST_SetSRID(ST_MakePoint(-121.8607,37.2250),4326),true),
    (s3,'Chen Family Farm Stand','Heritage vegetables and Asian greens. Growing specialty produce for 15 years.','harvest',false,true,0,'1234 Hillsdale Ave, San Jose','[]'::jsonb,'[{"id":"8-10","start":"08:00","end":"10:00"},{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb,'manual',ST_SetSRID(ST_MakePoint(-121.8756,37.2523),4326),true),
    (s4,'Sofia''s Kitchen Garden','Homemade baked goods and fresh herbs from my Italian-style kitchen garden.','cottage',true,true,4,'5920 Cahalan Ave, San Jose','[{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb,'[{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb,'automatic',ST_SetSRID(ST_MakePoint(-121.8430,37.2390),4326),true),
    (s5,'Herbs & Honey by James','Fresh-cut herbs, raw honey, and microgreens. Sustainably grown on my patio.','minimal',true,false,2,NULL,'[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb,'[]'::jsonb,'automatic',ST_SetSRID(ST_MakePoint(-121.9150,37.2530),4326),true)
  ON CONFLICT (owner_id) WHERE is_default = true DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, pickup_location=EXCLUDED.pickup_location, delivery_windows=EXCLUDED.delivery_windows, pickup_windows=EXCLUDED.pickup_windows;

  -- Products (with photos from /public/products/) — include fulfillment windows
  INSERT INTO market_products (seller_id,market_date,name,description,category,price_usd,unit,inventory,photos,harvested_at,moderation_status,
    window_dates, product_delivery_windows, product_pickup_windows) VALUES
    -- Maria (s1): booth offers delivery 8-10,10-12 + pickup 8-10
    (s1,CURRENT_DATE,'Heritage Tomatoes','Mix of Brandywine, Cherokee Purple, and Green Zebra','produce',5.00,'basket',20,'{"/products/heritage-tomatoes.png"}',now()-interval '1 day','approved',
     jsonb_build_array(to_char(CURRENT_DATE,'YYYY-MM-DD'), to_char(CURRENT_DATE+1,'YYYY-MM-DD')),
     jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"},{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"},{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb),
     jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb)),
    (s1,CURRENT_DATE,'Fresh Basil Bunch','Fragrant Genovese basil, just picked','produce',3.00,'bunch',15,'{"/products/fresh-basil.png"}',now(),'approved',
     jsonb_build_array(to_char(CURRENT_DATE,'YYYY-MM-DD'), to_char(CURRENT_DATE+1,'YYYY-MM-DD')),
     jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"},{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb),
     jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb)),
    (s1,CURRENT_DATE,'Organic Zucchini','Tender young zucchini from raised beds','produce',4.00,'bag',12,'{"/products/organic-zucchini.png"}',now()-interval '6 hours','approved',
     jsonb_build_array(to_char(CURRENT_DATE,'YYYY-MM-DD'), to_char(CURRENT_DATE+1,'YYYY-MM-DD')),
     jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"},{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb),
     jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb)),
    (s1,CURRENT_DATE,'Bell Pepper Mix','Red, yellow, and orange sweet peppers','produce',4.50,'bag',10,'{"/products/bell-peppers.png"}',now()-interval '1 day','approved',
     jsonb_build_array(to_char(CURRENT_DATE,'YYYY-MM-DD'), to_char(CURRENT_DATE+1,'YYYY-MM-DD')),
     jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"},{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb),
     jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb)),
    (s1,CURRENT_DATE,'Cherry Tomato Pint','Sweet Sungold and chocolate cherry tomatoes','produce',4.00,'pint',25,'{"/products/heritage-tomatoes.png"}',now(),'approved',
     jsonb_build_array(to_char(CURRENT_DATE,'YYYY-MM-DD'), to_char(CURRENT_DATE+1,'YYYY-MM-DD')),
     jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"},{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb),
     jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb)),
    -- Raj (s2): booth offers delivery 8-10 + pickup 8-10,10-12
    (s2,CURRENT_DATE,'Meyer Lemons','Sweet-tart Meyer lemons, tree-ripened','produce',3.50,'bag',30,'{"/products/meyer-lemons.png"}',now()-interval '2 days','approved',
     jsonb_build_array(to_char(CURRENT_DATE,'YYYY-MM-DD'), to_char(CURRENT_DATE+1,'YYYY-MM-DD')),
     jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb),
     jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"},{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"},{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb)),
    (s2,CURRENT_DATE,'Valencia Oranges','Juicy Valencia oranges, perfect for juicing','produce',4.00,'bag',25,'{"/products/valencia-oranges.png"}',now()-interval '1 day','approved',
     jsonb_build_array(to_char(CURRENT_DATE,'YYYY-MM-DD'), to_char(CURRENT_DATE+1,'YYYY-MM-DD')),
     jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb),
     jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"},{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"},{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb)),
    (s2,CURRENT_DATE,'Persian Limes','Bright green limes from my backyard tree','produce',3.00,'bag',20,'{"/products/persian-limes.png"}',now(),'approved',
     jsonb_build_array(to_char(CURRENT_DATE,'YYYY-MM-DD'), to_char(CURRENT_DATE+1,'YYYY-MM-DD')),
     jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb),
     jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"},{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"},{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb)),
    (s2,CURRENT_DATE,'Ruby Grapefruit','Deep red flesh, naturally sweet','produce',5.00,'each',15,'{"/products/ruby-grapefruit.png"}',now()-interval '3 days','approved',
     jsonb_build_array(to_char(CURRENT_DATE,'YYYY-MM-DD'), to_char(CURRENT_DATE+1,'YYYY-MM-DD')),
     jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb),
     jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"},{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"},{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb)),
    (s2,CURRENT_DATE,'Kumquats','Tiny, zesty kumquats — eat them whole!','produce',6.00,'pint',8,'{"/products/meyer-lemons.png"}',now(),'approved',
     jsonb_build_array(to_char(CURRENT_DATE,'YYYY-MM-DD'), to_char(CURRENT_DATE+1,'YYYY-MM-DD')),
     jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb),
     jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"},{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"},{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb)),
    -- Chen (s3): booth pickup-only 8-10,10-12
    (s3,CURRENT_DATE,'Baby Bok Choy','Tender baby bok choy, perfect for stir-fry','produce',3.50,'bunch',20,'{}',now(),'approved',
     jsonb_build_array(to_char(CURRENT_DATE,'YYYY-MM-DD'), to_char(CURRENT_DATE+1,'YYYY-MM-DD')),
     NULL,
     jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"},{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"},{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb)),
    (s3,CURRENT_DATE,'Chinese Long Beans','Crisp yard-long beans, freshly picked','produce',4.00,'bunch',15,'{}',now()-interval '6 hours','approved',
     jsonb_build_array(to_char(CURRENT_DATE,'YYYY-MM-DD'), to_char(CURRENT_DATE+1,'YYYY-MM-DD')),
     NULL,
     jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"},{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"},{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb)),
    (s3,CURRENT_DATE,'Daikon Radish','Large white daikon, great for soups and salads','produce',2.50,'each',12,'{}',now()-interval '1 day','approved',
     jsonb_build_array(to_char(CURRENT_DATE,'YYYY-MM-DD'), to_char(CURRENT_DATE+1,'YYYY-MM-DD')),
     NULL,
     jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"},{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"},{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb)),
    (s3,CURRENT_DATE,'Japanese Eggplant','Slender purple eggplant, no bitterness','produce',5.00,'bag',10,'{}',now()-interval '12 hours','approved',
     jsonb_build_array(to_char(CURRENT_DATE,'YYYY-MM-DD'), to_char(CURRENT_DATE+1,'YYYY-MM-DD')),
     NULL,
     jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"},{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"},{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb)),
    -- Sofia (s4): booth offers delivery 10-12 + pickup 10-12
    (s4,CURRENT_DATE,'Sourdough Loaf','Artisan sourdough, 24-hour ferment, crispy crust','produce',8.00,'loaf',6,'{"/products/sourdough-loaf.png"}',NULL,'approved',
     jsonb_build_array(to_char(CURRENT_DATE,'YYYY-MM-DD'), to_char(CURRENT_DATE+1,'YYYY-MM-DD')),
     jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb),
     jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb)),
    (s4,CURRENT_DATE,'Focaccia with Rosemary','Fluffy Italian focaccia topped with garden rosemary','produce',7.00,'half',8,'{"/products/herb-focaccia.png"}',NULL,'approved',
     jsonb_build_array(to_char(CURRENT_DATE,'YYYY-MM-DD'), to_char(CURRENT_DATE+1,'YYYY-MM-DD')),
     jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb),
     jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb)),
    (s4,CURRENT_DATE,'Strawberry Jam','Small-batch jam from local strawberries','produce',6.50,'jar',10,'{"/products/strawberry-jam.png"}',NULL,'approved',
     jsonb_build_array(to_char(CURRENT_DATE,'YYYY-MM-DD'), to_char(CURRENT_DATE+1,'YYYY-MM-DD')),
     jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb),
     jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb)),
    (s4,CURRENT_DATE,'Fresh Rosemary','Woody sprigs of fragrant rosemary','produce',2.00,'bunch',20,'{"/products/fresh-basil.png"}',now(),'approved',
     jsonb_build_array(to_char(CURRENT_DATE,'YYYY-MM-DD'), to_char(CURRENT_DATE+1,'YYYY-MM-DD')),
     jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb),
     jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb)),
    (s4,CURRENT_DATE,'Apple Cinnamon Pie','Homemade pie with Granny Smith apples','produce',12.00,'pie',3,'{"/products/apple-pie.png"}',NULL,'approved',
     jsonb_build_array(to_char(CURRENT_DATE,'YYYY-MM-DD'), to_char(CURRENT_DATE+1,'YYYY-MM-DD')),
     jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb),
     jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb)),
    -- James (s5): booth delivery-only 8-10
    (s5,CURRENT_DATE,'Raw Wildflower Honey','Pure raw honey from local hives, unfiltered','honey',12.00,'jar',8,'{"/products/strawberry-jam.png"}',NULL,'approved',
     jsonb_build_array(to_char(CURRENT_DATE,'YYYY-MM-DD'), to_char(CURRENT_DATE+1,'YYYY-MM-DD')),
     jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb),
     NULL),
    (s5,CURRENT_DATE,'Microgreens Mix','Sunflower, radish, and pea shoot mix','produce',5.00,'box',15,'{"/products/fresh-basil.png"}',now(),'approved',
     jsonb_build_array(to_char(CURRENT_DATE,'YYYY-MM-DD'), to_char(CURRENT_DATE+1,'YYYY-MM-DD')),
     jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb),
     NULL),
    (s5,CURRENT_DATE,'Fresh Mint Bundle','Spearmint and peppermint, great for tea','produce',2.50,'bunch',25,'{"/products/fresh-basil.png"}',now(),'approved',
     jsonb_build_array(to_char(CURRENT_DATE,'YYYY-MM-DD'), to_char(CURRENT_DATE+1,'YYYY-MM-DD')),
     jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb),
     NULL),
    (s5,CURRENT_DATE,'Thai Basil','Aromatic Thai basil with purple stems','produce',3.00,'bunch',18,'{"/products/fresh-basil.png"}',now(),'approved',
     jsonb_build_array(to_char(CURRENT_DATE,'YYYY-MM-DD'), to_char(CURRENT_DATE+1,'YYYY-MM-DD')),
     jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb),
     NULL),
    (s5,CURRENT_DATE,'Lavender Sachets','Dried lavender from my garden, handmade sachets','flowers',4.00,'each',12,'{}',NULL,'approved',
     jsonb_build_array(to_char(CURRENT_DATE,'YYYY-MM-DD'), to_char(CURRENT_DATE+1,'YYYY-MM-DD')),
     jsonb_build_object(to_char(CURRENT_DATE,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb, to_char(CURRENT_DATE+1,'YYYY-MM-DD'), '[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb),
     NULL);

  -- ============================================================
  --  Market Orders seed — comprehensive test scenarios
  --  seller@test = a1111111... , buyer@test = b2222222...
  --  seller@test has a booth + "Heirloom Peppers" product
  -- ============================================================

  -- Give seller@test a booth + product
  INSERT INTO market_booths (owner_id,name,description,decorative_theme,offers_delivery,offers_pickup,delivery_radius_miles,pickup_address,delivery_windows,pickup_windows,payment_method,pickup_location,is_default) VALUES
    ('a1111111-1111-1111-1111-111111111111','Test Seller''s Garden','Fresh garden produce from local backyard','harvest',
     true,true,5,'1168 Lincoln Ave, San Jose, CA 95125',
     '[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb,
     '[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb,
     'automatic',ST_SetSRID(ST_MakePoint(-121.8977,37.3084),4326),true)
  ON CONFLICT (owner_id) WHERE is_default = true DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, offers_delivery=EXCLUDED.offers_delivery, offers_pickup=EXCLUDED.offers_pickup, delivery_radius_miles=EXCLUDED.delivery_radius_miles, pickup_address=EXCLUDED.pickup_address, delivery_windows=EXCLUDED.delivery_windows, pickup_windows=EXCLUDED.pickup_windows, pickup_location=EXCLUDED.pickup_location;

  INSERT INTO market_products (seller_id,market_date,name,description,category,price_usd,unit,inventory,photos,harvested_at,moderation_status) VALUES
    ('a1111111-1111-1111-1111-111111111111',CURRENT_DATE,'Heirloom Peppers','Mixed hot and sweet peppers','produce',4.50,'basket',10,'{}',now(),'approved'),
    ('a1111111-1111-1111-1111-111111111111',CURRENT_DATE,'Sweet Corn','Golden bantam corn, picked today','produce',3.00,'each',20,'{}',now(),'approved'),
    ('a1111111-1111-1111-1111-111111111111',CURRENT_DATE,'Fresh Eggs','Free-range eggs from happy chickens','eggs',6.00,'dozen',8,'{}',now(),'approved'),
    ('a1111111-1111-1111-1111-111111111111',CURRENT_DATE,'Organic Honey','Raw wildflower honey, unfiltered','honey',10.00,'jar',5,'{}',NULL,'approved'),
    ('a1111111-1111-1111-1111-111111111111',CURRENT_DATE,'Sunflower Bouquet','Bright cheerful sunflowers from our garden','flowers',8.00,'bunch',6,'{}',now(),'approved')
  ON CONFLICT DO NOTHING;

  -- Give buyer@test a booth + products (so seller can buy from buyer)
  INSERT INTO market_booths (owner_id,name,description,decorative_theme,offers_delivery,offers_pickup,delivery_radius_miles,pickup_address,delivery_windows,pickup_windows,payment_method,pickup_location,is_default) VALUES
    ('b2222222-2222-2222-2222-222222222222','Beth''s Backyard Harvest','Fresh seasonal produce from my backyard garden','cottage',true,true,4,'1247 Minnesota Ave, San Jose, CA 95125',
     '[{"id":"9-11","start":"09:00","end":"11:00"},{"id":"14-16","start":"14:00","end":"16:00"}]'::jsonb,
     '[{"id":"9-11","start":"09:00","end":"11:00"}]'::jsonb,
     'automatic',ST_SetSRID(ST_MakePoint(-121.8983,37.3068),4326),true)
  ON CONFLICT (owner_id) WHERE is_default = true DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, offers_delivery=true, offers_pickup=true, delivery_windows=EXCLUDED.delivery_windows, pickup_windows=EXCLUDED.pickup_windows, pickup_address=EXCLUDED.pickup_address, pickup_location=EXCLUDED.pickup_location;

  INSERT INTO market_products (seller_id,market_date,name,description,category,price_usd,unit,inventory,photos,harvested_at,moderation_status) VALUES
    ('b2222222-2222-2222-2222-222222222222',CURRENT_DATE,'Roma Tomatoes','Meaty paste tomatoes, great for sauce','produce',4.00,'basket',15,'{}',now(),'approved'),
    ('b2222222-2222-2222-2222-222222222222',CURRENT_DATE,'Purple Basil','Beautiful purple Genovese basil','produce',3.50,'bunch',12,'{}',now(),'approved'),
    ('b2222222-2222-2222-2222-222222222222',CURRENT_DATE,'Fresh Mint','Spearmint from raised beds, pesticide free','produce',2.50,'bunch',20,'{}',now(),'approved'),
    ('b2222222-2222-2222-2222-222222222222',CURRENT_DATE,'Strawberries','Sweet Seascape variety, just picked today','produce',5.00,'pint',10,'{}',now(),'approved'),
    ('b2222222-2222-2222-2222-222222222222',CURRENT_DATE,'Lavender Bundle','Dried French lavender from my garden','flowers',4.00,'bunch',8,'{}',NULL,'approved'),
    ('b2222222-2222-2222-2222-222222222222',CURRENT_DATE,'Lemon Cucumbers','Round, sweet lemon cucumbers','produce',3.00,'bag',14,'{}',now(),'approved'),
    ('b2222222-2222-2222-2222-222222222222',CURRENT_DATE,'Tomato Seedling','Ready-to-plant cherry tomato seedling in a 4-inch pot','seedlings',6.00,'each',10,'{}',NULL,'approved'),
    ('b2222222-2222-2222-2222-222222222222',CURRENT_DATE,'Aloe Vera Plant','Small established aloe vera plant, great for kitchens','plants',12.00,'each',5,'{}',NULL,'approved')
  ON CONFLICT DO NOTHING;

  -- ── SELLER@TEST AS SELLER (login as seller@test to manage) ──

  -- S1: Pending delivery — seller needs to mark delivered or decline
  INSERT INTO market_orders (buyer_id, seller_id, booth_id, product_id, product_name,
    quantity, unit_price_usd, subtotal_usd, tax_amount_usd, total_usd,
    fulfillment_type, status)
  SELECT 'b2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111', b.id, p.id, 'Heirloom Peppers',
    3, 4.50, 13.50, 1.25, 14.75, 'delivery', 'pending'
  FROM market_booths b, market_products p
  WHERE b.owner_id = 'a1111111-1111-1111-1111-111111111111' AND p.name = 'Heirloom Peppers' LIMIT 1;

  -- S2: Pending pickup — seller needs to mark ready
  INSERT INTO market_orders (buyer_id, seller_id, booth_id, product_id, product_name,
    quantity, unit_price_usd, subtotal_usd, tax_amount_usd, total_usd,
    fulfillment_type, status)
  SELECT 'b2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111', b.id, p.id, 'Heirloom Peppers',
    2, 4.50, 9.00, 0.83, 9.83, 'pickup', 'pending'
  FROM market_booths b, market_products p
  WHERE b.owner_id = 'a1111111-1111-1111-1111-111111111111' AND p.name = 'Heirloom Peppers' LIMIT 1;

  -- S2b: Another pending pickup from same buyer (Beth → Sam) — for group hand-off testing
  INSERT INTO market_orders (buyer_id, seller_id, booth_id, product_id, product_name,
    quantity, unit_price_usd, subtotal_usd, tax_amount_usd, total_usd,
    fulfillment_type, status)
  SELECT 'b2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111', b.id, p.id, 'Heritage Tomatoes',
    3, 5.00, 15.00, 1.39, 16.39, 'pickup', 'pending'
  FROM market_booths b, market_products p
  WHERE b.owner_id = 'a1111111-1111-1111-1111-111111111111' AND p.name = 'Heritage Tomatoes' LIMIT 1;

  -- S2c: Third pending pickup from Beth → Sam — lemons
  INSERT INTO market_orders (buyer_id, seller_id, booth_id, product_id, product_name,
    quantity, unit_price_usd, subtotal_usd, tax_amount_usd, total_usd,
    fulfillment_type, status)
  SELECT 'b2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111', b.id, p.id, 'Meyer Lemons',
    4, 3.50, 14.00, 1.30, 15.30, 'pickup', 'pending'
  FROM market_booths b, market_products p
  WHERE b.owner_id = 'a1111111-1111-1111-1111-111111111111' AND p.name = 'Meyer Lemons' LIMIT 1;

  -- ── MARIA → SAM (mixed pickup + delivery) ──

  -- M1: Pending pickup from Maria
  INSERT INTO market_orders (buyer_id, seller_id, booth_id, product_id, product_name,
    quantity, unit_price_usd, subtotal_usd, tax_amount_usd, total_usd,
    fulfillment_type, status)
  SELECT 'c3333333-3333-3333-3333-333333333333', 'a1111111-1111-1111-1111-111111111111', b.id, p.id, 'Heritage Tomatoes',
    2, 5.00, 10.00, 0.93, 10.93, 'pickup', 'pending'
  FROM market_booths b, market_products p
  WHERE b.owner_id = 'a1111111-1111-1111-1111-111111111111' AND p.name = 'Heritage Tomatoes' LIMIT 1;

  -- M2: Pending pickup from Maria (second item)
  INSERT INTO market_orders (buyer_id, seller_id, booth_id, product_id, product_name,
    quantity, unit_price_usd, subtotal_usd, tax_amount_usd, total_usd,
    fulfillment_type, status)
  SELECT 'c3333333-3333-3333-3333-333333333333', 'a1111111-1111-1111-1111-111111111111', b.id, p.id, 'Heirloom Peppers',
    1, 4.50, 4.50, 0.42, 4.92, 'pickup', 'pending'
  FROM market_booths b, market_products p
  WHERE b.owner_id = 'a1111111-1111-1111-1111-111111111111' AND p.name = 'Heirloom Peppers' LIMIT 1;

  -- M3: Pending delivery from Maria (different fulfillment type)
  INSERT INTO market_orders (buyer_id, seller_id, booth_id, product_id, product_name,
    quantity, unit_price_usd, subtotal_usd, tax_amount_usd, total_usd,
    fulfillment_type, status)
  SELECT 'c3333333-3333-3333-3333-333333333333', 'a1111111-1111-1111-1111-111111111111', b.id, p.id, 'Meyer Lemons',
    3, 3.50, 10.50, 0.97, 11.47, 'delivery', 'pending'
  FROM market_booths b, market_products p
  WHERE b.owner_id = 'a1111111-1111-1111-1111-111111111111' AND p.name = 'Meyer Lemons' LIMIT 1;

  -- ── SELLER@TEST AS BUYER (login as seller@test to confirm/dispute) ──

  -- B1: Delivered — buyer can confirm delivery (test complete delivery)
  INSERT INTO market_orders (buyer_id, seller_id, booth_id, product_id, product_name,
    quantity, unit_price_usd, subtotal_usd, tax_amount_usd, total_usd,
    fulfillment_type, status, delivered_at, auto_complete_at)
  SELECT 'a1111111-1111-1111-1111-111111111111', s1, b.id, p.id, 'Heritage Tomatoes',
    2, 5.00, 10.00, 0.93, 10.93, 'delivery', 'delivered', now() - interval '30 min', now() + interval '3 hours 30 min'
  FROM market_booths b, market_products p
  WHERE b.owner_id = s1 AND p.name = 'Heritage Tomatoes' LIMIT 1;

  -- B2: Delivered — buyer can dispute delivery (test dispute delivery)
  INSERT INTO market_orders (buyer_id, seller_id, booth_id, product_id, product_name,
    quantity, unit_price_usd, subtotal_usd, tax_amount_usd, total_usd,
    fulfillment_type, status, delivered_at, auto_complete_at)
  SELECT 'a1111111-1111-1111-1111-111111111111', s2, b.id, p.id, 'Meyer Lemons',
    3, 3.50, 10.50, 0.97, 11.47, 'delivery', 'delivered', now() - interval '15 min', now() + interval '3 hours 45 min'
  FROM market_booths b, market_products p
  WHERE b.owner_id = s2 AND p.name = 'Meyer Lemons' LIMIT 1;

  -- B3: Ready for pickup with passcodes — buyer can complete pickup
  INSERT INTO market_orders (buyer_id, seller_id, booth_id, product_id, product_name,
    quantity, unit_price_usd, subtotal_usd, tax_amount_usd, total_usd,
    fulfillment_type, status, buyer_passcode, seller_passcode)
  SELECT 'a1111111-1111-1111-1111-111111111111', s3, b.id, p.id, 'Baby Bok Choy',
    5, 3.50, 17.50, 1.62, 19.12, 'pickup', 'pending', '4821', '7359'
  FROM market_booths b, market_products p
  WHERE b.owner_id = s3 AND p.name = 'Baby Bok Choy' LIMIT 1;

  -- B4: Ready for pickup — buyer can decline pickup
  INSERT INTO market_orders (buyer_id, seller_id, booth_id, product_id, product_name,
    quantity, unit_price_usd, subtotal_usd, tax_amount_usd, total_usd,
    fulfillment_type, status, buyer_passcode, seller_passcode)
  SELECT 'a1111111-1111-1111-1111-111111111111', s4, b.id, p.id, 'Sourdough Loaf',
    1, 8.00, 8.00, 0.74, 8.74, 'pickup', 'pending', '1234', '5678'
  FROM market_booths b, market_products p
  WHERE b.owner_id = s4 AND p.name = 'Sourdough Loaf' LIMIT 1;

  -- ── SELLER@TEST: DECLINE TEST ──

  -- S3: Pending delivery — seller can decline this one
  INSERT INTO market_orders (buyer_id, seller_id, booth_id, product_id, product_name,
    quantity, unit_price_usd, subtotal_usd, tax_amount_usd, total_usd,
    fulfillment_type, status)
  SELECT 'b2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111', b.id, p.id, 'Heirloom Peppers',
    2, 4.50, 9.00, 0.83, 9.83, 'delivery', 'pending'
  FROM market_booths b, market_products p
  WHERE b.owner_id = 'a1111111-1111-1111-1111-111111111111' AND p.name = 'Heirloom Peppers' LIMIT 1;

  -- ── BUYER@TEST AS BUYER (login as buyer@test to see buyer view) ──

  -- C1: Pending delivery from seller Sofia
  INSERT INTO market_orders (buyer_id, seller_id, booth_id, product_id, product_name,
    quantity, unit_price_usd, subtotal_usd, tax_amount_usd, total_usd,
    fulfillment_type, status)
  SELECT 'b2222222-2222-2222-2222-222222222222', s4, b.id, p.id, 'Sourdough Loaf',
    1, 8.00, 8.00, 0.74, 8.74, 'delivery', 'pending'
  FROM market_booths b, market_products p
  WHERE b.owner_id = s4 AND p.name = 'Sourdough Loaf' LIMIT 1;

  -- ── PAST ORDERS (for Past tab) ──

  -- P1: Completed delivery
  INSERT INTO market_orders (buyer_id, seller_id, booth_id, product_id, product_name,
    quantity, unit_price_usd, subtotal_usd, tax_amount_usd, total_usd,
    fulfillment_type, status, completed_at)
  SELECT 'b2222222-2222-2222-2222-222222222222', s5, b.id, p.id, 'Raw Wildflower Honey',
    1, 12.00, 12.00, 1.11, 13.11, 'delivery', 'completed', now() - interval '5 days'
  FROM market_booths b, market_products p
  WHERE b.owner_id = s5 AND p.name = 'Raw Wildflower Honey' LIMIT 1;

  -- STALE1: Pending from yesterday — should be auto-cancelled by settle_stale_orders()
  INSERT INTO market_orders (buyer_id, seller_id, booth_id, product_id, product_name,
    quantity, unit_price_usd, subtotal_usd, tax_amount_usd, total_usd,
    fulfillment_type, status, created_at)
  SELECT 'a1111111-1111-1111-1111-111111111111', s5, b.id, p.id, 'Microgreens Mix',
    2, 6.00, 12.00, 1.11, 13.11, 'delivery', 'pending', now() - interval '1 day'
  FROM market_booths b, market_products p
  WHERE b.owner_id = s5 AND p.name = 'Microgreens Mix' LIMIT 1;

  -- STALE2: Ready for pickup from yesterday — should also be auto-cancelled
  INSERT INTO market_orders (buyer_id, seller_id, booth_id, product_id, product_name,
    quantity, unit_price_usd, subtotal_usd, tax_amount_usd, total_usd,
    fulfillment_type, status, buyer_passcode, seller_passcode, created_at)
  SELECT 'b2222222-2222-2222-2222-222222222222', s1, b.id, p.id, 'Fresh Basil Bunch',
    2, 3.00, 6.00, 0.56, 6.56, 'pickup', 'pending', '9999', '8888', now() - interval '1 day'
  FROM market_booths b, market_products p
  WHERE b.owner_id = s1 AND p.name = 'Fresh Basil Bunch' LIMIT 1;

END $$;

-- =============================================================================
-- PAYOUT FLOW TEST DATA
-- Seeds settlement + ledger + user_balances so the Payout page has real balance
-- Login as seller@test.local (Sam Seller) → /earnings/payout to test
-- =============================================================================

-- 1. Create a cleared settlement for yesterday
INSERT INTO market_settlements (id, market_date, status, total_orders, total_captured_usd,
  total_payouts_usd, total_fees_usd, total_refunds_usd, total_released_usd,
  reconciliation_check, created_at, updated_at)
VALUES (
  'e0000001-0000-0000-0000-000000000001',
  CURRENT_DATE - interval '2 days',
  'cleared',
  5, 65.00, 52.50, 2.50, 0.00, 10.00,
  '{"check1_ledger_consistency": true, "check2_settlement_balance": true}'::jsonb,
  now() - interval '1 day', now() - interval '1 day'
) ON CONFLICT (market_date) DO NOTHING;

-- 2. User settlements
INSERT INTO user_settlements (id, settlement_id, user_id, gross_sales_usd,
  total_purchases_usd, refunds_issued_usd, refunds_received_usd,
  platform_fees_usd, hold_captured_usd, hold_released_usd, net_payout_usd, status)
VALUES
  ('e0000010-0000-0000-0000-000000000001',
   'e0000001-0000-0000-0000-000000000001',
   'a1111111-1111-1111-1111-111111111111',
   50.00, 0.00, 0.00, 0.00, 2.50, 0.00, 0.00, 47.50, 'available'),
  ('e0000010-0000-0000-0000-000000000002',
   'e0000001-0000-0000-0000-000000000001',
   'b2222222-2222-2222-2222-222222222222',
   15.00, 0.00, 0.00, 0.00, 0.75, 0.00, 0.00, 14.25, 'available')
ON CONFLICT DO NOTHING;

-- 3. Market ledger: settlement credits for both users → funds_cleared
INSERT INTO market_ledger (event_type, user_id, settlement_id, amount_usd, direction, balance_after, metadata)
VALUES
  -- Sam Seller: $50 sales credit
  ('settlement_credit', 'a1111111-1111-1111-1111-111111111111',
   'e0000001-0000-0000-0000-000000000001', 50.00, 'credit', 50.00,
   '{"type":"gross_sales"}'::jsonb),
  -- Sam Seller: $2.50 fee
  ('fee_charged', 'a1111111-1111-1111-1111-111111111111',
   'e0000001-0000-0000-0000-000000000001', 2.50, 'debit', 47.50,
   '{}'::jsonb),
  -- Sam Seller: funds cleared ($47.50 available)
  ('funds_cleared', 'a1111111-1111-1111-1111-111111111111',
   'e0000001-0000-0000-0000-000000000001', 47.50, 'credit', 95.00,
   '{"type":"funds_available"}'::jsonb),
  -- Beth Buyer: $15 sales credit
  ('settlement_credit', 'b2222222-2222-2222-2222-222222222222',
   'e0000001-0000-0000-0000-000000000001', 15.00, 'credit', 15.00,
   '{"type":"gross_sales"}'::jsonb),
  -- Beth Buyer: $0.75 fee
  ('fee_charged', 'b2222222-2222-2222-2222-222222222222',
   'e0000001-0000-0000-0000-000000000001', 0.75, 'debit', 14.25,
   '{}'::jsonb),
  -- Beth Buyer: funds cleared ($14.25 available)
  ('funds_cleared', 'b2222222-2222-2222-2222-222222222222',
   'e0000001-0000-0000-0000-000000000001', 14.25, 'credit', 28.50,
   '{"type":"funds_available"}'::jsonb);

-- 4. User balances ($47.50 for Sam, $14.25 for Beth, available for payout)
INSERT INTO user_balances (user_id, available_usd, pending_usd, total_earned_usd, total_spent_usd, total_withdrawn_usd)
VALUES
  ('a1111111-1111-1111-1111-111111111111', 47.50, 0.00, 50.00, 0.00, 0.00),
  ('b2222222-2222-2222-2222-222222222222', 14.25, 0.00, 15.00, 0.00, 0.00)
ON CONFLICT (user_id) DO UPDATE SET
  available_usd = EXCLUDED.available_usd,
  pending_usd = EXCLUDED.pending_usd,
  total_earned_usd = EXCLUDED.total_earned_usd,
  total_spent_usd = EXCLUDED.total_spent_usd,
  total_withdrawn_usd = EXCLUDED.total_withdrawn_usd,
  updated_at = now();


-- =============================================================================
-- 21. CasaBot System User + Demo Community Chat Messages
-- =============================================================================

-- CasaBot auth user
INSERT INTO auth.users (
  id, instance_id, aud, role,
  email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES (
  'a0000000-0000-0000-0000-00000ca5ab07',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'casabot@casagrown.com',
  '$2a$06$FbG0qaw0v4J3GOm/y5tduulnL0cYxDpju9ZoHH9mNJW.GgeaC.xve',
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"CasaBot 🌱"}',
  now(), now(),
  '', '', '', ''
) ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (
  id, user_id, provider_id, provider,
  identity_data, last_sign_in_at,
  created_at, updated_at
) VALUES (
  'a0000000-0000-0000-0000-00000ca5ab07',
  'a0000000-0000-0000-0000-00000ca5ab07',
  'casabot@casagrown.com', 'email',
  jsonb_build_object('sub', 'a0000000-0000-0000-0000-00000ca5ab07', 'email', 'casabot@casagrown.com'),
  now(), now(), now()
) ON CONFLICT (provider_id, provider) DO NOTHING;

-- CasaBot profile
INSERT INTO public.profiles (
  id, email, full_name, avatar_url, home_community_h3_index
) VALUES (
  'a0000000-0000-0000-0000-00000ca5ab07',
  'casabot@casagrown.com',
  'CasaBot 🐝',
  '/logo.png',
  '89283470c2fffff'
) ON CONFLICT (id) DO UPDATE SET
  full_name = 'CasaBot 🐝',
  avatar_url = '/logo.png';

-- Demo community chat messages (spread over several days for realism)
-- Using the realistic demo booth owners from earlier in the seed
INSERT INTO public.community_chat_messages (community_h3_index, author_id, content, is_system, is_pinned, created_at)
VALUES
  ('89283470c2fffff', 'a0000000-0000-0000-0000-00000ca5ab07',
   '👋 Welcome to CasaGrown Community! Share gardening tips, trade produce, and connect with neighbors. Say hello! 🌿',
   true, true, now() - interval '6 days'),
  ('89283470c2fffff', 'a0000000-0000-0000-0000-00000ca5ab07',
   '🌱 **Gardening Tip**: March is perfect for starting tomato seedlings indoors! They need 6-8 weeks before transplanting. Keep soil around 70-75°F for fastest germination.',
   true, false, now() - interval '5 days'),
  ('89283470c2fffff', 'a0000000-0000-0000-0000-00000ca5ab07',
   '🐝 Did you know? Planting marigolds near your vegetable garden repels pests naturally and attracts pollinators!',
   true, false, now() - interval '4 days'),
  ('89283470c2fffff', 'a1111111-1111-1111-1111-111111111111',
   'Just harvested a bunch of tomatoes from my raised bed! Anyone interested? 🍅',
   false, false, now() - interval '3 days'),
  ('89283470c2fffff', 'b2222222-2222-2222-2222-222222222222',
   'Yes please! I''d love some. How much are you asking per box?',
   false, false, now() - interval '3 days' + interval '2 hours'),
  ('89283470c2fffff', 'c3333333-3333-3333-3333-333333333333',
   'My basil is going crazy this season! Happy to share cuttings with anyone who wants to grow their own 🌿',
   false, false, now() - interval '2 days'),
  ('89283470c2fffff', 'a0000000-0000-0000-0000-00000ca5ab07',
   '💡 Have excess produce? Tap "📸 Sell Excess Produce" on the market page to share with neighbors!',
   true, false, now() - interval '1 day'),
  ('89283470c2fffff', 'b2222222-2222-2222-2222-222222222222',
   '@CasaBot what fruit trees grow well in partial shade around here?',
   false, false, now() - interval '12 hours'),
  ('89283470c2fffff', 'a0000000-0000-0000-0000-00000ca5ab07',
   '🌻 Ask me anything about gardening! Mention @CasaBot for planting schedules, pest control, soil tips, and more.',
   true, false, now() - interval '1 hour');

-- ============================================================================
-- Local Development Environment Overrides
-- ============================================================================

-- Ensure that local environments always default to localhost for email links.
-- The 20260423000100 migration creates a production vault secret as a failsafe 
-- when app.settings is missing. By deleting it here in the seed script, 
-- we guarantee local testing behaves correctly after a `supabase db reset`.
DELETE FROM vault.decrypted_secrets WHERE name = 'app_url';


-- ─── CRM Audiences ───────────────────────────────────────────────────────────
INSERT INTO crm_audiences (id, name, description, recipient_type, audience_rpc_name)
VALUES 
  ('11111111-2222-3333-4444-555555555555', 'All Active Users', 'Returns all registered users', 'users', 'crm_audience_users_only'),
  ('22222222-3333-4444-5555-666666666666', 'All Leads', 'Returns all un-registered leads', 'leads', 'crm_audience_leads_only'),
  ('33333333-4444-5555-6666-777777777777', 'Everyone (Leads + Users)', 'Returns all users and leads', 'both', 'crm_audience_all')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION get_audience_all_users()
RETURNS TABLE (
  id uuid,
  name text,
  email text,
  phone text,
  accepts_email boolean,
  accepts_sms boolean,
  recipient_type text
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 
    p.id,
    p.full_name as name,
    p.email,
    p.phone_number as phone,
    true as accepts_email,
    true as accepts_sms,
    'user'::text as recipient_type
  FROM profiles p;
$$;

INSERT INTO crm_audiences (id, name, description, recipient_type, audience_rpc_name)
VALUES ('77777777-8888-9999-0000-111111111111', 'All Users (Local Dev)', 'Local test audience returning everyone without filtering test domains', 'users', 'get_audience_all_users')
ON CONFLICT DO NOTHING;

-- =============================================================================
-- Queued Payouts for Admin Testing
-- =============================================================================
INSERT INTO public.redemption_merchandize (id, name, point_cost, type, reach_type)
VALUES (
  '07753e6c-c695-4af3-9028-f95555dee7e0',
  'Admin Test Payout Item',
  1500,
  'donation',
  'global'
) ON CONFLICT DO NOTHING;

INSERT INTO public.redemptions (id, user_id, item_id, point_cost, status, created_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'a1111111-1111-1111-1111-111111111111',
  '07753e6c-c695-4af3-9028-f95555dee7e0',
  1500,
  'queued',
  now()
) ON CONFLICT DO NOTHING;

-- =============================================================================
-- Sam Seller's Default Booth (Willow Glen Farm Stand)
-- =============================================================================

-- Booth 1: Default booth (Willow Glen Farm Stand)
INSERT INTO market_booths (id, owner_id, name, description, decorative_theme,
  offers_delivery, offers_pickup, delivery_radius_miles, pickup_address,
  delivery_windows, pickup_windows, payment_method, pickup_location, is_default
) VALUES (
  'b0010001-0001-0001-0001-000000000001',
  'a1111111-1111-1111-1111-111111111111',
  'Willow Glen Farm Stand', 'Fresh produce from our backyard garden in Willow Glen', 'harvest',
  true, true, 5, '1168 Lincoln Ave, San Jose, CA 95125',
  '[{"id":"8-10","start":"08:00","end":"10:00"},{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb,
  '[{"id":"9-11","start":"09:00","end":"11:00"}]'::jsonb,
  'automatic', ST_SetSRID(ST_MakePoint(-121.8977, 37.3084), 4326), true
) ON CONFLICT (owner_id) WHERE is_default = true DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description,
  offers_delivery = EXCLUDED.offers_delivery, offers_pickup = EXCLUDED.offers_pickup,
  delivery_radius_miles = EXCLUDED.delivery_radius_miles, pickup_address = EXCLUDED.pickup_address,
  delivery_windows = EXCLUDED.delivery_windows, pickup_windows = EXCLUDED.pickup_windows,
  pickup_location = EXCLUDED.pickup_location;


-- ============================================================
--  Helper Seed Data
--  Enables manual verification of:
--  - Helper management (passcode, join flow, helper orders view)
--
--  Test Accounts:
--  - seller@test  (a1111111...) — has 1 default booth
--  - buyer@test   (b2222222...) — buyer + helper for seller
--  - Maria Garcia (s1)          — helper for seller's booth
-- ============================================================

DO $helpers_seed$
DECLARE
  seller_id UUID := 'a1111111-1111-1111-1111-111111111111';
  buyer_id  UUID := 'b2222222-2222-2222-2222-222222222222';
  s1        UUID; -- Maria Garcia
  default_booth_id UUID;
BEGIN
  -- Lookup Maria's user ID
  SELECT id INTO s1 FROM profiles WHERE email = 'maria@test.local';

  -- ── 1. Set helper_passcode on seller's default booth ──
  UPDATE market_booths
  SET helper_passcode = 'HELP42'
  WHERE owner_id = seller_id AND is_default = true
  RETURNING id INTO default_booth_id;

  -- ── 2. Add booth_helpers ──
  -- buyer@test is a helper for seller's default booth (passcode HELP42)
  INSERT INTO booth_helpers (booth_id, helper_id, status)
  VALUES (default_booth_id, buyer_id, 'accepted')
  ON CONFLICT (booth_id, helper_id) DO UPDATE SET status = 'accepted';

  -- Maria is also a helper for seller's default booth
  IF s1 IS NOT NULL THEN
    INSERT INTO booth_helpers (booth_id, helper_id, status)
    VALUES (default_booth_id, s1, 'accepted')
    ON CONFLICT (booth_id, helper_id) DO UPDATE SET status = 'accepted';
  END IF;

  -- ── 3. Set helper_passcode on Maria's booth too (for testing join flow) ──
  IF s1 IS NOT NULL THEN
    UPDATE market_booths
    SET helper_passcode = 'MARIA1'
    WHERE owner_id = s1 AND is_default = true;
  END IF;

END $helpers_seed$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Pro Testers — implicit Pro subscription bypass (no Stripe required)
-- These accounts see all Pro features as if they had an active subscription.
-- Used for Facebook/Apple app review testing.
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO pro_testers (email, notes) VALUES
  ('alex@test.local', 'Test account — verifies implicit Pro via pro_testers (no Stripe sub)')
ON CONFLICT (email) DO NOTHING;

-- Make maria@test.local a Pro user (stable Pro user for facebook-autopost E2E tests)
UPDATE profiles SET is_pro = true WHERE id = '11111111-1111-1111-1111-111111111111';

-- Pro subscription record for Maria
INSERT INTO seller_subscriptions (
  user_id, plan, status, stripe_customer_id, stripe_subscription_id,
  current_period_start, current_period_end
) VALUES (
  '11111111-1111-1111-1111-111111111111', 'pro', 'active',
  'cus_test_maria_seller', 'sub_test_maria_seller',
  now() - interval '15 days', now() + interval '15 days'
) ON CONFLICT (user_id) DO UPDATE SET
  plan = 'pro', status = 'active',
  current_period_start = now() - interval '15 days',
  current_period_end = now() + interval '15 days';

-- Facebook connection for Maria
INSERT INTO seller_fb_connections (
  user_id, fb_access_token, fb_page_id, fb_page_name,
  fb_page_access_token, auto_sync_enabled, status
) VALUES (
  '11111111-1111-1111-1111-111111111111',
  'EAAtest_fake_token_for_maria',
  '987654321098765',
  'Willow Glen Farm Stand',
  'EAAtest_fake_page_token_for_maria',
  true, 'connected'
) ON CONFLICT (user_id) DO UPDATE SET
  status = 'connected', auto_sync_enabled = true,
  fb_page_name = 'Willow Glen Farm Stand';

