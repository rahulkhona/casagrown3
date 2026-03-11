-- ============================================================================
-- Migration: Add Counties Table & Link Zip Codes
-- Includes:
-- 1. Create counties table
-- 2. Add county_id to zip_codes
-- 3. Update update-zip-codes seed function (commentary/prep)
-- ============================================================================

-- 1. Create counties table
CREATE TABLE IF NOT EXISTS counties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_id UUID NOT NULL REFERENCES states(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  fips_code TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(state_id, name)
);

-- RLS for counties
ALTER TABLE counties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read counties"
  ON counties FOR SELECT TO authenticated USING (true);

CREATE POLICY "Anon can read counties"
  ON counties FOR SELECT TO anon USING (true);

CREATE POLICY "Service roles can manage counties"
  ON counties FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. Add county_id to zip_codes
ALTER TABLE zip_codes 
ADD COLUMN IF NOT EXISTS county_id UUID REFERENCES counties(id) ON DELETE SET NULL;
