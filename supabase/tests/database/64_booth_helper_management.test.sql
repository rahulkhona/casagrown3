-- ===========================================================================
-- pgTAP test 64: Booth Helper Management
--
-- Tests the full helper lifecycle including:
--   1. Schema — booth_helpers table, role column, constraints
--   2. join_booth_as_helper RPC exists
--   3. Helper status transitions — accepted, revoked, re-accepted
--   4. Helper passcode management
--   5. Unique constraint and role constraints
-- ===========================================================================
BEGIN;
SELECT plan(15);

-- ══════════════════════════════════════════════════════════════
-- Setup: Create test users and booths
-- ══════════════════════════════════════════════════════════════
-- Owner
INSERT INTO auth.users (id, email, role)
VALUES ('aa000000-0000-0000-0000-640000000001', 'owner64@test.local', 'authenticated')
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, email, full_name)
VALUES ('aa000000-0000-0000-0000-640000000001', 'owner64@test.local', 'Stand Owner 64')
ON CONFLICT (id) DO NOTHING;

-- Helper
INSERT INTO auth.users (id, email, role)
VALUES ('aa000000-0000-0000-0000-640000000002', 'helper64@test.local', 'authenticated')
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, email, full_name)
VALUES ('aa000000-0000-0000-0000-640000000002', 'helper64@test.local', 'Helper Person 64')
ON CONFLICT (id) DO NOTHING;

-- Outsider (no relationship)
INSERT INTO auth.users (id, email, role)
VALUES ('aa000000-0000-0000-0000-640000000003', 'outsider64@test.local', 'authenticated')
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, email, full_name)
VALUES ('aa000000-0000-0000-0000-640000000003', 'outsider64@test.local', 'Outsider 64')
ON CONFLICT (id) DO NOTHING;

-- Delete any auto-created default booth (auth trigger creates one on user insert)
DELETE FROM market_booths WHERE owner_id = 'aa000000-0000-0000-0000-640000000001';

-- Owner's booth with passcode
INSERT INTO market_booths (id, owner_id, name, helper_passcode, is_default)
VALUES ('aa000000-0000-0000-0000-6400000000b1', 'aa000000-0000-0000-0000-640000000001', 'Test Stand 64', 'JOIN64', true)
ON CONFLICT (id) DO UPDATE SET helper_passcode = 'JOIN64', name = 'Test Stand 64';

-- ══════════════════════════════════════════════════════════════
-- 1. Schema Verification
-- ══════════════════════════════════════════════════════════════

SELECT has_table('booth_helpers', 'booth_helpers table exists');
SELECT has_column('booth_helpers', 'booth_id', 'booth_helpers has booth_id');
SELECT has_column('booth_helpers', 'helper_id', 'booth_helpers has helper_id');
SELECT has_column('booth_helpers', 'status', 'booth_helpers has status');
SELECT has_column('booth_helpers', 'role', 'booth_helpers has role column');

-- Check role default value
SELECT is(
  (SELECT column_default FROM information_schema.columns
   WHERE table_name = 'booth_helpers' AND column_name = 'role'),
  '''delivery''::text',
  'role column defaults to delivery'
);

-- ══════════════════════════════════════════════════════════════
-- 2. join_booth_as_helper RPC
-- ══════════════════════════════════════════════════════════════

SELECT has_function('join_booth_as_helper', 'join_booth_as_helper RPC exists');

-- ══════════════════════════════════════════════════════════════
-- 3. Direct helper insertion and role handling
-- ══════════════════════════════════════════════════════════════

-- Insert a helper with 'delivery' role
INSERT INTO booth_helpers (booth_id, helper_id, status, role)
VALUES (
  'aa000000-0000-0000-0000-6400000000b1',
  'aa000000-0000-0000-0000-640000000002',
  'accepted', 'delivery'
);

SELECT is(
  (SELECT count(*)::int FROM booth_helpers
   WHERE booth_id = 'aa000000-0000-0000-0000-6400000000b1'),
  1,
  'Booth has 1 helper after insert'
);

SELECT is(
  (SELECT role FROM booth_helpers
   WHERE booth_id = 'aa000000-0000-0000-0000-6400000000b1'
   AND helper_id = 'aa000000-0000-0000-0000-640000000002'),
  'delivery',
  'Helper role is delivery'
);

-- ══════════════════════════════════════════════════════════════
-- 4. Status transitions: revoke then re-accept
-- ══════════════════════════════════════════════════════════════

-- Revoke
UPDATE booth_helpers
SET status = 'revoked', updated_at = now()
WHERE booth_id = 'aa000000-0000-0000-0000-6400000000b1'
  AND helper_id = 'aa000000-0000-0000-0000-640000000002';

SELECT is(
  (SELECT status FROM booth_helpers
   WHERE booth_id = 'aa000000-0000-0000-0000-6400000000b1'
   AND helper_id = 'aa000000-0000-0000-0000-640000000002'),
  'revoked',
  'Helper status is revoked after update'
);

-- Re-accept (simulates re-joining via passcode — ON CONFLICT DO UPDATE)
INSERT INTO booth_helpers (booth_id, helper_id, status)
VALUES (
  'aa000000-0000-0000-0000-6400000000b1',
  'aa000000-0000-0000-0000-640000000002',
  'accepted'
) ON CONFLICT (booth_id, helper_id)
  DO UPDATE SET status = 'accepted', updated_at = now();

SELECT is(
  (SELECT status FROM booth_helpers
   WHERE booth_id = 'aa000000-0000-0000-0000-6400000000b1'
   AND helper_id = 'aa000000-0000-0000-0000-640000000002'),
  'accepted',
  'Helper re-accepted after ON CONFLICT upsert'
);

-- ══════════════════════════════════════════════════════════════
-- 5. Helper passcode management
-- ══════════════════════════════════════════════════════════════

-- Verify passcode is set
SELECT is(
  (SELECT helper_passcode FROM market_booths
   WHERE id = 'aa000000-0000-0000-0000-6400000000b1'),
  'JOIN64',
  'Booth passcode is JOIN64'
);

-- Update passcode
UPDATE market_booths SET helper_passcode = 'NEW999'
WHERE id = 'aa000000-0000-0000-0000-6400000000b1';

SELECT is(
  (SELECT helper_passcode FROM market_booths
   WHERE id = 'aa000000-0000-0000-0000-6400000000b1'),
  'NEW999',
  'Booth passcode updated to NEW999'
);

-- ══════════════════════════════════════════════════════════════
-- 6. Unique constraint: same helper can't be added twice
-- ══════════════════════════════════════════════════════════════

-- Upsert should not error (helper already exists from step 4)
INSERT INTO booth_helpers (booth_id, helper_id, status)
VALUES (
  'aa000000-0000-0000-0000-6400000000b1',
  'aa000000-0000-0000-0000-640000000002',
  'accepted'
) ON CONFLICT (booth_id, helper_id) DO UPDATE SET status = 'accepted';

-- Still only 1 helper
SELECT is(
  (SELECT count(*)::int FROM booth_helpers
   WHERE booth_id = 'aa000000-0000-0000-0000-6400000000b1'),
  1,
  'Unique constraint prevents duplicate helpers'
);

-- ══════════════════════════════════════════════════════════════
-- 7. Role constraint: invalid role rejected
-- ══════════════════════════════════════════════════════════════

SELECT throws_ok(
  $$ INSERT INTO booth_helpers (booth_id, helper_id, status, role)
     VALUES (
       'aa000000-0000-0000-0000-6400000000b1',
       'aa000000-0000-0000-0000-640000000003',
       'accepted',
       'admin'
     ) $$,
  NULL,
  'Invalid role is rejected by CHECK constraint'
);

-- ══════════════════════════════════════════════════════════════
-- 8. Cleanup and finish
-- ══════════════════════════════════════════════════════════════

SELECT * FROM finish();
ROLLBACK;
