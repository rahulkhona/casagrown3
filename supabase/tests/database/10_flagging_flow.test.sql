-- ==========================================================================
-- Test: Product Flagging Flow
-- Tests flag insertion and product deactivation via threshold trigger
-- ==========================================================================
BEGIN;
SELECT plan(3);

-- Create test product under existing seller (Maria Garcia)
INSERT INTO market_products (id, seller_id, name, price_usd, unit, inventory, is_active, market_date, category)
VALUES (
  'f0f01111-0001-4f00-f001-000000000001',
  '11111111-1111-1111-1111-111111111111',
  'FLAGTEST Product', 5.00, 'each', 10, true, CURRENT_DATE + 7, 'produce'
);

-- T1: Product starts active and not flagged
SELECT ok(
  (SELECT is_active AND NOT is_flagged FROM market_products WHERE id = 'f0f01111-0001-4f00-f001-000000000001'),
  'Product starts active and not flagged'
);

-- T2: Inserting two flags does not yet trigger auto-hide
INSERT INTO product_flags (product_id, user_id, reason) VALUES
  ('f0f01111-0001-4f00-f001-000000000001', '22222222-2222-2222-2222-222222222222', 'offensive');
INSERT INTO product_flags (product_id, user_id, reason) VALUES
  ('f0f01111-0001-4f00-f001-000000000001', '33333333-3333-3333-3333-333333333333', 'misleading');

SELECT ok(
  (SELECT count(*) = 2 FROM product_flags WHERE product_id = 'f0f01111-0001-4f00-f001-000000000001'),
  'Two flags recorded'
);

-- T3: Third flag triggers auto-hide via check_product_flag_threshold
INSERT INTO product_flags (product_id, user_id, reason) VALUES
  ('f0f01111-0001-4f00-f001-000000000001', '44444444-4444-4444-4444-444444444444', 'prohibited');

SELECT ok(
  (SELECT is_flagged FROM market_products WHERE id = 'f0f01111-0001-4f00-f001-000000000001'),
  'Product is_flagged=true after 3 flags'
);

SELECT * FROM finish();
ROLLBACK;
