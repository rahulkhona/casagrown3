-- ============================================================================
-- Migration: Tax Rate Cache + RLS Policies
-- Cache for ZipTax API results, resets monthly.
-- RLS policies for category_tax_rules, product_tax_overrides, zip_tax_cache.
-- ============================================================================

-- 1. Zip Tax Cache table
CREATE TABLE IF NOT EXISTS zip_tax_cache (
  zip_code       TEXT PRIMARY KEY,
  combined_rate  NUMERIC(7,4) NOT NULL,  -- e.g. 9.1250%
  state_rate     NUMERIC(7,4),
  county_rate    NUMERIC(7,4),
  city_rate      NUMERIC(7,4),
  district_rate  NUMERIC(7,4),
  fetched_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ NOT NULL DEFAULT (date_trunc('month', now()) + interval '1 month')
);

-- RLS for zip_tax_cache
ALTER TABLE zip_tax_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read cached rates"
  ON zip_tax_cache FOR SELECT TO authenticated USING (true);

-- Service role can insert/update (Edge Function uses service_role key)
-- No explicit policy needed for service_role as it bypasses RLS

-- 2. RLS for category_tax_rules
ALTER TABLE category_tax_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read tax rules"
  ON category_tax_rules FOR SELECT TO authenticated USING (true);

CREATE POLICY "Anon can read tax rules"
  ON category_tax_rules FOR SELECT TO anon USING (true);

CREATE POLICY "Admins can manage tax rules"
  ON category_tax_rules FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()));

-- 3. RLS for product_tax_overrides
ALTER TABLE product_tax_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read product tax overrides"
  ON product_tax_overrides FOR SELECT TO authenticated USING (true);

CREATE POLICY "Anon can read product tax overrides"
  ON product_tax_overrides FOR SELECT TO anon USING (true);

CREATE POLICY "Admins can manage product tax overrides"
  ON product_tax_overrides FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()));
