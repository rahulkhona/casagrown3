-- ==========================================================================
-- Test: Market State Blocks — state-isolated free market mode
-- Tests the market_state_blocks table, enforce_free_market_price trigger,
-- is_market_blocked_for_user() helper, and state-filtered nearby_booths.
-- ==========================================================================
BEGIN;
SELECT plan(6);

-- ===== Setup: Block NY for testing =====

-- Get the NY state record
DO $$
DECLARE v_ny_id UUID;
BEGIN
  SELECT id INTO v_ny_id FROM states WHERE code = 'NY' AND country_iso_3 = 'USA';
  IF v_ny_id IS NULL THEN
    RAISE EXCEPTION 'NY state not found in states table';
  END IF;
  INSERT INTO market_state_blocks (state_id, reason)
  VALUES (v_ny_id, 'Agent of payee not recognized');
END;
$$;

-- T1: market_state_blocks table exists and has NY entry
SELECT ok(
  EXISTS(SELECT 1 FROM market_state_blocks msb JOIN states s ON msb.state_id = s.id WHERE s.code = 'NY'),
  'NY is in market_state_blocks'
);

-- T2: is_market_blocked_for_user returns FALSE for seed user (CA)
-- Seed user Maria Garcia = '11111111-1111-1111-1111-111111111111' is in CA
SELECT ok(
  NOT is_market_blocked_for_user('11111111-1111-1111-1111-111111111111'),
  'CA user is not blocked'
);

-- ===== Setup: Temporarily move Sofia Rossi to NY for trigger test =====
UPDATE profiles SET state_code = 'NY' WHERE id = '44444444-4444-4444-4444-444444444444';

-- T3: is_market_blocked_for_user returns TRUE for NY user
SELECT ok(
  is_market_blocked_for_user('44444444-4444-4444-4444-444444444444'),
  'NY user is blocked'
);

-- T4: Trigger forces price_usd = 0 for NY seller's product
INSERT INTO market_products (id, seller_id, name, price_usd, unit, inventory, is_active, market_date, category)
VALUES (
  'e0e01111-0001-4a00-a001-000000000001',
  '44444444-4444-4444-4444-444444444444',
  'FREETEST Product', 10.00, 'each', 5, true, CURRENT_DATE + 7, 'vegetables'
);

SELECT ok(
  (SELECT price_usd FROM market_products WHERE id = 'e0e01111-0001-4a00-a001-000000000001') = 0,
  'Trigger forced price to $0 for blocked-state seller'
);

-- T5: nearby_booths with buyer_state_code='CA' excludes NY seller's booth
-- Sofia's booth should not appear for a CA buyer
SELECT ok(
  NOT EXISTS(
    SELECT 1 FROM nearby_booths(37.33::float8, -121.89::float8, 50.0::float8, null::text, null::text, null::numeric, null::numeric, null::text, 'CA'::text)
    WHERE owner_id = '44444444-4444-4444-4444-444444444444'
  ),
  'NY seller booth excluded for CA buyer via state isolation'
);

-- T6: nearby_booths with buyer_state_code=NULL returns all (backward compat)
SELECT ok(
  EXISTS(
    SELECT 1 FROM nearby_booths(37.33::float8, -121.89::float8, 50.0::float8, null::text, null::text, null::numeric, null::numeric, null::text, null::text)
    WHERE owner_id = '11111111-1111-1111-1111-111111111111'
  ),
  'NULL buyer_state_code returns all booths (backward compat)'
);

-- Cleanup
DELETE FROM market_products WHERE id = 'e0e01111-0001-4a00-a001-000000000001';
UPDATE profiles SET state_code = 'CA' WHERE id = '44444444-4444-4444-4444-444444444444';
DELETE FROM market_state_blocks;

SELECT * FROM finish();
ROLLBACK;
