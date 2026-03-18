-- ============================================================================
-- pgTAP Stress Tests: Market Settlement — High Volume + Edge Cases
--
-- Scenario: 8 users, 20 orders, cross-buying, edge cases
-- Tests settlement correctness under realistic market-day load
-- ============================================================================
BEGIN;
SELECT plan(42);

-- ============================================================================
-- Cleanup: Mark all existing seed orders as already settled
-- so the tag-based settlement only picks up our test orders
-- ============================================================================
INSERT INTO market_settlements (id, market_date, status) VALUES
  ('00000000-0000-0000-0000-ffffffffffff', '2020-01-01', 'cleared')
ON CONFLICT (id) DO NOTHING;
UPDATE market_orders SET settlement_id = '00000000-0000-0000-0000-ffffffffffff'
WHERE settlement_id IS NULL;

-- ============================================================================
-- Setup: 8 users
-- ============================================================================
INSERT INTO auth.users (id, email, raw_user_meta_data, instance_id, aud, role, encrypted_password, confirmation_token, email_confirmed_at)
VALUES
  ('11111111-aaaa-bbbb-cccc-000000000001', 'alice@test.com', '{}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', crypt('pw', gen_salt('bf')), '', now()),
  ('11111111-aaaa-bbbb-cccc-000000000002', 'bob@test.com', '{}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', crypt('pw', gen_salt('bf')), '', now()),
  ('11111111-aaaa-bbbb-cccc-000000000003', 'carol@test.com', '{}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', crypt('pw', gen_salt('bf')), '', now()),
  ('11111111-aaaa-bbbb-cccc-000000000004', 'dan@test.com', '{}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', crypt('pw', gen_salt('bf')), '', now()),
  ('11111111-aaaa-bbbb-cccc-000000000005', 'eve@test.com', '{}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', crypt('pw', gen_salt('bf')), '', now()),
  ('11111111-aaaa-bbbb-cccc-000000000006', 'frank@test.com', '{}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', crypt('pw', gen_salt('bf')), '', now()),
  ('11111111-aaaa-bbbb-cccc-000000000007', 'grace@test.com', '{}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', crypt('pw', gen_salt('bf')), '', now()),
  ('11111111-aaaa-bbbb-cccc-000000000008', 'hank@test.com', '{}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', crypt('pw', gen_salt('bf')), '', now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, full_name, email) VALUES
  ('11111111-aaaa-bbbb-cccc-000000000001', 'Alice', 'alice@test.com'),  -- heavy seller
  ('11111111-aaaa-bbbb-cccc-000000000002', 'Bob', 'bob@test.com'),      -- heavy buyer
  ('11111111-aaaa-bbbb-cccc-000000000003', 'Carol', 'carol@test.com'),  -- mixed, net seller
  ('11111111-aaaa-bbbb-cccc-000000000004', 'Dan', 'dan@test.com'),      -- mixed, net buyer
  ('11111111-aaaa-bbbb-cccc-000000000005', 'Eve', 'eve@test.com'),      -- tiny transactions
  ('11111111-aaaa-bbbb-cccc-000000000006', 'Frank', 'frank@test.com'),  -- single large transaction
  ('11111111-aaaa-bbbb-cccc-000000000007', 'Grace', 'grace@test.com'),  -- seller only, never buys
  ('11111111-aaaa-bbbb-cccc-000000000008', 'Hank', 'hank@test.com')     -- buyer only, never sells
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

-- Booths
INSERT INTO market_booths (id, owner_id, name) VALUES
  ('22222222-aaaa-bbbb-cccc-000000000001', '11111111-aaaa-bbbb-cccc-000000000001', 'Alice Farm'),
  ('22222222-aaaa-bbbb-cccc-000000000003', '11111111-aaaa-bbbb-cccc-000000000003', 'Carol Kitchen'),
  ('22222222-aaaa-bbbb-cccc-000000000005', '11111111-aaaa-bbbb-cccc-000000000005', 'Eve Sprouts'),
  ('22222222-aaaa-bbbb-cccc-000000000006', '11111111-aaaa-bbbb-cccc-000000000006', 'Frank Ranch'),
  ('22222222-aaaa-bbbb-cccc-000000000007', '11111111-aaaa-bbbb-cccc-000000000007', 'Grace Garden')
ON CONFLICT (id) DO NOTHING;

-- Products
INSERT INTO market_products (id, seller_id, market_date, name, category, price_usd, unit, inventory, is_active) VALUES
  ('33333333-aaaa-0001-0001-000000000001', '11111111-aaaa-bbbb-cccc-000000000001', '2026-03-14', 'Tomatoes', 'vegetables', 5.00, 'lb', 200, true),
  ('33333333-aaaa-0001-0001-000000000002', '11111111-aaaa-bbbb-cccc-000000000001', '2026-03-14', 'Peppers', 'vegetables', 3.50, 'lb', 100, true),
  ('33333333-aaaa-0001-0001-000000000003', '11111111-aaaa-bbbb-cccc-000000000003', '2026-03-14', 'Cookies', 'baked', 12.00, 'dozen', 30, true),
  ('33333333-aaaa-0001-0001-000000000004', '11111111-aaaa-bbbb-cccc-000000000003', '2026-03-14', 'Bread', 'baked', 6.00, 'loaf', 50, true),
  ('33333333-aaaa-0001-0001-000000000005', '11111111-aaaa-bbbb-cccc-000000000005', '2026-03-14', 'Microgreens', 'herbs', 1.00, 'tray', 100, true),
  ('33333333-aaaa-0001-0001-000000000006', '11111111-aaaa-bbbb-cccc-000000000006', '2026-03-14', 'Beef', 'dairy', 45.00, 'lb', 20, true),
  ('33333333-aaaa-0001-0001-000000000007', '11111111-aaaa-bbbb-cccc-000000000007', '2026-03-14', 'Basil', 'herbs', 4.00, 'bunch', 40, true),
  ('33333333-aaaa-0001-0001-000000000008', '11111111-aaaa-bbbb-cccc-000000000007', '2026-03-14', 'Mint', 'herbs', 3.00, 'bunch', 60, true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 20 ORDERS — realistic market-day volume
-- ============================================================================
-- Market date: yesterday (so it's settable as a past day)
-- Using '2026-03-14' as the market date
INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id, product_name,
  quantity, unit_price_usd, subtotal_usd, tax_rate_pct, tax_amount_usd,
  platform_fee_pct, platform_fee_usd, total_usd, fulfillment_type, status, created_at)
VALUES
  -- Bob (heavy buyer) → Alice: 6 lb tomatoes = $30
  ('44444444-0001-0001-0001-000000000001', '11111111-aaaa-bbbb-cccc-000000000002', '11111111-aaaa-bbbb-cccc-000000000001',
   '22222222-aaaa-bbbb-cccc-000000000001', '33333333-aaaa-0001-0001-000000000001', 'Tomatoes',
   6, 5.00, 30.00, 0, 0, 10, 3.00, 30.00, 'pickup', 'completed', '2026-03-14'::timestamptz),
  -- Bob → Alice: 4 lb peppers = $14
  ('44444444-0001-0001-0001-000000000002', '11111111-aaaa-bbbb-cccc-000000000002', '11111111-aaaa-bbbb-cccc-000000000001',
   '22222222-aaaa-bbbb-cccc-000000000001', '33333333-aaaa-0001-0001-000000000002', 'Peppers',
   4, 3.50, 14.00, 0, 0, 10, 1.40, 14.00, 'pickup', 'completed', '2026-03-14'::timestamptz),
  -- Bob → Carol: 2 dozen cookies = $24
  ('44444444-0001-0001-0001-000000000003', '11111111-aaaa-bbbb-cccc-000000000002', '11111111-aaaa-bbbb-cccc-000000000003',
   '22222222-aaaa-bbbb-cccc-000000000003', '33333333-aaaa-0001-0001-000000000003', 'Cookies',
   2, 12.00, 24.00, 0, 0, 10, 2.40, 24.00, 'delivery', 'completed', '2026-03-14'::timestamptz),
  -- Dan → Alice: 2 lb tomatoes = $10
  ('44444444-0001-0001-0001-000000000004', '11111111-aaaa-bbbb-cccc-000000000004', '11111111-aaaa-bbbb-cccc-000000000001',
   '22222222-aaaa-bbbb-cccc-000000000001', '33333333-aaaa-0001-0001-000000000001', 'Tomatoes',
   2, 5.00, 10.00, 0, 0, 10, 1.00, 10.00, 'pickup', 'completed', '2026-03-14'::timestamptz),
  -- Dan → Carol: 1 loaf bread = $6
  ('44444444-0001-0001-0001-000000000005', '11111111-aaaa-bbbb-cccc-000000000004', '11111111-aaaa-bbbb-cccc-000000000003',
   '22222222-aaaa-bbbb-cccc-000000000003', '33333333-aaaa-0001-0001-000000000004', 'Bread',
   1, 6.00, 6.00, 0, 0, 10, 0.60, 6.00, 'pickup', 'completed', '2026-03-14'::timestamptz),
  -- Dan → Grace: 3 bunch basil = $12
  ('44444444-0001-0001-0001-000000000006', '11111111-aaaa-bbbb-cccc-000000000004', '11111111-aaaa-bbbb-cccc-000000000007',
   '22222222-aaaa-bbbb-cccc-000000000007', '33333333-aaaa-0001-0001-000000000007', 'Basil',
   3, 4.00, 12.00, 0, 0, 10, 1.20, 12.00, 'delivery', 'completed', '2026-03-14'::timestamptz),
  -- Hank (pure buyer) → Alice: 3 lb tomatoes = $15
  ('44444444-0001-0001-0001-000000000007', '11111111-aaaa-bbbb-cccc-000000000008', '11111111-aaaa-bbbb-cccc-000000000001',
   '22222222-aaaa-bbbb-cccc-000000000001', '33333333-aaaa-0001-0001-000000000001', 'Tomatoes',
   3, 5.00, 15.00, 0, 0, 10, 1.50, 15.00, 'pickup', 'completed', '2026-03-14'::timestamptz),
  -- Hank → Frank: 1 lb beef = $45
  ('44444444-0001-0001-0001-000000000008', '11111111-aaaa-bbbb-cccc-000000000008', '11111111-aaaa-bbbb-cccc-000000000006',
   '22222222-aaaa-bbbb-cccc-000000000006', '33333333-aaaa-0001-0001-000000000006', 'Beef',
   1, 45.00, 45.00, 0, 0, 10, 4.50, 45.00, 'pickup', 'completed', '2026-03-14'::timestamptz),
  -- Hank → Grace: 2 bunch mint = $6
  ('44444444-0001-0001-0001-000000000009', '11111111-aaaa-bbbb-cccc-000000000008', '11111111-aaaa-bbbb-cccc-000000000007',
   '22222222-aaaa-bbbb-cccc-000000000007', '33333333-aaaa-0001-0001-000000000008', 'Mint',
   2, 3.00, 6.00, 0, 0, 10, 0.60, 6.00, 'delivery', 'completed', '2026-03-14'::timestamptz),
  -- Carol → Alice: 2 lb peppers = $7 (mixed user buying, meets $5 min)
  ('44444444-0001-0001-0001-000000000010', '11111111-aaaa-bbbb-cccc-000000000003', '11111111-aaaa-bbbb-cccc-000000000001',
   '22222222-aaaa-bbbb-cccc-000000000001', '33333333-aaaa-0001-0001-000000000002', 'Peppers',
   2, 3.50, 7.00, 0, 0, 10, 0.70, 7.00, 'pickup', 'completed', '2026-03-14'::timestamptz),
  -- Alice (seller who also buys) → Carol: 1 dozen cookies = $12
  ('44444444-0001-0001-0001-000000000011', '11111111-aaaa-bbbb-cccc-000000000001', '11111111-aaaa-bbbb-cccc-000000000003',
   '22222222-aaaa-bbbb-cccc-000000000003', '33333333-aaaa-0001-0001-000000000003', 'Cookies',
   1, 12.00, 12.00, 0, 0, 10, 1.20, 12.00, 'pickup', 'completed', '2026-03-14'::timestamptz),
  -- Alice → Grace: 5 bunch basil = $20
  ('44444444-0001-0001-0001-000000000012', '11111111-aaaa-bbbb-cccc-000000000001', '11111111-aaaa-bbbb-cccc-000000000007',
   '22222222-aaaa-bbbb-cccc-000000000007', '33333333-aaaa-0001-0001-000000000007', 'Basil',
   5, 4.00, 20.00, 0, 0, 10, 2.00, 20.00, 'delivery', 'completed', '2026-03-14'::timestamptz),
  -- Eve → Alice: 1 lb tomatoes = $5 (meets $5 min)
  ('44444444-0001-0001-0001-000000000013', '11111111-aaaa-bbbb-cccc-000000000005', '11111111-aaaa-bbbb-cccc-000000000001',
   '22222222-aaaa-bbbb-cccc-000000000001', '33333333-aaaa-0001-0001-000000000001', 'Tomatoes',
   1, 5.00, 5.00, 0, 0, 10, 0.50, 5.00, 'pickup', 'completed', '2026-03-14'::timestamptz),
  -- Bob → Eve: 5 trays microgreens = $5 (Eve is also selling)
  ('44444444-0001-0001-0001-000000000014', '11111111-aaaa-bbbb-cccc-000000000002', '11111111-aaaa-bbbb-cccc-000000000005',
   '22222222-aaaa-bbbb-cccc-000000000005', '33333333-aaaa-0001-0001-000000000005', 'Microgreens',
   5, 1.00, 5.00, 0, 0, 10, 0.50, 5.00, 'pickup', 'completed', '2026-03-14'::timestamptz),
  -- Dan → Eve: 5 trays microgreens = $5 (meets $5 min)
  ('44444444-0001-0001-0001-000000000015', '11111111-aaaa-bbbb-cccc-000000000004', '11111111-aaaa-bbbb-cccc-000000000005',
   '22222222-aaaa-bbbb-cccc-000000000005', '33333333-aaaa-0001-0001-000000000005', 'Microgreens',
   5, 1.00, 5.00, 0, 0, 10, 0.50, 5.00, 'pickup', 'completed', '2026-03-14'::timestamptz),
  -- Hank → Carol: 3 loaves bread = $18
  ('44444444-0001-0001-0001-000000000016', '11111111-aaaa-bbbb-cccc-000000000008', '11111111-aaaa-bbbb-cccc-000000000003',
   '22222222-aaaa-bbbb-cccc-000000000003', '33333333-aaaa-0001-0001-000000000004', 'Bread',
   3, 6.00, 18.00, 0, 0, 10, 1.80, 18.00, 'pickup', 'completed', '2026-03-14'::timestamptz),
  -- Bob → Frank: 2 lb beef = $90 (large transaction)
  ('44444444-0001-0001-0001-000000000017', '11111111-aaaa-bbbb-cccc-000000000002', '11111111-aaaa-bbbb-cccc-000000000006',
   '22222222-aaaa-bbbb-cccc-000000000006', '33333333-aaaa-0001-0001-000000000006', 'Beef',
   2, 45.00, 90.00, 0, 0, 10, 9.00, 90.00, 'delivery', 'completed', '2026-03-14'::timestamptz),
  -- Carol → Frank: 1 lb beef = $45
  ('44444444-0001-0001-0001-000000000018', '11111111-aaaa-bbbb-cccc-000000000003', '11111111-aaaa-bbbb-cccc-000000000006',
   '22222222-aaaa-bbbb-cccc-000000000006', '33333333-aaaa-0001-0001-000000000006', 'Beef',
   1, 45.00, 45.00, 0, 0, 10, 4.50, 45.00, 'pickup', 'completed', '2026-03-14'::timestamptz),
  -- CANCELLED order — should NOT be included in settlement
  ('44444444-0001-0001-0001-000000000019', '11111111-aaaa-bbbb-cccc-000000000002', '11111111-aaaa-bbbb-cccc-000000000001',
   '22222222-aaaa-bbbb-cccc-000000000001', '33333333-aaaa-0001-0001-000000000001', 'Tomatoes',
   10, 5.00, 50.00, 0, 0, 10, 5.00, 50.00, 'pickup', 'cancelled', '2026-03-14'::timestamptz),
  -- PENDING order — should NOT be included in settlement
  ('44444444-0001-0001-0001-000000000020', '11111111-aaaa-bbbb-cccc-000000000004', '11111111-aaaa-bbbb-cccc-000000000001',
   '22222222-aaaa-bbbb-cccc-000000000001', '33333333-aaaa-0001-0001-000000000001', 'Tomatoes',
   5, 5.00, 25.00, 0, 0, 10, 2.50, 25.00, 'pickup', 'pending', '2026-03-14'::timestamptz);

-- ============================================================================
-- Expected settlement (only completed/delivered orders, all >= $5 minimum):
--
-- Alice:  sold: $30+14+10+15+7+5 = $81         bought: $12+20 = $32   fees: $8.10  net: $40.90
-- Bob:    sold: $0                               bought: $30+14+24+5+90 = $163  fees: $0  net: -$163
-- Carol:  sold: $24+6+12+18 = $60                bought: $7+45 = $52   fees: $6.00  net: $2.00
-- Dan:    sold: $0                               bought: $10+6+12+5 = $33   fees: $0  net: -$33
-- Eve:    sold: $5+5 = $10                       bought: $5          fees: $1.00  net: $4.00
-- Frank:  sold: $45+90+45 = $180                 bought: $0          fees: $18.00  net: $162
-- Grace:  sold: $12+6+20 = $38                   bought: $0          fees: $3.80  net: $34.20
-- Hank:   sold: $0                               bought: $15+45+6+18 = $84  fees: $0  net: -$84
-- ============================================================================

-- Create holds for all buyers
INSERT INTO market_holds (id, buyer_id, stripe_payment_intent_id, stripe_client_secret, hold_amount_cents, spent_amount_cents, status)
VALUES
  ('55555555-aaaa-0001-0001-000000000001', '11111111-aaaa-bbbb-cccc-000000000001', 'pi_alice', 'sec_alice', 5000, 3200, 'active'),
  ('55555555-aaaa-0001-0001-000000000002', '11111111-aaaa-bbbb-cccc-000000000002', 'pi_bob', 'sec_bob', 20000, 16300, 'active'),
  ('55555555-aaaa-0001-0001-000000000003', '11111111-aaaa-bbbb-cccc-000000000003', 'pi_carol', 'sec_carol', 6000, 5200, 'active'),
  ('55555555-aaaa-0001-0001-000000000004', '11111111-aaaa-bbbb-cccc-000000000004', 'pi_dan', 'sec_dan', 4000, 3300, 'active'),
  ('55555555-aaaa-0001-0001-000000000005', '11111111-aaaa-bbbb-cccc-000000000005', 'pi_eve', 'sec_eve', 700, 500, 'active'),
  ('55555555-aaaa-0001-0001-000000000008', '11111111-aaaa-bbbb-cccc-000000000008', 'pi_hank', 'sec_hank', 10000, 8400, 'active');
-- Grace and Frank have no holds (pure sellers)

-- ============================================================================
-- Run settlement
-- ============================================================================
SELECT lives_ok(
  $$SELECT run_market_settlement('2026-03-14'::date)$$,
  'Settlement with 8 users and 20 orders runs without error'
);

SELECT is(
  (SELECT status::text FROM market_settlements WHERE market_date = '2026-03-14'),
  'funds_pending',
  'Settlement in funds_pending state'
);

-- Verify 18 completed orders counted (not cancelled or pending)
SELECT is(
  (SELECT total_orders FROM market_settlements WHERE market_date = '2026-03-14'),
  18,
  'Settlement counted 18 completed orders (excluded cancelled+pending)'
);

-- ============================================================================
-- Verify ALL 8 users have settlements
-- ============================================================================
SELECT is(
  (SELECT COUNT(DISTINCT user_id) FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id WHERE ms.market_date = '2026-03-14'),
  8::BIGINT,
  'All 8 users have user_settlements'
);

-- ============================================================================
-- Verify individual user nets
-- ============================================================================

-- Alice: sold $81, bought $32, fees $8.10, net = $40.90
SELECT is(
  (SELECT gross_sales_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = '11111111-aaaa-bbbb-cccc-000000000001' AND ms.market_date = '2026-03-14'),
  81.00::NUMERIC(10,2),
  'Alice: gross_sales = $81.00 (heavy seller)'
);
SELECT is(
  (SELECT total_purchases_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = '11111111-aaaa-bbbb-cccc-000000000001' AND ms.market_date = '2026-03-14'),
  32.00::NUMERIC(10,2),
  'Alice: total_purchases = $32.00 (also buys)'
);
SELECT is(
  (SELECT net_payout_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = '11111111-aaaa-bbbb-cccc-000000000001' AND ms.market_date = '2026-03-14'),
  40.90::NUMERIC(10,2),
  'Alice: net = $40.90'
);

-- Bob: pure heavy buyer, sold $0, bought $163, net = -$163
SELECT is(
  (SELECT gross_sales_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = '11111111-aaaa-bbbb-cccc-000000000002' AND ms.market_date = '2026-03-14'),
  0.00::NUMERIC(10,2),
  'Bob: gross_sales = $0.00 (pure buyer)'
);
SELECT is(
  (SELECT total_purchases_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = '11111111-aaaa-bbbb-cccc-000000000002' AND ms.market_date = '2026-03-14'),
  163.00::NUMERIC(10,2),
  'Bob: total_purchases = $163.00 (heavy buyer with 5 orders)'
);
SELECT is(
  (SELECT net_payout_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = '11111111-aaaa-bbbb-cccc-000000000002' AND ms.market_date = '2026-03-14'),
  (-163.00)::NUMERIC(10,2),
  'Bob: net = -$163.00'
);

-- Carol: mixed, sold $60, bought $52, fees $6.00, net = $2.00
SELECT is(
  (SELECT gross_sales_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = '11111111-aaaa-bbbb-cccc-000000000003' AND ms.market_date = '2026-03-14'),
  60.00::NUMERIC(10,2),
  'Carol: gross_sales = $60.00'
);
SELECT is(
  (SELECT net_payout_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = '11111111-aaaa-bbbb-cccc-000000000003' AND ms.market_date = '2026-03-14'),
  2.00::NUMERIC(10,2),
  'Carol: net = $2.00 (mixed, slight net seller)'
);

-- Dan: bought $33, sold $0, net = -$33
SELECT is(
  (SELECT net_payout_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = '11111111-aaaa-bbbb-cccc-000000000004' AND ms.market_date = '2026-03-14'),
  (-33.00)::NUMERIC(10,2),
  'Dan: net = -$33.00 (mixed, more buyer than seller)'
);

-- Eve: sold $10, bought $5, fees $1.00, net = $4.00
SELECT is(
  (SELECT gross_sales_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = '11111111-aaaa-bbbb-cccc-000000000005' AND ms.market_date = '2026-03-14'),
  10.00::NUMERIC(10,2),
  'Eve: gross_sales = $10.00'
);
SELECT is(
  (SELECT net_payout_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = '11111111-aaaa-bbbb-cccc-000000000005' AND ms.market_date = '2026-03-14'),
  4.00::NUMERIC(10,2),
  'Eve: net = $4.00'
);

-- Frank: large seller only, sold $180, fees $18, net = $162
SELECT is(
  (SELECT gross_sales_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = '11111111-aaaa-bbbb-cccc-000000000006' AND ms.market_date = '2026-03-14'),
  180.00::NUMERIC(10,2),
  'Frank: gross_sales = $180.00 (single large seller)'
);
SELECT is(
  (SELECT net_payout_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = '11111111-aaaa-bbbb-cccc-000000000006' AND ms.market_date = '2026-03-14'),
  162.00::NUMERIC(10,2),
  'Frank: net = $162.00'
);

-- Grace: seller only (never buys), sold $38, fees $3.80, net = $34.20
SELECT is(
  (SELECT gross_sales_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = '11111111-aaaa-bbbb-cccc-000000000007' AND ms.market_date = '2026-03-14'),
  38.00::NUMERIC(10,2),
  'Grace: gross_sales = $38.00 (seller only)'
);
SELECT is(
  (SELECT total_purchases_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = '11111111-aaaa-bbbb-cccc-000000000007' AND ms.market_date = '2026-03-14'),
  0.00::NUMERIC(10,2),
  'Grace: total_purchases = $0.00 (never buys)'
);
SELECT is(
  (SELECT net_payout_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = '11111111-aaaa-bbbb-cccc-000000000007' AND ms.market_date = '2026-03-14'),
  34.20::NUMERIC(10,2),
  'Grace: net = $34.20'
);

-- Hank: pure buyer, sold $0, bought $84, net = -$84
SELECT is(
  (SELECT net_payout_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = '11111111-aaaa-bbbb-cccc-000000000008' AND ms.market_date = '2026-03-14'),
  (-84.00)::NUMERIC(10,2),
  'Hank: net = -$84.00 (pure buyer)'
);

-- ============================================================================
-- Global invariants
-- ============================================================================

SELECT is(
  (SELECT ROUND(SUM(net_payout_usd + platform_fees_usd)::NUMERIC, 2) FROM user_settlements us
   JOIN market_settlements ms ON ms.id = us.settlement_id WHERE ms.market_date = '2026-03-14'),
  0.00::NUMERIC,
  'INVARIANT: SUM(net + fees) = 0 (market is zero-sum)'
);

-- Total platform fees = 10% of $369 total sales = $36.90
SELECT is(
  (SELECT SUM(platform_fees_usd) FROM user_settlements us
   JOIN market_settlements ms ON ms.id = us.settlement_id WHERE ms.market_date = '2026-03-14'),
  36.90::NUMERIC(10,2),
  'Total platform fees = $36.90 (10% of all sales)'
);

-- Total gross sales should equal total purchases
SELECT is(
  (SELECT SUM(gross_sales_usd) FROM user_settlements us
   JOIN market_settlements ms ON ms.id = us.settlement_id WHERE ms.market_date = '2026-03-14'),
  (SELECT SUM(total_purchases_usd) FROM user_settlements us
   JOIN market_settlements ms ON ms.id = us.settlement_id WHERE ms.market_date = '2026-03-14'),
  'INVARIANT: total sales = total purchases'
);

-- ============================================================================
-- Settlement captures
-- ============================================================================

-- 6 buyers had holds → 6 captures
SELECT is(
  (SELECT COUNT(*) FROM settlement_captures sc JOIN market_settlements ms ON ms.id = sc.settlement_id WHERE ms.market_date = '2026-03-14'),
  6::BIGINT,
  '6 hold captures recorded (one per buyer with hold)'
);

-- Bob's large capture: $163 from $200 hold
SELECT is(
  (SELECT capture_amount_usd FROM settlement_captures WHERE buyer_id = '11111111-aaaa-bbbb-cccc-000000000002'),
  163.00::NUMERIC(10,2),
  'Bob: $163 captured from $200 hold'
);
SELECT is(
  (SELECT release_amount_usd FROM settlement_captures WHERE buyer_id = '11111111-aaaa-bbbb-cccc-000000000002'),
  37.00::NUMERIC(10,2),
  'Bob: $37 released back'
);

-- Eve: $5 captured from $7 hold
SELECT is(
  (SELECT capture_amount_usd FROM settlement_captures WHERE buyer_id = '11111111-aaaa-bbbb-cccc-000000000005'),
  5.00::NUMERIC(10,2),
  'Eve: $5.00 captured from $7 hold'
);

-- ============================================================================
-- Ledger consistency for ALL users
-- ============================================================================
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM user_settlements us
    JOIN market_settlements ms ON ms.id = us.settlement_id
    WHERE ms.market_date = '2026-03-14'
      AND (SELECT balance_after FROM market_ledger WHERE user_id = us.user_id ORDER BY id DESC LIMIT 1)
        != (SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_usd ELSE -amount_usd END), 0)
            FROM market_ledger WHERE user_id = us.user_id)
  ),
  'INVARIANT: All 8 users have consistent ledger (running balance = SUM)'
);

-- Reconciliation checks passed
SELECT ok(
  (SELECT (reconciliation_check->>'check1_ledger_consistency')::boolean FROM market_settlements WHERE market_date = '2026-03-14'),
  'Reconciliation check 1 passed'
);
SELECT ok(
  (SELECT (reconciliation_check->>'check2_settlement_balance')::boolean FROM market_settlements WHERE market_date = '2026-03-14'),
  'Reconciliation check 2 passed'
);

-- ============================================================================
-- User balances
-- ============================================================================

-- Sellers with positive net should have pending > 0
SELECT ok(
  (SELECT pending_usd FROM user_balances WHERE user_id = '11111111-aaaa-bbbb-cccc-000000000001') > 0,
  'Alice pending > 0'
);
SELECT ok(
  (SELECT pending_usd FROM user_balances WHERE user_id = '11111111-aaaa-bbbb-cccc-000000000006') > 0,
  'Frank pending > 0'
);
SELECT ok(
  (SELECT pending_usd FROM user_balances WHERE user_id = '11111111-aaaa-bbbb-cccc-000000000007') > 0,
  'Grace pending > 0'
);

-- Pure buyers should have pending = 0
SELECT is(
  (SELECT pending_usd FROM user_balances WHERE user_id = '11111111-aaaa-bbbb-cccc-000000000002'),
  0.00::NUMERIC(10,2),
  'Bob pending = 0 (pure buyer)'
);
SELECT is(
  (SELECT pending_usd FROM user_balances WHERE user_id = '11111111-aaaa-bbbb-cccc-000000000008'),
  0.00::NUMERIC(10,2),
  'Hank pending = 0 (pure buyer)'
);

-- Nobody in this test should have available yet (not cleared)
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM user_balances
    WHERE available_usd > 0
      AND user_id IN (
        '11111111-aaaa-bbbb-cccc-000000000001',
        '11111111-aaaa-bbbb-cccc-000000000002',
        '11111111-aaaa-bbbb-cccc-000000000003',
        '11111111-aaaa-bbbb-cccc-000000000004',
        '11111111-aaaa-bbbb-cccc-000000000005',
        '11111111-aaaa-bbbb-cccc-000000000006',
        '11111111-aaaa-bbbb-cccc-000000000007',
        '11111111-aaaa-bbbb-cccc-000000000008'
      )
  ),
  'No available balances for test users before funds received'
);

-- ============================================================================
-- Confirm funds → cleared
-- ============================================================================
-- Total captured: Alice=$32, Bob=$163, Carol=$52, Dan=$33, Eve=$5, Hank=$84 = $369
-- Stripe fees: 2.9% of 369 + 6 × $0.30 = $10.70 + $1.80 = $12.50
-- Expected payout: $369 - $12.50 = $356.50

SELECT lives_ok(
  $$SELECT confirm_settlement_funds_received(
    (SELECT id FROM market_settlements WHERE market_date = '2026-03-14'),
    'po_stress_test',
    356.50
  )$$,
  'Funds confirmation with realistic Stripe payout succeeds'
);

SELECT is(
  (SELECT status::text FROM market_settlements WHERE market_date = '2026-03-14'),
  'cleared',
  'Settlement cleared after funds received'
);

-- Now sellers should have available balances
SELECT is(
  (SELECT available_usd FROM user_balances WHERE user_id = '11111111-aaaa-bbbb-cccc-000000000006'),
  162.00::NUMERIC(10,2),
  'Frank: available = $162.00 after clearing'
);

SELECT is(
  (SELECT available_usd FROM user_balances WHERE user_id = '11111111-aaaa-bbbb-cccc-000000000007'),
  34.20::NUMERIC(10,2),
  'Grace: available = $34.20 after clearing'
);

-- All 8 users should have notifications
SELECT is(
  (SELECT COUNT(DISTINCT n.user_id) FROM notifications n
   JOIN user_settlements us ON us.user_id = n.user_id
   JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE ms.market_date = '2026-03-14' AND n.content LIKE '%settlement%'),
  8::BIGINT,
  'All 8 users received settlement notifications'
);

SELECT * FROM finish();
ROLLBACK;
