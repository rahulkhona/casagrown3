-- ============================================================================
-- pgTAP Tests: Multi-User Settlement Simulation
-- 5 users cross-trading 12 orders, then full settlement lifecycle
-- ============================================================================
BEGIN;
SELECT plan(35);

-- ============================================================================
-- Cleanup: Tag all existing seed orders as already settled
-- ============================================================================
INSERT INTO market_settlements (id, market_date, status) VALUES
  ('00000000-0000-0000-0000-ffffffffffff', '2020-01-01', 'cleared')
ON CONFLICT (id) DO NOTHING;
UPDATE market_orders SET settlement_id = '00000000-0000-0000-0000-ffffffffffff'
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
-- Test 5: Run settlement
-- ============================================================================
SELECT lives_ok(
  $$SELECT run_market_settlement(CURRENT_DATE + 3)$$,
  'run_market_settlement executes without error'
);

-- Test 6: Settlement status
SELECT is(
  (SELECT status::text FROM market_settlements WHERE market_date = CURRENT_DATE + 3),
  'funds_pending',
  'Settlement is in funds_pending state'
);

-- ============================================================================
-- Tests 7–11: Per-user gross_sales_usd
-- Alice sells: Basil($12) + Tomatoes($10) = $22
-- Bob sells: BobTomatoes($15) + Limes($18) + BokChoy($9) = $42
-- Carol sells: Sourdough($16) + Honey($12) = $28
-- Dave sells: Peppers($20) + Eggplant($8) = $28
-- Eve sells: Microgreens($15) + Jam($6) + Lavender($4) = $25
-- ============================================================================
SELECT is(
  (SELECT gross_sales_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = '31000001-0001-0001-0001-000000000001' AND ms.market_date = CURRENT_DATE + 3),
  22.00::NUMERIC(10,2),
  'Alice: gross_sales = $22.00'
);

SELECT is(
  (SELECT gross_sales_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = '31000001-0001-0001-0001-000000000002' AND ms.market_date = CURRENT_DATE + 3),
  42.00::NUMERIC(10,2),
  'Bob: gross_sales = $42.00'
);

SELECT is(
  (SELECT gross_sales_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = '31000001-0001-0001-0001-000000000003' AND ms.market_date = CURRENT_DATE + 3),
  28.00::NUMERIC(10,2),
  'Carol: gross_sales = $28.00'
);

SELECT is(
  (SELECT gross_sales_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = '31000001-0001-0001-0001-000000000004' AND ms.market_date = CURRENT_DATE + 3),
  28.00::NUMERIC(10,2),
  'Dave: gross_sales = $28.00'
);

SELECT is(
  (SELECT gross_sales_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = '31000001-0001-0001-0001-000000000005' AND ms.market_date = CURRENT_DATE + 3),
  25.00::NUMERIC(10,2),
  'Eve: gross_sales = $25.00'
);

-- ============================================================================
-- Tests 12–16: Per-user total_purchases_usd
-- Alice: $15 + $16 + $4 = $35
-- Bob: $12 + $12 = $24
-- Carol: $20 + $15 = $35
-- Dave: $10 + $6 + $9 = $25
-- Eve: $18 + $8 = $26
-- ============================================================================
SELECT is(
  (SELECT total_purchases_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = '31000001-0001-0001-0001-000000000001' AND ms.market_date = CURRENT_DATE + 3),
  35.00::NUMERIC(10,2),
  'Alice: total_purchases = $35.00'
);

SELECT is(
  (SELECT total_purchases_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = '31000001-0001-0001-0001-000000000002' AND ms.market_date = CURRENT_DATE + 3),
  24.00::NUMERIC(10,2),
  'Bob: total_purchases = $24.00'
);

SELECT is(
  (SELECT total_purchases_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = '31000001-0001-0001-0001-000000000003' AND ms.market_date = CURRENT_DATE + 3),
  35.00::NUMERIC(10,2),
  'Carol: total_purchases = $35.00'
);

SELECT is(
  (SELECT total_purchases_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = '31000001-0001-0001-0001-000000000004' AND ms.market_date = CURRENT_DATE + 3),
  25.00::NUMERIC(10,2),
  'Dave: total_purchases = $25.00'
);

SELECT is(
  (SELECT total_purchases_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = '31000001-0001-0001-0001-000000000005' AND ms.market_date = CURRENT_DATE + 3),
  26.00::NUMERIC(10,2),
  'Eve: total_purchases = $26.00'
);

-- ============================================================================
-- Tests 17–21: Per-user platform_fees_usd (10% of gross_sales)
-- ============================================================================
SELECT is(
  (SELECT platform_fees_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = '31000001-0001-0001-0001-000000000001' AND ms.market_date = CURRENT_DATE + 3),
  2.20::NUMERIC(10,2),
  'Alice: platform_fees = $2.20'
);

SELECT is(
  (SELECT platform_fees_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = '31000001-0001-0001-0001-000000000002' AND ms.market_date = CURRENT_DATE + 3),
  4.20::NUMERIC(10,2),
  'Bob: platform_fees = $4.20'
);

SELECT is(
  (SELECT platform_fees_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = '31000001-0001-0001-0001-000000000003' AND ms.market_date = CURRENT_DATE + 3),
  2.80::NUMERIC(10,2),
  'Carol: platform_fees = $2.80'
);

SELECT is(
  (SELECT platform_fees_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = '31000001-0001-0001-0001-000000000004' AND ms.market_date = CURRENT_DATE + 3),
  2.80::NUMERIC(10,2),
  'Dave: platform_fees = $2.80'
);

SELECT is(
  (SELECT platform_fees_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = '31000001-0001-0001-0001-000000000005' AND ms.market_date = CURRENT_DATE + 3),
  2.50::NUMERIC(10,2),
  'Eve: platform_fees = $2.50'
);

-- ============================================================================
-- Tests 22–26: Per-user net_payout_usd = gross_sales - total_purchases - platform_fees
-- Alice: $22 - $35 - $2.20 = -$15.20
-- Bob: $42 - $24 - $4.20 = $13.80
-- Carol: $28 - $35 - $2.80 = -$9.80
-- Dave: $28 - $25 - $2.80 = $0.20
-- Eve: $25 - $26 - $2.50 = -$3.50
-- ============================================================================
SELECT is(
  (SELECT net_payout_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = '31000001-0001-0001-0001-000000000001' AND ms.market_date = CURRENT_DATE + 3),
  (-15.20)::NUMERIC(10,2),
  'Alice: net_payout = -$15.20'
);

SELECT is(
  (SELECT net_payout_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = '31000001-0001-0001-0001-000000000002' AND ms.market_date = CURRENT_DATE + 3),
  13.80::NUMERIC(10,2),
  'Bob: net_payout = +$13.80'
);

SELECT is(
  (SELECT net_payout_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = '31000001-0001-0001-0001-000000000003' AND ms.market_date = CURRENT_DATE + 3),
  (-9.80)::NUMERIC(10,2),
  'Carol: net_payout = -$9.80'
);

SELECT is(
  (SELECT net_payout_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = '31000001-0001-0001-0001-000000000004' AND ms.market_date = CURRENT_DATE + 3),
  0.20::NUMERIC(10,2),
  'Dave: net_payout = +$0.20'
);

SELECT is(
  (SELECT net_payout_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = '31000001-0001-0001-0001-000000000005' AND ms.market_date = CURRENT_DATE + 3),
  (-3.50)::NUMERIC(10,2),
  'Eve: net_payout = -$3.50'
);

-- ============================================================================
-- Tests 27–28: Settlement captures exist
-- ============================================================================
SELECT ok(
  (SELECT COUNT(*) FROM settlement_captures sc
   JOIN market_settlements ms ON ms.id = sc.settlement_id WHERE ms.market_date = CURRENT_DATE + 3) >= 1,
  'Settlement captures: captures created for settlement'
);

SELECT ok(
  (SELECT SUM(capture_amount_usd) FROM settlement_captures sc
   JOIN market_settlements ms ON ms.id = sc.settlement_id WHERE ms.market_date = CURRENT_DATE + 3) > 0,
  'Settlement captures: total captured > $0'
);

-- ============================================================================
-- Tests 29–30: Ledger running balance consistency
-- ============================================================================
SELECT ok(
  (SELECT COUNT(*) FROM market_ledger WHERE user_id = '31000001-0001-0001-0001-000000000002') > 0,
  'Bob: has ledger entries from settlement'
);

SELECT ok(
  (SELECT COUNT(*) FROM market_ledger WHERE user_id = '31000001-0001-0001-0001-000000000004') > 0,
  'Dave: has ledger entries from settlement'
);

-- ============================================================================
-- Tests 31–32: Reconciliation check
-- ============================================================================
SELECT ok(
  (SELECT reconciliation_check IS NOT NULL FROM market_settlements WHERE market_date = CURRENT_DATE + 3),
  'Reconciliation check was performed'
);

-- ============================================================================
-- Test 33: Confirm funds received → status = cleared
-- ============================================================================
SELECT lives_ok(
  $$SELECT confirm_settlement_funds_received(
    (SELECT id FROM market_settlements WHERE market_date = CURRENT_DATE + 3),
    'po_sim_multi_user',
    139.29
  )$$,
  'confirm_settlement_funds_received succeeds'
);

SELECT is(
  (SELECT status::text FROM market_settlements WHERE market_date = CURRENT_DATE + 3),
  'cleared',
  'Settlement status = cleared after funds received'
);

-- ============================================================================
-- Test 35: Bob (net seller) has positive available_usd
-- ============================================================================
SELECT ok(
  (SELECT COALESCE(available_usd, 0) FROM user_balances WHERE user_id = '31000001-0001-0001-0001-000000000002') > 0,
  'Bob: available_usd > $0 after clearing (net seller)'
);

-- ============================================================================
-- Test 36: Re-running settlement returns no unsettled orders
-- ============================================================================
SELECT ok(
  (SELECT (run_market_settlement(CURRENT_DATE + 3))->>'error' IS NOT NULL),
  'Re-running settlement returns error (no orders to process)'
);

SELECT * FROM finish();
ROLLBACK;
