-- ============================================================
-- 37_payout_events.test.sql — stripe_payout_events table & RPCs
-- ============================================================
BEGIN;

SELECT plan(18);

-- ══════════════════════════════════════════════════════════════
-- 1. Table existence and structure
-- ══════════════════════════════════════════════════════════════
SELECT has_table('stripe_payout_events', 'stripe_payout_events table exists');

SELECT has_column('stripe_payout_events', 'id', 'has id column');
SELECT has_column('stripe_payout_events', 'stripe_payout_id', 'has stripe_payout_id column');
SELECT has_column('stripe_payout_events', 'event_type', 'has event_type column');
SELECT has_column('stripe_payout_events', 'amount_usd', 'has amount_usd column');
SELECT has_column('stripe_payout_events', 'failure_code', 'has failure_code column');
SELECT has_column('stripe_payout_events', 'failure_message', 'has failure_message column');
SELECT has_column('stripe_payout_events', 'matched_settlement_ids', 'has matched_settlement_ids column');
SELECT has_column('stripe_payout_events', 'affected_user_ids', 'has affected_user_ids column');
SELECT has_column('stripe_payout_events', 'raw_event', 'has raw_event column');
SELECT has_column('stripe_payout_events', 'created_at', 'has created_at column');

-- ══════════════════════════════════════════════════════════════
-- 2. event_type CHECK constraint
-- ══════════════════════════════════════════════════════════════
SELECT lives_ok(
  $$ INSERT INTO stripe_payout_events (stripe_payout_id, event_type, amount_usd)
     VALUES ('po_test_paid', 'paid', 100.00) $$,
  'Can insert paid event'
);

SELECT lives_ok(
  $$ INSERT INTO stripe_payout_events (stripe_payout_id, event_type, amount_usd, failure_code, failure_message)
     VALUES ('po_test_failed', 'failed', 200.00, 'no_account', 'Bank account not found') $$,
  'Can insert failed event with failure details'
);

SELECT throws_ok(
  $$ INSERT INTO stripe_payout_events (stripe_payout_id, event_type, amount_usd)
     VALUES ('po_test_invalid', 'invalid_type', 50.00) $$,
  '23514',  -- CHECK constraint violation
  NULL,
  'Rejects invalid event_type'
);

-- ══════════════════════════════════════════════════════════════
-- 3. Admin RPCs exist
-- ══════════════════════════════════════════════════════════════
SELECT has_function('get_payout_events_admin', 'get_payout_events_admin function exists');
SELECT has_function('get_payout_event_details', 'get_payout_event_details function exists');

-- ══════════════════════════════════════════════════════════════
-- 4. RLS: regular user cannot see payout events
-- ══════════════════════════════════════════════════════════════
-- Clean up any data from earlier tests (run as superuser)
DELETE FROM stripe_payout_events;

-- Insert fresh test data as superuser
INSERT INTO stripe_payout_events (stripe_payout_id, event_type, amount_usd)
VALUES ('po_rls_test', 'paid', 999.00);

-- Verify we can see it as superuser
SELECT is(
  (SELECT count(*)::int FROM stripe_payout_events WHERE stripe_payout_id = 'po_rls_test'),
  1,
  'Superuser can see the test payout event'
);

-- Now switch to a NON-staff authenticated user
-- (a1111111... IS a staff member, so use c3333333... which is just a regular user)
SET request.jwt.claim.sub = 'c3333333-3333-3333-3333-333333333333';
SET role = 'authenticated';

SELECT is(
  (SELECT count(*)::int FROM stripe_payout_events),
  0,
  'Non-staff user sees 0 payout events (RLS blocks access)'
);

-- Reset for remaining tests
RESET role;

SELECT * FROM finish();

ROLLBACK;
