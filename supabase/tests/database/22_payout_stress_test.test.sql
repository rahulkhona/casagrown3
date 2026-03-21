-- ============================================================================
-- pgTAP Large-Scale Stress Test: 1,000 Users x 10 Debits = 10,000 Operations
--
-- Validates debit_market_balance atomicity and correctness at scale.
-- Verifies: balance accuracy, ledger consistency, overdraft prevention.
-- ============================================================================
BEGIN;
SELECT plan(8);

-- ============================================================================
-- Phase 1: Bulk user creation (1000 users, each with $100)
-- ============================================================================
DO $$
DECLARE
  i INTEGER;
  uid UUID;
BEGIN
  FOR i IN 1..1000 LOOP
    uid := ('55000000-0000-0000-0000-' || LPAD(i::text, 12, '0'))::UUID;

    INSERT INTO auth.users (id, email, raw_user_meta_data, instance_id, aud, role, encrypted_password, confirmation_token, email_confirmed_at)
    VALUES (uid, 'stress' || i || '@test.com', ('{"full_name":"Stress User ' || i || '"}')::jsonb,
      '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      crypt('password', gen_salt('bf')), '', now())
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO profiles (id, full_name, email)
    VALUES (uid, 'Stress User ' || i, 'stress' || i || '@test.com')
    ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

    INSERT INTO user_balances (user_id, available_usd, pending_usd, total_earned_usd, total_withdrawn_usd)
    VALUES (uid, 100.00, 0, 100.00, 0)
    ON CONFLICT (user_id) DO UPDATE SET available_usd = 100.00, total_withdrawn_usd = 0;

    -- Seed matching ledger credit so running balance starts at $100
    PERFORM append_ledger_entry('settlement_credit', uid, 100.00, 'credit');
  END LOOP;
END $$;

SELECT ok(
  (SELECT COUNT(*) FROM user_balances WHERE user_id::text LIKE '55000000-0000-0000-0000-%') >= 1000,
  'Phase 1: Created 1000 users with $100 each'
);

-- ============================================================================
-- Phase 2: Bulk debits (10 x $5 per user = $50 debited, $50 remaining)
-- ============================================================================
DO $$
DECLARE
  i INTEGER;
  j INTEGER;
  uid UUID;
BEGIN
  FOR i IN 1..1000 LOOP
    uid := ('55000000-0000-0000-0000-' || LPAD(i::text, 12, '0'))::UUID;
    FOR j IN 1..10 LOOP
      PERFORM debit_market_balance(uid, 5.00, NULL,
        jsonb_build_object('provider', 'paypal', 'target', 'stress-' || i || '-' || j));
    END LOOP;
  END LOOP;
END $$;

-- ============================================================================
-- Phase 3: Verification
-- ============================================================================

-- All users should have exactly $50
SELECT is(
  (SELECT COUNT(*) FROM user_balances
   WHERE user_id::text LIKE '55000000-0000-0000-0000-%'
     AND available_usd = 50.00)::INTEGER,
  1000,
  'Phase 3a: All 1000 users have exactly $50 remaining'
);

-- No negative balances
SELECT ok(
  NOT EXISTS(
    SELECT 1 FROM user_balances
    WHERE user_id::text LIKE '55000000-0000-0000-0000-%'
      AND available_usd < 0
  ),
  'Phase 3b: No user has negative available_usd'
);

-- Total withdrawn = $50 per user
SELECT is(
  (SELECT COUNT(*) FROM user_balances
   WHERE user_id::text LIKE '55000000-0000-0000-0000-%'
     AND total_withdrawn_usd = 50.00)::INTEGER,
  1000,
  'Phase 3c: All users have total_withdrawn_usd = $50'
);

-- Exactly 10,000 ledger entries
SELECT is(
  (SELECT COUNT(*) FROM market_ledger
   WHERE user_id::text LIKE '55000000-0000-0000-0000-%'
     AND event_type = 'payout_sent')::INTEGER,
  10000,
  'Phase 3d: Exactly 10,000 payout_sent entries created'
);

-- ============================================================================
-- Phase 4: Running balance integrity (sample 50 users)
-- ============================================================================
SELECT ok(
  NOT EXISTS(
    SELECT 1 FROM (
      SELECT sampled.user_id,
        (SELECT balance_after FROM market_ledger ml2 WHERE ml2.user_id = sampled.user_id AND event_type = 'payout_sent' ORDER BY id DESC LIMIT 1) AS last_ledger_balance,
        (SELECT available_usd FROM user_balances ub WHERE ub.user_id = sampled.user_id) AS current_balance
      FROM (
        SELECT DISTINCT user_id FROM market_ledger
        WHERE user_id::text LIKE '55000000-0000-0000-0000-%'
          AND event_type = 'payout_sent'
        ORDER BY user_id LIMIT 50
      ) sampled
    ) checks
    WHERE last_ledger_balance != current_balance
  ),
  'Phase 4: Sampled 50 users — last ledger balance matches user_balances.available_usd'
);

-- ============================================================================
-- Phase 5: Overdraft stress — try to debit more than available for all 1000
-- ============================================================================
DO $$
DECLARE
  i INTEGER;
  uid UUID;
  result JSONB;
BEGIN
  FOR i IN 1..1000 LOOP
    uid := ('55000000-0000-0000-0000-' || LPAD(i::text, 12, '0'))::UUID;
    result := debit_market_balance(uid, 51.00, NULL, '{}'::jsonb);
    IF (result->>'success')::boolean THEN
      RAISE EXCEPTION 'Overdraft should have failed for user %', i;
    END IF;
  END LOOP;
END $$;

SELECT is(
  (SELECT COUNT(*) FROM user_balances
   WHERE user_id::text LIKE '55000000-0000-0000-0000-%'
     AND available_usd = 50.00)::INTEGER,
  1000,
  'Phase 5a: All 1000 users still have $50 after failed overdraft'
);

SELECT is(
  (SELECT COUNT(*) FROM market_ledger
   WHERE user_id::text LIKE '55000000-0000-0000-0000-%'
     AND event_type = 'payout_sent')::INTEGER,
  10000,
  'Phase 5b: Still exactly 10,000 entries (no overdraft entries leaked)'
);

SELECT * FROM finish();
ROLLBACK;
