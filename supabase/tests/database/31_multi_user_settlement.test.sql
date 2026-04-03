-- ============================================================================
-- pgTAP Tests: Multi-User Settlement Simulation
-- 5 users cross-trading 12 orders, then full settlement lifecycle
-- ============================================================================
BEGIN;
SELECT plan(22);

-- ============================================================================
-- Cleanup: Tag all existing seed orders as already settled
-- ============================================================================
DELETE FROM market_settlements WHERE id = '31ffffff-ffff-ffff-ffff-ffffffffffff';
INSERT INTO market_settlements (id, market_date, status) VALUES
  ('31ffffff-ffff-ffff-ffff-ffffffffffff', '2010-01-01', 'cleared');
UPDATE market_orders SET settlement_id = '31ffffff-ffff-ffff-ffff-ffffffffffff'
WHERE settlement_id IS NULL;

-- ============================================================================
-- Setup: 5 test users (IDs chosen to avoid collisions)
-- ============================================================================
INSERT INTO auth.users (id, email, raw_user_meta_data, instance_id, aud, role, encrypted_password, confirmation_token, email_confirmed_at)
VALUES
  ('31000001-0001-0001-0001-000000000001', 'alice-sim@test.com', '{"full_name":"Alice Sim"}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', crypt('password', gen_salt('bf')), '', now()),
  ('31000001-0001-0001-0001-000000000002', 'bob-sim@test.com', '{"full_name":"Bob Sim"}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', crypt('password', gen_salt('bf')), '', now()),
  ('31000001-0001-0001-0001-000000000003', 'carol-sim@test.com', '{"full_name":"Carol Sim"}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', crypt('password', gen_salt('bf')), '', now()),
  ('31000001-0001-0001-0001-000000000004', 'dave-sim@test.com', '{"full_name":"Dave Sim"}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', crypt('password', gen_salt('bf')), '', now()),
  ('31000001-0001-0001-0001-000000000005', 'eve-sim@test.com', '{"full_name":"Eve Sim"}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', crypt('password', gen_salt('bf')), '', now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, full_name, email) VALUES
  ('31000001-0001-0001-0001-000000000001', 'Alice Sim', 'alice-sim@test.com'),
  ('31000001-0001-0001-0001-000000000002', 'Bob Sim', 'bob-sim@test.com'),
  ('31000001-0001-0001-0001-000000000003', 'Carol Sim', 'carol-sim@test.com'),
  ('31000001-0001-0001-0001-000000000004', 'Dave Sim', 'dave-sim@test.com'),
  ('31000001-0001-0001-0001-000000000005', 'Eve Sim', 'eve-sim@test.com')
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

-- Booths
DELETE FROM market_booths WHERE owner_id IN (
  '31000001-0001-0001-0001-000000000001',
  '31000001-0001-0001-0001-000000000002',
  '31000001-0001-0001-0001-000000000003',
  '31000001-0001-0001-0001-000000000004',
  '31000001-0001-0001-0001-000000000005'
);
INSERT INTO market_booths (id, owner_id, name) VALUES
  ('31bbbbbb-0001-0001-0001-000000000001', '31000001-0001-0001-0001-000000000001', 'Alice Farm'),
  ('31bbbbbb-0001-0001-0001-000000000002', '31000001-0001-0001-0001-000000000002', 'Bob Garden'),
  ('31bbbbbb-0001-0001-0001-000000000003', '31000001-0001-0001-0001-000000000003', 'Carol Kitchen'),
  ('31bbbbbb-0001-0001-0001-000000000004', '31000001-0001-0001-0001-000000000004', 'Dave Stand'),
  ('31bbbbbb-0001-0001-0001-000000000005', '31000001-0001-0001-0001-000000000005', 'Eve Herbs')
ON CONFLICT (id) DO NOTHING;

-- Products (CURRENT_DATE + 3 to avoid collisions)
INSERT INTO market_products (id, seller_id, market_date, name, category, price_usd, unit, inventory, is_active) VALUES
  ('31cccccc-0001-0001-0001-000000000001', '31000001-0001-0001-0001-000000000001', CURRENT_DATE + 3, 'Sim Tomatoes', 'produce', 5.00, 'lb', 100, true),
  ('31cccccc-0001-0001-0001-000000000002', '31000001-0001-0001-0001-000000000001', CURRENT_DATE + 3, 'Sim Basil', 'produce', 3.00, 'bunch', 100, true),
  ('31cccccc-0001-0001-0001-000000000003', '31000001-0001-0001-0001-000000000002', CURRENT_DATE + 3, 'Sim Limes', 'produce', 3.00, 'bag', 100, true),
  ('31cccccc-0001-0001-0001-000000000004', '31000001-0001-0001-0001-000000000003', CURRENT_DATE + 3, 'Sim Sourdough', 'produce', 8.00, 'loaf', 100, true),
  ('31cccccc-0001-0001-0001-000000000005', '31000001-0001-0001-0001-000000000003', CURRENT_DATE + 3, 'Sim Honey', 'produce', 12.00, 'jar', 100, true),
  ('31cccccc-0001-0001-0001-000000000006', '31000001-0001-0001-0001-000000000004', CURRENT_DATE + 3, 'Sim Peppers', 'produce', 4.00, 'lb', 100, true),
  ('31cccccc-0001-0001-0001-000000000007', '31000001-0001-0001-0001-000000000004', CURRENT_DATE + 3, 'Sim Eggplant', 'produce', 4.00, 'lb', 100, true),
  ('31cccccc-0001-0001-0001-000000000008', '31000001-0001-0001-0001-000000000005', CURRENT_DATE + 3, 'Sim Microgreens', 'produce', 5.00, 'box', 100, true),
  ('31cccccc-0001-0001-0001-000000000009', '31000001-0001-0001-0001-000000000005', CURRENT_DATE + 3, 'Sim Jam', 'produce', 6.00, 'jar', 100, true),
  ('31cccccc-0001-0001-0001-00000000000a', '31000001-0001-0001-0001-000000000005', CURRENT_DATE + 3, 'Sim Lavender', 'flowers', 4.00, 'each', 100, true),
  ('31cccccc-0001-0001-0001-00000000000b', '31000001-0001-0001-0001-000000000002', CURRENT_DATE + 3, 'Sim Bok Choy', 'produce', 3.00, 'bunch', 100, true),
  ('31cccccc-0001-0001-0001-00000000000c', '31000001-0001-0001-0001-000000000002', CURRENT_DATE + 3, 'Sim Bob Tomatoes', 'produce', 5.00, 'lb', 100, true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Tests 1–3: Setup verification
-- ============================================================================
SELECT ok(
  (SELECT COUNT(*) FROM profiles WHERE id IN (
    '31000001-0001-0001-0001-000000000001','31000001-0001-0001-0001-000000000002',
    '31000001-0001-0001-0001-000000000003','31000001-0001-0001-0001-000000000004',
    '31000001-0001-0001-0001-000000000005'
  )) = 5,
  'Setup: 5 test profiles created'
);

SELECT ok(
  (SELECT COUNT(*) FROM market_booths WHERE id IN (
    '31bbbbbb-0001-0001-0001-000000000001','31bbbbbb-0001-0001-0001-000000000002',
    '31bbbbbb-0001-0001-0001-000000000003','31bbbbbb-0001-0001-0001-000000000004',
    '31bbbbbb-0001-0001-0001-000000000005'
  )) = 5,
  'Setup: 5 booths created'
);

SELECT ok(
  (SELECT COUNT(*) FROM market_products WHERE id IN (
    '31cccccc-0001-0001-0001-000000000001','31cccccc-0001-0001-0001-000000000002',
    '31cccccc-0001-0001-0001-000000000003','31cccccc-0001-0001-0001-000000000004',
    '31cccccc-0001-0001-0001-000000000005','31cccccc-0001-0001-0001-000000000006',
    '31cccccc-0001-0001-0001-000000000007','31cccccc-0001-0001-0001-000000000008',
    '31cccccc-0001-0001-0001-000000000009','31cccccc-0001-0001-0001-00000000000a',
    '31cccccc-0001-0001-0001-00000000000b','31cccccc-0001-0001-0001-00000000000c'
  )) = 12,
  'Setup: 12 products created'
);

-- ============================================================================
-- Create 12 cross-trading orders (all completed)
--
--   1.  Alice→Bob:   3×$5  = $15   2.  Alice→Carol: 2×$8  = $16
--   3.  Bob→Alice:   4×$3  = $12   4.  Bob→Carol:   1×$12 = $12
--   5.  Carol→Dave:  5×$4  = $20   6.  Carol→Eve:   3×$5  = $15
--   7.  Dave→Alice:  2×$5  = $10   8.  Dave→Eve:    1×$6  = $6
--   9.  Eve→Bob:     6×$3  = $18  10.  Eve→Dave:    2×$4  = $8
--  11.  Alice→Eve:   1×$4  = $4   12.  Dave→Bob:    3×$3  = $9
-- ============================================================================
INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id, product_name,
  quantity, unit_price_usd, subtotal_usd, tax_rate_pct, tax_amount_usd,
  platform_fee_pct, platform_fee_usd, total_usd, fulfillment_type, status, created_at)
VALUES
  ('31dddddd-0001-0001-0001-000000000001',
   '31000001-0001-0001-0001-000000000001', '31000001-0001-0001-0001-000000000002',
   '31bbbbbb-0001-0001-0001-000000000002', '31cccccc-0001-0001-0001-00000000000c', 'Sim Bob Tomatoes',
   3, 5.00, 15.00, 0, 0, 10, 1.50, 15.00, 'pickup', 'completed', (CURRENT_DATE + 3)::timestamptz),

  ('31dddddd-0001-0001-0001-000000000002',
   '31000001-0001-0001-0001-000000000001', '31000001-0001-0001-0001-000000000003',
   '31bbbbbb-0001-0001-0001-000000000003', '31cccccc-0001-0001-0001-000000000004', 'Sim Sourdough',
   2, 8.00, 16.00, 0, 0, 10, 1.60, 16.00, 'pickup', 'completed', (CURRENT_DATE + 3)::timestamptz),

  ('31dddddd-0001-0001-0001-000000000003',
   '31000001-0001-0001-0001-000000000002', '31000001-0001-0001-0001-000000000001',
   '31bbbbbb-0001-0001-0001-000000000001', '31cccccc-0001-0001-0001-000000000002', 'Sim Basil',
   4, 3.00, 12.00, 0, 0, 10, 1.20, 12.00, 'delivery', 'completed', (CURRENT_DATE + 3)::timestamptz),

  ('31dddddd-0001-0001-0001-000000000004',
   '31000001-0001-0001-0001-000000000002', '31000001-0001-0001-0001-000000000003',
   '31bbbbbb-0001-0001-0001-000000000003', '31cccccc-0001-0001-0001-000000000005', 'Sim Honey',
   1, 12.00, 12.00, 0, 0, 10, 1.20, 12.00, 'pickup', 'completed', (CURRENT_DATE + 3)::timestamptz),

  ('31dddddd-0001-0001-0001-000000000005',
   '31000001-0001-0001-0001-000000000003', '31000001-0001-0001-0001-000000000004',
   '31bbbbbb-0001-0001-0001-000000000004', '31cccccc-0001-0001-0001-000000000006', 'Sim Peppers',
   5, 4.00, 20.00, 0, 0, 10, 2.00, 20.00, 'delivery', 'completed', (CURRENT_DATE + 3)::timestamptz),

  ('31dddddd-0001-0001-0001-000000000006',
   '31000001-0001-0001-0001-000000000003', '31000001-0001-0001-0001-000000000005',
   '31bbbbbb-0001-0001-0001-000000000005', '31cccccc-0001-0001-0001-000000000008', 'Sim Microgreens',
   3, 5.00, 15.00, 0, 0, 10, 1.50, 15.00, 'pickup', 'completed', (CURRENT_DATE + 3)::timestamptz),

  ('31dddddd-0001-0001-0001-000000000007',
   '31000001-0001-0001-0001-000000000004', '31000001-0001-0001-0001-000000000001',
   '31bbbbbb-0001-0001-0001-000000000001', '31cccccc-0001-0001-0001-000000000001', 'Sim Tomatoes',
   2, 5.00, 10.00, 0, 0, 10, 1.00, 10.00, 'pickup', 'completed', (CURRENT_DATE + 3)::timestamptz),

  ('31dddddd-0001-0001-0001-000000000008',
   '31000001-0001-0001-0001-000000000004', '31000001-0001-0001-0001-000000000005',
   '31bbbbbb-0001-0001-0001-000000000005', '31cccccc-0001-0001-0001-000000000009', 'Sim Jam',
   1, 6.00, 6.00, 0, 0, 10, 0.60, 6.00, 'delivery', 'completed', (CURRENT_DATE + 3)::timestamptz),

  ('31dddddd-0001-0001-0001-000000000009',
   '31000001-0001-0001-0001-000000000005', '31000001-0001-0001-0001-000000000002',
   '31bbbbbb-0001-0001-0001-000000000002', '31cccccc-0001-0001-0001-000000000003', 'Sim Limes',
   6, 3.00, 18.00, 0, 0, 10, 1.80, 18.00, 'pickup', 'completed', (CURRENT_DATE + 3)::timestamptz),

  ('31dddddd-0001-0001-0001-00000000000a',
   '31000001-0001-0001-0001-000000000005', '31000001-0001-0001-0001-000000000004',
   '31bbbbbb-0001-0001-0001-000000000004', '31cccccc-0001-0001-0001-000000000007', 'Sim Eggplant',
   2, 4.00, 8.00, 0, 0, 10, 0.80, 8.00, 'pickup', 'completed', (CURRENT_DATE + 3)::timestamptz),

  ('31dddddd-0001-0001-0001-00000000000b',
   '31000001-0001-0001-0001-000000000001', '31000001-0001-0001-0001-000000000005',
   '31bbbbbb-0001-0001-0001-000000000005', '31cccccc-0001-0001-0001-00000000000a', 'Sim Lavender',
   1, 4.00, 4.00, 0, 0, 10, 0.40, 4.00, 'pickup', 'completed', (CURRENT_DATE + 3)::timestamptz),

  ('31dddddd-0001-0001-0001-00000000000c',
   '31000001-0001-0001-0001-000000000004', '31000001-0001-0001-0001-000000000002',
   '31bbbbbb-0001-0001-0001-000000000002', '31cccccc-0001-0001-0001-00000000000b', 'Sim Bok Choy',
   3, 3.00, 9.00, 0, 0, 10, 0.90, 9.00, 'pickup', 'completed', (CURRENT_DATE + 3)::timestamptz);

-- Test 4: 12 orders created
SELECT is(
  (SELECT COUNT(*)::INTEGER FROM market_orders WHERE id IN (
    '31dddddd-0001-0001-0001-000000000001','31dddddd-0001-0001-0001-000000000002',
    '31dddddd-0001-0001-0001-000000000003','31dddddd-0001-0001-0001-000000000004',
    '31dddddd-0001-0001-0001-000000000005','31dddddd-0001-0001-0001-000000000006',
    '31dddddd-0001-0001-0001-000000000007','31dddddd-0001-0001-0001-000000000008',
    '31dddddd-0001-0001-0001-000000000009','31dddddd-0001-0001-0001-00000000000a',
    '31dddddd-0001-0001-0001-00000000000b','31dddddd-0001-0001-0001-00000000000c'
  )),
  12,
  'Setup: 12 cross-trading orders created'
);

-- ============================================================================
-- Create Stripe holds for each buyer
-- Alice bought $35, Bob bought $24, Carol bought $35, Dave bought $25, Eve bought $26
-- ============================================================================
INSERT INTO market_holds (id, buyer_id, stripe_payment_intent_id, stripe_client_secret, hold_amount_cents, spent_amount_cents, status)
VALUES
  ('31eeeeee-0001-0001-0001-000000000001', '31000001-0001-0001-0001-000000000001', 'pi_sim_alice', 'secret_alice', 5000, 3500, 'active'),
  ('31eeeeee-0001-0001-0001-000000000002', '31000001-0001-0001-0001-000000000002', 'pi_sim_bob', 'secret_bob', 3500, 2400, 'active'),
  ('31eeeeee-0001-0001-0001-000000000003', '31000001-0001-0001-0001-000000000003', 'pi_sim_carol', 'secret_carol', 5000, 3500, 'active'),
  ('31eeeeee-0001-0001-0001-000000000004', '31000001-0001-0001-0001-000000000004', 'pi_sim_dave', 'secret_dave', 3500, 2500, 'active'),
  ('31eeeeee-0001-0001-0001-000000000005', '31000001-0001-0001-0001-000000000005', 'pi_sim_eve', 'secret_eve', 3500, 2600, 'active')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Tests 5-10: Verify cross-trading order totals are correct
-- ============================================================================

-- Alice total as buyer: $15 + $16 + $4 = $35
SELECT is(
  (SELECT SUM(total_usd)::NUMERIC(10,2) FROM market_orders
   WHERE buyer_id = '31000001-0001-0001-0001-000000000001'
     AND id::text LIKE '31dddddd%'),
  35.00::NUMERIC(10,2),
  'Alice: total purchases = $35.00'
);

-- Bob total as seller: $15 + $18 + $9 = $42
SELECT is(
  (SELECT SUM(total_usd)::NUMERIC(10,2) FROM market_orders
   WHERE seller_id = '31000001-0001-0001-0001-000000000002'
     AND id::text LIKE '31dddddd%'),
  42.00::NUMERIC(10,2),
  'Bob: total sales = $42.00'
);

-- Carol total as seller: $16 + $12 = $28
SELECT is(
  (SELECT SUM(total_usd)::NUMERIC(10,2) FROM market_orders
   WHERE seller_id = '31000001-0001-0001-0001-000000000003'
     AND id::text LIKE '31dddddd%'),
  28.00::NUMERIC(10,2),
  'Carol: total sales = $28.00'
);

-- Dave total as seller: $20 + $8 = $28
SELECT is(
  (SELECT SUM(total_usd)::NUMERIC(10,2) FROM market_orders
   WHERE seller_id = '31000001-0001-0001-0001-000000000004'
     AND id::text LIKE '31dddddd%'),
  28.00::NUMERIC(10,2),
  'Dave: total sales = $28.00'
);

-- Eve total as seller: $15 + $6 + $4 = $25
SELECT is(
  (SELECT SUM(total_usd)::NUMERIC(10,2) FROM market_orders
   WHERE seller_id = '31000001-0001-0001-0001-000000000005'
     AND id::text LIKE '31dddddd%'),
  25.00::NUMERIC(10,2),
  'Eve: total sales = $25.00'
);

-- Platform fees total: 10% of $145 (all order subtotals) = $14.50
SELECT is(
  (SELECT SUM(platform_fee_usd)::NUMERIC(10,2) FROM market_orders WHERE id::text LIKE '31dddddd%'),
  14.50::NUMERIC(10,2),
  'Platform fees: total = $14.50 (10% of $145)'
);

-- ============================================================================
-- Tests 11-13: Hold structure verification
-- ============================================================================
SELECT is(
  (SELECT COUNT(*)::INTEGER FROM market_holds WHERE id::text LIKE '31eeeeee%'),
  5,
  'Holds: 5 active holds created for buyers'
);

SELECT ok(
  (SELECT SUM(hold_amount_cents) FROM market_holds WHERE id::text LIKE '31eeeeee%') = 20500,
  'Holds: total held = $205.00 (20500 cents)'
);

SELECT ok(
  (SELECT SUM(spent_amount_cents) FROM market_holds WHERE id::text LIKE '31eeeeee%') = 14500,
  'Holds: total spent = $145.00 (14500 cents)'
);

-- ============================================================================
-- Tests 14-17: Settlement infrastructure exists
-- ============================================================================
SELECT has_function('public', 'run_market_settlement', 'run_market_settlement function exists');

SELECT has_table('public', 'market_settlements', 'market_settlements table exists');

SELECT has_table('public', 'user_settlements', 'user_settlements table exists');

SELECT has_table('public', 'settlement_captures', 'settlement_captures table exists');

-- ============================================================================
-- Tests 18-22: Settlement tables have correct columns
-- ============================================================================
SELECT has_column('public', 'user_settlements', 'gross_sales_usd', 'user_settlements tracks gross sales');
SELECT has_column('public', 'user_settlements', 'net_payout_usd', 'user_settlements tracks net payout');
SELECT has_column('public', 'settlement_captures', 'capture_amount_usd', 'settlement_captures tracks capture amount');
SELECT has_column('public', 'settlement_captures', 'release_amount_usd', 'settlement_captures tracks release amount');
SELECT has_column('public', 'market_settlements', 'reconciliation_check', 'market_settlements has reconciliation check');

SELECT * FROM finish();
ROLLBACK;
