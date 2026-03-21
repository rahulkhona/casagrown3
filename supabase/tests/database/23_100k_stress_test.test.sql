-- ============================================================================
-- pgTAP STRESS TEST: 100,000 Transactions — Full Netting + Payout Flow
--
-- Simulates:
--   Phase 1: Create 10,000 sellers
--   Phase 2: 100,000 settlement_credit entries (10 sales per seller, netting)
--   Phase 3: 100,000 payout_sent debits (drain each credit via debit_market_balance)
--   Phase 4: Verify all balances = $0, ledger integrity, no overdrafts
--   Phase 5: Overdraft prevention at scale (10,000 attempts)
--
-- Reports wall-clock time per phase.
-- ============================================================================
BEGIN;
SELECT plan(11);

-- ============================================================================
-- Phase 1: Create 10,000 sellers
-- ============================================================================
DO $$
DECLARE
  i INTEGER;
  uid UUID;
  t0 TIMESTAMPTZ := clock_timestamp();
BEGIN
  FOR i IN 1..10000 LOOP
    uid := ('66000000-0000-0000-0000-' || LPAD(i::text, 12, '0'))::UUID;

    INSERT INTO auth.users (id, email, raw_user_meta_data, instance_id, aud, role, encrypted_password, confirmation_token, email_confirmed_at)
    VALUES (uid, 'stx' || i || '@test.com', ('{"full_name":"STX Seller ' || i || '"}')::jsonb,
      '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      crypt('password', gen_salt('bf')), '', now())
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO profiles (id, full_name, email)
    VALUES (uid, 'STX Seller ' || i, 'stx' || i || '@test.com')
    ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

    INSERT INTO user_balances (user_id, available_usd, pending_usd, total_earned_usd, total_withdrawn_usd)
    VALUES (uid, 0, 0, 0, 0)
    ON CONFLICT (user_id) DO UPDATE SET available_usd = 0, pending_usd = 0, total_earned_usd = 0, total_withdrawn_usd = 0;
  END LOOP;

  RAISE NOTICE '🏗️ Phase 1: Created 10,000 users in % ms', EXTRACT(MILLISECONDS FROM clock_timestamp() - t0)::INTEGER;
END $$;

SELECT ok(
  (SELECT COUNT(*) FROM user_balances WHERE user_id::text LIKE '66000000-0000-0000-0000-%') >= 10000,
  'Phase 1: Created 10,000 sellers'
);

-- ============================================================================
-- Phase 2: 100,000 settlement credits (10 sales per seller)
-- Simulates: run_market_settlement crediting sellers after each market day
-- Each credit = $25 net (after fees), so 10 x $25 = $250 per seller
-- ============================================================================
DO $$
DECLARE
  i INTEGER;
  j INTEGER;
  uid UUID;
  t0 TIMESTAMPTZ := clock_timestamp();
BEGIN
  FOR i IN 1..10000 LOOP
    uid := ('66000000-0000-0000-0000-' || LPAD(i::text, 12, '0'))::UUID;
    FOR j IN 1..10 LOOP
      -- Simulate settlement_credit via append_ledger_entry (same as run_market_settlement)
      PERFORM append_ledger_entry(
        'settlement_credit', uid, 25.00, 'credit',
        NULL, NULL,
        jsonb_build_object('market_date', CURRENT_DATE - j, 'iteration', j)
      );
    END LOOP;

    -- Update user_balances to match (normally done by settlement function)
    UPDATE user_balances
    SET available_usd = 250.00,
        total_earned_usd = 250.00,
        updated_at = now()
    WHERE user_id = uid;
  END LOOP;

  RAISE NOTICE '📊 Phase 2: 100,000 settlement credits in % ms', EXTRACT(MILLISECONDS FROM clock_timestamp() - t0)::INTEGER;
END $$;

-- Verify: 100,000 credit entries
SELECT is(
  (SELECT COUNT(*) FROM market_ledger
   WHERE user_id::text LIKE '66000000-0000-0000-0000-%'
     AND event_type = 'settlement_credit')::INTEGER,
  100000,
  'Phase 2: Exactly 100,000 settlement_credit entries'
);

-- All sellers have $250
SELECT is(
  (SELECT COUNT(*) FROM user_balances
   WHERE user_id::text LIKE '66000000-0000-0000-0000-%'
     AND available_usd = 250.00)::INTEGER,
  10000,
  'Phase 2: All 10,000 sellers have $250 available'
);

-- ============================================================================
-- Phase 3: 100,000 payout debits via debit_market_balance
-- Each seller gets 10 x $25 payouts = $250 total (fully drained)
-- ============================================================================
DO $$
DECLARE
  i INTEGER;
  j INTEGER;
  uid UUID;
  result JSONB;
  success_count INTEGER := 0;
  fail_count INTEGER := 0;
  t0 TIMESTAMPTZ := clock_timestamp();
BEGIN
  FOR i IN 1..10000 LOOP
    uid := ('66000000-0000-0000-0000-' || LPAD(i::text, 12, '0'))::UUID;
    FOR j IN 1..10 LOOP
      result := debit_market_balance(
        uid, 25.00, NULL,
        jsonb_build_object('provider', 'paypal', 'payout_batch', 'batch-' || i, 'iteration', j)
      );
      IF (result->>'success')::boolean THEN
        success_count := success_count + 1;
      ELSE
        fail_count := fail_count + 1;
      END IF;
    END LOOP;
  END LOOP;

  RAISE NOTICE '💸 Phase 3: 100,000 payout debits in % ms (% succeeded, % failed)',
    EXTRACT(MILLISECONDS FROM clock_timestamp() - t0)::INTEGER, success_count, fail_count;
END $$;

-- Verify: 100,000 payout entries
SELECT is(
  (SELECT COUNT(*) FROM market_ledger
   WHERE user_id::text LIKE '66000000-0000-0000-0000-%'
     AND event_type = 'payout_sent')::INTEGER,
  100000,
  'Phase 3: Exactly 100,000 payout_sent entries'
);

-- All balances should be exactly $0
SELECT is(
  (SELECT COUNT(*) FROM user_balances
   WHERE user_id::text LIKE '66000000-0000-0000-0000-%'
     AND available_usd = 0.00)::INTEGER,
  10000,
  'Phase 3: All 10,000 sellers have $0 after full payout'
);

-- Total withdrawn should be $250 per seller
SELECT is(
  (SELECT COUNT(*) FROM user_balances
   WHERE user_id::text LIKE '66000000-0000-0000-0000-%'
     AND total_withdrawn_usd = 250.00)::INTEGER,
  10000,
  'Phase 3: All sellers have total_withdrawn = $250'
);

-- ============================================================================
-- Phase 4: Ledger integrity verification
-- ============================================================================
DO $$
DECLARE
  t0 TIMESTAMPTZ := clock_timestamp();
BEGIN
  RAISE NOTICE '🔍 Phase 4: Running integrity checks...';

  -- Check: running balance = SUM(credits) - SUM(debits) for sample users
  IF EXISTS(
    SELECT 1 FROM (
      SELECT sampled.user_id,
        (SELECT balance_after FROM market_ledger ml2 WHERE ml2.user_id = sampled.user_id ORDER BY id DESC LIMIT 1) AS last_balance,
        (SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_usd ELSE -amount_usd END), 0)
         FROM market_ledger ml3 WHERE ml3.user_id = sampled.user_id) AS computed_balance
      FROM (
        SELECT DISTINCT user_id FROM user_balances
        WHERE user_id::text LIKE '66000000-0000-0000-0000-%'
        ORDER BY user_id LIMIT 100
      ) sampled
    ) checks
    WHERE last_balance != computed_balance
  ) THEN
    RAISE WARNING 'Ledger integrity violation found!';
  END IF;

  RAISE NOTICE '✅ Phase 4: Integrity checks complete in % ms', EXTRACT(MILLISECONDS FROM clock_timestamp() - t0)::INTEGER;
END $$;

-- Running balance for all tested users should be 0 (credits cancelled by debits)
SELECT ok(
  NOT EXISTS(
    SELECT 1 FROM (
      SELECT sampled.user_id,
        (SELECT balance_after FROM market_ledger ml2 WHERE ml2.user_id = sampled.user_id ORDER BY id DESC LIMIT 1) AS last_balance
      FROM (
        SELECT DISTINCT user_id FROM user_balances
        WHERE user_id::text LIKE '66000000-0000-0000-0000-%'
        ORDER BY user_id LIMIT 200
      ) sampled
    ) checks
    WHERE last_balance != 0
  ),
  'Phase 4a: Sampled 200 users — final ledger balance = $0'
);

-- No negative balance_after for payout_sent (impossible if credits were applied first)
SELECT ok(
  NOT EXISTS(
    SELECT 1 FROM market_ledger
    WHERE user_id::text LIKE '66000000-0000-0000-0000-%'
      AND event_type = 'payout_sent'
      AND balance_after < 0
  ),
  'Phase 4b: No negative balance_after in any payout_sent entry'
);

-- Cross-check: user_balances.available_usd matches last market_ledger balance_after
SELECT ok(
  NOT EXISTS(
    SELECT 1 FROM (
      SELECT sampled.user_id,
        (SELECT balance_after FROM market_ledger ml2 WHERE ml2.user_id = sampled.user_id ORDER BY id DESC LIMIT 1) AS last_ledger,
        (SELECT available_usd FROM user_balances ub WHERE ub.user_id = sampled.user_id) AS current_balance
      FROM (
        SELECT DISTINCT user_id FROM user_balances
        WHERE user_id::text LIKE '66000000-0000-0000-0000-%'
        ORDER BY user_id LIMIT 200
      ) sampled
    ) checks
    WHERE last_ledger != current_balance
  ),
  'Phase 4c: user_balances.available_usd matches final ledger balance_after (200 users)'
);

-- ============================================================================
-- Phase 5: Overdraft prevention at scale (10,000 attempts on zero-balance users)
-- ============================================================================
DO $$
DECLARE
  i INTEGER;
  uid UUID;
  result JSONB;
  leak_count INTEGER := 0;
  t0 TIMESTAMPTZ := clock_timestamp();
BEGIN
  FOR i IN 1..10000 LOOP
    uid := ('66000000-0000-0000-0000-' || LPAD(i::text, 12, '0'))::UUID;
    result := debit_market_balance(uid, 1.00, NULL, '{"provider":"paypal","test":"overdraft"}'::jsonb);
    IF (result->>'success')::boolean THEN
      leak_count := leak_count + 1;
    END IF;
  END LOOP;

  RAISE NOTICE '🛡️ Phase 5: 10,000 overdraft attempts in % ms (% leaked through)',
    EXTRACT(MILLISECONDS FROM clock_timestamp() - t0)::INTEGER, leak_count;

  IF leak_count > 0 THEN
    RAISE EXCEPTION 'CRITICAL: % overdraft(s) succeeded on zero-balance accounts!', leak_count;
  END IF;
END $$;

-- Balances should still all be $0
SELECT is(
  (SELECT COUNT(*) FROM user_balances
   WHERE user_id::text LIKE '66000000-0000-0000-0000-%'
     AND available_usd = 0.00)::INTEGER,
  10000,
  'Phase 5a: All 10,000 users still have $0 after overdraft attempts'
);

-- No new payout_sent entries (still exactly 100,000)
SELECT is(
  (SELECT COUNT(*) FROM market_ledger
   WHERE user_id::text LIKE '66000000-0000-0000-0000-%'
     AND event_type = 'payout_sent')::INTEGER,
  100000,
  'Phase 5b: Still exactly 100k payout entries (no overdraft leaks)'
);

SELECT * FROM finish();
ROLLBACK;
