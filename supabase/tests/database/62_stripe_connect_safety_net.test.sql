-- ============================================================================
-- Stripe Connect Safety Net Tests
-- Tests: C2 (wallet fallback), C3 (deauthorization), C4 (transfer reversal),
--        restore_wallet_after_failed_transfer RPC, and constraint validation
-- ============================================================================

BEGIN;

SELECT plan(28);

-- ── Cleanup ──────────────────────────────────────────────────────────────────
DELETE FROM market_ledger WHERE user_id::text LIKE 'ee000000-0000-0000-0000-%';
DELETE FROM platform_bank_ledger WHERE settlement_id IN (SELECT id FROM market_settlements WHERE market_date = CURRENT_DATE + 600);
DELETE FROM settlement_captures WHERE settlement_id IN (SELECT id FROM market_settlements WHERE market_date = CURRENT_DATE + 600);
DELETE FROM user_settlements WHERE settlement_id IN (SELECT id FROM market_settlements WHERE market_date = CURRENT_DATE + 600);
DELETE FROM market_settlements WHERE market_date = CURRENT_DATE + 600;

-- Park any unsettled orders so they don't contaminate our run
INSERT INTO market_settlements (id, market_date, status) VALUES
  ('ee000000-0000-0000-0000-fffffffffa01', '1999-12-30'::date, 'cleared')
ON CONFLICT (id) DO NOTHING;
UPDATE market_orders SET settlement_id = 'ee000000-0000-0000-0000-fffffffffa01'
WHERE settlement_id IS NULL;

-- ── Setup Test Users ─────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email)
VALUES
  ('ee000000-0000-0000-0000-000000000c01'::uuid, 'safety-seller1@test.local'),
  ('ee000000-0000-0000-0000-000000000c02'::uuid, 'safety-seller2@test.local'),
  ('ee000000-0000-0000-0000-000000000c03'::uuid, 'safety-seller3@test.local'),
  ('ee000000-0000-0000-0000-000000000c04'::uuid, 'safety-buyer@test.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, email, full_name, stripe_connect_id, stripe_onboarding_completed, stripe_connect_active)
VALUES
  ('ee000000-0000-0000-0000-000000000c01', 'safety-seller1@test.local', 'Safety Seller 1', 'acct_safety_1', true, true),
  ('ee000000-0000-0000-0000-000000000c02', 'safety-seller2@test.local', 'Safety Seller 2', 'acct_safety_2', true, true),
  ('ee000000-0000-0000-0000-000000000c03', 'safety-seller3@test.local', 'Safety Seller 3', 'acct_safety_3', true, true),
  ('ee000000-0000-0000-0000-000000000c04', 'safety-buyer@test.local', 'Safety Buyer', NULL, false, false)
ON CONFLICT (id) DO UPDATE SET
  stripe_connect_id = EXCLUDED.stripe_connect_id,
  stripe_connect_active = EXCLUDED.stripe_connect_active,
  stripe_onboarding_completed = EXCLUDED.stripe_onboarding_completed;

-- Zeroed balances
INSERT INTO user_balances (user_id, available_usd, pending_usd, total_earned_usd, total_withdrawn_usd)
VALUES
  ('ee000000-0000-0000-0000-000000000c01', 0, 0, 0, 0),
  ('ee000000-0000-0000-0000-000000000c02', 0, 0, 0, 0),
  ('ee000000-0000-0000-0000-000000000c03', 0, 0, 0, 0),
  ('ee000000-0000-0000-0000-000000000c04', 0, 0, 0, 0)
ON CONFLICT (user_id) DO UPDATE SET
  available_usd = 0, pending_usd = 0, total_earned_usd = 0, total_withdrawn_usd = 0;

-- ── Setup Booths, Products, Orders ───────────────────────────────────────────
DELETE FROM market_booths WHERE owner_id IN ('ee000000-0000-0000-0000-000000000c01', 'ee000000-0000-0000-0000-000000000c02', 'ee000000-0000-0000-0000-000000000c03');

INSERT INTO market_booths (id, owner_id, name)
VALUES
  ('ee000000-0000-0000-0000-000000001c01', 'ee000000-0000-0000-0000-000000000c01', 'Safety Booth 1'),
  ('ee000000-0000-0000-0000-000000001c02', 'ee000000-0000-0000-0000-000000000c02', 'Safety Booth 2'),
  ('ee000000-0000-0000-0000-000000001c03', 'ee000000-0000-0000-0000-000000000c03', 'Safety Booth 3')
ON CONFLICT (id) DO NOTHING;

INSERT INTO market_products (id, seller_id, market_date, name, category, price_usd, unit, inventory, is_active)
VALUES
  ('ee000000-0000-0000-0000-000000002c01', 'ee000000-0000-0000-0000-000000000c01', CURRENT_DATE + 600, 'Apples', 'produce', 100.00, 'lb', 10, true),
  ('ee000000-0000-0000-0000-000000002c02', 'ee000000-0000-0000-0000-000000000c02', CURRENT_DATE + 600, 'Berries', 'produce', 80.00, 'lb', 10, true),
  ('ee000000-0000-0000-0000-000000002c03', 'ee000000-0000-0000-0000-000000000c03', CURRENT_DATE + 600, 'Cherries', 'produce', 60.00, 'lb', 10, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id, product_name, quantity, unit_price_usd, subtotal_usd, tax_rate_pct, tax_amount_usd, platform_fee_pct, platform_fee_usd, total_usd, fulfillment_type, status, created_at)
VALUES
  ('ee000000-0000-0000-0000-000000003c01', 'ee000000-0000-0000-0000-000000000c04', 'ee000000-0000-0000-0000-000000000c01', 'ee000000-0000-0000-0000-000000001c01', 'ee000000-0000-0000-0000-000000002c01', 'Apples', 1, 100.00, 100.00, 0, 0, 10, 10.00, 100.00, 'pickup', 'completed', (CURRENT_DATE + 600)::timestamptz),
  ('ee000000-0000-0000-0000-000000003c02', 'ee000000-0000-0000-0000-000000000c04', 'ee000000-0000-0000-0000-000000000c02', 'ee000000-0000-0000-0000-000000001c02', 'ee000000-0000-0000-0000-000000002c02', 'Berries', 1, 80.00, 80.00, 0, 0, 10, 8.00, 80.00, 'pickup', 'completed', (CURRENT_DATE + 600)::timestamptz),
  ('ee000000-0000-0000-0000-000000003c03', 'ee000000-0000-0000-0000-000000000c04', 'ee000000-0000-0000-0000-000000000c03', 'ee000000-0000-0000-0000-000000001c03', 'ee000000-0000-0000-0000-000000002c03', 'Cherries', 1, 60.00, 60.00, 0, 0, 10, 6.00, 60.00, 'pickup', 'completed', (CURRENT_DATE + 600)::timestamptz)
ON CONFLICT (id) DO NOTHING;

INSERT INTO market_holds (id, buyer_id, stripe_payment_intent_id, stripe_client_secret, hold_amount_cents, spent_amount_cents, status)
VALUES ('ee000000-0000-0000-0000-00000000ec01', 'ee000000-0000-0000-0000-000000000c04', 'pi_safety_240', 'secret_safety', 24000, 24000, 'active')
ON CONFLICT (id) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════
-- TEST 1: Run settlement
-- ══════════════════════════════════════════════════════════════════════════
SELECT lives_ok(
  $$SELECT run_market_settlement(CURRENT_DATE + 600)$$,
  'Settlement runs without error'
);

-- TEST 2-4: All 3 Stripe sellers are stripe_transfer_pending
SELECT is(
  (SELECT status FROM user_settlements
   WHERE settlement_id = (SELECT settlement_id FROM market_orders WHERE id = 'ee000000-0000-0000-0000-000000003c01')
     AND user_id = 'ee000000-0000-0000-0000-000000000c01'),
  'stripe_transfer_pending',
  'Seller 1: stripe_transfer_pending'
);

SELECT is(
  (SELECT status FROM user_settlements
   WHERE settlement_id = (SELECT settlement_id FROM market_orders WHERE id = 'ee000000-0000-0000-0000-000000003c01')
     AND user_id = 'ee000000-0000-0000-0000-000000000c02'),
  'stripe_transfer_pending',
  'Seller 2: stripe_transfer_pending'
);

SELECT is(
  (SELECT status FROM user_settlements
   WHERE settlement_id = (SELECT settlement_id FROM market_orders WHERE id = 'ee000000-0000-0000-0000-000000003c01')
     AND user_id = 'ee000000-0000-0000-0000-000000000c03'),
  'stripe_transfer_pending',
  'Seller 3: stripe_transfer_pending'
);

-- TEST 5-7: All sellers have pending_usd = 0 (netted for Stripe)
SELECT is(
  (SELECT pending_usd FROM user_balances WHERE user_id = 'ee000000-0000-0000-0000-000000000c01'),
  0.00::NUMERIC(10,2),
  'Seller 1: pending_usd = $0.00 (netted for Stripe)'
);

SELECT is(
  (SELECT pending_usd FROM user_balances WHERE user_id = 'ee000000-0000-0000-0000-000000000c02'),
  0.00::NUMERIC(10,2),
  'Seller 2: pending_usd = $0.00 (netted for Stripe)'
);

SELECT is(
  (SELECT pending_usd FROM user_balances WHERE user_id = 'ee000000-0000-0000-0000-000000000c03'),
  0.00::NUMERIC(10,2),
  'Seller 3: pending_usd = $0.00 (netted for Stripe)'
);

-- TEST 8: payout_sent ledger debit exists
SELECT is(
  (SELECT COUNT(*) FROM market_ledger
   WHERE user_id = 'ee000000-0000-0000-0000-000000000c01'
     AND event_type = 'payout_sent' AND direction = 'debit')::INTEGER,
  1,
  'Seller 1: has payout_sent debit'
);

-- ══════════════════════════════════════════════════════════════════════════
-- C2: Test wallet fallback on failed transfer
-- ══════════════════════════════════════════════════════════════════════════

-- Simulate transfer failure for Seller 1
UPDATE user_settlements
SET status = 'stripe_transfer_failed', stripe_transfer_error = 'Test: account deauthorized'
WHERE user_id = 'ee000000-0000-0000-0000-000000000c01'
  AND status = 'stripe_transfer_pending';

-- TEST 9: restore_wallet RPC succeeds
SELECT is(
  (SELECT (restore_wallet_after_failed_transfer(
    (SELECT id FROM user_settlements WHERE user_id = 'ee000000-0000-0000-0000-000000000c01' AND status = 'stripe_transfer_failed'),
    'stripe_transfer_failed',
    'Test: account deauthorized',
    'wallet_fallback'
  ))->>'success'),
  'true',
  'restore_wallet_after_failed_transfer: succeeds'
);

-- TEST 10: Status changed to wallet_fallback
SELECT is(
  (SELECT status FROM user_settlements
   WHERE user_id = 'ee000000-0000-0000-0000-000000000c01'
   ORDER BY created_at DESC LIMIT 1),
  'wallet_fallback',
  'Seller 1: status = wallet_fallback'
);

-- TEST 11: pending_usd restored (net $90 = $100 - $10 fee)
SELECT is(
  (SELECT pending_usd FROM user_balances WHERE user_id = 'ee000000-0000-0000-0000-000000000c01'),
  90.00::NUMERIC(10,2),
  'Seller 1: pending_usd restored to $90.00'
);

-- TEST 12: Ledger has reversal credit entry
SELECT is(
  (SELECT COUNT(*) FROM market_ledger
   WHERE user_id = 'ee000000-0000-0000-0000-000000000c01'
     AND event_type = 'stripe_transfer_reversed'
     AND direction = 'credit')::INTEGER,
  1,
  'Seller 1: has stripe_transfer_reversed credit in ledger'
);

-- TEST 13: Ledger balance consistency after reversal
SELECT is(
  (SELECT balance_after FROM market_ledger
   WHERE user_id = 'ee000000-0000-0000-0000-000000000c01'
   ORDER BY id DESC LIMIT 1),
  (SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_usd ELSE -amount_usd END), 0)
   FROM market_ledger WHERE user_id = 'ee000000-0000-0000-0000-000000000c01'),
  'Seller 1: ledger balance_after consistent after reversal'
);

-- ══════════════════════════════════════════════════════════════════════════
-- C2: Idempotency — double restore is a no-op
-- ══════════════════════════════════════════════════════════════════════════

-- TEST 14: Double-restore returns error
SELECT is(
  (SELECT (restore_wallet_after_failed_transfer(
    (SELECT id FROM user_settlements WHERE user_id = 'ee000000-0000-0000-0000-000000000c01' ORDER BY created_at DESC LIMIT 1),
    'stripe_transfer_failed',
    'Double-call test',
    'wallet_fallback'
  ))->>'error' IS NOT NULL)::TEXT,
  'true',
  'Double-restore returns error (idempotent)'
);

-- TEST 15: pending_usd not doubled
SELECT is(
  (SELECT pending_usd FROM user_balances WHERE user_id = 'ee000000-0000-0000-0000-000000000c01'),
  90.00::NUMERIC(10,2),
  'Seller 1: pending_usd still $90.00 (no double-credit)'
);

-- ══════════════════════════════════════════════════════════════════════════
-- C4: Transfer reversal (Seller 2 — paid_out then reversed)
-- ══════════════════════════════════════════════════════════════════════════

-- Simulate: transfer succeeded, then Stripe reversed it later
UPDATE user_settlements
SET status = 'paid_out',
    stripe_transfer_id = 'tr_safety_test_002',
    stripe_transfer_completed_at = now()
WHERE user_id = 'ee000000-0000-0000-0000-000000000c02'
  AND status = 'stripe_transfer_pending';

-- TEST 16: restore works for paid_out → stripe_transfer_reversed
SELECT is(
  (SELECT (restore_wallet_after_failed_transfer(
    (SELECT id FROM user_settlements WHERE user_id = 'ee000000-0000-0000-0000-000000000c02' AND status = 'paid_out'),
    'transfer.reversed',
    'Bank rejected ACH deposit',
    'stripe_transfer_reversed'
  ))->>'success'),
  'true',
  'Reversal: restore_wallet succeeds for paid_out transfer'
);

-- TEST 17: Status = stripe_transfer_reversed
SELECT is(
  (SELECT status FROM user_settlements
   WHERE user_id = 'ee000000-0000-0000-0000-000000000c02'
   ORDER BY created_at DESC LIMIT 1),
  'stripe_transfer_reversed',
  'Seller 2: status = stripe_transfer_reversed'
);

-- TEST 18: pending_usd restored ($72 = $80 - $8 fee)
SELECT is(
  (SELECT pending_usd FROM user_balances WHERE user_id = 'ee000000-0000-0000-0000-000000000c02'),
  72.00::NUMERIC(10,2),
  'Seller 2: pending_usd restored to $72.00'
);

-- ══════════════════════════════════════════════════════════════════════════
-- C3: Deauthorization (Seller 3)
-- ══════════════════════════════════════════════════════════════════════════

-- Simulate webhook deactivation
UPDATE profiles
SET stripe_connect_active = false, stripe_onboarding_completed = false
WHERE id = 'ee000000-0000-0000-0000-000000000c03';

INSERT INTO stripe_connect_audit_log
  (user_id, changed_by, old_active, new_active, old_onboarding_completed, new_onboarding_completed, reason)
VALUES
  ('ee000000-0000-0000-0000-000000000c03', 'webhook', true, false, true, false,
   'account.application.deauthorized: Seller disconnected their Stripe account');

-- TEST 19: Connect deactivated
SELECT is(
  (SELECT stripe_connect_active FROM profiles WHERE id = 'ee000000-0000-0000-0000-000000000c03'),
  false,
  'Seller 3: stripe_connect_active = false after deauth'
);

-- TEST 20: Audit log entry exists
SELECT is(
  (SELECT COUNT(*) FROM stripe_connect_audit_log
   WHERE user_id = 'ee000000-0000-0000-0000-000000000c03'
     AND changed_by = 'webhook'
     AND new_active = false)::INTEGER,
  1,
  'Seller 3: audit log has deauth entry'
);

-- ══════════════════════════════════════════════════════════════════════════
-- Constraint validation
-- ══════════════════════════════════════════════════════════════════════════

-- TEST 21: wallet_fallback status is valid
SELECT lives_ok(
  $$ UPDATE user_settlements SET status = 'wallet_fallback'
     WHERE user_id = 'ee000000-0000-0000-0000-000000000c01'
       AND status = 'wallet_fallback' $$,
  'wallet_fallback passes CHECK constraint'
);

-- TEST 22: stripe_transfer_reversed status is valid
SELECT lives_ok(
  $$ UPDATE user_settlements SET status = 'stripe_transfer_reversed'
     WHERE user_id = 'ee000000-0000-0000-0000-000000000c02'
       AND status = 'stripe_transfer_reversed' $$,
  'stripe_transfer_reversed passes CHECK constraint'
);

-- ══════════════════════════════════════════════════════════════════════════
-- G7: get_transaction_log includes stripe_transfer_reversed entries
-- ══════════════════════════════════════════════════════════════════════════

-- Set session auth to seller 1 so get_transaction_log uses their uid
SET LOCAL ROLE postgres;
SET LOCAL "request.jwt.claims" = '{"sub": "ee000000-0000-0000-0000-000000000c01", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

-- TEST 23: stripe_transfer_reversed entry appears in transaction log
SELECT is(
  (SELECT COUNT(*)::INTEGER FROM get_transaction_log()
   WHERE tx_type = 'stripe_transfer_reversed'),
  1,
  'G7: get_transaction_log returns stripe_transfer_reversed entry'
);

-- TEST 24: reversal entry has correct description
SELECT ok(
  (SELECT description FROM get_transaction_log()
   WHERE tx_type = 'stripe_transfer_reversed' LIMIT 1)
  LIKE '%funds restored to wallet%',
  'G7: reversal description mentions funds restored to wallet'
);

-- ══════════════════════════════════════════════════════════════════════════
-- G8: processing_payouts_usd includes stripe_transfer_pending amounts
-- ══════════════════════════════════════════════════════════════════════════

-- Seller 3 still has stripe_transfer_pending status (never failed/reversed)
-- Switch to Seller 3 to check their summary
RESET ROLE;
SET LOCAL ROLE postgres;
SET LOCAL "request.jwt.claims" = '{"sub": "ee000000-0000-0000-0000-000000000c03", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

-- TEST 25: processing_payouts_usd includes in-transit Stripe transfer
SELECT ok(
  (SELECT (get_transaction_summary())->'processing_payouts_usd')::NUMERIC > 0,
  'G8: processing_payouts_usd > 0 for seller with stripe_transfer_pending'
);

-- TEST 26: processing_payouts_usd equals the net payout amount ($54 = $60 - $6 fee)
SELECT is(
  (SELECT (get_transaction_summary())->'processing_payouts_usd')::NUMERIC(10,2),
  54.00::NUMERIC(10,2),
  'G8: processing_payouts_usd = $54.00 (Seller 3 net payout)'
);

-- ══════════════════════════════════════════════════════════════════════════
-- Cross-seller isolation: Seller 1's restore didn't affect Seller 3
-- ══════════════════════════════════════════════════════════════════════════

RESET ROLE;

-- TEST 27: Seller 3's pending_usd is still 0 (transfer still in-transit, not in wallet)
SELECT is(
  (SELECT pending_usd FROM user_balances WHERE user_id = 'ee000000-0000-0000-0000-000000000c03'),
  0.00::NUMERIC(10,2),
  'Seller 3: pending_usd = $0 (still in Stripe transfer, not wallet)'
);

-- TEST 28: Seller 3's user_settlement is still stripe_transfer_pending
SELECT is(
  (SELECT status FROM user_settlements
   WHERE user_id = 'ee000000-0000-0000-0000-000000000c03'
   ORDER BY created_at DESC LIMIT 1),
  'stripe_transfer_pending',
  'Seller 3: still stripe_transfer_pending (not affected by Seller 1 restore)'
);

SELECT * FROM finish();

ROLLBACK;
