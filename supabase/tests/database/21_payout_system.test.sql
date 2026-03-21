-- ============================================================================
-- pgTAP Tests: Payout System — debit_market_balance, auto-payout eligibility,
-- concurrent debit safety, and market_ledger integrity
-- ============================================================================
BEGIN;
SELECT plan(32);

-- ============================================================================
-- Setup: test users with known balances
-- ============================================================================
INSERT INTO auth.users (id, email, raw_user_meta_data, instance_id, aud, role, encrypted_password, confirmation_token, email_confirmed_at)
VALUES
  ('aa000001-0001-0001-0001-000000000001', 'pa-seller1@test.com', '{"full_name":"PA Seller 1"}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', crypt('password', gen_salt('bf')), '', now()),
  ('aa000001-0001-0001-0001-000000000002', 'pa-seller2@test.com', '{"full_name":"PA Seller 2"}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', crypt('password', gen_salt('bf')), '', now()),
  ('aa000001-0001-0001-0001-000000000003', 'pa-bigbalance@test.com', '{"full_name":"PA Big Balance"}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', crypt('password', gen_salt('bf')), '', now()),
  ('aa000001-0001-0001-0001-000000000004', 'pa-inactive@test.com', '{"full_name":"PA Inactive"}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', crypt('password', gen_salt('bf')), '', now()),
  ('aa000001-0001-0001-0001-000000000005', 'pa-threshold@test.com', '{"full_name":"PA Threshold"}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', crypt('password', gen_salt('bf')), '', now()),
  ('aa000001-0001-0001-0001-000000000099', 'pa-staff@test.com', '{"full_name":"PA Staff"}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', crypt('password', gen_salt('bf')), '', now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, full_name, email, last_active_at) VALUES
  ('aa000001-0001-0001-0001-000000000001', 'PA Seller 1', 'pa-seller1@test.com', now()),
  ('aa000001-0001-0001-0001-000000000002', 'PA Seller 2', 'pa-seller2@test.com', now()),
  ('aa000001-0001-0001-0001-000000000003', 'PA Big Balance', 'pa-bigbalance@test.com', now()),
  ('aa000001-0001-0001-0001-000000000004', 'PA Inactive', 'pa-inactive@test.com', now() - INTERVAL '100 days'),
  ('aa000001-0001-0001-0001-000000000005', 'PA Threshold', 'pa-threshold@test.com', now()),
  ('aa000001-0001-0001-0001-000000000099', 'PA Staff', 'pa-staff@test.com', now())
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, last_active_at = EXCLUDED.last_active_at;

INSERT INTO staff_members (user_id, email, granted_by)
VALUES ('aa000001-0001-0001-0001-000000000099', 'pa-staff@test.com', 'aa000001-0001-0001-0001-000000000099')
ON CONFLICT DO NOTHING;

-- Setup balances
INSERT INTO user_balances (user_id, available_usd, pending_usd, total_earned_usd, total_withdrawn_usd, updated_at)
VALUES
  ('aa000001-0001-0001-0001-000000000001', 100.00, 0, 200.00, 100.00, now()),
  ('aa000001-0001-0001-0001-000000000002', 0.50, 0, 10.00, 9.50, now()),
  ('aa000001-0001-0001-0001-000000000003', 550.00, 0, 1000.00, 450.00, now()),
  ('aa000001-0001-0001-0001-000000000004', 25.00, 0, 50.00, 25.00, now()),
  ('aa000001-0001-0001-0001-000000000005', 200.00, 0, 400.00, 200.00, now())
ON CONFLICT (user_id) DO UPDATE SET
  available_usd = EXCLUDED.available_usd,
  pending_usd = EXCLUDED.pending_usd,
  total_earned_usd = EXCLUDED.total_earned_usd,
  total_withdrawn_usd = EXCLUDED.total_withdrawn_usd,
  updated_at = EXCLUDED.updated_at;

-- Seed market_ledger credit entries so running balance starts correctly
SELECT append_ledger_entry('settlement_credit', 'aa000001-0001-0001-0001-000000000001', 100.00, 'credit');
SELECT append_ledger_entry('settlement_credit', 'aa000001-0001-0001-0001-000000000002', 0.50, 'credit');
SELECT append_ledger_entry('settlement_credit', 'aa000001-0001-0001-0001-000000000003', 550.00, 'credit');
SELECT append_ledger_entry('settlement_credit', 'aa000001-0001-0001-0001-000000000004', 25.00, 'credit');
SELECT append_ledger_entry('settlement_credit', 'aa000001-0001-0001-0001-000000000005', 200.00, 'credit');

-- ============================================================================
-- 1. Functions exist
-- ============================================================================
SELECT has_function('debit_market_balance', 'debit_market_balance function exists');
SELECT has_function('get_auto_payout_eligible_users', 'get_auto_payout_eligible_users function exists');

-- ============================================================================
-- 2. debit_market_balance — happy path
-- ============================================================================
SELECT is(
  (debit_market_balance('aa000001-0001-0001-0001-000000000001', 50.00, NULL, '{"provider":"paypal"}'::jsonb))->>'success',
  'true',
  'debit_market_balance: returns success for valid debit'
);

SELECT is(
  (SELECT available_usd FROM user_balances WHERE user_id = 'aa000001-0001-0001-0001-000000000001'),
  50.00::NUMERIC(10,2),
  'debit_market_balance: available_usd decreased from $100 to $50'
);

SELECT is(
  (SELECT total_withdrawn_usd FROM user_balances WHERE user_id = 'aa000001-0001-0001-0001-000000000001'),
  150.00::NUMERIC(10,2),
  'debit_market_balance: total_withdrawn_usd increased from $100 to $150'
);

-- Check market_ledger entry
SELECT is(
  (SELECT event_type FROM market_ledger WHERE user_id = 'aa000001-0001-0001-0001-000000000001' ORDER BY id DESC LIMIT 1),
  'payout_sent',
  'debit_market_balance: created payout_sent ledger entry'
);

SELECT is(
  (SELECT direction FROM market_ledger WHERE user_id = 'aa000001-0001-0001-0001-000000000001' ORDER BY id DESC LIMIT 1),
  'debit',
  'debit_market_balance: ledger entry direction is debit'
);

SELECT is(
  (SELECT amount_usd FROM market_ledger WHERE user_id = 'aa000001-0001-0001-0001-000000000001' ORDER BY id DESC LIMIT 1),
  50.00::NUMERIC(10,2),
  'debit_market_balance: ledger entry amount = $50'
);

SELECT is(
  (SELECT balance_after FROM market_ledger WHERE user_id = 'aa000001-0001-0001-0001-000000000001' ORDER BY id DESC LIMIT 1),
  50.00::NUMERIC(10,2),
  'debit_market_balance: ledger balance_after = $50'
);

-- ============================================================================
-- 3. debit_market_balance — insufficient balance (returns error, not exception)
-- ============================================================================
SELECT is(
  (debit_market_balance('aa000001-0001-0001-0001-000000000002', 10.00, NULL, '{}'::jsonb))->>'success',
  'false',
  'debit_market_balance: returns success=false when balance ($0.50) < debit ($10)'
);

SELECT ok(
  (debit_market_balance('aa000001-0001-0001-0001-000000000002', 10.00, NULL, '{}'::jsonb))->>'error' LIKE 'Insufficient%',
  'debit_market_balance: error message contains Insufficient'
);

-- Balance should remain unchanged
SELECT is(
  (SELECT available_usd FROM user_balances WHERE user_id = 'aa000001-0001-0001-0001-000000000002'),
  0.50::NUMERIC(10,2),
  'debit_market_balance: balance unchanged after insufficient balance'
);

-- ============================================================================
-- 4. debit_market_balance — exact balance (edge case)
-- ============================================================================
SELECT is(
  (debit_market_balance('aa000001-0001-0001-0001-000000000002', 0.50, NULL, '{}'::jsonb))->>'success',
  'true',
  'debit_market_balance: allows debit of exact remaining balance'
);

SELECT is(
  (SELECT available_usd FROM user_balances WHERE user_id = 'aa000001-0001-0001-0001-000000000002'),
  0.00::NUMERIC(10,2),
  'debit_market_balance: balance = $0 after exact debit'
);

-- ============================================================================
-- 5. debit_market_balance — zero balance
-- ============================================================================
SELECT is(
  (debit_market_balance('aa000001-0001-0001-0001-000000000002', 0.01, NULL, '{}'::jsonb))->>'success',
  'false',
  'debit_market_balance: rejects debit on zero balance'
);

-- ============================================================================
-- 6. Sequential debits
-- ============================================================================
SELECT is(
  (debit_market_balance('aa000001-0001-0001-0001-000000000001', 10.00, NULL, '{"provider":"paypal"}'::jsonb))->>'success',
  'true', 'debit_market_balance: second sequential debit succeeds'
);
SELECT is(
  (debit_market_balance('aa000001-0001-0001-0001-000000000001', 10.00, NULL, '{"provider":"tremendous"}'::jsonb))->>'success',
  'true', 'debit_market_balance: third sequential debit succeeds'
);

SELECT is(
  (SELECT available_usd FROM user_balances WHERE user_id = 'aa000001-0001-0001-0001-000000000001'),
  30.00::NUMERIC(10,2),
  'debit_market_balance: balance = $30 after 3 debits ($100 -> $50 -> $40 -> $30)'
);

SELECT is(
  (SELECT COUNT(*) FROM market_ledger WHERE user_id = 'aa000001-0001-0001-0001-000000000001' AND event_type = 'payout_sent')::INTEGER,
  3,
  'debit_market_balance: 3 payout_sent ledger entries created'
);

-- ============================================================================
-- 7. get_auto_payout_eligible_users — AML cap ($500)
-- ============================================================================
SELECT ok(
  EXISTS(
    SELECT 1 FROM get_auto_payout_eligible_users()
    WHERE user_id = 'aa000001-0001-0001-0001-000000000003'
      AND trigger_reason = 'aml_cap'
  ),
  'get_auto_payout_eligible: $550 balance triggers aml_cap'
);

-- ============================================================================
-- 8. 90-day inactivity sweep
-- ============================================================================
SELECT ok(
  EXISTS(
    SELECT 1 FROM get_auto_payout_eligible_users()
    WHERE user_id = 'aa000001-0001-0001-0001-000000000004'
      AND trigger_reason = 'inactivity_sweep'
  ),
  'get_auto_payout_eligible: 100-day-old user triggers inactivity_sweep'
);

-- ============================================================================
-- 9. Threshold trigger
-- ============================================================================
INSERT INTO user_auto_redemption_config (user_id, enabled, threshold_usd, method)
VALUES ('aa000001-0001-0001-0001-000000000005', true, 100.00, 'cashout')
ON CONFLICT (user_id) DO UPDATE SET enabled = true, threshold_usd = 100.00, method = 'cashout';

SELECT ok(
  EXISTS(
    SELECT 1 FROM get_auto_payout_eligible_users()
    WHERE user_id = 'aa000001-0001-0001-0001-000000000005'
      AND trigger_reason = 'threshold'
  ),
  'get_auto_payout_eligible: $200 balance with $100 threshold triggers threshold'
);

-- ============================================================================
-- 10. NOT eligible — below threshold
-- ============================================================================
INSERT INTO user_auto_redemption_config (user_id, enabled, threshold_usd, method)
VALUES ('aa000001-0001-0001-0001-000000000001', true, 50.00, 'cashout')
ON CONFLICT (user_id) DO UPDATE SET enabled = true, threshold_usd = 50.00;

SELECT ok(
  NOT EXISTS(
    SELECT 1 FROM get_auto_payout_eligible_users()
    WHERE user_id = 'aa000001-0001-0001-0001-000000000001'
      AND trigger_reason = 'threshold'
  ),
  'get_auto_payout_eligible: $30 balance with $50 threshold NOT eligible'
);

-- ============================================================================
-- 11. Disabled config
-- ============================================================================
UPDATE user_auto_redemption_config SET enabled = false
WHERE user_id = 'aa000001-0001-0001-0001-000000000005';

SELECT ok(
  NOT EXISTS(
    SELECT 1 FROM get_auto_payout_eligible_users()
    WHERE user_id = 'aa000001-0001-0001-0001-000000000005'
      AND trigger_reason = 'threshold'
  ),
  'get_auto_payout_eligible: disabled config not eligible for threshold'
);

-- ============================================================================
-- 12. market_ledger integrity
-- ============================================================================
SELECT ok(
  NOT EXISTS(SELECT 1 FROM market_ledger WHERE event_type = 'payout_sent' AND amount_usd <= 0),
  'market_ledger: all payout_sent entries have positive amount_usd'
);

SELECT ok(
  NOT EXISTS(SELECT 1 FROM market_ledger WHERE event_type = 'payout_sent' AND direction != 'debit'),
  'market_ledger: all payout_sent entries have direction = debit'
);

SELECT ok(
  NOT EXISTS(SELECT 1 FROM market_ledger WHERE event_type = 'payout_sent' AND balance_after < 0),
  'market_ledger: no payout_sent entries have negative balance_after'
);

-- ============================================================================
-- 13. Stress test: 100 rapid sequential debits
-- ============================================================================
UPDATE user_balances SET available_usd = 1000.00 WHERE user_id = 'aa000001-0001-0001-0001-000000000001';
-- Seed matching credit so ledger running balance starts at 1000
-- First zero-out ledger balance, then credit 1000
DO $$
DECLARE
  v_current NUMERIC;
BEGIN
  SELECT COALESCE((SELECT balance_after FROM market_ledger WHERE user_id = 'aa000001-0001-0001-0001-000000000001' ORDER BY id DESC LIMIT 1), 0) INTO v_current;
  IF v_current < 1000 THEN
    PERFORM append_ledger_entry('settlement_credit', 'aa000001-0001-0001-0001-000000000001', 1000.00 - v_current, 'credit');
  END IF;
END $$;

DO $$
DECLARE
  i INTEGER;
BEGIN
  FOR i IN 1..100 LOOP
    PERFORM debit_market_balance(
      'aa000001-0001-0001-0001-000000000001'::UUID,
      1.00,
      NULL,
      jsonb_build_object('provider', 'paypal', 'iteration', i)
    );
  END LOOP;
END $$;

SELECT is(
  (SELECT available_usd FROM user_balances WHERE user_id = 'aa000001-0001-0001-0001-000000000001'),
  900.00::NUMERIC(10,2),
  'Stress test: balance = $900 after 100 x $1 debits from $1000'
);

SELECT is(
  (SELECT balance_after FROM market_ledger WHERE user_id = 'aa000001-0001-0001-0001-000000000001' ORDER BY id DESC LIMIT 1),
  900.00::NUMERIC(10,2),
  'Stress test: last market_ledger balance_after = $900'
);

SELECT ok(
  NOT EXISTS(
    SELECT 1 FROM market_ledger
    WHERE user_id = 'aa000001-0001-0001-0001-000000000001'
      AND event_type = 'payout_sent'
      AND balance_after < 0
  ),
  'Stress test: no negative balance_after in any entry'
);

-- ============================================================================
-- 14. Overdraft prevention
-- ============================================================================
SELECT is(
  (debit_market_balance('aa000001-0001-0001-0001-000000000001', 901.00, NULL, '{}'::jsonb))->>'success',
  'false',
  'Overdraft prevention: cannot debit $901 from $900 balance'
);

SELECT is(
  (SELECT available_usd FROM user_balances WHERE user_id = 'aa000001-0001-0001-0001-000000000001'),
  900.00::NUMERIC(10,2),
  'Overdraft prevention: balance still $900 after failed overdraft'
);

SELECT * FROM finish();
ROLLBACK;
