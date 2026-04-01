-- pgTAP tests for buyer_product_notifications trigger
-- Tests the queue_buyer_product_notifications trigger on market_products

BEGIN;
SELECT plan(9);

-- ═══════════════════════════════════════════════
-- Setup: Create test users, products, and interests
-- ═══════════════════════════════════════════════

-- Seed auth.users first (FK requirement)
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('a0000000-0000-0000-0000-000000000010', 'seller_bpn@test.com', '{"full_name":"Seller BPN"}'),
  ('a0000000-0000-0000-0000-000000000011', 'buyer1_bpn@test.com', '{"full_name":"Buyer1 BPN"}'),
  ('a0000000-0000-0000-0000-000000000012', 'buyer2_bpn@test.com', '{"full_name":"Buyer2 BPN"}'),
  ('a0000000-0000-0000-0000-000000000013', 'faraway_bpn@test.com', '{"full_name":"FarAway BPN"}')
ON CONFLICT (id) DO NOTHING;

-- Create community for H3 zone
INSERT INTO communities (h3_index, name) VALUES
  ('882a100d23fffff', 'BPN Test Zone')
ON CONFLICT (h3_index) DO NOTHING;

-- Create profiles
INSERT INTO profiles (id, full_name, email, home_community_h3_index, nearby_community_h3_indices) VALUES
  ('a0000000-0000-0000-0000-000000000010', 'Seller BPN', 'seller_bpn@test.com', '882a100d23fffff', ARRAY['882a100d23fffff']::text[]),
  ('a0000000-0000-0000-0000-000000000011', 'Buyer1 BPN', 'buyer1_bpn@test.com', '882a100d23fffff', ARRAY['882a100d23fffff']::text[]),
  ('a0000000-0000-0000-0000-000000000012', 'Buyer2 BPN', 'buyer2_bpn@test.com', '882a100d23fffff', ARRAY['882a100d23fffff']::text[]),
  ('a0000000-0000-0000-0000-000000000013', 'FarAway BPN', 'faraway_bpn@test.com', '882a100d25fffff', ARRAY['882a100d25fffff']::text[])
ON CONFLICT (id) DO UPDATE SET
  home_community_h3_index = EXCLUDED.home_community_h3_index,
  nearby_community_h3_indices = EXCLUDED.nearby_community_h3_indices;

-- Buyer1 expressed interest in "eggs" during onboarding
INSERT INTO produce_interests (user_id, produce_name)
VALUES ('a0000000-0000-0000-0000-000000000011', 'eggs')
ON CONFLICT (user_id, produce_name) DO NOTHING;

-- Buyer2 expressed interest in "eggs" and "tomatoes"
INSERT INTO produce_interests (user_id, produce_name)
VALUES 
  ('a0000000-0000-0000-0000-000000000012', 'eggs'),
  ('a0000000-0000-0000-0000-000000000012', 'tomatoes')
ON CONFLICT (user_id, produce_name) DO NOTHING;

-- FarAway buyer also interested in eggs (different zone)
INSERT INTO produce_interests (user_id, produce_name)
VALUES ('a0000000-0000-0000-0000-000000000013', 'eggs')
ON CONFLICT (user_id, produce_name) DO NOTHING;

-- ═══════════════════════════════════════════════
-- Test 1: Table exists
-- ═══════════════════════════════════════════════
SELECT has_table('public', 'buyer_product_notifications', 'buyer_product_notifications table exists');

-- ═══════════════════════════════════════════════
-- Test 2: Has required columns
-- ═══════════════════════════════════════════════
SELECT has_column('public', 'buyer_product_notifications', 'buyer_id', 'has buyer_id column');
SELECT has_column('public', 'buyer_product_notifications', 'product_id', 'has product_id column');
SELECT has_column('public', 'buyer_product_notifications', 'match_source', 'has match_source column');
SELECT has_column('public', 'buyer_product_notifications', 'keyword', 'has keyword column');

-- ═══════════════════════════════════════════════
-- Test 5: Publishing a product triggers notifications for matching buyers in same zone
-- ═══════════════════════════════════════════════

-- Create a product as inactive first (draft)
INSERT INTO market_products (id, seller_id, name, description, price_usd, unit, category, market_date, is_active, is_draft)
VALUES (
  'b0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000010',
  'Fresh Farm Eggs',
  'Free range eggs from our chickens',
  6.00, 'dozen', 'eggs',
  CURRENT_DATE, false, true
);

-- Now publish it (activate) — this should trigger buyer notifications
UPDATE market_products
SET is_active = true, is_draft = false
WHERE id = 'b0000000-0000-0000-0000-000000000001';

-- Test 5: Buyer1 in same zone should get notified (interested in "eggs")
SELECT ok(
  EXISTS(
    SELECT 1 FROM buyer_product_notifications
    WHERE buyer_id = 'a0000000-0000-0000-0000-000000000011'
      AND product_id = 'b0000000-0000-0000-0000-000000000001'
      AND match_source = 'interest'
  ),
  'Buyer1 in same zone gets interest-based notification for eggs'
);

-- Test 6: Buyer2 in same zone should also get notified
SELECT ok(
  EXISTS(
    SELECT 1 FROM buyer_product_notifications
    WHERE buyer_id = 'a0000000-0000-0000-0000-000000000012'
      AND product_id = 'b0000000-0000-0000-0000-000000000001'
      AND match_source = 'interest'
  ),
  'Buyer2 in same zone gets notification for eggs'
);

-- Test 7: FarAway buyer should NOT get notified (different H3 zone)
SELECT ok(
  NOT EXISTS(
    SELECT 1 FROM buyer_product_notifications
    WHERE buyer_id = 'a0000000-0000-0000-0000-000000000013'
      AND product_id = 'b0000000-0000-0000-0000-000000000001'
  ),
  'FarAway buyer in different zone does NOT get notified'
);

-- Test 8: Seller does NOT get self-notification
SELECT ok(
  NOT EXISTS(
    SELECT 1 FROM buyer_product_notifications
    WHERE buyer_id = 'a0000000-0000-0000-0000-000000000010'
      AND product_id = 'b0000000-0000-0000-0000-000000000001'
  ),
  'Seller does not receive self-notification'
);

-- Cleanup
DELETE FROM buyer_product_notifications WHERE product_id = 'b0000000-0000-0000-0000-000000000001';
DELETE FROM market_products WHERE id = 'b0000000-0000-0000-0000-000000000001';
DELETE FROM produce_interests WHERE user_id IN (
  'a0000000-0000-0000-0000-000000000011',
  'a0000000-0000-0000-0000-000000000012',
  'a0000000-0000-0000-0000-000000000013'
);

SELECT * FROM finish();
ROLLBACK;
