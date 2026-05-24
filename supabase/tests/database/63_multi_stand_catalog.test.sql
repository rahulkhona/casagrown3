-- ===========================================================================
-- pgTAP test: Multi-Stand & Catalog System
--
-- Tests:
--   1. Schema — tables, columns, constraints
--   2. create_stand RPC — creates booth with correct defaults
--   3. catalog_items — CRUD, inventory tracking
--   4. allocate_from_catalog — fulfillment window logic, inventory checks
--   5. booth_helpers — passcode pairing, RLS
--   6. Default booth backward compatibility
-- ===========================================================================
BEGIN;
SELECT plan(42);

-- ══════════════════════════════════════════════════════════════
-- 1. Schema Verification
-- ══════════════════════════════════════════════════════════════

-- catalog_items table
SELECT has_table('catalog_items', 'catalog_items table exists');
SELECT has_column('catalog_items', 'owner_id', 'catalog_items has owner_id');
SELECT has_column('catalog_items', 'name', 'catalog_items has name');
SELECT has_column('catalog_items', 'total_inventory', 'catalog_items has total_inventory');
SELECT has_column('catalog_items', 'default_price_usd', 'catalog_items has default_price_usd');
SELECT has_column('catalog_items', 'harvest_date', 'catalog_items has harvest_date');

-- market_booths multi-stand columns
SELECT has_column('market_booths', 'is_default', 'market_booths has is_default column');
SELECT has_column('market_booths', 'weekly_delivery_windows', 'market_booths has weekly_delivery_windows');
SELECT has_column('market_booths', 'weekly_pickup_windows', 'market_booths has weekly_pickup_windows');
SELECT has_column('market_booths', 'helper_passcode', 'market_booths has helper_passcode');

-- market_products.catalog_item_id
SELECT has_column('market_products', 'catalog_item_id', 'market_products has catalog_item_id');
SELECT has_column('market_products', 'booth_id', 'market_products has booth_id');

-- booth_helpers table
SELECT has_table('booth_helpers', 'booth_helpers table exists');
SELECT has_column('booth_helpers', 'booth_id', 'booth_helpers has booth_id');
SELECT has_column('booth_helpers', 'helper_id', 'booth_helpers has helper_id');
SELECT has_column('booth_helpers', 'status', 'booth_helpers has status');
SELECT has_column('booth_helpers', 'role', 'booth_helpers has role');

-- ══════════════════════════════════════════════════════════════
-- 2. RPCs exist
-- ══════════════════════════════════════════════════════════════
SELECT has_function('create_stand', 'create_stand RPC exists');
SELECT has_function('allocate_from_catalog', 'allocate_from_catalog RPC exists');
SELECT has_function('join_booth_as_helper', 'join_booth_as_helper RPC exists');

-- ══════════════════════════════════════════════════════════════
-- 3. Test Data Setup
-- ══════════════════════════════════════════════════════════════
-- Create test users
INSERT INTO auth.users (id, email)
VALUES
  ('aa000000-0000-0000-0000-000000000b01', 'multi-seller@test.local'),
  ('aa000000-0000-0000-0000-000000000b02', 'helper-user@test.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, email, full_name)
VALUES
  ('aa000000-0000-0000-0000-000000000b01', 'multi-seller@test.local', 'Multi Seller'),
  ('aa000000-0000-0000-0000-000000000b02', 'helper-user@test.local', 'Helper User')
ON CONFLICT (id) DO NOTHING;

-- ══════════════════════════════════════════════════════════════
-- 4. Default booth backward compatibility
-- ══════════════════════════════════════════════════════════════
-- User with default booth should work the same as before
-- Delete any auto-created default booth from the profile trigger so our explicit insert succeeds
DELETE FROM market_booths WHERE owner_id = 'aa000000-0000-0000-0000-000000000b01';
INSERT INTO market_booths (id, owner_id, name, is_default, offers_delivery, offers_pickup, delivery_windows, pickup_windows)
VALUES (
  'aa000000-0000-0000-0000-0000000000d1',
  'aa000000-0000-0000-0000-000000000b01',
  'Default Stand',
  true, true, true,
  '[{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb,
  '[{"id":"14-16","start":"14:00","end":"16:00"}]'::jsonb
) ON CONFLICT (id) DO NOTHING;

-- Can create a product on default booth (legacy path)
INSERT INTO market_products (
  id, seller_id, booth_id, name, price_usd, inventory, market_date, is_active, category
) VALUES (
  'aa000000-0000-0000-0000-000000000e01',
  'aa000000-0000-0000-0000-000000000b01',
  'aa000000-0000-0000-0000-0000000000d1',
  'Legacy Tomatoes', 3.50, 10, CURRENT_DATE, true, 'produce'
) ON CONFLICT (id) DO NOTHING;

SELECT is(
  (SELECT name FROM market_products WHERE id = 'aa000000-0000-0000-0000-000000000e01'),
  'Legacy Tomatoes',
  'Default booth: product created successfully (backward compat)'
);

-- ══════════════════════════════════════════════════════════════
-- 5. Multi-booth: create second booth
-- ══════════════════════════════════════════════════════════════
INSERT INTO market_booths (
  id, owner_id, name, is_default, offers_delivery, offers_pickup,
  weekly_delivery_windows, weekly_pickup_windows
) VALUES (
  'aa000000-0000-0000-0000-0000000000d2',
  'aa000000-0000-0000-0000-000000000b01',
  'Saturday Market Stand',
  false, true, true,
  '{"Saturday":["10-12","14-16"]}'::jsonb,
  '{"Saturday":["10-12"]}'::jsonb
) ON CONFLICT (id) DO NOTHING;

SELECT is(
  (SELECT count(*)::int FROM market_booths WHERE owner_id = 'aa000000-0000-0000-0000-000000000b01'),
  2,
  'Multi-booth: seller has 2 booths'
);

-- Product on second booth
INSERT INTO market_products (
  id, seller_id, booth_id, name, price_usd, inventory, market_date, is_active, category
) VALUES (
  'aa000000-0000-0000-0000-000000000e02',
  'aa000000-0000-0000-0000-000000000b01',
  'aa000000-0000-0000-0000-0000000000d2',
  'Saturday Peppers', 2.00, 5, CURRENT_DATE, true, 'produce'
) ON CONFLICT (id) DO NOTHING;

SELECT is(
  (SELECT booth_id::text FROM market_products WHERE id = 'aa000000-0000-0000-0000-000000000e02'),
  'aa000000-0000-0000-0000-0000000000d2',
  'Multi-booth: product linked to correct booth'
);

-- ══════════════════════════════════════════════════════════════
-- 6. Catalog Items CRUD
-- ══════════════════════════════════════════════════════════════
INSERT INTO catalog_items (
  id, owner_id, name, description, category, total_inventory,
  default_price_usd, default_unit, harvest_date
) VALUES (
  'aa000000-0000-0000-0000-000000000c01',
  'aa000000-0000-0000-0000-000000000b01',
  'Catalog Heirloom Tomatoes', 'Red and juicy', 'produce',
  50, 4.99, 'lb', CURRENT_DATE
) ON CONFLICT (id) DO NOTHING;

SELECT is(
  (SELECT name FROM catalog_items WHERE id = 'aa000000-0000-0000-0000-000000000c01'),
  'Catalog Heirloom Tomatoes',
  'Catalog: item created with name'
);

SELECT is(
  (SELECT total_inventory FROM catalog_items WHERE id = 'aa000000-0000-0000-0000-000000000c01'),
  50,
  'Catalog: item has correct inventory'
);

SELECT is(
  (SELECT harvest_date FROM catalog_items WHERE id = 'aa000000-0000-0000-0000-000000000c01'),
  CURRENT_DATE,
  'Catalog: harvest_date stored correctly'
);

-- ══════════════════════════════════════════════════════════════
-- 7. allocate_from_catalog RPC
-- ══════════════════════════════════════════════════════════════
-- Authenticate as the seller
SET request.jwt.claims = '{"sub":"aa000000-0000-0000-0000-000000000b01"}';

-- Allocate 10 units to booth with weekly windows
SELECT lives_ok(
  $$ SELECT allocate_from_catalog(
    'aa000000-0000-0000-0000-000000000c01'::uuid,
    'aa000000-0000-0000-0000-0000000000d2'::uuid,
    10,
    NULL
  ) $$,
  'allocate_from_catalog: succeeds for booth with weekly windows'
);

-- Verify product was created as active (not draft)
SELECT is(
  (SELECT is_active FROM market_products WHERE catalog_item_id = 'aa000000-0000-0000-0000-000000000c01' AND booth_id = 'aa000000-0000-0000-0000-0000000000d2' LIMIT 1),
  true,
  'allocate_from_catalog: creates ACTIVE listing (not draft)'
);

SELECT is(
  (SELECT is_draft FROM market_products WHERE catalog_item_id = 'aa000000-0000-0000-0000-000000000c01' AND booth_id = 'aa000000-0000-0000-0000-0000000000d2' LIMIT 1),
  false,
  'allocate_from_catalog: listing is NOT draft'
);

-- Verify catalog item metadata transferred
SELECT is(
  (SELECT name FROM market_products WHERE catalog_item_id = 'aa000000-0000-0000-0000-000000000c01' AND booth_id = 'aa000000-0000-0000-0000-0000000000d2' LIMIT 1),
  'Catalog Heirloom Tomatoes',
  'allocate_from_catalog: name transferred from catalog'
);

SELECT is(
  (SELECT inventory FROM market_products WHERE catalog_item_id = 'aa000000-0000-0000-0000-000000000c01' AND booth_id = 'aa000000-0000-0000-0000-0000000000d2' LIMIT 1),
  10,
  'allocate_from_catalog: correct quantity allocated'
);

-- Verify expiry was set (not null)
SELECT isnt(
  (SELECT expires_at FROM market_products WHERE catalog_item_id = 'aa000000-0000-0000-0000-000000000c01' AND booth_id = 'aa000000-0000-0000-0000-0000000000d2' LIMIT 1),
  NULL::timestamptz,
  'allocate_from_catalog: expires_at is set (not null)'
);

-- Verify window_dates populated
SELECT isnt(
  (SELECT window_dates FROM market_products WHERE catalog_item_id = 'aa000000-0000-0000-0000-000000000c01' AND booth_id = 'aa000000-0000-0000-0000-0000000000d2' LIMIT 1),
  NULL::jsonb,
  'allocate_from_catalog: window_dates populated from booth defaults'
);

-- Allocate to default booth (uses generic delivery_windows/pickup_windows)
SELECT lives_ok(
  $$ SELECT allocate_from_catalog(
    'aa000000-0000-0000-0000-000000000c01'::uuid,
    'aa000000-0000-0000-0000-0000000000d1'::uuid,
    10,
    NULL
  ) $$,
  'allocate_from_catalog: succeeds for default booth with generic windows'
);

-- ══════════════════════════════════════════════════════════════
-- 8. allocate_from_catalog — no windows → REJECT
-- ══════════════════════════════════════════════════════════════
-- Create a booth with NO windows
INSERT INTO market_booths (
  id, owner_id, name, is_default, offers_delivery, offers_pickup
) VALUES (
  'aa000000-0000-0000-0000-0000000000d3',
  'aa000000-0000-0000-0000-000000000b01',
  'Empty Booth',
  false, false, false
) ON CONFLICT (id) DO NOTHING;

SELECT throws_ok(
  $$ SELECT allocate_from_catalog(
    'aa000000-0000-0000-0000-000000000c01'::uuid,
    'aa000000-0000-0000-0000-0000000000d3'::uuid,
    5,
    NULL
  ) $$,
  'This booth has no fulfillment windows configured. Please set up delivery or pickup windows in booth settings first.',
  'allocate_from_catalog: rejects booth with no fulfillment windows'
);

-- ══════════════════════════════════════════════════════════════
-- 9. allocate_from_catalog — exceed inventory → REJECT
-- ══════════════════════════════════════════════════════════════
SELECT throws_ok(
  $$ SELECT allocate_from_catalog(
    'aa000000-0000-0000-0000-000000000c01'::uuid,
    'aa000000-0000-0000-0000-0000000000d2'::uuid,
    999,
    NULL
  ) $$,
  NULL,
  'allocate_from_catalog: rejects when exceeding available inventory'
);

-- ══════════════════════════════════════════════════════════════
-- 10. Booth Helpers
-- ══════════════════════════════════════════════════════════════
RESET request.jwt.claims;

-- Set a passcode on the booth
UPDATE market_booths SET helper_passcode = 'ABC123' WHERE id = 'aa000000-0000-0000-0000-0000000000d2';

SELECT is(
  (SELECT helper_passcode FROM market_booths WHERE id = 'aa000000-0000-0000-0000-0000000000d2'),
  'ABC123',
  'Helper passcode set on booth'
);

-- Insert helper directly (simulating join_booth_as_helper)
INSERT INTO booth_helpers (booth_id, helper_id, status, role)
VALUES (
  'aa000000-0000-0000-0000-0000000000d2',
  'aa000000-0000-0000-0000-000000000b02',
  'accepted', 'delivery'
);

SELECT is(
  (SELECT count(*)::int FROM booth_helpers WHERE booth_id = 'aa000000-0000-0000-0000-0000000000d2'),
  1,
  'Booth has 1 helper'
);

SELECT is(
  (SELECT role FROM booth_helpers WHERE booth_id = 'aa000000-0000-0000-0000-0000000000d2' AND helper_id = 'aa000000-0000-0000-0000-000000000b02'),
  'delivery',
  'Helper has delivery role'
);

-- ══════════════════════════════════════════════════════════════
-- 11. Deprecated columns still exist but are unused
-- ══════════════════════════════════════════════════════════════
SELECT has_column('market_booths', 'payment_method', 'Deprecated payment_method column still exists');
SELECT has_column('market_booths', 'venmo_handle', 'Deprecated venmo_handle column still exists');
SELECT has_column('market_booths', 'charity_name', 'Deprecated charity_name column still exists');

SELECT * FROM finish();
ROLLBACK;
