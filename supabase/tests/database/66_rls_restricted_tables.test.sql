-- ==========================================================================
-- Test: RLS & Grant Restrictions on stripe_connect_audit_log,
--       public_profiles, and catalog_item_allocations
-- ==========================================================================
BEGIN;
SELECT plan(19);

-- ══════════════════════════════════════════════════════════════════════════
-- Setup test users
-- ══════════════════════════════════════════════════════════════════════════
INSERT INTO auth.users (id, email)
VALUES
  ('dd000000-0000-0000-0000-000000000d01'::uuid, 'rls-user1@test.local'),
  ('dd000000-0000-0000-0000-000000000d02'::uuid, 'rls-user2@test.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, email, full_name, stripe_connect_id, stripe_onboarding_completed, stripe_connect_active)
VALUES
  ('dd000000-0000-0000-0000-000000000d01', 'rls-user1@test.local', 'RLS User 1', 'acct_rls_1', true, true),
  ('dd000000-0000-0000-0000-000000000d02', 'rls-user2@test.local', 'RLS User 2', 'acct_rls_2', true, true)
ON CONFLICT (id) DO UPDATE SET
  stripe_connect_id = EXCLUDED.stripe_connect_id,
  stripe_connect_active = EXCLUDED.stripe_connect_active,
  stripe_onboarding_completed = EXCLUDED.stripe_onboarding_completed;

-- Insert audit log entries for both users (as superuser, bypassing RLS)
INSERT INTO stripe_connect_audit_log
  (user_id, changed_by, old_active, new_active, old_onboarding_completed, new_onboarding_completed, reason)
VALUES
  ('dd000000-0000-0000-0000-000000000d01', 'user', false, true, true, true, 'Test: user1 activated'),
  ('dd000000-0000-0000-0000-000000000d02', 'webhook', true, false, true, false, 'Test: user2 deauthorized');

-- ══════════════════════════════════════════════════════════════════════════
-- 1. stripe_connect_audit_log — RLS enabled
-- ══════════════════════════════════════════════════════════════════════════

-- TEST 1: RLS is enabled on the table
SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'stripe_connect_audit_log'),
  true,
  'stripe_connect_audit_log has RLS enabled'
);

-- ── anon role tests ─────────────────────────────────────────────────────

SET LOCAL ROLE anon;

-- TEST 2: anon cannot SELECT from stripe_connect_audit_log
SELECT throws_ok(
  $$ SELECT count(*) FROM stripe_connect_audit_log $$,
  '42501',
  NULL,
  'anon cannot SELECT from stripe_connect_audit_log'
);

RESET ROLE;

-- ── authenticated user1 tests ───────────────────────────────────────────

SET LOCAL ROLE postgres;
SET LOCAL "request.jwt.claims" = '{"sub": "dd000000-0000-0000-0000-000000000d01", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

-- TEST 3: authenticated user can SELECT their own audit rows
SELECT results_eq(
  $$ SELECT count(*)::INT FROM stripe_connect_audit_log $$,
  ARRAY[1::INT],
  'authenticated user1 sees only their own audit log row'
);

-- TEST 4: authenticated user cannot see other user's rows
SELECT results_eq(
  $$ SELECT count(*)::INT FROM stripe_connect_audit_log WHERE user_id = 'dd000000-0000-0000-0000-000000000d02' $$,
  ARRAY[0::INT],
  'authenticated user1 cannot see user2 audit rows'
);

-- TEST 5: authenticated user cannot INSERT into stripe_connect_audit_log
SELECT throws_ok(
  $$ INSERT INTO stripe_connect_audit_log (user_id, changed_by, old_active, new_active, reason)
     VALUES ('dd000000-0000-0000-0000-000000000d01', 'user', true, false, 'Should fail') $$,
  '42501',
  NULL,
  'authenticated user cannot INSERT into stripe_connect_audit_log'
);

-- TEST 6: authenticated user cannot UPDATE stripe_connect_audit_log
SELECT throws_ok(
  $$ UPDATE stripe_connect_audit_log SET reason = 'hacked' WHERE user_id = 'dd000000-0000-0000-0000-000000000d01' $$,
  '42501',
  NULL,
  'authenticated user cannot UPDATE stripe_connect_audit_log'
);

-- TEST 7: authenticated user cannot DELETE from stripe_connect_audit_log
SELECT throws_ok(
  $$ DELETE FROM stripe_connect_audit_log WHERE user_id = 'dd000000-0000-0000-0000-000000000d01' $$,
  '42501',
  NULL,
  'authenticated user cannot DELETE from stripe_connect_audit_log'
);

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- 2. public_profiles (VIEW) — public read, no writes
-- ══════════════════════════════════════════════════════════════════════════

-- ── anon role tests ─────────────────────────────────────────────────────

SET LOCAL ROLE anon;

-- TEST 8: anon can SELECT from public_profiles
SELECT lives_ok(
  $$ SELECT count(*) FROM public_profiles $$,
  'anon can SELECT from public_profiles'
);

-- TEST 9: anon cannot INSERT into public_profiles
SELECT throws_ok(
  $$ INSERT INTO public_profiles (id, full_name) VALUES ('dd000000-0000-0000-0000-000000000d01', 'Hacker') $$,
  '42501',
  NULL,
  'anon cannot INSERT into public_profiles'
);

-- TEST 10: anon cannot UPDATE public_profiles
SELECT throws_ok(
  $$ UPDATE public_profiles SET full_name = 'Hacked' WHERE id = 'dd000000-0000-0000-0000-000000000d01' $$,
  '42501',
  NULL,
  'anon cannot UPDATE public_profiles'
);

-- TEST 11: anon cannot DELETE from public_profiles
SELECT throws_ok(
  $$ DELETE FROM public_profiles WHERE id = 'dd000000-0000-0000-0000-000000000d01' $$,
  '42501',
  NULL,
  'anon cannot DELETE from public_profiles'
);

RESET ROLE;

-- ── authenticated role tests ────────────────────────────────────────────

SET LOCAL ROLE postgres;
SET LOCAL "request.jwt.claims" = '{"sub": "dd000000-0000-0000-0000-000000000d01", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

-- TEST 12: authenticated can SELECT from public_profiles
SELECT lives_ok(
  $$ SELECT count(*) FROM public_profiles $$,
  'authenticated can SELECT from public_profiles'
);

-- TEST 13: authenticated cannot INSERT into public_profiles
SELECT throws_ok(
  $$ INSERT INTO public_profiles (id, full_name) VALUES ('dd000000-0000-0000-0000-000000000d01', 'Hacker') $$,
  '42501',
  NULL,
  'authenticated cannot INSERT into public_profiles'
);

-- TEST 14: authenticated cannot DELETE from public_profiles
SELECT throws_ok(
  $$ DELETE FROM public_profiles WHERE id = 'dd000000-0000-0000-0000-000000000d01' $$,
  '42501',
  NULL,
  'authenticated cannot DELETE from public_profiles'
);

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════════
-- 3. catalog_item_allocations (VIEW) — authenticated read only
-- ══════════════════════════════════════════════════════════════════════════

-- ── anon role tests ─────────────────────────────────────────────────────

SET LOCAL ROLE anon;

-- TEST 15: anon cannot SELECT from catalog_item_allocations
SELECT throws_ok(
  $$ SELECT count(*) FROM catalog_item_allocations $$,
  '42501',
  NULL,
  'anon cannot SELECT from catalog_item_allocations'
);

RESET ROLE;

-- ── authenticated role tests ────────────────────────────────────────────

SET LOCAL ROLE postgres;
SET LOCAL "request.jwt.claims" = '{"sub": "dd000000-0000-0000-0000-000000000d01", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

-- TEST 16: authenticated can SELECT from catalog_item_allocations
SELECT lives_ok(
  $$ SELECT count(*) FROM catalog_item_allocations $$,
  'authenticated can SELECT from catalog_item_allocations'
);

-- TEST 17: authenticated cannot INSERT into catalog_item_allocations
SELECT throws_ok(
  $$ INSERT INTO catalog_item_allocations (catalog_item_id, owner_id, name, category, total_inventory, allocated_inventory, available_inventory, stand_count)
     VALUES (gen_random_uuid(), 'dd000000-0000-0000-0000-000000000d01', 'Fake', 'produce', 10, 0, 10, 0) $$,
  '55000',
  NULL,
  'authenticated cannot INSERT into catalog_item_allocations'
);

-- TEST 18: authenticated cannot UPDATE catalog_item_allocations
SELECT throws_ok(
  $$ UPDATE catalog_item_allocations SET name = 'Hacked' WHERE owner_id = 'dd000000-0000-0000-0000-000000000d01' $$,
  '55000',
  NULL,
  'authenticated cannot UPDATE catalog_item_allocations'
);

-- TEST 19: authenticated cannot DELETE from catalog_item_allocations
SELECT throws_ok(
  $$ DELETE FROM catalog_item_allocations WHERE owner_id = 'dd000000-0000-0000-0000-000000000d01' $$,
  '55000',
  NULL,
  'authenticated cannot DELETE from catalog_item_allocations'
);

RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
