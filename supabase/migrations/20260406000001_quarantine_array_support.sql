-- ============================================================================
-- Migration: Quarantine Array Support
-- Enhances quarantine_pest_categories and quarantine_zones down to botanical 
-- array precision while retaining the sales_category foreign key restriction.
-- Adds keyword-based blocking capabilities.
-- ============================================================================

-- 1. Add Arrays to quarantine_pest_categories cache
ALTER TABLE quarantine_pest_categories 
  RENAME COLUMN category TO sales_categories;

ALTER TABLE quarantine_pest_categories
  ALTER COLUMN sales_categories TYPE text[] USING ARRAY[sales_categories];

ALTER TABLE quarantine_pest_categories 
  RENAME COLUMN produce_category TO produce_categories;

ALTER TABLE quarantine_pest_categories
  ALTER COLUMN produce_categories TYPE text[] USING ARRAY[produce_categories];

ALTER TABLE quarantine_pest_categories
  ADD COLUMN IF NOT EXISTS keywords text[] NOT NULL DEFAULT '{}'::text[];

-- 2. Add Arrays to quarantine_zones
-- We keep 'category' exactly as is to preserve the foreign key to sales_categories
ALTER TABLE quarantine_zones
  ADD COLUMN IF NOT EXISTS produce_categories text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS keywords text[] NOT NULL DEFAULT '{}'::text[];

-- 3. Update the RPC to return all arrays to the Edge Function payload and UI
DROP FUNCTION IF EXISTS check_quarantine_for_seller(UUID, TEXT);

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
  reason TEXT,
  produce_categories text[],
  keywords text[]
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_county_id UUID;
  v_state_id UUID;
  v_country_iso_3 TEXT;
BEGIN
  -- Resolve seller's jurisdiction from zip_codes table
  SELECT z.county_id, ci.state_id, p.country_code
  INTO v_county_id, v_state_id, v_country_iso_3
  FROM profiles p
  JOIN zip_codes z ON z.zip_code = p.zip_code AND z.country_iso_3 = p.country_code
  LEFT JOIN cities ci ON ci.id = z.city_id
  WHERE p.id = p_seller_id;

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
    qz.reason,
    qz.produce_categories,
    qz.keywords
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

-- 4. Update the sync_bot_quarantines RPC
CREATE OR REPLACE FUNCTION sync_bot_quarantines(p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row jsonb;
  v_county_id uuid;
  v_state_id uuid;
  v_sales_category text;
BEGIN
  -- Validate payload
  IF jsonb_typeof(p_payload) != 'array' THEN
    RAISE EXCEPTION 'Payload must be a JSON array';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_payload)
  LOOP
    -- 1. Try to find the exact county mapping. We often rely on naming heuristics.
    SELECT id INTO v_state_id 
      FROM states 
      WHERE code = v_row->>'state_code' 
      LIMIT 1;

    IF (v_row->>'county_name') IS NOT NULL AND v_state_id IS NOT NULL THEN
      SELECT id INTO v_county_id 
        FROM counties 
        WHERE state_id = v_state_id AND name ILIKE '%' || (v_row->>'county_name') || '%'
        LIMIT 1;
    END IF;

    -- Insert multiple rows, one for each sales category
    FOR v_sales_category IN SELECT * FROM jsonb_array_elements_text(v_row->'sales_categories')
    LOOP
      INSERT INTO quarantine_zones (
        state_id,
        county_id,
        pest_name,
        category,
        produce_categories,
        keywords,
        reason,
        starts_at,
        ends_at,
        data_source,
        source_url,
        is_active,
        created_by_admin,
        created_at,
        updated_at
      ) VALUES (
        v_state_id,
        v_county_id,
        v_row->>'pest_name',
        v_sales_category,
        ARRAY(SELECT jsonb_array_elements_text(v_row->'produce_categories')),
        ARRAY(SELECT jsonb_array_elements_text(v_row->'keywords')),
        v_row->>'notes',
        COALESCE((NULLIF(v_row->>'starts_at', ''))::timestamptz, now()),
        (NULLIF(v_row->>'ends_at', ''))::timestamptz,
        COALESCE(v_row->>'data_source', 'Bot'),
        v_row->>'source_url',
        true,
        false,
        now(),
        now()
      );
    END LOOP;
    
    -- reset ids
    v_county_id := NULL;
    v_state_id := NULL;
  END LOOP;
END;
$$;
