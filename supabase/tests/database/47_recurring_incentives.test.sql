-- ============================================================
-- Test 47: Recurring User Incentives
-- Tests: cron idempotency, frequency calculations, 
--        active/inactive flags, and onetime logic.
-- ============================================================
BEGIN;

SELECT plan(4);

-- ──────────────────────────────────────────────────────────
-- SETUP
-- ──────────────────────────────────────────────────────────

-- User to receive incentives
INSERT INTO auth.users (id, email) VALUES
  ('cc470001-0000-0000-0000-000000000001', 'buyer1_47@test.com');

UPDATE profiles SET full_name = 'Buyer 47', email = 'buyer1_47@test.com'
  WHERE id = 'cc470001-0000-0000-0000-000000000001';

-- ──────────────────────────────────────────────────────────
-- TEST 1: Monthly Calculation & Idempotency
-- ──────────────────────────────────────────────────────────

-- Create a monthly incentive
INSERT INTO user_incentives (id, user_id, amount_usd, credit_type, cap_type, cap_value, expiration_frequency)
VALUES ('cc470001-1000-0000-0000-000000000001', 'cc470001-0000-0000-0000-000000000001',
  20.00, 'purchase', 'flat_amount', 5.00, 'monthly');

-- Run the cron function twice to test idempotency
SELECT process_recurring_incentives();
SELECT process_recurring_incentives();

SELECT results_eq(
  $$SELECT count(*)::int FROM user_credits WHERE source_id = 'cc470001-1000-0000-0000-000000000001'$$,
  ARRAY[1],
  'Cron job issues exactly 1 credit for the current month (idempotency)'
);

SELECT results_eq(
  $$SELECT (expires_at::date)::text FROM user_credits WHERE source_id = 'cc470001-1000-0000-0000-000000000001'$$,
  ARRAY[(date_trunc('month', now()) + interval '1 month')::date::text],
  'Monthly expiration is calculated correctly'
);

-- ──────────────────────────────────────────────────────────
-- TEST 2: Inactivity & Expiration
-- ──────────────────────────────────────────────────────────

-- Set to inactive and stop_date in the past
UPDATE user_incentives 
SET is_active = false, stop_date = now() - interval '1 day'
WHERE id = 'cc470001-1000-0000-0000-000000000001';

-- Delete existing credit to test
DELETE FROM user_credits WHERE source_id = 'cc470001-1000-0000-0000-000000000001';

SELECT process_recurring_incentives();

SELECT results_eq(
  $$SELECT count(*)::int FROM user_credits WHERE source_id = 'cc470001-1000-0000-0000-000000000001'$$,
  ARRAY[0],
  'Inactive/Expired incentive does not issue credits'
);

-- ──────────────────────────────────────────────────────────
-- TEST 3: Onetime Frequency
-- ──────────────────────────────────────────────────────────

INSERT INTO user_incentives (id, user_id, amount_usd, credit_type, cap_type, cap_value, expiration_frequency)
VALUES ('cc470001-1000-0000-0000-000000000002', 'cc470001-0000-0000-0000-000000000001',
  50.00, 'purchase', 'percentage', 10, 'onetime');

SELECT process_recurring_incentives();
SELECT process_recurring_incentives();

SELECT results_eq(
  $$SELECT count(*)::int FROM user_credits WHERE source_id = 'cc470001-1000-0000-0000-000000000002'$$,
  ARRAY[1],
  'Onetime incentive issues exactly 1 credit ever'
);

ROLLBACK;
