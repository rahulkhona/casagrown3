-- ============================================================================
-- Migration: Quarantine Zones
-- Agricultural pest quarantine management system.
-- Blocks sellers in quarantined jurisdictions from listing affected categories.
-- ============================================================================

-- 1. Create quarantine_zones table
CREATE TABLE IF NOT EXISTS quarantine_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Jurisdiction (same hierarchy as category_restrictions)
  country_iso_3 TEXT REFERENCES countries(iso_3) DEFAULT 'USA',
  state_id UUID REFERENCES states(id),
  county_id UUID REFERENCES counties(id),
  city_id UUID REFERENCES cities(id),
  -- What's quarantined
  category TEXT NOT NULL,           -- matches sales_categories.name, or 'ALL'
  pest_name TEXT NOT NULL,          -- e.g. 'Mexican Fruit Fly', 'Citrus Greening (HLB)'
  -- When
  starts_at DATE NOT NULL DEFAULT CURRENT_DATE,
  ends_at DATE,                     -- NULL = indefinite until manually ended
  -- Metadata
  source_url TEXT,                  -- link to CDFA notice
  reason TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast filtering in nearby_booths
CREATE INDEX IF NOT EXISTS idx_quarantine_zones_active
  ON quarantine_zones (is_active, county_id, category)
  WHERE is_active = true;

-- Unique constraint to prevent duplicate quarantine entries
CREATE UNIQUE INDEX IF NOT EXISTS quarantine_zones_unified_idx
  ON quarantine_zones (
    category,
    pest_name,
    COALESCE(country_iso_3, ''),
    COALESCE(state_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(county_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(city_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- 2. RLS Policies
ALTER TABLE quarantine_zones ENABLE ROW LEVEL SECURITY;

-- Anyone can read quarantine zones (needed for seller-side checks in the frontend)
CREATE POLICY "Anyone can read quarantine zones"
  ON quarantine_zones FOR SELECT
  USING (true);

-- Only service role can insert/update/delete (admin API uses service role)
CREATE POLICY "Service role manages quarantine zones"
  ON quarantine_zones FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 3. RPC: check_quarantine_for_seller
-- Used by the "List a Product" page to check if a category is quarantined
-- in the seller's jurisdiction before allowing them to save.
CREATE OR REPLACE FUNCTION check_quarantine_for_seller(
  p_seller_id UUID,
  p_category TEXT
)
RETURNS TABLE (
  quarantine_id UUID,
  pest_name TEXT,
  category TEXT,
  county_name TEXT,
  state_name TEXT,
  starts_at DATE,
  ends_at DATE,
  source_url TEXT,
  reason TEXT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_county_id UUID;
  v_state_id UUID;
  v_country_iso_3 TEXT;
BEGIN
  -- Resolve seller's jurisdiction from their profile
  SELECT p.county_id, p.state_id, p.country_code
  INTO v_county_id, v_state_id, v_country_iso_3
  FROM profiles p
  LEFT JOIN zip_codes z ON z.zip_code = p.zip_code AND z.country_iso_3 = p.country_code
  LEFT JOIN cities ci ON ci.id = z.city_id
  WHERE p.id = p_seller_id;

  -- If seller has county_id directly on profile, use it
  -- Otherwise try to resolve from zip code
  IF v_county_id IS NULL THEN
    SELECT z.county_id, ci.state_id
    INTO v_county_id, v_state_id
    FROM profiles p
    JOIN zip_codes z ON z.zip_code = p.zip_code AND z.country_iso_3 = p.country_code
    LEFT JOIN cities ci ON ci.id = z.city_id
    WHERE p.id = p_seller_id;
  END IF;

  RETURN QUERY
  SELECT
    qz.id AS quarantine_id,
    qz.pest_name,
    qz.category,
    co.name AS county_name,
    st.name AS state_name,
    qz.starts_at,
    qz.ends_at,
    qz.source_url,
    qz.reason
  FROM quarantine_zones qz
  LEFT JOIN counties co ON co.id = qz.county_id
  LEFT JOIN states st ON st.id = qz.state_id
  WHERE qz.is_active = true
    AND qz.starts_at <= CURRENT_DATE
    AND (qz.ends_at IS NULL OR qz.ends_at >= CURRENT_DATE)
    AND (qz.category = p_category OR qz.category = 'ALL')
    AND (
      -- County-level match
      (qz.county_id IS NOT NULL AND qz.county_id = v_county_id)
      -- State-level match (no county specified = entire state)
      OR (qz.state_id IS NOT NULL AND qz.county_id IS NULL AND qz.state_id = v_state_id)
      -- Country-level match
      OR (qz.country_iso_3 IS NOT NULL AND qz.state_id IS NULL AND qz.county_id IS NULL
          AND qz.country_iso_3 = v_country_iso_3)
      -- Global quarantine
      OR (qz.country_iso_3 IS NULL AND qz.state_id IS NULL AND qz.county_id IS NULL AND qz.city_id IS NULL)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION check_quarantine_for_seller(UUID, TEXT) TO authenticated;

-- 4. Seed current CA quarantine data (March 2026)
-- Uses dynamic lookups to resolve county/state UUIDs

DO $$
DECLARE
  v_ca_state_id UUID;
  v_san_diego UUID;
  v_los_angeles UUID;
  v_orange UUID;
  v_riverside UUID;
  v_ventura UUID;
  v_santa_barbara UUID;
BEGIN
  -- Resolve CA state ID
  SELECT id INTO v_ca_state_id FROM states WHERE code = 'CA' LIMIT 1;
  IF v_ca_state_id IS NULL THEN
    RAISE NOTICE 'CA state not found — skipping quarantine seeding';
    RETURN;
  END IF;

  -- Resolve county IDs
  SELECT id INTO v_san_diego FROM counties WHERE name = 'San Diego' AND state_id = v_ca_state_id LIMIT 1;
  SELECT id INTO v_los_angeles FROM counties WHERE name = 'Los Angeles' AND state_id = v_ca_state_id LIMIT 1;
  SELECT id INTO v_orange FROM counties WHERE name = 'Orange' AND state_id = v_ca_state_id LIMIT 1;
  SELECT id INTO v_riverside FROM counties WHERE name = 'Riverside' AND state_id = v_ca_state_id LIMIT 1;
  SELECT id INTO v_ventura FROM counties WHERE name = 'Ventura' AND state_id = v_ca_state_id LIMIT 1;
  SELECT id INTO v_santa_barbara FROM counties WHERE name = 'Santa Barbara' AND state_id = v_ca_state_id LIMIT 1;

  -- Mexican Fruit Fly — San Diego (fruits)
  IF v_san_diego IS NOT NULL THEN
    INSERT INTO quarantine_zones (country_iso_3, state_id, county_id, category, pest_name, starts_at, source_url, reason)
    VALUES ('USA', v_ca_state_id, v_san_diego, 'produce', 'Mexican Fruit Fly',
            '2026-03-10', 'https://www.cdfa.ca.gov/plant/mexfly/',
            'CDFA/USDA quarantine — La Mesa area, San Diego County. Homegrown produce must not be moved from property.')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Sweet Orange Scab — Los Angeles (citrus)
  IF v_los_angeles IS NOT NULL THEN
    INSERT INTO quarantine_zones (country_iso_3, state_id, county_id, category, pest_name, starts_at, source_url, reason)
    VALUES ('USA', v_ca_state_id, v_los_angeles, 'citrus', 'Sweet Orange Scab (SOS)',
            '2026-02-01', 'https://www.cdfa.ca.gov/plant/sos/',
            'CDFA quarantine — Van Nuys area expanded March 2026. Citrus sharing restricted.')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Sweet Orange Scab — Orange County (citrus)
  IF v_orange IS NOT NULL THEN
    INSERT INTO quarantine_zones (country_iso_3, state_id, county_id, category, pest_name, starts_at, source_url, reason)
    VALUES ('USA', v_ca_state_id, v_orange, 'citrus', 'Sweet Orange Scab (SOS)',
            '2026-02-18', 'https://www.cdfa.ca.gov/plant/sos/',
            'CDFA quarantine — Villa Park area, Orange County. Citrus sharing restricted.')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Citrus Greening (HLB) — Riverside (citrus)
  IF v_riverside IS NOT NULL THEN
    INSERT INTO quarantine_zones (country_iso_3, state_id, county_id, category, pest_name, starts_at, source_url, reason)
    VALUES ('USA', v_ca_state_id, v_riverside, 'citrus', 'Citrus Greening (HLB)',
            '2026-01-01', 'https://www.cdfa.ca.gov/plant/hlb/',
            'CDFA/USDA quarantine — Corona area, Riverside County. Citrus movement restricted.')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Citrus Greening (HLB) — Orange County (citrus)
  IF v_orange IS NOT NULL THEN
    INSERT INTO quarantine_zones (country_iso_3, state_id, county_id, category, pest_name, starts_at, ends_at, source_url, reason)
    VALUES ('USA', v_ca_state_id, v_orange, 'citrus', 'Citrus Greening (HLB)',
            '2026-01-01', NULL, 'https://www.cdfa.ca.gov/plant/hlb/',
            'CDFA/USDA quarantine — San Juan Capistrano area, Orange County.')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Asian Citrus Psyllid — Ventura (monitoring/voluntary, but restricting citrus)
  IF v_ventura IS NOT NULL THEN
    INSERT INTO quarantine_zones (country_iso_3, state_id, county_id, category, pest_name, starts_at, source_url, reason, is_active)
    VALUES ('USA', v_ca_state_id, v_ventura, 'citrus', 'Asian Citrus Psyllid (ACP)',
            '2026-03-10', 'https://www.cdfa.ca.gov/plant/acp/',
            'CDFA monitoring — ACP detected positive for HLB bacteria. Voluntary treatment encouraged.', false)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Asian Citrus Psyllid — Santa Barbara (monitoring, not yet active)
  IF v_santa_barbara IS NOT NULL THEN
    INSERT INTO quarantine_zones (country_iso_3, state_id, county_id, category, pest_name, starts_at, source_url, reason, is_active)
    VALUES ('USA', v_ca_state_id, v_santa_barbara, 'citrus', 'Asian Citrus Psyllid (ACP)',
            '2026-03-10', 'https://www.cdfa.ca.gov/plant/acp/',
            'CDFA monitoring — ACP detected positive for HLB bacteria. Under observation.', false)
    ON CONFLICT DO NOTHING;
  END IF;

  RAISE NOTICE 'Quarantine zones seeded for CA counties';
END;
$$;
