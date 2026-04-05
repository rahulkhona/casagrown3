-- ============================================================================
-- pgTAP Tests: Market Clearing & Settlement
-- Comprehensive stress tests for the settlement system
--
-- Run:
--   docker exec -i supabase_db_casagrown3 psql -U postgres -d postgres \
--     -c "CREATE EXTENSION IF NOT EXISTS pgtap;" && \
--   docker exec -i supabase_db_casagrown3 psql -U postgres -d postgres \
--     < supabase/tests/database/03_market_settlement.test.sql
-- ============================================================================
BEGIN;
SELECT plan(58);

-- ============================================================================
-- Cleanup: Mark all existing seed orders as already settled
-- so the tag-based settlement only picks up our test orders
-- Clean up any E2E data contaminating the sentinel market_date
DELETE FROM platform_bank_ledger WHERE settlement_id IN (SELECT id FROM market_settlements WHERE market_date = '2020-01-01');
DELETE FROM settlement_captures WHERE settlement_id IN (SELECT id FROM market_settlements WHERE market_date = '2020-01-01');
DELETE FROM user_settlements WHERE settlement_id IN (SELECT id FROM market_settlements WHERE market_date = '2020-01-01');
DELETE FROM market_settlements WHERE market_date = '2020-01-01';
INSERT INTO market_settlements (id, market_date, status) VALUES
  ('00000000-0000-0000-0000-ffffffffffff', '2020-01-01', 'cleared');
UPDATE market_orders SET settlement_id = '00000000-0000-0000-0000-ffffffffffff'
WHERE settlement_id IS NULL;

-- ============================================================================
-- Setup: Create test users and data
-- ============================================================================

-- Create test profiles
INSERT INTO auth.users (id, email, raw_user_meta_data, instance_id, aud, role, encrypted_password, confirmation_token, email_confirmed_at)
VALUES
  ('aaaaaaaa-0001-0001-0001-000000000001', 'sam@test.com', '{"full_name":"Sam Seller"}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', crypt('password', gen_salt('bf')), '', now()),
  ('aaaaaaaa-0001-0001-0001-000000000002', 'beth@test.com', '{"full_name":"Beth Buyer"}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', crypt('password', gen_salt('bf')), '', now()),
  ('aaaaaaaa-0001-0001-0001-000000000003', 'maria@test.com', '{"full_name":"Maria Mixed"}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', crypt('password', gen_salt('bf')), '', now()),
  ('aaaaaaaa-0001-0001-0001-000000000004', 'dave@test.com', '{"full_name":"Dave Dispute"}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', crypt('password', gen_salt('bf')), '', now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, full_name, email) VALUES
  ('aaaaaaaa-0001-0001-0001-000000000001', 'Sam Seller', 'sam@test.com'),
  ('aaaaaaaa-0001-0001-0001-000000000002', 'Beth Buyer', 'beth@test.com'),
  ('aaaaaaaa-0001-0001-0001-000000000003', 'Maria Mixed', 'maria@test.com'),
  ('aaaaaaaa-0001-0001-0001-000000000004', 'Dave Dispute', 'dave@test.com')
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

-- Create booths and products (delete auto-created booths from trigger first)
DELETE FROM market_booths WHERE owner_id IN ('aaaaaaaa-0001-0001-0001-000000000001', 'aaaaaaaa-0001-0001-0001-000000000003');
INSERT INTO market_booths (id, owner_id, name)
VALUES
  ('bbbbbbbb-0001-0001-0001-000000000001', 'aaaaaaaa-0001-0001-0001-000000000001', 'Sam Farm'),
  ('bbbbbbbb-0001-0001-0001-000000000002', 'aaaaaaaa-0001-0001-0001-000000000003', 'Maria Garden')
ON CONFLICT (id) DO NOTHING;

INSERT INTO market_products (id, seller_id, market_date, name, category, price_usd, unit, inventory, is_active)
VALUES
  ('cccccccc-0001-0001-0001-000000000001', 'aaaaaaaa-0001-0001-0001-000000000001', CURRENT_DATE + 200, 'Tomatoes', 'produce', 5.00, 'lb', 100, true),
  ('cccccccc-0001-0001-0001-000000000002', 'aaaaaaaa-0001-0001-0001-000000000001', CURRENT_DATE + 200, 'Peppers', 'produce', 4.00, 'lb', 50, true),
  ('cccccccc-0001-0001-0001-000000000003', 'aaaaaaaa-0001-0001-0001-000000000003', CURRENT_DATE + 200, 'Basil', 'flowers', 3.00, 'bunch', 80, true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 1. Tables Exist
-- ============================================================================
SELECT has_table('market_ledger', 'market_ledger table should exist');
SELECT has_table('market_settlements', 'market_settlements table should exist');
SELECT has_table('user_settlements', 'user_settlements table should exist');
SELECT has_table('user_balances', 'user_balances table should exist');
SELECT has_table('settlement_captures', 'settlement_captures table should exist');

-- ============================================================================
-- 2. Columns Exist — key tables
-- ============================================================================
SELECT has_column('market_ledger', 'balance_after', 'ledger: balance_after');
SELECT has_column('market_ledger', 'direction', 'ledger: direction');
SELECT has_column('market_settlements', 'stripe_payout_id', 'settlements: stripe_payout_id');
SELECT has_column('market_settlements', 'stripe_payout_amount_usd', 'settlements: stripe_payout_amount_usd');
SELECT has_column('market_settlements', 'total_released_usd', 'settlements: total_released_usd');
SELECT has_column('settlement_captures', 'capture_amount_usd', 'captures: capture_amount_usd');
SELECT has_column('settlement_captures', 'release_amount_usd', 'captures: release_amount_usd');
SELECT has_column('settlement_captures', 'stripe_payment_intent_id', 'captures: stripe_payment_intent_id');

-- ============================================================================
-- 3. Functions Exist
-- ============================================================================
SELECT has_function('append_ledger_entry', 'append_ledger_entry function exists');
SELECT has_function('get_user_ledger_balance', 'get_user_ledger_balance function exists');
SELECT has_function('run_market_settlement', 'run_market_settlement function exists');
SELECT has_function('confirm_settlement_funds_received', 'confirm_settlement_funds_received function exists');

-- ============================================================================
-- 4. Test: Ledger append and running balance
-- ============================================================================

-- Insert entries via function calls
SELECT append_ledger_entry('settlement_credit', 'aaaaaaaa-0001-0001-0001-000000000001', 50.00, 'credit');
SELECT append_ledger_entry('fee_charged', 'aaaaaaaa-0001-0001-0001-000000000001', 10.00, 'debit');
SELECT append_ledger_entry('settlement_credit', 'aaaaaaaa-0001-0001-0001-000000000001', 20.00, 'credit');

-- Check running balance of last entry
SELECT is(
  (SELECT balance_after FROM market_ledger WHERE user_id = 'aaaaaaaa-0001-0001-0001-000000000001' ORDER BY id DESC LIMIT 1),
  60.00::NUMERIC(10,2),
  'Ledger: final running balance = 60.00 after credits and debits'
);

-- Running balance function
SELECT is(
  get_user_ledger_balance('aaaaaaaa-0001-0001-0001-000000000001'),
  60.00::NUMERIC,
  'get_user_ledger_balance returns 60.00'
);

-- Consistency: SUM of debits/credits = running balance
SELECT is(
  (SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_usd ELSE -amount_usd END), 0) FROM market_ledger WHERE user_id = 'aaaaaaaa-0001-0001-0001-000000000001'),
  60.00::NUMERIC,
  'Ledger consistency: SUM = running balance'
);

-- Verify entry count
SELECT is(
  (SELECT COUNT(*) FROM market_ledger WHERE user_id = 'aaaaaaaa-0001-0001-0001-000000000001'),
  3::BIGINT,
  'Ledger has exactly 3 entries'
);

-- Clean up test ledger entries for clean settlement test
DELETE FROM market_ledger WHERE user_id = 'aaaaaaaa-0001-0001-0001-000000000001';

-- ============================================================================
-- 5. Full settlement scenario
--
-- Orders:
--   1. Beth buys Tomatoes from Sam:  4 × $5 = $20 (fee: $2.00)
--   2. Maria buys Peppers from Sam:  3 × $4 = $12 (fee: $1.20)
--   3. Beth buys Basil from Maria:   3 × $3 = $9  (fee: $0.90)
--   4. Sam buys Basil from Maria:    2 × $3 = $6  (fee: $0.60)
--
-- Expected:
--   Sam:   sold=$32, bought=$6, fees=$3.20 → net=+$22.80
--   Beth:  sold=$0,  bought=$29, fees=$0   → net=-$29.00
--   Maria: sold=$15, bought=$12, fees=$1.50 → net=+$1.50
-- ============================================================================

INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id, product_name,
  quantity, unit_price_usd, subtotal_usd, tax_rate_pct, tax_amount_usd,
  platform_fee_pct, platform_fee_usd, total_usd, fulfillment_type, status, created_at)
VALUES
  -- Beth buys from Sam: $20
  ('dddddddd-0001-0001-0001-000000000001',
   'aaaaaaaa-0001-0001-0001-000000000002', 'aaaaaaaa-0001-0001-0001-000000000001',
   'bbbbbbbb-0001-0001-0001-000000000001', 'cccccccc-0001-0001-0001-000000000001', 'Tomatoes',
   4, 5.00, 20.00, 0, 0, 10, 2.00, 20.00, 'pickup', 'completed', (CURRENT_DATE + 200)::timestamptz),
  -- Maria buys from Sam: $12
  ('dddddddd-0001-0001-0001-000000000002',
   'aaaaaaaa-0001-0001-0001-000000000003', 'aaaaaaaa-0001-0001-0001-000000000001',
   'bbbbbbbb-0001-0001-0001-000000000001', 'cccccccc-0001-0001-0001-000000000002', 'Peppers',
   3, 4.00, 12.00, 0, 0, 10, 1.20, 12.00, 'delivery', 'completed', (CURRENT_DATE + 200)::timestamptz),
  -- Beth buys from Maria: $9
  ('dddddddd-0001-0001-0001-000000000003',
   'aaaaaaaa-0001-0001-0001-000000000002', 'aaaaaaaa-0001-0001-0001-000000000003',
   'bbbbbbbb-0001-0001-0001-000000000002', 'cccccccc-0001-0001-0001-000000000003', 'Basil',
   3, 3.00, 9.00, 0, 0, 10, 0.90, 9.00, 'pickup', 'completed', (CURRENT_DATE + 200)::timestamptz),
  -- Sam buys from Maria: $6
  ('dddddddd-0001-0001-0001-000000000004',
   'aaaaaaaa-0001-0001-0001-000000000001', 'aaaaaaaa-0001-0001-0001-000000000003',
   'bbbbbbbb-0001-0001-0001-000000000002', 'cccccccc-0001-0001-0001-000000000003', 'Basil',
   2, 3.00, 6.00, 0, 0, 10, 0.60, 6.00, 'pickup', 'completed', (CURRENT_DATE + 200)::timestamptz);

-- Create Stripe holds for buyers
INSERT INTO market_holds (id, buyer_id, stripe_payment_intent_id, stripe_client_secret, hold_amount_cents, spent_amount_cents, status)
VALUES
  ('eeeeeee0-0001-0001-0001-000000000001', 'aaaaaaaa-0001-0001-0001-000000000002', 'pi_test_beth', 'secret_beth', 5000, 2900, 'active'),
  ('eeeeeee0-0001-0001-0001-000000000002', 'aaaaaaaa-0001-0001-0001-000000000001', 'pi_test_sam', 'secret_sam', 1000, 600, 'active');

-- ============================================================================
-- 6. Run settlement
-- ============================================================================

SELECT lives_ok(
  $$SELECT run_market_settlement(CURRENT_DATE + 200)$$,
  'run_market_settlement executes without error'
);

SELECT is(
  (SELECT COUNT(*) FROM market_settlements WHERE market_date = CURRENT_DATE + 200),
  1::BIGINT,
  'One settlement created for today'
);

SELECT isnt(
  (SELECT status::text FROM market_settlements WHERE market_date = CURRENT_DATE + 200),
  'reconciliation_failed',
  'Settlement should NOT have failed reconciliation'
);

SELECT is(
  (SELECT status::text FROM market_settlements WHERE market_date = CURRENT_DATE + 200),
  'funds_pending',
  'Settlement should be in funds_pending state'
);

-- ============================================================================
-- 7. Verify per-user settlement: Sam
-- ============================================================================

SELECT is(
  (SELECT gross_sales_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = 'aaaaaaaa-0001-0001-0001-000000000001' AND ms.market_date = CURRENT_DATE + 200),
  32.00::NUMERIC(10,2),
  'Sam: gross_sales = $32.00'
);

SELECT is(
  (SELECT total_purchases_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = 'aaaaaaaa-0001-0001-0001-000000000001' AND ms.market_date = CURRENT_DATE + 200),
  6.00::NUMERIC(10,2),
  'Sam: total_purchases = $6.00'
);

SELECT is(
  (SELECT platform_fees_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = 'aaaaaaaa-0001-0001-0001-000000000001' AND ms.market_date = CURRENT_DATE + 200),
  3.20::NUMERIC(10,2),
  'Sam: platform_fees = $3.20'
);

SELECT is(
  (SELECT net_payout_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = 'aaaaaaaa-0001-0001-0001-000000000001' AND ms.market_date = CURRENT_DATE + 200),
  22.80::NUMERIC(10,2),
  'Sam: net_payout = $22.80'
);

-- ============================================================================
-- 8. Verify per-user settlement: Beth (pure buyer)
-- ============================================================================

SELECT is(
  (SELECT gross_sales_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = 'aaaaaaaa-0001-0001-0001-000000000002' AND ms.market_date = CURRENT_DATE + 200),
  0.00::NUMERIC(10,2),
  'Beth: gross_sales = $0.00'
);

SELECT is(
  (SELECT total_purchases_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = 'aaaaaaaa-0001-0001-0001-000000000002' AND ms.market_date = CURRENT_DATE + 200),
  29.00::NUMERIC(10,2),
  'Beth: total_purchases = $29.00'
);

SELECT is(
  (SELECT net_payout_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = 'aaaaaaaa-0001-0001-0001-000000000002' AND ms.market_date = CURRENT_DATE + 200),
  (-29.00)::NUMERIC(10,2),
  'Beth: net_payout = -$29.00 (net buyer)'
);

-- ============================================================================
-- 9. Verify per-user settlement: Maria (mixed buyer/seller)
-- ============================================================================

SELECT is(
  (SELECT gross_sales_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = 'aaaaaaaa-0001-0001-0001-000000000003' AND ms.market_date = CURRENT_DATE + 200),
  15.00::NUMERIC(10,2),
  'Maria: gross_sales = $15.00'
);

SELECT is(
  (SELECT net_payout_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = 'aaaaaaaa-0001-0001-0001-000000000003' AND ms.market_date = CURRENT_DATE + 200),
  1.50::NUMERIC(10,2),
  'Maria: net_payout = $1.50'
);

-- ============================================================================
-- 10. Verify settlement_captures (per-hold tracking)
-- ============================================================================

-- Beth's hold: $50 hold, $29 captured, $21 released
SELECT is(
  (SELECT capture_amount_usd FROM settlement_captures WHERE buyer_id = 'aaaaaaaa-0001-0001-0001-000000000002'),
  29.00::NUMERIC(10,2),
  'Beth capture: $29.00 captured from $50 hold'
);

SELECT is(
  (SELECT release_amount_usd FROM settlement_captures WHERE buyer_id = 'aaaaaaaa-0001-0001-0001-000000000002'),
  21.00::NUMERIC(10,2),
  'Beth capture: $21.00 released back'
);

SELECT is(
  (SELECT stripe_payment_intent_id FROM settlement_captures WHERE buyer_id = 'aaaaaaaa-0001-0001-0001-000000000002'),
  'pi_test_beth',
  'Beth capture: correct Stripe PI recorded'
);

-- Sam's hold (he was also a buyer): $10 hold, $6 captured, $4 released
SELECT is(
  (SELECT capture_amount_usd FROM settlement_captures WHERE buyer_id = 'aaaaaaaa-0001-0001-0001-000000000001'),
  6.00::NUMERIC(10,2),
  'Sam capture: $6.00 captured from $10 hold'
);

SELECT is(
  (SELECT release_amount_usd FROM settlement_captures WHERE buyer_id = 'aaaaaaaa-0001-0001-0001-000000000001'),
  4.00::NUMERIC(10,2),
  'Sam capture: $4.00 released back'
);

-- Total captured across settlement
SELECT is(
  (SELECT SUM(capture_amount_usd) FROM settlement_captures sc
   JOIN market_settlements ms ON ms.id = sc.settlement_id WHERE ms.market_date = CURRENT_DATE + 200),
  35.00::NUMERIC(10,2),
  'Total captured across all holds = $35.00'
);

-- ============================================================================
-- 11. Verify ledger consistency
-- ============================================================================

-- Each user's running balance equals SUM of their entries
SELECT ok(
  (SELECT balance_after FROM market_ledger WHERE user_id = 'aaaaaaaa-0001-0001-0001-000000000001' ORDER BY id DESC LIMIT 1)
   = (SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_usd ELSE -amount_usd END), 0)
      FROM market_ledger WHERE user_id = 'aaaaaaaa-0001-0001-0001-000000000001'),
  'Sam: ledger running balance = SUM of entries'
);

SELECT ok(
  (SELECT balance_after FROM market_ledger WHERE user_id = 'aaaaaaaa-0001-0001-0001-000000000003' ORDER BY id DESC LIMIT 1)
   = (SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_usd ELSE -amount_usd END), 0)
      FROM market_ledger WHERE user_id = 'aaaaaaaa-0001-0001-0001-000000000003'),
  'Maria: ledger running balance = SUM of entries'
);

-- ============================================================================
-- 12. Reconciliation checks passed
-- ============================================================================

SELECT ok(
  (SELECT (reconciliation_check->>'check1_ledger_consistency')::boolean FROM market_settlements WHERE market_date = CURRENT_DATE + 200),
  'Reconciliation check 1 (ledger consistency) passed'
);

SELECT ok(
  (SELECT (reconciliation_check->>'check2_settlement_balance')::boolean FROM market_settlements WHERE market_date = CURRENT_DATE + 200),
  'Reconciliation check 2 (settlement balance) passed'
);

-- ============================================================================
-- 13. Re-running settlement: all orders already tagged, nothing to process
-- ============================================================================

SELECT is(
  (SELECT (run_market_settlement(CURRENT_DATE + 200))->>'error'),
  'No unsettled orders to process',
  'Re-running settlement returns no unsettled orders (all already tagged)'
);

-- ============================================================================
-- 14. User balances: pending state (before Stripe funds arrive)
-- ============================================================================

SELECT is(
  (SELECT pending_usd FROM user_balances WHERE user_id = 'aaaaaaaa-0001-0001-0001-000000000001'),
  22.80::NUMERIC(10,2),
  'Sam: pending_usd = $22.80 before funds received'
);

SELECT is(
  (SELECT available_usd FROM user_balances WHERE user_id = 'aaaaaaaa-0001-0001-0001-000000000001'),
  0.00::NUMERIC(10,2),
  'Sam: available_usd = $0.00 before funds received'
);

SELECT is(
  (SELECT pending_usd FROM user_balances WHERE user_id = 'aaaaaaaa-0001-0001-0001-000000000002'),
  0.00::NUMERIC(10,2),
  'Beth: pending_usd = $0.00 (net buyer, no payout)'
);

-- ============================================================================
-- 15. Confirm funds received (Stripe T+2) — with reconciliation
-- ============================================================================

SELECT lives_ok(
  $$SELECT confirm_settlement_funds_received(
    (SELECT id FROM market_settlements WHERE market_date = CURRENT_DATE + 200),
    'po_test_payout_123',
    33.39
  )$$,
  'confirm_settlement_funds_received executes without error'
);

-- Settlement cleared
SELECT is(
  (SELECT status::text FROM market_settlements WHERE market_date = CURRENT_DATE + 200),
  'cleared',
  'Settlement status = cleared after funds received'
);

-- Stripe payout info recorded
SELECT is(
  (SELECT stripe_payout_id FROM market_settlements WHERE market_date = CURRENT_DATE + 200),
  'po_test_payout_123',
  'Stripe payout ID recorded on settlement'
);

SELECT is(
  (SELECT stripe_payout_amount_usd FROM market_settlements WHERE market_date = CURRENT_DATE + 200),
  33.39::NUMERIC(10,2),
  'Stripe payout amount recorded = $33.39 (after fees)'
);

-- Check 3 passed
SELECT ok(
  (SELECT (reconciliation_check->>'check3_stripe_reconciliation')::boolean FROM market_settlements WHERE market_date = CURRENT_DATE + 200),
  'Reconciliation check 3 (Stripe reconciliation) passed'
);

-- ============================================================================
-- 16. User balances: available state (after Stripe funds arrive)
-- ============================================================================

SELECT is(
  (SELECT available_usd FROM user_balances WHERE user_id = 'aaaaaaaa-0001-0001-0001-000000000001'),
  22.80::NUMERIC(10,2),
  'Sam: available_usd = $22.80 after funds cleared'
);

SELECT is(
  (SELECT pending_usd FROM user_balances WHERE user_id = 'aaaaaaaa-0001-0001-0001-000000000001'),
  0.00::NUMERIC(10,2),
  'Sam: pending_usd = $0.00 after funds cleared'
);

SELECT is(
  (SELECT us.status FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = 'aaaaaaaa-0001-0001-0001-000000000001' AND ms.market_date = CURRENT_DATE + 200),
  'available',
  'Sam: user_settlement status = available'
);

-- ============================================================================
-- 17. Notifications created
-- ============================================================================

SELECT ok(
  (SELECT COUNT(*) FROM market_notifications WHERE user_id = 'aaaaaaaa-0001-0001-0001-000000000001'
    AND content LIKE '%settlement%') > 0,
  'Sam received settlement notification'
);

SELECT ok(
  (SELECT COUNT(*) FROM market_notifications WHERE user_id = 'aaaaaaaa-0001-0001-0001-000000000001'
    AND content LIKE '%available%') > 0,
  'Sam received funds-available notification'
);

SELECT * FROM finish();
ROLLBACK;
