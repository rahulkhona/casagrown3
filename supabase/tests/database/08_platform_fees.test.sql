-- ==========================================================================
-- Test: Platform Fees
--
-- Verifies that platform_fees table has valid data and the fee lookup works.
-- ==========================================================================
BEGIN;
SELECT plan(3);

-- T1: platform_fees table has at least one entry
SELECT ok(
  (SELECT COUNT(*) > 0 FROM platform_fees),
  'platform_fees table has data'
);

-- T2: USA fee rate is reasonable (0-100%)
SELECT ok(
  (SELECT fees * 100 BETWEEN 0 AND 100 FROM platform_fees WHERE country_code = 'USA' ORDER BY creation_date DESC LIMIT 1),
  'USA platform fee rate is between 0-100%'
);

-- T3: Fee rate is accessible via the pattern used in create_order
SELECT ok(
  (SELECT COALESCE(fees * 100, 10) > 0 FROM platform_fees WHERE country_code = 'USA' ORDER BY creation_date DESC LIMIT 1),
  'Fee lookup returns positive rate'
);

SELECT * FROM finish();
ROLLBACK;
