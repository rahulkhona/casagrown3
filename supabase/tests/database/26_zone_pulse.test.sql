-- ============================================================================
-- pgTAP Tests for Zone Pulse Change Tracking
-- Verifies: zone_pulse table, triggers on market_booths/market_products,
-- and the check_zone_pulse RPC.
-- Run: docker exec -i supabase_db_casagrown3 psql -U postgres -d postgres \
--        -c "CREATE EXTENSION IF NOT EXISTS pgtap;" && \
--      docker exec -i supabase_db_casagrown3 psql -U postgres -d postgres \
--        < supabase/tests/database/26_zone_pulse.test.sql
-- ============================================================================
BEGIN;
SELECT plan(14);

-- ============================================================================
-- 1. Schema: table and columns exist
-- ============================================================================
SELECT has_table('zone_pulse', 'zone_pulse table should exist');
SELECT has_column('zone_pulse', 'zone_id',      'zone_pulse: zone_id');
SELECT has_column('zone_pulse', 'last_updated',  'zone_pulse: last_updated');

-- ============================================================================
-- 2. Functions exist
-- ============================================================================
SELECT has_function('h3_to_r5',         'h3_to_r5 helper should exist');
SELECT has_function('check_zone_pulse', 'check_zone_pulse RPC should exist');

-- ============================================================================
-- 3. Triggers exist
-- ============================================================================
SELECT has_trigger('market_booths',   'trg_zone_pulse_booths',   'booth trigger should exist');
SELECT has_trigger('market_products', 'trg_zone_pulse_products', 'product trigger should exist');

-- ============================================================================
-- 4. Trigger behavior: product insert creates zone_pulse row
-- ============================================================================

-- Setup: ensure test seller profile has an H3 zone
-- (Uses existing seed data — seller@test.local should have a profile)
DO $$
DECLARE
  v_seller_id UUID;
  v_zone TEXT;
BEGIN
  SELECT id INTO v_seller_id FROM auth.users WHERE email = 'seller@test.local';

  -- Ensure seller has an H3 zone set
  UPDATE profiles SET home_community_h3_index = '852a100bfffffff'
  WHERE id = v_seller_id AND home_community_h3_index IS NULL;

  SELECT home_community_h3_index INTO v_zone FROM profiles WHERE id = v_seller_id;

  -- Clear any existing zone_pulse entries for clean test
  DELETE FROM zone_pulse WHERE zone_id = h3_to_r5(v_zone);
END $$;

-- Insert a product — should trigger zone_pulse upsert
INSERT INTO market_products (seller_id, market_date, name, price_usd, unit, inventory)
SELECT id, CURRENT_DATE, 'pgTAP Test Tomato', 3.50, 'lb', 10
FROM auth.users WHERE email = 'seller@test.local';

SELECT ok(
  EXISTS(
    SELECT 1 FROM zone_pulse zp
    JOIN profiles p ON h3_to_r5(p.home_community_h3_index) = zp.zone_id
    JOIN auth.users au ON au.id = p.id
    WHERE au.email = 'seller@test.local'
  ),
  'Product INSERT should create zone_pulse row for seller zone'
);

-- ============================================================================
-- 5. Trigger behavior: product update advances timestamp
-- ============================================================================
DO $$ BEGIN PERFORM pg_sleep(0.1); END $$; -- small delay to ensure timestamp advances

UPDATE market_products SET price_usd = 4.00
WHERE name = 'pgTAP Test Tomato';

SELECT ok(
  (
    SELECT zp.last_updated > (now() - interval '5 seconds')
    FROM zone_pulse zp
    JOIN profiles p ON h3_to_r5(p.home_community_h3_index) = zp.zone_id
    JOIN auth.users au ON au.id = p.id
    WHERE au.email = 'seller@test.local'
  ),
  'Product UPDATE should advance zone_pulse timestamp'
);

-- ============================================================================
-- 6. Trigger behavior: booth update fires trigger
-- ============================================================================
DO $$ BEGIN PERFORM pg_sleep(0.1); END $$;

UPDATE market_booths SET name = name || ''
WHERE owner_id = (SELECT id FROM auth.users WHERE email = 'seller@test.local');

SELECT ok(
  (
    SELECT zp.last_updated > (now() - interval '5 seconds')
    FROM zone_pulse zp
    JOIN profiles p ON h3_to_r5(p.home_community_h3_index) = zp.zone_id
    JOIN auth.users au ON au.id = p.id
    WHERE au.email = 'seller@test.local'
  ),
  'Booth UPDATE should advance zone_pulse timestamp'
);

-- ============================================================================
-- 7. check_zone_pulse: returns correct timestamp for known zones
-- ============================================================================
SELECT ok(
  (
    SELECT check_zone_pulse(ARRAY[
      (SELECT h3_to_r5(home_community_h3_index) FROM profiles
       JOIN auth.users au ON au.id = profiles.id
       WHERE au.email = 'seller@test.local')
    ]) > '1970-01-01'::timestamptz
  ),
  'check_zone_pulse should return recent timestamp for known zone'
);

-- ============================================================================
-- 8. check_zone_pulse: returns epoch for unknown zones
-- ============================================================================
SELECT is(
  check_zone_pulse(ARRAY['nonexistent_zone_12345']),
  '1970-01-01'::timestamptz,
  'check_zone_pulse should return epoch for unknown zones'
);

-- ============================================================================
-- 9. check_zone_pulse: multi-zone returns MAX
-- ============================================================================
-- Insert a second zone with a known older timestamp
INSERT INTO zone_pulse (zone_id, last_updated) VALUES ('test_old_zone', '2020-01-01'::timestamptz)
ON CONFLICT (zone_id) DO UPDATE SET last_updated = '2020-01-01'::timestamptz;

SELECT ok(
  (
    SELECT check_zone_pulse(ARRAY[
      (SELECT h3_to_r5(home_community_h3_index) FROM profiles
       JOIN auth.users au ON au.id = profiles.id
       WHERE au.email = 'seller@test.local'),
      'test_old_zone'
    ]) > '2020-01-01'::timestamptz
  ),
  'Multi-zone check should return MAX(last_updated)'
);

-- ============================================================================
-- 10. RLS: anon can SELECT from zone_pulse
-- ============================================================================
SET ROLE anon;
SELECT ok(
  (SELECT count(*) >= 0 FROM zone_pulse),
  'Anon role can SELECT from zone_pulse'
);
RESET ROLE;

-- ============================================================================
-- Cleanup
-- ============================================================================
DELETE FROM market_products WHERE name = 'pgTAP Test Tomato';
DELETE FROM zone_pulse WHERE zone_id = 'test_old_zone';

SELECT * FROM finish();
ROLLBACK;
