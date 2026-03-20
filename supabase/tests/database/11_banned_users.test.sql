-- ==========================================================================
-- Test: Banned Users
-- Tests banning/unbanning using existing seed user (Sofia Rossi)
-- ==========================================================================
BEGIN;
SELECT plan(3);

-- Temporarily ban Sofia Rossi for testing
UPDATE profiles SET is_banned = true, banned_at = now() WHERE id = '44444444-4444-4444-4444-444444444444';

-- Add a test product with future date
INSERT INTO market_products (id, seller_id, name, price_usd, unit, inventory, is_active, market_date, category)
VALUES (
  'd0d01111-0001-4a00-a001-000000000001',
  '44444444-4444-4444-4444-444444444444',
  'BANTEST Product', 5.00, 'each', 10, true, CURRENT_DATE + 7, 'produce'
);

-- T1: Banned seller's booth does not appear
SELECT ok(
  NOT EXISTS(
    SELECT 1 FROM nearby_booths(37.33::float8, -121.89::float8, 50.0::float8, null::text, null::text, null::numeric, null::numeric, null::text, null::text)
    WHERE owner_id = '44444444-4444-4444-4444-444444444444'
  ),
  'Banned seller booth is excluded from nearby_booths'
);

-- T2: Unbanning makes booth appear
UPDATE profiles SET is_banned = false, banned_at = null WHERE id = '44444444-4444-4444-4444-444444444444';
SELECT ok(
  EXISTS(
    SELECT 1 FROM nearby_booths(37.33::float8, -121.89::float8, 50.0::float8, null::text, null::text, null::numeric, null::numeric, null::text, null::text)
    WHERE owner_id = '44444444-4444-4444-4444-444444444444'
  ),
  'Unbanned seller booth appears in nearby_booths'
);

-- T3: Re-banning hides booth again
UPDATE profiles SET is_banned = true, banned_at = now() WHERE id = '44444444-4444-4444-4444-444444444444';
SELECT ok(
  NOT EXISTS(
    SELECT 1 FROM nearby_booths(37.33::float8, -121.89::float8, 50.0::float8, null::text, null::text, null::numeric, null::numeric, null::text, null::text)
    WHERE owner_id = '44444444-4444-4444-4444-444444444444'
  ),
  'Re-banned seller booth is excluded again'
);

-- Cleanup: restore Sofia to unbanned state
UPDATE profiles SET is_banned = false, banned_at = null WHERE id = '44444444-4444-4444-4444-444444444444';

SELECT * FROM finish();
ROLLBACK;
