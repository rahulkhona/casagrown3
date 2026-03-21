-- ============================================================================
-- pgTAP Tests: Cash Flow System
-- Tests: platform_bank_ledger, buyer_debts, reconciliation, blocking,
--        post-settlement refunds, admin RPCs
-- ============================================================================
BEGIN;
SELECT plan(38);

-- ============================================================================
-- Cleanup: Tag existing seed orders as settled
-- ============================================================================
INSERT INTO market_settlements (id, market_date, status) VALUES
  ('00000000-0000-0000-0000-ffffffffffff', '2020-01-01', 'cleared')
ON CONFLICT (id) DO NOTHING;
UPDATE market_orders SET settlement_id = '00000000-0000-0000-0000-ffffffffffff'
WHERE settlement_id IS NULL;

-- ============================================================================
-- 1. Tables exist
-- ============================================================================
SELECT has_table('platform_bank_ledger', 'platform_bank_ledger exists');
SELECT has_table('buyer_debts', 'buyer_debts exists');

-- ============================================================================
-- 2. Functions exist
-- ============================================================================
SELECT has_function('append_bank_ledger_entry', 'append_bank_ledger_entry exists');
SELECT has_function('get_platform_bank_balance', 'get_platform_bank_balance exists');
SELECT has_function('get_platform_bank_statement', 'get_platform_bank_statement exists');
SELECT has_function('is_buyer_blocked', 'is_buyer_blocked exists');
SELECT has_function('auto_recover_buyer_debt', 'auto_recover_buyer_debt exists');
SELECT has_function('platform_cash_position', 'platform_cash_position exists');
SELECT has_function('reconcile_platform_balances', 'reconcile_platform_balances exists');
SELECT has_function('process_post_settlement_refund', 'process_post_settlement_refund exists');
SELECT has_function('get_settlements_admin', 'get_settlements_admin exists');
SELECT has_function('get_failed_captures_admin', 'get_failed_captures_admin exists');
SELECT has_function('get_reconciliation_status', 'get_reconciliation_status exists');

-- ============================================================================
-- 3. Setup test users
-- ============================================================================
INSERT INTO auth.users (id, email, raw_user_meta_data, instance_id, aud, role, encrypted_password, confirmation_token, email_confirmed_at)
VALUES
  ('cf000001-0001-0001-0001-000000000001', 'cf-seller@test.com', '{"full_name":"CF Seller"}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', crypt('password', gen_salt('bf')), '', now()),
  ('cf000001-0001-0001-0001-000000000002', 'cf-buyer@test.com', '{"full_name":"CF Buyer"}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', crypt('password', gen_salt('bf')), '', now()),
  ('cf000001-0001-0001-0001-000000000099', 'cf-staff@test.com', '{"full_name":"CF Staff"}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', crypt('password', gen_salt('bf')), '', now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, full_name, email) VALUES
  ('cf000001-0001-0001-0001-000000000001', 'CF Seller', 'cf-seller@test.com'),
  ('cf000001-0001-0001-0001-000000000002', 'CF Buyer', 'cf-buyer@test.com'),
  ('cf000001-0001-0001-0001-000000000099', 'CF Staff', 'cf-staff@test.com')
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

-- Make staff user
INSERT INTO staff_members (user_id, email, granted_by)
VALUES ('cf000001-0001-0001-0001-000000000099', 'cf-staff@test.com', 'cf000001-0001-0001-0001-000000000099')
ON CONFLICT DO NOTHING;

-- Capture starting balance (may be non-zero from other test runs)
DO $$ BEGIN
  PERFORM set_config('test.start_balance',
    COALESCE((SELECT balance_after::text FROM platform_bank_ledger ORDER BY id DESC LIMIT 1), '0'),
    true);
END $$;

SELECT ok(
  append_bank_ledger_entry('stripe_payout_received', 'inflow', 100.00, 'stripe', 'payout', 'po_test1') > 0,
  'Bank ledger: first entry returns positive id'
);

SELECT is(
  (SELECT balance_after FROM platform_bank_ledger ORDER BY id DESC LIMIT 1),
  (current_setting('test.start_balance')::NUMERIC + 100.00)::NUMERIC(10,2),
  'Bank ledger: balance increases by $100 after inflow'
);

-- Outflow
SELECT append_bank_ledger_entry('cashout_sent', 'outflow', 25.00, 'paypal', 'redemption', 'red_001');

SELECT is(
  (SELECT balance_after FROM platform_bank_ledger ORDER BY id DESC LIMIT 1),
  (current_setting('test.start_balance')::NUMERIC + 75.00)::NUMERIC(10,2),
  'Bank ledger: balance is start+$75 after $25 outflow'
);

-- Second inflow
SELECT append_bank_ledger_entry('stripe_payout_received', 'inflow', 50.00, 'stripe', 'payout', 'po_test2');

SELECT is(
  (SELECT balance_after FROM platform_bank_ledger ORDER BY id DESC LIMIT 1),
  (current_setting('test.start_balance')::NUMERIC + 125.00)::NUMERIC(10,2),
  'Bank ledger: balance is start+$125 after another $50 inflow'
);

-- Consistency: running balance = SUM of inflows - outflows
SELECT is(
  (SELECT balance_after FROM platform_bank_ledger ORDER BY id DESC LIMIT 1),
  (SELECT COALESCE(SUM(CASE WHEN direction = 'inflow' THEN amount_usd ELSE -amount_usd END), 0) FROM platform_bank_ledger),
  'Bank ledger integrity: running balance = computed SUM'
);

-- ============================================================================
-- 5. Full settlement + bank ledger flow
-- ============================================================================

-- Create booth, product, and orders for settlement test
INSERT INTO market_booths (id, owner_id, name)
VALUES ('cfbbbbbb-0001-0001-0001-000000000001', 'cf000001-0001-0001-0001-000000000001', 'CF Farm')
ON CONFLICT (id) DO NOTHING;

INSERT INTO market_products (id, seller_id, market_date, name, category, price_usd, unit, inventory, is_active)
VALUES ('cfcccccc-0001-0001-0001-000000000001', 'cf000001-0001-0001-0001-000000000001', CURRENT_DATE + 1, 'CF Apples', 'produce', 10.00, 'lb', 100, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id, product_name,
  quantity, unit_price_usd, subtotal_usd, tax_rate_pct, tax_amount_usd,
  platform_fee_pct, platform_fee_usd, total_usd, fulfillment_type, status, created_at)
VALUES
  ('cfdddddd-0001-0001-0001-000000000001',
   'cf000001-0001-0001-0001-000000000002', 'cf000001-0001-0001-0001-000000000001',
   'cfbbbbbb-0001-0001-0001-000000000001', 'cfcccccc-0001-0001-0001-000000000001', 'CF Apples',
   5, 10.00, 50.00, 0, 0, 10, 5.00, 50.00, 'pickup', 'completed', (CURRENT_DATE + 1)::timestamptz);

-- Hold for buyer
INSERT INTO market_holds (id, buyer_id, stripe_payment_intent_id, stripe_client_secret, hold_amount_cents, spent_amount_cents, status)
VALUES ('cfeeeeee-0001-0001-0001-000000000001', 'cf000001-0001-0001-0001-000000000002', 'pi_cf_buyer', 'secret_cf', 7500, 5000, 'active');

-- Run settlement
SELECT lives_ok(
  $$SELECT run_market_settlement(CURRENT_DATE + 1)$$,
  'Settlement runs without error'
);

-- Settlement should be in funds_pending
SELECT is(
  (SELECT status::text FROM market_settlements WHERE market_date = CURRENT_DATE + 1),
  'funds_pending',
  'Settlement is in funds_pending state'
);

-- Seller should have pending balance
SELECT is(
  (SELECT pending_usd FROM user_balances WHERE user_id = 'cf000001-0001-0001-0001-000000000001'),
  45.00::NUMERIC(10,2),
  'Seller: pending_usd = $45.00 (sale $50 - fee $5)'
);

-- Simulate bank deposit: record inflow and confirm
-- Settlement captured $50 from buyer. Expected Stripe payout after fees:
-- Fees = ($50 * 0.029) + (1 * $0.30) = $1.75. Expected = $50 - $1.75 = $48.25
SELECT append_bank_ledger_entry(
  'stripe_payout_received', 'inflow', 48.25, 'stripe', 'settlement',
  (SELECT id::text FROM market_settlements WHERE market_date = CURRENT_DATE + 1),
  (SELECT id FROM market_settlements WHERE market_date = CURRENT_DATE + 1)
);

SELECT lives_ok(
  $$SELECT confirm_settlement_funds_received(
    (SELECT id FROM market_settlements WHERE market_date = CURRENT_DATE + 1),
    'po_cf_test_1',
    48.25
  )$$,
  'confirm_settlement_funds_received after bank deposit'
);

-- Settlement cleared
SELECT is(
  (SELECT status::text FROM market_settlements WHERE market_date = CURRENT_DATE + 1),
  'cleared',
  'Settlement cleared after funds confirmed'
);

-- Seller now has available balance
SELECT is(
  (SELECT available_usd FROM user_balances WHERE user_id = 'cf000001-0001-0001-0001-000000000001'),
  45.00::NUMERIC(10,2),
  'Seller: available_usd = $45 after clearing'
);

-- ============================================================================
-- 6. Buyer debts and blocking
-- ============================================================================

-- Create a buyer debt (simulating failed capture)
INSERT INTO buyer_debts (buyer_id, settlement_id, amount_usd, reason, stripe_payment_intent_id, error_message)
VALUES (
  'cf000001-0001-0001-0001-000000000002',
  (SELECT id FROM market_settlements WHERE market_date = CURRENT_DATE + 1),
  20.00, 'capture_failed', 'pi_cf_buyer', 'Card declined'
);

-- Buyer should be blocked
SELECT is(
  (is_buyer_blocked('cf000001-0001-0001-0001-000000000002'))->>'blocked',
  'true',
  'Buyer with outstanding debt is blocked'
);

SELECT is(
  ((is_buyer_blocked('cf000001-0001-0001-0001-000000000002'))->>'total_debt_usd')::NUMERIC,
  20.00::NUMERIC,
  'Buyer debt total = $20'
);

-- Seller should NOT be blocked
SELECT is(
  (is_buyer_blocked('cf000001-0001-0001-0001-000000000001'))->>'blocked',
  'false',
  'Seller with no debt is not blocked'
);

-- ============================================================================
-- 7. Auto-recovery of buyer debt
-- ============================================================================

-- Give buyer some available balance
INSERT INTO user_balances (user_id, available_usd) VALUES
  ('cf000001-0001-0001-0001-000000000002', 30.00)
ON CONFLICT (user_id) DO UPDATE SET available_usd = 30.00;

-- Auto-recover
SELECT lives_ok(
  $$SELECT auto_recover_buyer_debt('cf000001-0001-0001-0001-000000000002')$$,
  'auto_recover_buyer_debt runs without error'
);

-- Debt should be recovered
SELECT is(
  (SELECT status FROM buyer_debts WHERE buyer_id = 'cf000001-0001-0001-0001-000000000002' AND reason = 'capture_failed'),
  'recovered',
  'Debt status = recovered after auto-recovery'
);

-- Buyer balance should be reduced
SELECT is(
  (SELECT available_usd FROM user_balances WHERE user_id = 'cf000001-0001-0001-0001-000000000002'),
  10.00::NUMERIC(10,2),
  'Buyer available_usd = $10 after $20 debt recovery from $30'
);

-- Buyer should no longer be blocked
SELECT is(
  (is_buyer_blocked('cf000001-0001-0001-0001-000000000002'))->>'blocked',
  'false',
  'Buyer is unblocked after debt recovery'
);

-- ============================================================================
-- 8. Post-settlement refund (staff-only)
-- ============================================================================

-- Set auth context to staff user
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"cf000001-0001-0001-0001-000000000099","role":"authenticated","email":"cf-staff@test.com"}';

SELECT lives_ok(
  $$SELECT process_post_settlement_refund(
    'cfdddddd-0001-0001-0001-000000000001',
    15.00,
    'quality_issue'
  )$$,
  'Post-settlement refund runs without error'
);
-- Reset role so we can read user_balances without RLS
RESET ROLE;

-- Seller balance decreased
SELECT is(
  (SELECT available_usd FROM user_balances WHERE user_id = 'cf000001-0001-0001-0001-000000000001'),
  30.00::NUMERIC(10,2),
  'Seller: available_usd = $30 after $15 refund ($45 - $15)'
);

-- Buyer balance increased
SELECT is(
  (SELECT available_usd FROM user_balances WHERE user_id = 'cf000001-0001-0001-0001-000000000002'),
  25.00::NUMERIC(10,2),
  'Buyer: available_usd = $25 after $15 refund ($10 + $15)'
);

RESET ROLE;

-- ============================================================================
-- 9. Reconciliation
-- ============================================================================

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"cf000001-0001-0001-0001-000000000099","role":"authenticated","email":"cf-staff@test.com"}';

SELECT is(
  (reconcile_platform_balances()->>'healthy')::boolean,
  true,
  'reconcile_platform_balances reports healthy'
);

SELECT is(
  jsonb_array_length(reconcile_platform_balances()->'discrepancies'),
  0,
  'reconcile_platform_balances has zero discrepancies'
);

RESET ROLE;

-- ============================================================================
-- 10. Platform cash position
-- ============================================================================

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"cf000001-0001-0001-0001-000000000099","role":"authenticated","email":"cf-staff@test.com"}';

SELECT ok(
  (platform_cash_position()->>'bank_balance_usd') IS NOT NULL,
  'platform_cash_position returns bank_balance_usd'
);

SELECT ok(
  (platform_cash_position()->>'is_healthy') IS NOT NULL,
  'platform_cash_position returns is_healthy flag'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
