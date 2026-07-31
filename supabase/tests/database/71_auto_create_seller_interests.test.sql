-- ============================================================================
-- pgTAP Tests: Auto Create Seller Produce Interests on Listing Draft / Publish
-- Verifies that creating or updating a product listing (draft or published)
-- automatically populates produce_interests and crm_produce_interests.
-- ============================================================================
BEGIN;
SELECT plan(8);

-- 1. Verify function and trigger exist
SELECT has_function('public', 'auto_create_seller_produce_interest', 'auto_create_seller_produce_interest function exists');
SELECT has_trigger('public', 'market_products', 'trg_auto_create_seller_produce_interest', 'trg_auto_create_seller_produce_interest trigger exists');

-- 2. Setup test seller profile & booth
INSERT INTO auth.users (id, email, instance_id, aud, role, encrypted_password, confirmation_token, email_confirmed_at)
VALUES
  ('b0000001-0001-0001-0001-000000000001', 'seller-test-autointerest@casagrown.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', crypt('password', gen_salt('bf')), '', now())
ON CONFLICT DO NOTHING;

INSERT INTO profiles (id, full_name, email, last_active_at)
VALUES
  ('b0000001-0001-0001-0001-000000000001', 'Test Auto Interest Seller', 'seller-test-autointerest@casagrown.com', now())
ON CONFLICT DO NOTHING;

INSERT INTO market_booths (id, owner_id, name)
VALUES
  ('b0000001-0001-0001-0001-000000000002', 'b0000001-0001-0001-0001-000000000001', 'Test Auto Interest Stand')
ON CONFLICT DO NOTHING;

-- 3. Insert product listing AS DRAFT (is_draft = true)
INSERT INTO market_products (id, seller_id, booth_id, name, price_usd, is_active, is_draft, category, market_date)
VALUES (
  'b0000001-0001-0001-0001-000000000003',
  'b0000001-0001-0001-0001-000000000001',
  'b0000001-0001-0001-0001-000000000002',
  'Organic Heirloom Tomatoes',
  4.99,
  true,
  true, -- Draft
  'produce',
  now()::date
);

-- Assert produce_interests contains "Organic Heirloom Tomatoes"
SELECT results_eq(
  $$SELECT produce_name FROM produce_interests WHERE user_id = 'b0000001-0001-0001-0001-000000000001'$$,
  ARRAY['Organic Heirloom Tomatoes'],
  'Saving listing as draft automatically creates produce_interests record'
);

-- Assert crm_produce_interests contains "Organic Heirloom Tomatoes" with interest_type = sell
SELECT results_eq(
  $$SELECT produce_name FROM crm_produce_interests WHERE user_id = 'b0000001-0001-0001-0001-000000000001' AND interest_type = 'sell'$$,
  ARRAY['Organic Heirloom Tomatoes'],
  'Saving listing as draft automatically creates crm_produce_interests sell record'
);

-- 4. Insert published product listing (is_draft = false)
INSERT INTO market_products (id, seller_id, booth_id, name, price_usd, is_active, is_draft, category, market_date)
VALUES (
  'b0000001-0001-0001-0001-000000000004',
  'b0000001-0001-0001-0001-000000000001',
  'b0000001-0001-0001-0001-000000000002',
  'Fresh Hass Avocados',
  3.50,
  true,
  false, -- Published
  'produce',
  now()::date
);

-- Assert produce_interests now has both produce items
SELECT is(
  (SELECT COUNT(*) FROM produce_interests WHERE user_id = 'b0000001-0001-0001-0001-000000000001')::integer,
  2,
  'Publishing listing automatically creates second produce_interests record'
);

-- Assert crm_produce_interests now has both sell interests
SELECT is(
  (SELECT COUNT(*) FROM crm_produce_interests WHERE user_id = 'b0000001-0001-0001-0001-000000000001' AND interest_type = 'sell')::integer,
  2,
  'Publishing listing automatically creates second crm_produce_interests sell record'
);

-- 5. Update existing draft product (updating price/description) - should NOT duplicate interests
UPDATE market_products
SET price_usd = 5.99
WHERE id = 'b0000001-0001-0001-0001-000000000003';

SELECT is(
  (SELECT COUNT(*) FROM produce_interests WHERE user_id = 'b0000001-0001-0001-0001-000000000001')::integer,
  2,
  'Updating existing product listing does not duplicate produce_interests records'
);

SELECT is(
  (SELECT COUNT(*) FROM crm_produce_interests WHERE user_id = 'b0000001-0001-0001-0001-000000000001' AND interest_type = 'sell')::integer,
  2,
  'Updating existing product listing does not duplicate crm_produce_interests records'
);

SELECT * FROM finish();
ROLLBACK;
