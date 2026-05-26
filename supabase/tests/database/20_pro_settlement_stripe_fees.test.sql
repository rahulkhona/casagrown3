-- ============================================================================
-- pgTAP Tests: Pro Seller Settlement — Stripe Fee Pass-Through
--
-- Tests:
--   1. stamp_stripe_fee_on_order trigger
--   2. run_market_settlement() with stripe fees (Pro vs non-Pro)
--   3. Stress test: 50+ Pro seller orders with fee aggregation
--   4. enrich_receipt_with_stripe_fee function
--   5. get_seller_fee_rate function
--
-- Run:
--   docker exec -i supabase_db_casagrown3 psql -U postgres -d postgres \
--     -c "CREATE EXTENSION IF NOT EXISTS pgtap;" && \
--   docker exec -i supabase_db_casagrown3 psql -U postgres -d postgres \
--     < supabase/tests/database/20_pro_settlement_stripe_fees.test.sql
-- ============================================================================
BEGIN;
SELECT plan(74);

-- ============================================================================
-- Cleanup: Mark all existing seed orders as already settled
-- so the tag-based settlement only picks up our test orders
-- ============================================================================
DELETE FROM platform_bank_ledger WHERE settlement_id IN (SELECT id FROM market_settlements WHERE market_date = '2020-01-01');
DELETE FROM settlement_captures WHERE settlement_id IN (SELECT id FROM market_settlements WHERE market_date = '2020-01-01');
DELETE FROM user_settlements WHERE settlement_id IN (SELECT id FROM market_settlements WHERE market_date = '2020-01-01');
DELETE FROM market_settlements WHERE market_date = '2020-01-01';
INSERT INTO market_settlements (id, market_date, status) VALUES
  ('00000000-0000-0000-0000-ffffffffffff', '2020-01-01', 'cleared');
UPDATE market_orders SET settlement_id = '00000000-0000-0000-0000-ffffffffffff'
WHERE settlement_id IS NULL;

-- ============================================================================
-- Setup: Test users
--   User 1: ProPete  — Pro seller with active subscription
--   User 2: FreeFreda — Free/standard seller (no subscription)
--   User 3: BuyerBob — Pure buyer
--   User 4: ExpiredEd — Expired/canceled Pro subscription
-- ============================================================================

INSERT INTO auth.users (id, email, raw_user_meta_data, instance_id, aud, role, encrypted_password, confirmation_token, email_confirmed_at)
VALUES
  ('aaa00020-0001-0001-0001-000000000001', 'propete@test.com', '{"full_name":"ProPete"}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', crypt('pw', gen_salt('bf')), '', now()),
  ('aaa00020-0001-0001-0001-000000000002', 'freefreda@test.com', '{"full_name":"FreeFreda"}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', crypt('pw', gen_salt('bf')), '', now()),
  ('aaa00020-0001-0001-0001-000000000003', 'buyerbob@test.com', '{"full_name":"BuyerBob"}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', crypt('pw', gen_salt('bf')), '', now()),
  ('aaa00020-0001-0001-0001-000000000004', 'expireded@test.com', '{"full_name":"ExpiredEd"}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', crypt('pw', gen_salt('bf')), '', now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, full_name, email) VALUES
  ('aaa00020-0001-0001-0001-000000000001', 'ProPete', 'propete@test.com'),
  ('aaa00020-0001-0001-0001-000000000002', 'FreeFreda', 'freefreda@test.com'),
  ('aaa00020-0001-0001-0001-000000000003', 'BuyerBob', 'buyerbob@test.com'),
  ('aaa00020-0001-0001-0001-000000000004', 'ExpiredEd', 'expireded@test.com')
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

-- Booths (delete auto-created booths from trigger first)
DELETE FROM market_booths WHERE owner_id IN (
  'aaa00020-0001-0001-0001-000000000001',
  'aaa00020-0001-0001-0001-000000000002',
  'aaa00020-0001-0001-0001-000000000004'
);
INSERT INTO market_booths (id, owner_id, name) VALUES
  ('bbb00020-0001-0001-0001-000000000001', 'aaa00020-0001-0001-0001-000000000001', 'ProPete Farm'),
  ('bbb00020-0001-0001-0001-000000000002', 'aaa00020-0001-0001-0001-000000000002', 'FreeFreda Garden'),
  ('bbb00020-0001-0001-0001-000000000003', 'aaa00020-0001-0001-0001-000000000004', 'ExpiredEd Ranch')
ON CONFLICT (id) DO NOTHING;

-- Products (use a far-future market_date to avoid collisions)
INSERT INTO market_products (id, seller_id, market_date, name, category, price_usd, unit, inventory, is_active) VALUES
  ('ccc00020-0001-0001-0001-000000000001', 'aaa00020-0001-0001-0001-000000000001', CURRENT_DATE + 300, 'Pro Tomatoes', 'produce', 10.00, 'lb', 500, true),
  ('ccc00020-0001-0001-0001-000000000002', 'aaa00020-0001-0001-0001-000000000001', CURRENT_DATE + 300, 'Pro Peppers', 'produce', 8.00, 'lb', 200, true),
  ('ccc00020-0001-0001-0001-000000000003', 'aaa00020-0001-0001-0001-000000000002', CURRENT_DATE + 300, 'Free Basil', 'flowers', 5.00, 'bunch', 300, true),
  ('ccc00020-0001-0001-0001-000000000004', 'aaa00020-0001-0001-0001-000000000004', CURRENT_DATE + 300, 'Ed Honey', 'honey', 12.00, 'jar', 100, true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Seller subscriptions
-- ============================================================================

-- ProPete: Active Pro subscription
INSERT INTO seller_subscriptions (user_id, plan, status, current_period_start, current_period_end, absorb_stripe_fees)
VALUES ('aaa00020-0001-0001-0001-000000000001', 'pro', 'active', now() - interval '15 days', now() + interval '15 days', false)
ON CONFLICT (user_id) DO UPDATE SET plan = 'pro', status = 'active',
  current_period_start = now() - interval '15 days',
  current_period_end = now() + interval '15 days',
  absorb_stripe_fees = false;

-- ExpiredEd: Canceled Pro subscription
INSERT INTO seller_subscriptions (user_id, plan, status, current_period_start, current_period_end, canceled_at)
VALUES ('aaa00020-0001-0001-0001-000000000004', 'pro', 'canceled', now() - interval '45 days', now() - interval '15 days', now() - interval '15 days')
ON CONFLICT (user_id) DO UPDATE SET plan = 'pro', status = 'canceled',
  current_period_start = now() - interval '45 days',
  current_period_end = now() - interval '15 days',
  canceled_at = now() - interval '15 days';

-- Ensure platform_settings has pass_through mode
UPDATE platform_settings SET pro_stripe_fee_handling = 'pass_through';

-- ============================================================================
-- SECTION 1: get_seller_fee_rate() tests
-- ============================================================================

-- T1: Pro seller returns pro_fee_pct
SELECT is(
  get_seller_fee_rate('aaa00020-0001-0001-0001-000000000001'),
  (SELECT COALESCE(pro_fee_pct, 5)::NUMERIC FROM platform_fees WHERE country_code = 'USA' ORDER BY creation_date DESC LIMIT 1),
  'get_seller_fee_rate: Pro seller returns pro fee rate'
);

-- T2: Non-Pro seller (no subscription) returns free/standard fee
SELECT is(
  get_seller_fee_rate('aaa00020-0001-0001-0001-000000000002'),
  (SELECT COALESCE(free_fee_pct, (fees * 100)::NUMERIC, 10::NUMERIC)::NUMERIC FROM platform_fees WHERE country_code = 'USA' ORDER BY creation_date DESC LIMIT 1),
  'get_seller_fee_rate: Non-Pro seller returns standard fee rate'
);

-- T3: Expired/canceled Pro subscription returns standard fee
SELECT is(
  get_seller_fee_rate('aaa00020-0001-0001-0001-000000000004'),
  (SELECT COALESCE(free_fee_pct, (fees * 100)::NUMERIC, 10::NUMERIC)::NUMERIC FROM platform_fees WHERE country_code = 'USA' ORDER BY creation_date DESC LIMIT 1),
  'get_seller_fee_rate: Expired Pro seller returns standard fee rate'
);

-- T4: Pure buyer (no subscription at all) returns standard fee
SELECT is(
  get_seller_fee_rate('aaa00020-0001-0001-0001-000000000003'),
  (SELECT COALESCE(free_fee_pct, (fees * 100)::NUMERIC, 10::NUMERIC)::NUMERIC FROM platform_fees WHERE country_code = 'USA' ORDER BY creation_date DESC LIMIT 1),
  'get_seller_fee_rate: Non-seller returns standard fee rate'
);

-- T5: Function exists
SELECT has_function('get_seller_fee_rate', 'get_seller_fee_rate function exists');

-- ============================================================================
-- SECTION 2: stamp_stripe_fee_on_order trigger tests
-- ============================================================================

-- T6: Trigger function exists
SELECT has_function('stamp_stripe_fee_on_order', 'stamp_stripe_fee_on_order function exists');

-- T7: Trigger exists on market_orders
SELECT has_trigger('market_orders', 'trg_stamp_stripe_fee', 'trg_stamp_stripe_fee trigger exists on market_orders');

-- Insert a pending order for Pro seller ProPete
INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id, product_name,
  quantity, unit_price_usd, subtotal_usd, tax_rate_pct, tax_amount_usd,
  platform_fee_pct, platform_fee_usd, total_usd, fulfillment_type, status, created_at)
VALUES
  ('ddd00020-0001-0001-0001-000000000001',
   'aaa00020-0001-0001-0001-000000000003', 'aaa00020-0001-0001-0001-000000000001',
   'bbb00020-0001-0001-0001-000000000001', 'ccc00020-0001-0001-0001-000000000001', 'Pro Tomatoes',
   5, 10.00, 50.00, 0, 0, 5, 2.50, 50.00, 'pickup', 'pending', (CURRENT_DATE + 300)::timestamptz);

-- T8: Before completion, stripe_processing_fee_usd should be 0
SELECT is(
  (SELECT stripe_processing_fee_usd FROM market_orders WHERE id = 'ddd00020-0001-0001-0001-000000000001'),
  0.00::NUMERIC(10,2),
  'Trigger: pending order has stripe_processing_fee_usd = 0'
);

-- T9: Before completion, stripe_fee_passed_through should be FALSE
SELECT is(
  (SELECT stripe_fee_passed_through FROM market_orders WHERE id = 'ddd00020-0001-0001-0001-000000000001'),
  FALSE,
  'Trigger: pending order has stripe_fee_passed_through = FALSE'
);

-- Update order to 'completed' → trigger should fire
UPDATE market_orders SET status = 'completed' WHERE id = 'ddd00020-0001-0001-0001-000000000001';

-- T10: After completion, stripe_processing_fee_usd should be computed (2.9% + $0.30)
-- For $50.00 order: 50 * 0.029 + 0.30 = 1.45 + 0.30 = $1.75
SELECT is(
  (SELECT stripe_processing_fee_usd FROM market_orders WHERE id = 'ddd00020-0001-0001-0001-000000000001'),
  1.75::NUMERIC(10,2),
  'Trigger: completed Pro order has stripe_processing_fee_usd = $1.75 (2.9% + $0.30 of $50)'
);

-- T11: After completion, stripe_fee_passed_through should be TRUE
SELECT is(
  (SELECT stripe_fee_passed_through FROM market_orders WHERE id = 'ddd00020-0001-0001-0001-000000000001'),
  TRUE,
  'Trigger: completed Pro order has stripe_fee_passed_through = TRUE'
);

-- T12: Re-update order status (trigger idempotency) — fee should NOT change
UPDATE market_orders SET status = 'completed' WHERE id = 'ddd00020-0001-0001-0001-000000000001';
SELECT is(
  (SELECT stripe_processing_fee_usd FROM market_orders WHERE id = 'ddd00020-0001-0001-0001-000000000001'),
  1.75::NUMERIC(10,2),
  'Trigger idempotency: re-update does not change stripe_processing_fee_usd'
);

-- Test non-Pro seller order: FreeFreda
INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id, product_name,
  quantity, unit_price_usd, subtotal_usd, tax_rate_pct, tax_amount_usd,
  platform_fee_pct, platform_fee_usd, total_usd, fulfillment_type, status, created_at)
VALUES
  ('ddd00020-0001-0001-0001-000000000002',
   'aaa00020-0001-0001-0001-000000000003', 'aaa00020-0001-0001-0001-000000000002',
   'bbb00020-0001-0001-0001-000000000002', 'ccc00020-0001-0001-0001-000000000003', 'Free Basil',
   4, 5.00, 20.00, 0, 0, 10, 2.00, 20.00, 'pickup', 'pending', (CURRENT_DATE + 300)::timestamptz);

UPDATE market_orders SET status = 'completed' WHERE id = 'ddd00020-0001-0001-0001-000000000002';

-- T13: Non-Pro seller order → stripe_processing_fee_usd stays 0
SELECT is(
  (SELECT stripe_processing_fee_usd FROM market_orders WHERE id = 'ddd00020-0001-0001-0001-000000000002'),
  0.00::NUMERIC(10,2),
  'Trigger: Non-Pro seller order keeps stripe_processing_fee_usd = 0'
);

-- T14: Non-Pro seller order → stripe_fee_passed_through stays FALSE
SELECT is(
  (SELECT stripe_fee_passed_through FROM market_orders WHERE id = 'ddd00020-0001-0001-0001-000000000002'),
  FALSE,
  'Trigger: Non-Pro seller order keeps stripe_fee_passed_through = FALSE'
);

-- Test expired Pro seller order: ExpiredEd
INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id, product_name,
  quantity, unit_price_usd, subtotal_usd, tax_rate_pct, tax_amount_usd,
  platform_fee_pct, platform_fee_usd, total_usd, fulfillment_type, status, created_at)
VALUES
  ('ddd00020-0001-0001-0001-000000000003',
   'aaa00020-0001-0001-0001-000000000003', 'aaa00020-0001-0001-0001-000000000004',
   'bbb00020-0001-0001-0001-000000000003', 'ccc00020-0001-0001-0001-000000000004', 'Ed Honey',
   2, 12.00, 24.00, 0, 0, 10, 2.40, 24.00, 'pickup', 'pending', (CURRENT_DATE + 300)::timestamptz);

UPDATE market_orders SET status = 'completed' WHERE id = 'ddd00020-0001-0001-0001-000000000003';

-- T15: Expired Pro seller → stripe_processing_fee_usd stays 0
SELECT is(
  (SELECT stripe_processing_fee_usd FROM market_orders WHERE id = 'ddd00020-0001-0001-0001-000000000003'),
  0.00::NUMERIC(10,2),
  'Trigger: Expired Pro seller order keeps stripe_processing_fee_usd = 0'
);

-- T16: Expired Pro seller → stripe_fee_passed_through stays FALSE
SELECT is(
  (SELECT stripe_fee_passed_through FROM market_orders WHERE id = 'ddd00020-0001-0001-0001-000000000003'),
  FALSE,
  'Trigger: Expired Pro seller order keeps stripe_fee_passed_through = FALSE'
);

-- Mark these trigger-test orders as settled so they don't interfere with settlement tests
UPDATE market_orders SET settlement_id = '00000000-0000-0000-0000-ffffffffffff'
WHERE id IN ('ddd00020-0001-0001-0001-000000000001', 'ddd00020-0001-0001-0001-000000000002', 'ddd00020-0001-0001-0001-000000000003');

-- Clean up test ledger entries created by settlement cleanup
DELETE FROM market_ledger WHERE user_id IN (
  'aaa00020-0001-0001-0001-000000000001', 'aaa00020-0001-0001-0001-000000000002',
  'aaa00020-0001-0001-0001-000000000003', 'aaa00020-0001-0001-0001-000000000004'
);

-- ============================================================================
-- SECTION 3: run_market_settlement() with Stripe fees — Pro vs non-Pro
-- ============================================================================
-- Settlement scenario (market_date = CURRENT_DATE + 301):
--
-- Orders:
--   1. BuyerBob buys from ProPete:   3 × $10 = $30  (fee: 5% = $1.50, stripe: $1.17)
--   2. BuyerBob buys from ProPete:   2 × $8  = $16  (fee: 5% = $0.80, stripe: $0.76)
--   3. BuyerBob buys from FreeFreda: 6 × $5  = $30  (fee: 10% = $3.00, stripe: $0)
--
-- Expected:
--   ProPete:   sold=$46, fees=$2.30, stripe_fees=$1.93 → net=$41.77
--   FreeFreda: sold=$30, fees=$3.00, stripe_fees=$0    → net=$27.00
--   BuyerBob:  bought=$76                              → net=-$76.00
-- ============================================================================

INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id, product_name,
  quantity, unit_price_usd, subtotal_usd, tax_rate_pct, tax_amount_usd,
  platform_fee_pct, platform_fee_usd, total_usd, fulfillment_type, status,
  stripe_processing_fee_usd, stripe_fee_passed_through, created_at)
VALUES
  -- BuyerBob buys from ProPete: $30
  ('ddd00020-0002-0001-0001-000000000001',
   'aaa00020-0001-0001-0001-000000000003', 'aaa00020-0001-0001-0001-000000000001',
   'bbb00020-0001-0001-0001-000000000001', 'ccc00020-0001-0001-0001-000000000001', 'Pro Tomatoes',
   3, 10.00, 30.00, 0, 0, 5, 1.50, 30.00, 'pickup', 'completed',
   1.17, TRUE, (CURRENT_DATE + 301)::timestamptz),
  -- BuyerBob buys from ProPete: $16
  ('ddd00020-0002-0001-0001-000000000002',
   'aaa00020-0001-0001-0001-000000000003', 'aaa00020-0001-0001-0001-000000000001',
   'bbb00020-0001-0001-0001-000000000001', 'ccc00020-0001-0001-0001-000000000002', 'Pro Peppers',
   2, 8.00, 16.00, 0, 0, 5, 0.80, 16.00, 'delivery', 'completed',
   0.76, TRUE, (CURRENT_DATE + 301)::timestamptz),
  -- BuyerBob buys from FreeFreda: $30
  ('ddd00020-0002-0001-0001-000000000003',
   'aaa00020-0001-0001-0001-000000000003', 'aaa00020-0001-0001-0001-000000000002',
   'bbb00020-0001-0001-0001-000000000002', 'ccc00020-0001-0001-0001-000000000003', 'Free Basil',
   6, 5.00, 30.00, 0, 0, 10, 3.00, 30.00, 'pickup', 'completed',
   0, FALSE, (CURRENT_DATE + 301)::timestamptz);

-- Create Stripe hold for BuyerBob
INSERT INTO market_holds (id, buyer_id, stripe_payment_intent_id, stripe_client_secret, hold_amount_cents, spent_amount_cents, status)
VALUES
  ('eee00020-0002-0001-0001-000000000001', 'aaa00020-0001-0001-0001-000000000003', 'pi_test20_bob', 'secret_test20_bob', 10000, 7600, 'active');

-- Run settlement
SELECT lives_ok(
  $$SELECT run_market_settlement(CURRENT_DATE + 301)$$,
  'run_market_settlement executes without error for Pro + non-Pro mix'
);

-- T17: Settlement created
SELECT is(
  (SELECT COUNT(*) FROM market_settlements WHERE market_date = CURRENT_DATE + 301),
  1::BIGINT,
  'One settlement created'
);

-- T18: Settlement status
SELECT is(
  (SELECT status::text FROM market_settlements WHERE market_date = CURRENT_DATE + 301),
  'funds_pending',
  'Settlement in funds_pending state'
);

-- T19: Settlement should NOT have failed reconciliation
SELECT isnt(
  (SELECT status::text FROM market_settlements WHERE market_date = CURRENT_DATE + 301),
  'reconciliation_failed',
  'Settlement did not fail reconciliation'
);

-- ============================================================================
-- Verify per-user settlement: ProPete (Pro seller with stripe fees)
-- ============================================================================

-- T20: ProPete gross sales = $46
SELECT is(
  (SELECT gross_sales_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = 'aaa00020-0001-0001-0001-000000000001' AND ms.market_date = CURRENT_DATE + 301),
  46.00::NUMERIC(10,2),
  'ProPete: gross_sales = $46.00'
);

-- T21: ProPete platform fees = $2.30
SELECT is(
  (SELECT platform_fees_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = 'aaa00020-0001-0001-0001-000000000001' AND ms.market_date = CURRENT_DATE + 301),
  2.30::NUMERIC(10,2),
  'ProPete: platform_fees = $2.30 (5% Pro rate)'
);

-- T22: ProPete stripe_fees_usd = $1.93 (1.17 + 0.76)
SELECT is(
  (SELECT stripe_fees_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = 'aaa00020-0001-0001-0001-000000000001' AND ms.market_date = CURRENT_DATE + 301),
  1.93::NUMERIC(10,2),
  'ProPete: stripe_fees_usd = $1.93 (pass-through)'
);

-- T23: ProPete net payout = $46 - $2.30 - $1.93 = $41.77
SELECT is(
  (SELECT net_payout_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = 'aaa00020-0001-0001-0001-000000000001' AND ms.market_date = CURRENT_DATE + 301),
  41.77::NUMERIC(10,2),
  'ProPete: net_payout = $41.77 (reduced by stripe fees)'
);

-- ============================================================================
-- Verify per-user settlement: FreeFreda (non-Pro seller, no stripe fees)
-- ============================================================================

-- T24: FreeFreda gross sales = $30
SELECT is(
  (SELECT gross_sales_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = 'aaa00020-0001-0001-0001-000000000002' AND ms.market_date = CURRENT_DATE + 301),
  30.00::NUMERIC(10,2),
  'FreeFreda: gross_sales = $30.00'
);

-- T25: FreeFreda platform fees = $3.00 (10% standard)
SELECT is(
  (SELECT platform_fees_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = 'aaa00020-0001-0001-0001-000000000002' AND ms.market_date = CURRENT_DATE + 301),
  3.00::NUMERIC(10,2),
  'FreeFreda: platform_fees = $3.00 (10% standard rate)'
);

-- T26: FreeFreda stripe_fees_usd = $0
SELECT is(
  (SELECT stripe_fees_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = 'aaa00020-0001-0001-0001-000000000002' AND ms.market_date = CURRENT_DATE + 301),
  0.00::NUMERIC(10,2),
  'FreeFreda: stripe_fees_usd = $0.00 (non-Pro, no pass-through)'
);

-- T27: FreeFreda net payout = $30 - $3.00 = $27.00
SELECT is(
  (SELECT net_payout_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = 'aaa00020-0001-0001-0001-000000000002' AND ms.market_date = CURRENT_DATE + 301),
  27.00::NUMERIC(10,2),
  'FreeFreda: net_payout = $27.00 (no stripe fee deduction)'
);

-- ============================================================================
-- Verify per-user settlement: BuyerBob (pure buyer)
-- ============================================================================

-- T28: BuyerBob purchases = $76
SELECT is(
  (SELECT total_purchases_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = 'aaa00020-0001-0001-0001-000000000003' AND ms.market_date = CURRENT_DATE + 301),
  76.00::NUMERIC(10,2),
  'BuyerBob: total_purchases = $76.00'
);

-- T29: BuyerBob net = -$76
SELECT is(
  (SELECT net_payout_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = 'aaa00020-0001-0001-0001-000000000003' AND ms.market_date = CURRENT_DATE + 301),
  (-76.00)::NUMERIC(10,2),
  'BuyerBob: net_payout = -$76.00 (pure buyer)'
);

-- ============================================================================
-- Verify ledger entries for stripe fee pass-through
-- ============================================================================

-- T30: ProPete has a 'stripe_fee_passthrough' ledger entry
SELECT ok(
  (SELECT COUNT(*) FROM market_ledger
   WHERE user_id = 'aaa00020-0001-0001-0001-000000000001'
     AND event_type = 'stripe_fee_passthrough') > 0,
  'ProPete: has stripe_fee_passthrough ledger entry'
);

-- T31: ProPete stripe_fee_passthrough entry amount = $1.93
SELECT is(
  (SELECT amount_usd FROM market_ledger
   WHERE user_id = 'aaa00020-0001-0001-0001-000000000001'
     AND event_type = 'stripe_fee_passthrough'
   ORDER BY id DESC LIMIT 1),
  1.93::NUMERIC(10,2),
  'ProPete: stripe_fee_passthrough ledger amount = $1.93'
);

-- T32: ProPete stripe_fee_passthrough direction = debit
SELECT is(
  (SELECT direction FROM market_ledger
   WHERE user_id = 'aaa00020-0001-0001-0001-000000000001'
     AND event_type = 'stripe_fee_passthrough'
   ORDER BY id DESC LIMIT 1),
  'debit',
  'ProPete: stripe_fee_passthrough direction is debit'
);

-- T33: FreeFreda should NOT have a stripe_fee_passthrough ledger entry
SELECT is(
  (SELECT COUNT(*) FROM market_ledger
   WHERE user_id = 'aaa00020-0001-0001-0001-000000000002'
     AND event_type = 'stripe_fee_passthrough'),
  0::BIGINT,
  'FreeFreda: no stripe_fee_passthrough ledger entry'
);

-- ============================================================================
-- Verify reconciliation checks passed
-- ============================================================================

-- T34: Check 1 — ledger consistency
SELECT ok(
  (SELECT (reconciliation_check->>'check1_ledger_consistency')::boolean FROM market_settlements WHERE market_date = CURRENT_DATE + 301),
  'Reconciliation check 1 (ledger consistency) passed'
);

-- T35: Check 2 — settlement balance
SELECT ok(
  (SELECT (reconciliation_check->>'check2_settlement_balance')::boolean FROM market_settlements WHERE market_date = CURRENT_DATE + 301),
  'Reconciliation check 2 (settlement balance) passed'
);

-- T36: Reconciliation JSON includes stripe fees total
SELECT ok(
  (SELECT (reconciliation_check->>'total_stripe_fees_passthrough_usd')::NUMERIC > 0
   FROM market_settlements WHERE market_date = CURRENT_DATE + 301),
  'Reconciliation includes total_stripe_fees_passthrough_usd > 0'
);

-- T37: Ledger running balance consistency for all users
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM user_settlements us
    JOIN market_settlements ms ON ms.id = us.settlement_id
    WHERE ms.market_date = CURRENT_DATE + 301
      AND (SELECT balance_after FROM market_ledger WHERE user_id = us.user_id ORDER BY id DESC LIMIT 1)
        != (SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_usd ELSE -amount_usd END), 0)
            FROM market_ledger WHERE user_id = us.user_id)
  ),
  'INVARIANT: All users have consistent ledger (running balance = SUM)'
);

-- ============================================================================
-- SECTION 4: Stress test — 50+ Pro seller orders
-- ============================================================================
-- Generate 50 orders from BuyerBob to ProPete (Pro seller)
-- Each order: 1 × $10 = $10, fee 5% = $0.50, stripe fee = $0.59 (10 * 0.029 + 0.30)
-- Plus 5 orders from BuyerBob to FreeFreda: each 1 × $5, fee 10% = $0.50, no stripe fee
-- ============================================================================

-- Use a DIFFERENT market date for stress test: CURRENT_DATE + 302
-- Generate 50 Pro orders using generate_series
INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id, product_name,
  quantity, unit_price_usd, subtotal_usd, tax_rate_pct, tax_amount_usd,
  platform_fee_pct, platform_fee_usd, total_usd, fulfillment_type, status,
  stripe_processing_fee_usd, stripe_fee_passed_through, created_at)
SELECT
  ('ddd00020-0003-0001-' || lpad(i::text, 4, '0') || '-000000000001')::UUID,
  'aaa00020-0001-0001-0001-000000000003',  -- buyer: BuyerBob
  'aaa00020-0001-0001-0001-000000000001',  -- seller: ProPete
  'bbb00020-0001-0001-0001-000000000001',
  'ccc00020-0001-0001-0001-000000000001',
  'Pro Tomatoes',
  1, 10.00, 10.00, 0, 0, 5, 0.50, 10.00, 'pickup', 'completed',
  0.59, TRUE,  -- stripe fee: 10 * 0.029 + 0.30 = $0.59
  (CURRENT_DATE + 302)::timestamptz
FROM generate_series(1, 50) AS s(i);

-- 5 non-Pro orders for FreeFreda
INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id, product_name,
  quantity, unit_price_usd, subtotal_usd, tax_rate_pct, tax_amount_usd,
  platform_fee_pct, platform_fee_usd, total_usd, fulfillment_type, status,
  stripe_processing_fee_usd, stripe_fee_passed_through, created_at)
SELECT
  ('ddd00020-0003-0001-' || lpad((50 + i)::text, 4, '0') || '-000000000001')::UUID,
  'aaa00020-0001-0001-0001-000000000003',
  'aaa00020-0001-0001-0001-000000000002',
  'bbb00020-0001-0001-0001-000000000002',
  'ccc00020-0001-0001-0001-000000000003',
  'Free Basil',
  1, 5.00, 5.00, 0, 0, 10, 0.50, 5.00, 'pickup', 'completed',
  0, FALSE,
  (CURRENT_DATE + 302)::timestamptz
FROM generate_series(1, 5) AS s(i);

-- Create hold for stress test purchases
-- Total spent: 50 × $10 + 5 × $5 = $525
INSERT INTO market_holds (id, buyer_id, stripe_payment_intent_id, stripe_client_secret, hold_amount_cents, spent_amount_cents, status)
VALUES
  ('eee00020-0003-0001-0001-000000000001', 'aaa00020-0001-0001-0001-000000000003', 'pi_stress20', 'secret_stress20', 60000, 52500, 'active');

-- Clean up ledger from prior settlement section before running stress test
DELETE FROM market_ledger WHERE user_id IN (
  'aaa00020-0001-0001-0001-000000000001', 'aaa00020-0001-0001-0001-000000000002',
  'aaa00020-0001-0001-0001-000000000003'
);

-- Run settlement for stress test date
SELECT lives_ok(
  $$SELECT run_market_settlement(CURRENT_DATE + 302)$$,
  'Stress test: settlement with 55 orders runs without error'
);

-- T38: Settlement created
SELECT is(
  (SELECT COUNT(*) FROM market_settlements WHERE market_date = CURRENT_DATE + 302),
  1::BIGINT,
  'Stress: One settlement created'
);

-- T39: 55 orders settled
SELECT is(
  (SELECT total_orders FROM market_settlements WHERE market_date = CURRENT_DATE + 302),
  55,
  'Stress: 55 orders counted in settlement'
);

-- T40: Settlement status = funds_pending (not reconciliation_failed)
SELECT is(
  (SELECT status::text FROM market_settlements WHERE market_date = CURRENT_DATE + 302),
  'funds_pending',
  'Stress: Settlement in funds_pending state'
);

-- T41: ProPete gross sales = 50 × $10 = $500
SELECT is(
  (SELECT gross_sales_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = 'aaa00020-0001-0001-0001-000000000001' AND ms.market_date = CURRENT_DATE + 302),
  500.00::NUMERIC(10,2),
  'Stress: ProPete gross_sales = $500.00'
);

-- T42: ProPete stripe_fees_usd = 50 × $0.59 = $29.50
SELECT is(
  (SELECT stripe_fees_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = 'aaa00020-0001-0001-0001-000000000001' AND ms.market_date = CURRENT_DATE + 302),
  29.50::NUMERIC(10,2),
  'Stress: ProPete stripe_fees_usd = $29.50 (50 × $0.59)'
);

-- T43: ProPete platform fees = 50 × $0.50 = $25.00
SELECT is(
  (SELECT platform_fees_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = 'aaa00020-0001-0001-0001-000000000001' AND ms.market_date = CURRENT_DATE + 302),
  25.00::NUMERIC(10,2),
  'Stress: ProPete platform_fees = $25.00 (50 × $0.50)'
);

-- T44: ProPete net = $500 - $25 - $29.50 = $445.50
SELECT is(
  (SELECT net_payout_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = 'aaa00020-0001-0001-0001-000000000001' AND ms.market_date = CURRENT_DATE + 302),
  445.50::NUMERIC(10,2),
  'Stress: ProPete net_payout = $445.50'
);

-- T45: FreeFreda gross sales = 5 × $5 = $25
SELECT is(
  (SELECT gross_sales_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = 'aaa00020-0001-0001-0001-000000000002' AND ms.market_date = CURRENT_DATE + 302),
  25.00::NUMERIC(10,2),
  'Stress: FreeFreda gross_sales = $25.00'
);

-- T46: FreeFreda stripe_fees_usd = $0
SELECT is(
  (SELECT stripe_fees_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = 'aaa00020-0001-0001-0001-000000000002' AND ms.market_date = CURRENT_DATE + 302),
  0.00::NUMERIC(10,2),
  'Stress: FreeFreda stripe_fees_usd = $0.00'
);

-- T47: FreeFreda net = $25 - $2.50 = $22.50
SELECT is(
  (SELECT net_payout_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = 'aaa00020-0001-0001-0001-000000000002' AND ms.market_date = CURRENT_DATE + 302),
  22.50::NUMERIC(10,2),
  'Stress: FreeFreda net_payout = $22.50'
);

-- T48: BuyerBob total purchases = $525
SELECT is(
  (SELECT total_purchases_usd FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE us.user_id = 'aaa00020-0001-0001-0001-000000000003' AND ms.market_date = CURRENT_DATE + 302),
  525.00::NUMERIC(10,2),
  'Stress: BuyerBob total_purchases = $525.00'
);

-- T49: Reconciliation check 1 passed for stress test
SELECT ok(
  (SELECT (reconciliation_check->>'check1_ledger_consistency')::boolean FROM market_settlements WHERE market_date = CURRENT_DATE + 302),
  'Stress: Reconciliation check 1 (ledger consistency) passed'
);

-- T50: Reconciliation check 2 passed for stress test
SELECT ok(
  (SELECT (reconciliation_check->>'check2_settlement_balance')::boolean FROM market_settlements WHERE market_date = CURRENT_DATE + 302),
  'Stress: Reconciliation check 2 (settlement balance) passed'
);

-- T51: Global invariant — SUM(net + fees + stripe_fees) = 0 (zero-sum market)
SELECT is(
  (SELECT ROUND(SUM(net_payout_usd + platform_fees_usd + stripe_fees_usd)::NUMERIC, 2)
   FROM user_settlements us JOIN market_settlements ms ON ms.id = us.settlement_id
   WHERE ms.market_date = CURRENT_DATE + 302),
  0.00::NUMERIC,
  'Stress INVARIANT: SUM(net + platform_fees + stripe_fees) = 0'
);

-- T52: Total gross sales = total purchases
SELECT is(
  (SELECT SUM(gross_sales_usd) FROM user_settlements us
   JOIN market_settlements ms ON ms.id = us.settlement_id WHERE ms.market_date = CURRENT_DATE + 302),
  (SELECT SUM(total_purchases_usd) FROM user_settlements us
   JOIN market_settlements ms ON ms.id = us.settlement_id WHERE ms.market_date = CURRENT_DATE + 302),
  'Stress INVARIANT: total sales = total purchases'
);

-- T53: Stripe fees passthrough total in reconciliation JSON = $29.50
SELECT is(
  (SELECT (reconciliation_check->>'total_stripe_fees_passthrough_usd')::NUMERIC
   FROM market_settlements WHERE market_date = CURRENT_DATE + 302),
  29.50::NUMERIC,
  'Stress: Reconciliation total_stripe_fees_passthrough_usd = $29.50'
);

-- T54: Ledger consistency for all users in stress test
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM user_settlements us
    JOIN market_settlements ms ON ms.id = us.settlement_id
    WHERE ms.market_date = CURRENT_DATE + 302
      AND (SELECT balance_after FROM market_ledger WHERE user_id = us.user_id ORDER BY id DESC LIMIT 1)
        != (SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_usd ELSE -amount_usd END), 0)
            FROM market_ledger WHERE user_id = us.user_id)
  ),
  'Stress INVARIANT: All users have consistent ledger'
);

-- ============================================================================
-- SECTION 5: enrich_receipt_with_stripe_fee function
-- ============================================================================

-- T55: Function exists
SELECT has_function('enrich_receipt_with_stripe_fee', 'enrich_receipt_with_stripe_fee function exists');

-- Create a test order with stripe fee passed through for receipt enrichment
INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id, product_name,
  quantity, unit_price_usd, subtotal_usd, tax_rate_pct, tax_amount_usd,
  platform_fee_pct, platform_fee_usd, total_usd, fulfillment_type, status,
  stripe_processing_fee_usd, stripe_fee_passed_through, seller_plan, created_at,
  settlement_id)
VALUES
  ('ddd00020-0004-0001-0001-000000000001',
   'aaa00020-0001-0001-0001-000000000003', 'aaa00020-0001-0001-0001-000000000001',
   'bbb00020-0001-0001-0001-000000000001', 'ccc00020-0001-0001-0001-000000000001', 'Pro Tomatoes',
   5, 10.00, 50.00, 0, 0, 5, 2.50, 50.00, 'pickup', 'completed',
   1.75, TRUE, 'pro', now(),
   '00000000-0000-0000-0000-ffffffffffff');  -- already settled

-- T56: enrich_receipt adds stripeFee field
SELECT is(
  (SELECT (enrich_receipt_with_stripe_fee(
    '{"buyerName": "BuyerBob", "total": 50.00}'::JSONB,
    'ddd00020-0004-0001-0001-000000000001'
  ))->>'stripeFee')::NUMERIC,
  1.75::NUMERIC,
  'enrich_receipt: adds stripeFee = $1.75 for Pro order'
);

-- T57: enrich_receipt adds sellerPlan field
SELECT is(
  (SELECT (enrich_receipt_with_stripe_fee(
    '{"buyerName": "BuyerBob", "total": 50.00}'::JSONB,
    'ddd00020-0004-0001-0001-000000000001'
  ))->>'sellerPlan'),
  'pro',
  'enrich_receipt: adds sellerPlan = pro'
);

-- T58: enrich_receipt calculates sellerPayout correctly
-- sellerPayout = subtotal - platform_fee - stripe_fee = 50 - 2.50 - 1.75 = $45.75
SELECT is(
  (SELECT (enrich_receipt_with_stripe_fee(
    '{"buyerName": "BuyerBob", "total": 50.00}'::JSONB,
    'ddd00020-0004-0001-0001-000000000001'
  ))->>'sellerPayout')::NUMERIC,
  45.75::NUMERIC,
  'enrich_receipt: sellerPayout = $45.75 (subtotal - platform_fee - stripe_fee)'
);

-- T59: enrich_receipt preserves existing fields
SELECT is(
  (SELECT (enrich_receipt_with_stripe_fee(
    '{"buyerName": "BuyerBob", "total": 50.00}'::JSONB,
    'ddd00020-0004-0001-0001-000000000001'
  ))->>'buyerName'),
  'BuyerBob',
  'enrich_receipt: preserves existing buyerName field'
);

-- Test with non-Pro order (no stripe fee pass-through)
INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id, product_name,
  quantity, unit_price_usd, subtotal_usd, tax_rate_pct, tax_amount_usd,
  platform_fee_pct, platform_fee_usd, total_usd, fulfillment_type, status,
  stripe_processing_fee_usd, stripe_fee_passed_through, seller_plan, created_at,
  settlement_id)
VALUES
  ('ddd00020-0004-0001-0001-000000000002',
   'aaa00020-0001-0001-0001-000000000003', 'aaa00020-0001-0001-0001-000000000002',
   'bbb00020-0001-0001-0001-000000000002', 'ccc00020-0001-0001-0001-000000000003', 'Free Basil',
   4, 5.00, 20.00, 0, 0, 10, 2.00, 20.00, 'pickup', 'completed',
   0, FALSE, 'free', now(),
   '00000000-0000-0000-0000-ffffffffffff');

-- T60: enrich_receipt for non-Pro order: stripeFee = 0
SELECT is(
  (SELECT (enrich_receipt_with_stripe_fee(
    '{"buyerName": "BuyerBob"}'::JSONB,
    'ddd00020-0004-0001-0001-000000000002'
  ))->>'stripeFee')::NUMERIC,
  0::NUMERIC,
  'enrich_receipt: stripeFee = 0 for non-Pro order'
);

-- T61: enrich_receipt for non-Pro order: sellerPlan = free
SELECT is(
  (SELECT (enrich_receipt_with_stripe_fee(
    '{"buyerName": "BuyerBob"}'::JSONB,
    'ddd00020-0004-0001-0001-000000000002'
  ))->>'sellerPlan'),
  'free',
  'enrich_receipt: sellerPlan = free for non-Pro order'
);

-- T62: enrich_receipt for non-Pro: sellerPayout = subtotal - platform_fee = 20 - 2.00 = $18.00
SELECT is(
  (SELECT (enrich_receipt_with_stripe_fee(
    '{"buyerName": "BuyerBob"}'::JSONB,
    'ddd00020-0004-0001-0001-000000000002'
  ))->>'sellerPayout')::NUMERIC,
  18.00::NUMERIC,
  'enrich_receipt: sellerPayout = $18.00 for non-Pro (no stripe fee deduction)'
);

-- T63: enrich_receipt with non-existent order returns input unchanged
SELECT is(
  enrich_receipt_with_stripe_fee(
    '{"test": "unchanged"}'::JSONB,
    '00000000-0000-0000-0000-000000000000'
  ),
  '{"test": "unchanged"}'::JSONB,
  'enrich_receipt: non-existent order returns input JSONB unchanged'
);

-- ============================================================================
-- SECTION 6: Column existence checks
-- ============================================================================

-- T64: market_orders.stripe_processing_fee_usd column exists
SELECT has_column('market_orders', 'stripe_processing_fee_usd',
  'market_orders has stripe_processing_fee_usd column');

-- T65: market_orders.stripe_fee_passed_through column exists
SELECT has_column('market_orders', 'stripe_fee_passed_through',
  'market_orders has stripe_fee_passed_through column');

-- T66: user_settlements.stripe_fees_usd column exists
SELECT has_column('user_settlements', 'stripe_fees_usd',
  'user_settlements has stripe_fees_usd column');

-- T67: seller_subscriptions table exists
SELECT has_table('seller_subscriptions',
  'seller_subscriptions table exists');

-- T68: seller_subscriptions.absorb_stripe_fees column exists
SELECT has_column('seller_subscriptions', 'absorb_stripe_fees',
  'seller_subscriptions has absorb_stripe_fees column');

-- ============================================================================
-- SECTION 7: Edge cases
-- ============================================================================

-- T69: Trigger on 'delivered' status also works
INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id, product_name,
  quantity, unit_price_usd, subtotal_usd, tax_rate_pct, tax_amount_usd,
  platform_fee_pct, platform_fee_usd, total_usd, fulfillment_type, status, created_at,
  settlement_id)
VALUES
  ('ddd00020-0005-0001-0001-000000000001',
   'aaa00020-0001-0001-0001-000000000003', 'aaa00020-0001-0001-0001-000000000001',
   'bbb00020-0001-0001-0001-000000000001', 'ccc00020-0001-0001-0001-000000000001', 'Pro Tomatoes',
   10, 10.00, 100.00, 0, 0, 5, 5.00, 100.00, 'delivery', 'pending', now(),
   '00000000-0000-0000-0000-ffffffffffff');

UPDATE market_orders SET status = 'delivered' WHERE id = 'ddd00020-0005-0001-0001-000000000001';

-- stripe fee = 100 * 0.029 + 0.30 = $3.20
SELECT is(
  (SELECT stripe_processing_fee_usd FROM market_orders WHERE id = 'ddd00020-0005-0001-0001-000000000001'),
  3.20::NUMERIC(10,2),
  'Edge: delivered status also triggers stripe fee ($3.20 on $100)'
);

-- T70: Trigger does NOT fire when status changes to 'cancelled'
INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id, product_name,
  quantity, unit_price_usd, subtotal_usd, tax_rate_pct, tax_amount_usd,
  platform_fee_pct, platform_fee_usd, total_usd, fulfillment_type, status, created_at,
  settlement_id)
VALUES
  ('ddd00020-0005-0001-0001-000000000002',
   'aaa00020-0001-0001-0001-000000000003', 'aaa00020-0001-0001-0001-000000000001',
   'bbb00020-0001-0001-0001-000000000001', 'ccc00020-0001-0001-0001-000000000001', 'Pro Tomatoes',
   3, 10.00, 30.00, 0, 0, 5, 1.50, 30.00, 'pickup', 'pending', now(),
   '00000000-0000-0000-0000-ffffffffffff');

UPDATE market_orders SET status = 'cancelled' WHERE id = 'ddd00020-0005-0001-0001-000000000002';

SELECT is(
  (SELECT stripe_processing_fee_usd FROM market_orders WHERE id = 'ddd00020-0005-0001-0001-000000000002'),
  0.00::NUMERIC(10,2),
  'Edge: cancelled status does NOT trigger stripe fee (stays $0)'
);

-- T71: Zero-dollar edge case (hypothetical $0 order — fee = $0.30)
INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id, product_name,
  quantity, unit_price_usd, subtotal_usd, tax_rate_pct, tax_amount_usd,
  platform_fee_pct, platform_fee_usd, total_usd, fulfillment_type, status, created_at,
  settlement_id)
VALUES
  ('ddd00020-0005-0001-0001-000000000003',
   'aaa00020-0001-0001-0001-000000000003', 'aaa00020-0001-0001-0001-000000000001',
   'bbb00020-0001-0001-0001-000000000001', 'ccc00020-0001-0001-0001-000000000001', 'Pro Tomatoes',
   1, 0.00, 0.00, 0, 0, 5, 0.00, 0.00, 'pickup', 'pending', now(),
   '00000000-0000-0000-0000-ffffffffffff');

UPDATE market_orders SET status = 'completed' WHERE id = 'ddd00020-0005-0001-0001-000000000003';

SELECT is(
  (SELECT stripe_processing_fee_usd FROM market_orders WHERE id = 'ddd00020-0005-0001-0001-000000000003'),
  0.30::NUMERIC(10,2),
  'Edge: $0 order gets $0.30 stripe fee (fixed component only)'
);

-- T72: Re-running settlement for already-settled date returns error
SELECT is(
  (SELECT (run_market_settlement(CURRENT_DATE + 301))->>'error'),
  'No unsettled orders to process',
  'Re-running settlement returns no unsettled orders'
);

SELECT * FROM finish();
ROLLBACK;
