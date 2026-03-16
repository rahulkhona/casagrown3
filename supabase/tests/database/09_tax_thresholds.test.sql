-- ==========================================================================
-- Test: Tax Reporting Thresholds (fixed column name: amount not threshold_amount)
-- ==========================================================================
BEGIN;
SELECT plan(4);

-- T1: Table has a _default entry
SELECT ok(
  EXISTS(SELECT 1 FROM tax_reporting_thresholds WHERE state_code = '_default'),
  'tax_reporting_thresholds has _default entry'
);

-- T2: Default threshold amount is positive
SELECT ok(
  (SELECT amount > 0 FROM tax_reporting_thresholds WHERE state_code = '_default' LIMIT 1),
  'Default threshold amount is positive'
);

-- T3: warn_pct is between 0 and 1 (decimal)
SELECT ok(
  (SELECT warn_pct BETWEEN 0 AND 1 FROM tax_reporting_thresholds WHERE state_code = '_default' LIMIT 1),
  'Default warn_pct is between 0 and 1'
);

-- T4: Non-existent state returns no rows
SELECT ok(
  NOT EXISTS(SELECT 1 FROM tax_reporting_thresholds WHERE state_code = 'ZZ'),
  'Non-existent state returns no rows (app should fallback to _default)'
);

SELECT * FROM finish();
ROLLBACK;
