BEGIN;
SELECT plan(13);

-- ═══════════════════════════════════════════════
-- Setup: Create test users, H3 zones, products, and produces
-- ═══════════════════════════════════════════════

-- Create H3 zones for communities
INSERT INTO communities (h3_index, name, city, state, country)
VALUES ('872834465ffffff', 'Grower Test Zone', 'Test City', 'CA', 'US')
ON CONFLICT (h3_index) DO NOTHING;

INSERT INTO communities (h3_index, name, city, state, country)
VALUES ('872830828ffffff', 'Distant Zone', 'Far City', 'TX', 'US')
ON CONFLICT (h3_index) DO NOTHING;

-- Create auth users first (profiles has FK to auth.users)
INSERT INTO auth.users (id, email, raw_user_meta_data, instance_id, aud, role, encrypted_password, confirmation_token, email_confirmed_at)
VALUES
  ('cccc0032-0001-0001-0001-000000000001', 'grower-alice@test.local', '{"full_name":"Grower Alice"}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', crypt('password', gen_salt('bf')), '', now()),
  ('cccc0032-0001-0001-0001-000000000002', 'grower-bob@test.local', '{"full_name":"Grower Bob"}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', crypt('password', gen_salt('bf')), '', now()),
  ('cccc0032-0001-0001-0001-000000000003', 'buyer-carol@test.local', '{"full_name":"Buyer Carol"}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', crypt('password', gen_salt('bf')), '', now()),
  ('cccc0032-0001-0001-0001-000000000004', 'distant-dave@test.local', '{"full_name":"Distant Dave"}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', crypt('password', gen_salt('bf')), '', now())
ON CONFLICT (id) DO NOTHING;

-- Create test users with H3 zones
INSERT INTO profiles (id, full_name, email, home_community_h3_index, nearby_community_h3_indices)
VALUES
  ('cccc0032-0001-0001-0001-000000000001', 'Grower Alice', 'grower-alice@test.local', '872834465ffffff', ARRAY['872834465ffffff']),
  ('cccc0032-0001-0001-0001-000000000002', 'Grower Bob', 'grower-bob@test.local', '872834465ffffff', ARRAY['872834465ffffff']),
  ('cccc0032-0001-0001-0001-000000000003', 'Buyer Carol', 'buyer-carol@test.local', '872834465ffffff', ARRAY['872834465ffffff']),
  ('cccc0032-0001-0001-0001-000000000004', 'Distant Dave', 'distant-dave@test.local', '872830828ffffff', ARRAY['872830828ffffff'])
ON CONFLICT (id) DO UPDATE SET
  home_community_h3_index = EXCLUDED.home_community_h3_index,
  nearby_community_h3_indices = EXCLUDED.nearby_community_h3_indices;

-- Alice grows tomatoes and basil (garden info)
INSERT INTO grower_produces (user_id, produce_name, category, notify_on_search)
VALUES
  ('cccc0032-0001-0001-0001-000000000001', 'Tomatoes', 'vegetables', true),
  ('cccc0032-0001-0001-0001-000000000001', 'Basil', 'herbs', true)
ON CONFLICT (user_id, produce_name) DO NOTHING;

-- Bob grows peppers but opted out of notifications
INSERT INTO grower_produces (user_id, produce_name, category, notify_on_search)
VALUES ('cccc0032-0001-0001-0001-000000000002', 'Peppers', 'vegetables', false)
ON CONFLICT (user_id, produce_name) DO NOTHING;

-- Dave grows tomatoes in a DIFFERENT zone
INSERT INTO grower_produces (user_id, produce_name, category, notify_on_search)
VALUES ('cccc0032-0001-0001-0001-000000000004', 'Tomatoes', 'vegetables', true)
ON CONFLICT (user_id, produce_name) DO NOTHING;

-- Bob has an OLD product listing for "Hot Peppers" (inactive)
INSERT INTO market_products (id, seller_id, market_date, name, description, category, price_usd, unit, inventory, is_active, is_draft)
VALUES (
  'cccc0032-0003-0001-0001-000000000001',
  'cccc0032-0001-0001-0001-000000000002',
  '2025-12-01',
  'Hot Peppers', 'Fresh hot peppers from garden', 'produce', 3.99, 'lb', 0, false, false
) ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════
-- Test 1: Garden match — keyword "tomatoes" should match Alice
-- ═══════════════════════════════════════════════
SELECT lives_ok(
  $$ SELECT queue_grower_search_match('tomatoes', '872834465ffffff', 'cccc0032-0001-0001-0001-000000000003') $$,
  'queue_grower_search_match runs without error'
);

SELECT is(
  (SELECT count(*)::int FROM grower_search_notifications
   WHERE grower_id = 'cccc0032-0001-0001-0001-000000000001'
     AND keyword = 'tomatoes'
     AND match_source = 'garden'),
  1,
  'Alice gets garden match notification for tomatoes'
);

-- ═══════════════════════════════════════════════
-- Test 2: Past listing match — keyword "peppers" should match Bob's old listing
-- ═══════════════════════════════════════════════
SELECT lives_ok(
  $$ SELECT queue_grower_search_match('peppers', '872834465ffffff', 'cccc0032-0001-0001-0001-000000000003') $$,
  'queue_grower_search_match for peppers runs'
);

-- Bob opted out of grower_produces notification, but should still get past_listing match
SELECT is(
  (SELECT count(*)::int FROM grower_search_notifications
   WHERE grower_id = 'cccc0032-0001-0001-0001-000000000002'
     AND keyword = 'peppers'
     AND match_source = 'past_listing'
     AND past_product_id = 'cccc0032-0003-0001-0001-000000000001'),
  1,
  'Bob gets past_listing match with product ID for peppers'
);

-- ═══════════════════════════════════════════════
-- Test 3: H3 zone scoping — Dave in different zone should NOT match
-- ═══════════════════════════════════════════════
SELECT is(
  (SELECT count(*)::int FROM grower_search_notifications
   WHERE grower_id = 'cccc0032-0001-0001-0001-000000000004'),
  0,
  'Dave in different H3 zone does NOT get notification'
);

-- ═══════════════════════════════════════════════
-- Test 4: 24-hour dedup — searching again shouldn't create duplicates
-- ═══════════════════════════════════════════════
SELECT lives_ok(
  $$ SELECT queue_grower_search_match('tomatoes', '872834465ffffff', 'cccc0032-0001-0001-0001-000000000003') $$,
  'Second search for tomatoes runs'
);

SELECT is(
  (SELECT count(*)::int FROM grower_search_notifications
   WHERE grower_id = 'cccc0032-0001-0001-0001-000000000001'
     AND keyword = 'tomatoes'),
  1,
  '24h dedup: only 1 notification for tomatoes (not 2)'
);

-- ═══════════════════════════════════════════════
-- Test 5: Active product — Alice has active tomato listing, she should NOT be notified
-- ═══════════════════════════════════════════════

-- First, clear existing notifications
DELETE FROM grower_search_notifications WHERE keyword = 'tomatoes';

-- Add an ACTIVE tomato product for Alice
INSERT INTO market_products (id, seller_id, market_date, name, category, price_usd, unit, inventory, is_active, is_draft)
VALUES (
  'cccc0032-0003-0001-0001-000000000002',
  'cccc0032-0001-0001-0001-000000000001',
  CURRENT_DATE,
  'Fresh Tomatoes', 'produce', 4.99, 'lb', 10, true, false
) ON CONFLICT (id) DO NOTHING;

SELECT lives_ok(
  $$ SELECT queue_grower_search_match('tomatoes', '872834465ffffff', 'cccc0032-0001-0001-0001-000000000003') $$,
  'Search for tomatoes after Alice has active listing'
);

SELECT is(
  (SELECT count(*)::int FROM grower_search_notifications
   WHERE grower_id = 'cccc0032-0001-0001-0001-000000000001'
     AND keyword = 'tomatoes'),
  0,
  'Alice with active tomato listing does NOT get notification'
);

-- ═══════════════════════════════════════════════
-- Test 6: Searcher should not match themselves
-- ═══════════════════════════════════════════════
SELECT lives_ok(
  $$ SELECT queue_grower_search_match('basil', '872834465ffffff', 'cccc0032-0001-0001-0001-000000000001') $$,
  'Alice searching for her own produce runs'
);

SELECT is(
  (SELECT count(*)::int FROM grower_search_notifications
   WHERE grower_id = 'cccc0032-0001-0001-0001-000000000001'
     AND keyword = 'basil'),
  0,
  'Alice does NOT get notified about her own produce search'
);

-- ═══════════════════════════════════════════════
-- Test 7: match_source column exists and has correct values
-- ═══════════════════════════════════════════════
SELECT has_column(
  'public', 'grower_search_notifications', 'match_source',
  'grower_search_notifications has match_source column'
);

SELECT has_column(
  'public', 'grower_search_notifications', 'past_product_id',
  'grower_search_notifications has past_product_id column'
);

-- Cleanup
DELETE FROM grower_search_notifications WHERE grower_id IN (
  'cccc0032-0001-0001-0001-000000000001',
  'cccc0032-0001-0001-0001-000000000002',
  'cccc0032-0001-0001-0001-000000000004'
);
DELETE FROM market_products WHERE id IN ('cccc0032-0003-0001-0001-000000000001', 'cccc0032-0003-0001-0001-000000000002');
DELETE FROM grower_produces WHERE user_id IN (
  'cccc0032-0001-0001-0001-000000000001',
  'cccc0032-0001-0001-0001-000000000002',
  'cccc0032-0001-0001-0001-000000000004'
);

SELECT * FROM finish();
ROLLBACK;
