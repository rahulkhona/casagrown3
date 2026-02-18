-- Seed Data for E2E Testing and Local Development
-- Deterministic IDs used for reliability

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

-- 6. Incentive Rules
-- (Authentication/Signup rule is already handled by migration, adding others for manual testing)
insert into public.incentive_rules (action_type, scope, points, start_date)
values 
  ('join_a_community', 'global', 100, now()),
  ('make_first_post', 'global', 25, now()),
  ('invitee_signing_up', 'global', 50, now()),
  ('invitee_making_first_transaction', 'global', 100, now());

-- 7. Sales Category Restrictions (Allow common items globally for development)
insert into public.sales_category_restrictions (category, scope, is_allowed, country_iso_3)
values 
  ('vegetables', 'global', true, 'USA'),
  ('fruits', 'global', true, 'USA');

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

-- 9. Platform Config
INSERT INTO public.platform_config (key, value, description)
VALUES ('platform_fee_percent', '10', 'Platform fee percentage charged on completed sales')
ON CONFLICT (key) DO NOTHING;

-- =============================================================================
-- 10. Test Users (for E2E / Playwright / Maestro)
-- =============================================================================
-- Deterministic UUIDs for reliable test references
-- Passwords are hashed with bcrypt ('TestPassword123!')

-- Test Seller
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
  crypt('TestPassword123!', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Test Seller"}',
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

-- Test Buyer
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
  crypt('TestPassword123!', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Test Buyer"}',
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

-- =============================================================================
-- 11. Test Profiles
-- =============================================================================

INSERT INTO public.profiles (id, email, full_name, home_community_h3_index, referral_code)
VALUES
  ('a1111111-1111-1111-1111-111111111111', 'seller@test.local', 'Test Seller', '89283470c2fffff', 'SELLER01'),
  ('b2222222-2222-2222-2222-222222222222', 'buyer@test.local',  'Test Buyer',  '89283470c2fffff', 'BUYER01')
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  home_community_h3_index = EXCLUDED.home_community_h3_index,
  referral_code = EXCLUDED.referral_code;

-- Seed points for both users (enough for test transactions)
INSERT INTO public.point_ledger (user_id, type, amount, balance_after, metadata)
VALUES
  ('a1111111-1111-1111-1111-111111111111', 'reward', 500, 500, '{"reason":"E2E test seed"}'),
  ('b2222222-2222-2222-2222-222222222222', 'reward', 500, 500, '{"reason":"E2E test seed"}');

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

INSERT INTO public.want_to_sell_details (post_id, category, produce_name, unit, total_quantity_available, points_per_unit)
VALUES ('c3333333-3333-3333-3333-333333333333', 'vegetables', 'Tomatoes', 'box', 10, 25);

INSERT INTO public.delivery_dates (post_id, delivery_date)
VALUES
  ('c3333333-3333-3333-3333-333333333333', CURRENT_DATE + interval '3 days'),
  ('c3333333-3333-3333-3333-333333333333', CURRENT_DATE + interval '7 days');

-- Sell Post 2: Strawberries
INSERT INTO public.posts (id, author_id, community_h3_index, type, reach, content)
VALUES (
  'd4444444-4444-4444-4444-444444444444',
  'a1111111-1111-1111-1111-111111111111',
  '89283470c2fffff',
  'want_to_sell', 'community',
  '{"produceName":"Strawberries","description":"Sweet seasonal strawberries, picked fresh"}'
);

INSERT INTO public.want_to_sell_details (post_id, category, produce_name, unit, total_quantity_available, points_per_unit)
VALUES ('d4444444-4444-4444-4444-444444444444', 'fruits', 'Strawberries', 'box', 5, 40);

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
VALUES ('e5555555-5555-5555-5555-555555555555', 'herbs', ARRAY['Basil', 'Thai Basil'], 3, 'bag', CURRENT_DATE + interval '14 days');

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

INSERT INTO public.want_to_sell_details (post_id, category, produce_name, unit, total_quantity_available, points_per_unit)
VALUES ('a7777777-7777-7777-7777-777777777777', 'vegetables', 'Peppers', 'bag', 8, 15);

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
  'vegetables', 'Peppers',
  3, 15, CURRENT_DATE + interval '2 days',
  'b8888888-8888-8888-8888-888888888888',
  'pending', 1
);

-- Escrow: debit buyer (seller account) 45 points for the order
INSERT INTO public.point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
VALUES (
  'a1111111-1111-1111-1111-111111111111',
  'escrow', -45, 455,
  'd0000000-0000-0000-0000-000000000001',
  '{"reason":"Order escrow for Peppers","order_id":"d0000000-0000-0000-0000-000000000001"}'
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

INSERT INTO public.want_to_sell_details (post_id, category, produce_name, unit, total_quantity_available, points_per_unit)
VALUES
  ('f0000002-0000-0000-0000-000000000002', 'vegetables', 'Tomatoes', 'box', 10, 25),
  ('f0000003-0000-0000-0000-000000000003', 'fruits', 'Strawberries', 'box', 5, 50),
  ('f0000004-0000-0000-0000-000000000004', 'herbs', 'Basil', 'bag', 10, 8),
  ('f0000005-0000-0000-0000-000000000005', 'fruits', 'Lemons', 'bag', 8, 20),
  ('f0000006-0000-0000-0000-000000000006', 'herbs', 'Herbs Mix', 'bag', 6, 12);

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
  'vegetables', 'Tomatoes',
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
  'fruits', 'Strawberries',
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
  'herbs', 'Basil',
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
  'fruits', 'Lemons',
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
  'herbs', 'Herbs Mix',
  3, 12, CURRENT_DATE + interval '5 days',
  'b8888888-8888-8888-8888-888888888806',
  'cancelled', 2
) ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 15. Delivery Proof Storage Bucket
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

