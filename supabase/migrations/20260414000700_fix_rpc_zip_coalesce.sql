-- Apply updated get_quarantines_for_user RPC
-- Uses COALESCE(zip_code, LEFT(zip_plus4, 5)) for legacy profiles
-- that only have zip_plus4 populated.

DROP FUNCTION IF EXISTS get_quarantines_for_user(uuid);

CREATE OR REPLACE FUNCTION get_quarantines_for_user(p_user_id uuid)
RETURNS TABLE (
  quarantine_id uuid,
  pest_name text,
  category text,
  produce_categories text[],
  keywords text[],
  county_name text,
  state_name text,
  starts_at date,
  ends_at date,
  source_url text,
  reason text,
  created_by_admin boolean
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_county_id UUID;
  v_state_id UUID;
  v_country_iso_3 TEXT;
  v_zip5 TEXT;
BEGIN
  -- Get 5-digit zip: prefer zip_code, extract from zip_plus4 for legacy profiles
  SELECT COALESCE(p.zip_code, LEFT(p.zip_plus4, 5)), COALESCE(p.country_code, 'USA')
  INTO v_zip5, v_country_iso_3
  FROM profiles p
  WHERE p.id = p_user_id
    AND (p.zip_code IS NOT NULL OR p.zip_plus4 IS NOT NULL);

  -- Try zip_codes resolution: zip → county → state
  IF v_zip5 IS NOT NULL THEN
    SELECT z.county_id, COALESCE(ci.state_id, co2.state_id)
    INTO v_county_id, v_state_id
    FROM zip_codes z
    LEFT JOIN cities ci ON ci.id = z.city_id
    LEFT JOIN counties co2 ON co2.id = z.county_id
    WHERE z.zip_code = v_zip5
      AND z.country_iso_3 = v_country_iso_3
    LIMIT 1;
  END IF;

  -- Fallback: use state_code from profile
  IF v_state_id IS NULL THEN
    SELECT s.id
    INTO v_state_id
    FROM profiles p
    JOIN states s ON s.code = p.state_code
    WHERE p.id = p_user_id
      AND p.state_code IS NOT NULL;
  END IF;

  -- If we couldn't resolve any location, return empty
  IF v_state_id IS NULL AND v_county_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    qz.id AS quarantine_id,
    qz.pest_name,
    qz.category,
    qz.produce_categories,
    qz.keywords,
    co.name AS county_name,
    st.name AS state_name,
    qz.starts_at,
    qz.ends_at,
    qz.source_url,
    qz.reason,
    qz.created_by_admin
  FROM quarantine_zones qz
  LEFT JOIN counties co ON co.id = qz.county_id
  LEFT JOIN states st ON st.id = qz.state_id
  WHERE qz.is_active = true
    AND (qz.ends_at IS NULL OR qz.ends_at >= CURRENT_DATE)
    AND (
      -- County-level: user's exact county
      (qz.county_id IS NOT NULL AND v_county_id IS NOT NULL AND qz.county_id = v_county_id)
      -- State-level: user's state (statewide + county-specific in same state)
      OR (qz.state_id IS NOT NULL AND qz.state_id = v_state_id)
      -- Country-level
      OR (qz.country_iso_3 IS NOT NULL AND qz.state_id IS NULL AND qz.county_id IS NULL
          AND qz.country_iso_3 = v_country_iso_3)
      -- Global quarantine
      OR (qz.country_iso_3 IS NULL AND qz.state_id IS NULL AND qz.county_id IS NULL AND qz.city_id IS NULL)
    )
  ORDER BY qz.starts_at DESC;
END;
$$;
