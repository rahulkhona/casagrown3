-- ==========================================================================
-- Test: Market Schedule & Settings
--
-- Verifies get_market_config RPC returns correct schedule and settings,
-- including market_never_closes override behavior.
-- ==========================================================================
BEGIN;
SELECT plan(8);

-- T1: get_market_config returns schedule key
SELECT ok(
  (SELECT get_market_config() ? 'schedule'),
  'get_market_config returns schedule key'
);

-- T2: get_market_config returns productsNeverExpire key
SELECT ok(
  (SELECT get_market_config() ? 'productsNeverExpire'),
  'get_market_config returns productsNeverExpire key'
);

-- T3: get_market_config returns marketNeverCloses key
SELECT ok(
  (SELECT get_market_config() ? 'marketNeverCloses'),
  'get_market_config returns marketNeverCloses key'
);

-- T4: Default productsNeverExpire is false
SELECT ok(
  NOT (get_market_config()->'productsNeverExpire')::text::boolean,
  'Default productsNeverExpire is false'
);

-- T5: Default marketNeverCloses is false (unless set for testing)
-- Save current value, set to false for test
UPDATE market_settings SET market_never_closes = false WHERE id = true;
SELECT ok(
  NOT (get_market_config()->'marketNeverCloses')::text::boolean,
  'marketNeverCloses is false when disabled'
);

-- T6: When market_never_closes=true, all days are returned
UPDATE market_settings SET market_never_closes = true WHERE id = true;
SELECT is(
  jsonb_array_length(get_market_config()->'schedule'),
  7,
  'market_never_closes returns all 7 days'
);

-- T7: When market_never_closes=true, days use 00:00-23:59
SELECT ok(
  (get_market_config()->'schedule'->0->>'openTime') = '00:00',
  'market_never_closes uses 00:00 open time'
);

-- T8: Schedule entries have required fields
SELECT ok(
  (get_market_config()->'schedule'->0) ? 'dayOfWeek'
  AND (get_market_config()->'schedule'->0) ? 'dayName'
  AND (get_market_config()->'schedule'->0) ? 'openTime'
  AND (get_market_config()->'schedule'->0) ? 'closeTime',
  'Schedule entries have all required fields'
);

-- Restore
UPDATE market_settings SET market_never_closes = true WHERE id = true;

SELECT * FROM finish();
ROLLBACK;
