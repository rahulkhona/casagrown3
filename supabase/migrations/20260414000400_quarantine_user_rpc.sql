-- ============================================================================
-- Migration: RPC for quarantine info page — jurisdiction-aware
-- Returns quarantines relevant to a user based on their zip code,
-- using the same zip_codes → county → state resolution chain
-- as check_quarantine_for_seller.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_quarantines_for_user(p_user_id uuid)
RETURNS TABLE (
  quarantine_id uuid,
  pest_name text,
  category text,
  produce_categories text[],
  keywords text[],
  county_name text,
  state_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  source_url text,
  reason text,
  created_by_admin boolean
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_county_id UUID;
  v_state_id UUID;
  v_country_iso_3 TEXT;
BEGIN
  -- Resolve user's jurisdiction from zip_codes table
  -- profiles.zip_code → zip_codes.county_id, city.state_id
  SELECT z.county_id, ci.state_id, p.country_code
  INTO v_county_id, v_state_id, v_country_iso_3
  FROM profiles p
  JOIN zip_codes z ON z.zip_code = p.zip_code AND z.country_iso_3 = p.country_code
  LEFT JOIN cities ci ON ci.id = z.city_id
  WHERE p.id = p_user_id;

  -- If we couldn't resolve, try state_code directly from profile
  IF v_state_id IS NULL THEN
    SELECT s.id INTO v_state_id
    FROM profiles p
    JOIN states s ON s.code = p.state_code
    WHERE p.id = p_user_id;
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
      -- County-level: exact county match
      (qz.county_id IS NOT NULL AND qz.county_id = v_county_id)
      -- State-level: state matches, no county specified (statewide)
      OR (qz.state_id IS NOT NULL AND qz.county_id IS NULL AND qz.state_id = v_state_id)
      -- Country-level
      OR (qz.country_iso_3 IS NOT NULL AND qz.state_id IS NULL AND qz.county_id IS NULL
          AND qz.country_iso_3 = v_country_iso_3)
      -- Global quarantine
      OR (qz.country_iso_3 IS NULL AND qz.state_id IS NULL AND qz.county_id IS NULL AND qz.city_id IS NULL)
    )
  ORDER BY qz.starts_at DESC;
END;
$$;
