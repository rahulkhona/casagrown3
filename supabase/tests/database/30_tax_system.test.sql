-- ============================================================================
-- pgTAP Tests: Tax System — ZipTax Cache, Category Rules, Product Overrides
-- ============================================================================
BEGIN;
SELECT plan(9);

-- ============================================================================
-- 1–3. Tables exist
-- ============================================================================
SELECT has_table('zip_tax_cache', 'zip_tax_cache table exists');
SELECT has_table('category_tax_rules', 'category_tax_rules table exists');
SELECT has_table('product_tax_overrides', 'product_tax_overrides table exists');

-- ============================================================================
-- 4. Cache hit: insert a cached rate for ZIP 95120
-- ============================================================================
INSERT INTO zip_tax_cache (zip_code, combined_rate, state_rate, county_rate, city_rate, district_rate, fetched_at, expires_at)
VALUES ('95120', 9.375, 7.25, 0.0, 0.0, 2.125, now(), now() + interval '30 days')
ON CONFLICT (zip_code) DO UPDATE SET
  combined_rate = EXCLUDED.combined_rate,
  expires_at = EXCLUDED.expires_at;

SELECT is(
  (SELECT combined_rate FROM zip_tax_cache WHERE zip_code = '95120' AND expires_at > now()),
  9.375::NUMERIC,
  'Cache hit: ZIP 95120 returns combined_rate = 9.375%'
);

-- ============================================================================
-- 5. Cache expiry: expired entries NOT returned
-- ============================================================================
INSERT INTO zip_tax_cache (zip_code, combined_rate, state_rate, county_rate, city_rate, district_rate, fetched_at, expires_at)
VALUES ('99999', 5.00, 5.00, 0.0, 0.0, 0.0, now() - interval '60 days', now() - interval '1 day')
ON CONFLICT (zip_code) DO UPDATE SET
  combined_rate = EXCLUDED.combined_rate,
  expires_at = now() - interval '1 day';

SELECT ok(
  NOT EXISTS(SELECT 1 FROM zip_tax_cache WHERE zip_code = '99999' AND expires_at > now()),
  'Cache expiry: expired ZIP 99999 entry is not returned by expires_at filter'
);

-- ============================================================================
-- 6. Category rule: produce is exempt (fixed 0%) in California
-- ============================================================================
-- Delete any existing active rule for CA+produce first (partial unique index)
DELETE FROM category_tax_rules
WHERE state_code = 'CA' AND category_name = 'produce' AND effective_until IS NULL;

INSERT INTO category_tax_rules (state_code, category_name, rule_type, rate_pct)
VALUES ('CA', 'produce', 'fixed', 0.00);

SELECT is(
  (SELECT rate_pct FROM category_tax_rules WHERE state_code = 'CA' AND category_name = 'produce' AND effective_until IS NULL),
  0.000::NUMERIC(5,3),
  'Category rule: CA produce is exempt (fixed 0%)'
);

-- ============================================================================
-- 7. Product override: "Raw Honey" taxed at 8.25% within 'honey' category
-- ============================================================================
DELETE FROM category_tax_rules
WHERE state_code = 'CA' AND category_name = 'honey' AND effective_until IS NULL;

INSERT INTO category_tax_rules (id, state_code, category_name, rule_type, rate_pct)
VALUES ('30000000-0000-0000-0000-000000000001', 'CA', 'honey', 'fixed', 0.00);

DELETE FROM product_tax_overrides
WHERE category_rule_id = '30000000-0000-0000-0000-000000000001' AND product_name = 'Raw Honey';

INSERT INTO product_tax_overrides (category_rule_id, product_name, rule_type, rate_pct)
VALUES ('30000000-0000-0000-0000-000000000001', 'Raw Honey', 'fixed', 8.25);

SELECT is(
  (SELECT rate_pct FROM product_tax_overrides WHERE product_name = 'Raw Honey' AND effective_until IS NULL),
  8.250::NUMERIC(5,3),
  'Product override: Raw Honey taxed at 8.25% despite exempt category'
);

-- ============================================================================
-- 8. Category 'evaluate' rule: falls through to ZipTax lookup
-- ============================================================================
DELETE FROM category_tax_rules
WHERE state_code = 'CA' AND category_name = 'eggs' AND effective_until IS NULL;

INSERT INTO category_tax_rules (state_code, category_name, rule_type, rate_pct)
VALUES ('CA', 'eggs', 'evaluate', NULL);

SELECT is(
  (SELECT rule_type::text FROM category_tax_rules WHERE state_code = 'CA' AND category_name = 'eggs' AND effective_until IS NULL),
  'evaluate',
  'Category evaluate rule: eggs falls through to ZipTax'
);

-- ============================================================================
-- 9. Multi-rule coexistence
-- ============================================================================
SELECT ok(
  (SELECT COUNT(*) FROM zip_tax_cache WHERE zip_code = '95120') > 0
  AND (SELECT COUNT(*) FROM category_tax_rules WHERE state_code = 'CA') > 0
  AND (SELECT COUNT(*) FROM product_tax_overrides WHERE product_name = 'Raw Honey') > 0,
  'Multi-rule coexistence: cache, category rules, and product overrides all coexist'
);

SELECT * FROM finish();
ROLLBACK;
