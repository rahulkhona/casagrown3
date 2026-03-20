-- ==========================================================================
-- Test: Listing Lifecycle — expires_at trigger, defaults, and filtering
-- Tests the expires_at column, auto-compute trigger, and refresh_product_data
-- ==========================================================================
BEGIN;
SELECT plan(8);

-- Create test user (needed for FK constraints)
INSERT INTO auth.users (id, email, aud, role, created_at, updated_at)
VALUES ('11111111-1111-1111-1111-111111111111', 'lifecycle-test@test.com', 'authenticated', 'authenticated', now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, full_name, state_code, email)
VALUES ('11111111-1111-1111-1111-111111111111', 'Lifecycle Test User', 'CA', 'lifecycle-test@test.com')
ON CONFLICT (id) DO NOTHING;

-- Ensure categories exist
INSERT INTO sales_categories (name, display_order)
VALUES ('produce', 1), ('eggs', 2), ('honey', 3), ('flowers', 4), ('garden_equipment', 5)
ON CONFLICT (name) DO NOTHING;

-- T1: Trigger auto-computes expires_at for perishable category (3 days)
INSERT INTO market_products (id, seller_id, name, price_usd, unit, inventory, is_active, market_date, category)
VALUES (
  'a0a01111-0001-4e00-a001-000000000001',
  '11111111-1111-1111-1111-111111111111',
  'LCTEST Perishable Carrots',
  3.00, 'bunch', 5, true, CURRENT_DATE + 7, 'produce'
);

SELECT ok(
  (SELECT expires_at FROM market_products WHERE id = 'a0a01111-0001-4e00-a001-000000000001') IS NOT NULL,
  'Trigger sets expires_at for perishable product'
);

-- T2: Perishable default is ~3 days
SELECT ok(
  (SELECT expires_at FROM market_products WHERE id = 'a0a01111-0001-4e00-a001-000000000001')
    <= now() + interval '3 days' + interval '5 minutes',
  'Perishable product expires_at is ~3 days from now'
);

-- T3: Non-perishable category gets 30 days
INSERT INTO market_products (id, seller_id, name, price_usd, unit, inventory, is_active, market_date, category)
VALUES (
  'b0b02222-0002-4e00-a002-000000000002',
  '11111111-1111-1111-1111-111111111111',
  'LCTEST Preserved Jam',
  8.00, 'jar', 10, true, CURRENT_DATE + 7, 'garden_equipment'
);

SELECT ok(
  (SELECT expires_at FROM market_products WHERE id = 'b0b02222-0002-4e00-a002-000000000002')
    > now() + interval '29 days',
  'Non-perishable product expires_at is ~30 days from now'
);

-- T4: Explicit expires_at is honored (not overwritten by trigger)
INSERT INTO market_products (id, seller_id, name, price_usd, unit, inventory, is_active, market_date, category, expires_at)
VALUES (
  'c0c03333-0003-4e00-a003-000000000003',
  '11111111-1111-1111-1111-111111111111',
  'LCTEST Custom Expiry Honey',
  12.00, 'jar', 3, true, CURRENT_DATE + 7, 'garden_equipment',
  now() + interval '14 days'
);

SELECT ok(
  (SELECT expires_at FROM market_products WHERE id = 'c0c03333-0003-4e00-a003-000000000003')
    < now() + interval '15 days',
  'Explicit expires_at not overwritten by trigger'
);

-- T5: Expired product (expires_at in past) is filtered by refresh_product_data
INSERT INTO market_products (id, seller_id, name, price_usd, unit, inventory, is_active, market_date, category, expires_at)
VALUES (
  'd0d04444-0004-4e00-a004-000000000004',
  '11111111-1111-1111-1111-111111111111',
  'LCTEST Expired Tomatoes',
  5.00, 'basket', 10, true, CURRENT_DATE + 7, 'produce',
  now() - interval '1 day'
);

SELECT ok(
  NOT (SELECT is_active FROM refresh_product_data(ARRAY['d0d04444-0004-4e00-a004-000000000004'::uuid])),
  'refresh_product_data returns is_active=false for expired product'
);

-- T6: Active product with future expires_at is kept active
SELECT ok(
  (SELECT is_active FROM refresh_product_data(ARRAY['a0a01111-0001-4e00-a001-000000000001'::uuid])),
  'refresh_product_data returns is_active=true for non-expired product'
);

-- T7: Product with NULL expires_at is treated as active (backward compat)
INSERT INTO market_products (id, seller_id, name, price_usd, unit, inventory, is_active, market_date, category)
VALUES (
  'e0e05555-0005-4e00-a005-000000000005',
  '11111111-1111-1111-1111-111111111111',
  'LCTEST No Expiry Product',
  2.00, 'each', 5, true, CURRENT_DATE + 7, 'garden_equipment'
);
UPDATE market_products SET expires_at = NULL WHERE id = 'e0e05555-0005-4e00-a005-000000000005';

SELECT ok(
  (SELECT is_active FROM refresh_product_data(ARRAY['e0e05555-0005-4e00-a005-000000000005'::uuid])),
  'NULL expires_at is treated as active (backward compatibility)'
);

-- T8: Flowers category is treated as perishable (3 days)
INSERT INTO market_products (id, seller_id, name, price_usd, unit, inventory, is_active, market_date, category)
VALUES (
  'f0f06666-0006-4e00-a006-000000000006',
  '11111111-1111-1111-1111-111111111111',
  'LCTEST Fresh Roses',
  15.00, 'bunch', 3, true, CURRENT_DATE + 7, 'flowers'
);

SELECT ok(
  (SELECT expires_at FROM market_products WHERE id = 'f0f06666-0006-4e00-a006-000000000006')
    <= now() + interval '3 days' + interval '1 minute',
  'Flowers category gets perishable default (3 days)'
);

SELECT * FROM finish();
ROLLBACK;
