-- ==========================================================================
-- Test: Product Expiration in nearby_booths
-- Uses existing seed data users/booths, only inserts test products
-- ==========================================================================
BEGIN;
SELECT plan(6);

-- Ensure products_never_expire is false and all testing booths are open
UPDATE market_settings SET products_never_expire = false WHERE id = true;
UPDATE market_booths SET is_open = true;

-- Active product with future market_date (seller: 22222222-2222-2222-2222-222222222222)
INSERT INTO market_products (id, seller_id, name, price_usd, unit, inventory, is_active, market_date, category, expires_at)
VALUES (
  'f0f01111-0001-4e00-f001-000000000001',
  '22222222-2222-2222-2222-222222222222',
  'EXPTEST Fresh Tomatoes',
  5.00, 'basket', 10, true, CURRENT_DATE + 1, 'produce', now() + interval '5 days'
);

-- Expired product (market_date in the past)
INSERT INTO market_products (id, seller_id, name, price_usd, unit, inventory, is_active, market_date, category, expires_at)
VALUES (
  'f0f02222-0002-4e00-f002-000000000002',
  '22222222-2222-2222-2222-222222222222',
  'EXPTEST Old Lettuce',
  3.00, 'head', 5, true, CURRENT_DATE - 7, 'produce', now() - interval '2 days'
);

-- T1: Active product appears in nearby_booths
SELECT ok(
  EXISTS(
    SELECT 1 FROM nearby_booths(37.33::float8, -121.89::float8, 50.0::float8, null::text, null::text, null::numeric, null::numeric, null::text, null::text)
    WHERE matched_products::text ILIKE '%EXPTEST Fresh Tomatoes%'
  ),
  'Active future-dated product appears in nearby_booths'
);

-- T2: Expired product does NOT appear
SELECT ok(
  NOT EXISTS(
    SELECT 1 FROM nearby_booths(37.33::float8, -121.89::float8, 50.0::float8, null::text, null::text, null::numeric, null::numeric, null::text, null::text)
    WHERE matched_products::text ILIKE '%EXPTEST Old Lettuce%'
  ),
  'Expired product is filtered from nearby_booths'
);

-- T3: refresh_product_data marks expired product as inactive
SELECT ok(
  NOT (SELECT is_active FROM refresh_product_data(ARRAY['f0f02222-0002-4e00-f002-000000000002'::uuid])),
  'refresh_product_data returns is_active=false for expired product'
);

-- T4: refresh_product_data keeps active product active
SELECT ok(
  (SELECT is_active FROM refresh_product_data(ARRAY['f0f01111-0001-4e00-f001-000000000001'::uuid])),
  'refresh_product_data returns is_active=true for future-dated product'
);

-- T5: Re-list expired product
UPDATE market_products SET market_date = CURRENT_DATE + 1, expires_at = now() + interval '5 days', is_deleted = false WHERE id = 'f0f02222-0002-4e00-f002-000000000002';
SELECT ok(
  EXISTS(
    SELECT 1 FROM nearby_booths(37.33::float8, -121.89::float8, 50.0::float8, null::text, null::text, null::numeric, null::numeric, null::text, null::text)
    WHERE matched_products::text ILIKE '%EXPTEST Old Lettuce%'
  ),
  'Re-listed product appears in nearby_booths'
);

-- T6: products_never_expire override
UPDATE market_products SET market_date = CURRENT_DATE - 7, expires_at = now() - interval '2 days' WHERE id = 'f0f02222-0002-4e00-f002-000000000002';
UPDATE market_settings SET products_never_expire = true WHERE id = true;
SELECT ok(
  EXISTS(
    SELECT 1 FROM nearby_booths(37.33::float8, -121.89::float8, 50.0::float8, null::text, null::text, null::numeric, null::numeric, null::text, null::text)
    WHERE matched_products::text ILIKE '%EXPTEST Old Lettuce%'
  ),
  'products_never_expire=true shows expired products'
);

-- Cleanup
UPDATE market_settings SET products_never_expire = false WHERE id = true;

SELECT * FROM finish();
ROLLBACK;
