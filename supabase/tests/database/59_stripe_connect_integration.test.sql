-- ===========================================================================
-- pgTAP test: Stripe Connect Integration Schema & RPCs
-- ===========================================================================
BEGIN;
SELECT plan(13);

-- ══════════════════════════════════════════════════════════════
-- 1. Table existence and columns verification
-- ══════════════════════════════════════════════════════════════
SELECT has_column('profiles', 'stripe_connect_id', 'profiles table has stripe_connect_id column');
SELECT has_column('profiles', 'stripe_onboarding_completed', 'profiles table has stripe_onboarding_completed column');
SELECT has_column('profiles', 'stripe_connect_active', 'profiles table has stripe_connect_active column');

SELECT has_column('user_settlements', 'stripe_transfer_id', 'user_settlements has stripe_transfer_id column');
SELECT has_column('user_settlements', 'stripe_transfer_error', 'user_settlements has stripe_transfer_error column');

-- ══════════════════════════════════════════════════════════════
-- 2. Constraint validation
-- ══════════════════════════════════════════════════════════════
-- Set up test data ids
INSERT INTO auth.users (id, email) 
VALUES 
  ('ff000000-0000-0000-0000-000000000101', 'buyer1@test.local'),
  ('ff000000-0000-0000-0000-000000000102', 'buyer2@test.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, email, full_name) 
VALUES 
  ('ff000000-0000-0000-0000-000000000101', 'buyer1@test.local', 'Buyer One'),
  ('ff000000-0000-0000-0000-000000000102', 'buyer2@test.local', 'Buyer Two')
ON CONFLICT (id) DO NOTHING;

INSERT INTO market_settlements (id, market_date, status)
VALUES 
  ('ff000000-0000-0000-0000-000000000001', '2020-01-01', 'cleared'),
  ('ff000000-0000-0000-0000-000000000003', '2020-01-02', 'cleared')
ON CONFLICT (id) DO NOTHING;

SELECT lives_ok(
  $$ INSERT INTO user_settlements (settlement_id, user_id, gross_sales_usd, net_payout_usd, status)
     VALUES ('ff000000-0000-0000-0000-000000000001', 'ff000000-0000-0000-0000-000000000101', 100.00, 90.00, 'stripe_transfer_pending') $$,
  'Constraint: Allows inserting stripe_transfer_pending status'
);

SELECT lives_ok(
  $$ INSERT INTO user_settlements (settlement_id, user_id, gross_sales_usd, net_payout_usd, status, stripe_transfer_error)
     VALUES ('ff000000-0000-0000-0000-000000000003', 'ff000000-0000-0000-0000-000000000102', 100.00, 90.00, 'stripe_transfer_failed', 'Stripe account restricted') $$,
  'Constraint: Allows inserting stripe_transfer_failed status'
);

-- ══════════════════════════════════════════════════════════════
-- 3. RPC Verification
-- ══════════════════════════════════════════════════════════════
SELECT has_function('set_stripe_connect_active', 'set_stripe_connect_active RPC exists');
SELECT has_function('get_profile_stripe_connect_info', 'get_profile_stripe_connect_info RPC exists');

-- Switch to a clean test user
INSERT INTO auth.users (id, email) VALUES ('ff000000-0000-0000-0000-000000000c01', 'integration@test.local') ON CONFLICT (id) DO NOTHING;
INSERT INTO profiles (id, email, full_name, stripe_onboarding_completed)
VALUES ('ff000000-0000-0000-0000-000000000c01', 'integration@test.local', 'Integration Tester', false)
ON CONFLICT (id) DO UPDATE SET stripe_onboarding_completed = false, stripe_connect_active = false;

-- Test set_stripe_connect_active unauthenticated fails (throws error)
-- Under pgTAP, since we run as superuser, we set jwt claims to null or empty
SET request.jwt.claims = '';
SELECT throws_ok(
  $$ SELECT set_stripe_connect_active(true) $$,
  'Not authenticated',
  'RPC: set_stripe_connect_active fails when unauthenticated'
);

-- Switch to our test user authenticated context
SET request.jwt.claims = '{"sub":"ff000000-0000-0000-0000-000000000c01"}';

-- Test set_stripe_connect_active(true) fails if onboarding is not completed
SELECT throws_ok(
  $$ SELECT set_stripe_connect_active(true) $$,
  'Onboarding not completed',
  'RPC: set_stripe_connect_active(true) fails if stripe onboarding is incomplete'
);

-- Complete onboarding and test set_stripe_connect_active(true) succeeds
RESET request.jwt.claims; -- temporarily reset to superuser to complete onboarding in DB
UPDATE profiles SET stripe_onboarding_completed = true WHERE id = 'ff000000-0000-0000-0000-000000000c01';
SET request.jwt.claims = '{"sub":"ff000000-0000-0000-0000-000000000c01"}';

SELECT lives_ok(
  $$ SELECT set_stripe_connect_active(true) $$,
  'RPC: set_stripe_connect_active(true) succeeds once stripe onboarding is completed'
);

-- Test get_profile_stripe_connect_info() returns correct info
SELECT results_eq(
  $$ SELECT * FROM get_profile_stripe_connect_info() $$,
  $$ VALUES (NULL::text, true, true) $$,
  'RPC: get_profile_stripe_connect_info returns accurate profile configuration'
);

SELECT * FROM finish();
ROLLBACK;
