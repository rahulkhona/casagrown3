-- ============================================================================
-- Update: check_quarantine_for_seller
-- Adds p_override_zip to allow querying quarantine rules before a user's 
-- profile is fully updated with their zip code (used by Guest Seller Wizard).
-- ============================================================================

DROP FUNCTION IF EXISTS check_quarantine_for_seller(uuid, text);

CREATE OR REPLACE FUNCTION check_quarantine_for_seller(
  p_seller_id uuid, 
  p_category text, 
  p_override_zip text DEFAULT NULL
)
RETURNS TABLE (
  pest_name text,
  county_name text,
  state_name text,
  source_url text,
  reason text,
  keywords text[]
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_county_id UUID;
  v_zip TEXT;
  v_country_iso_3 TEXT;
BEGIN
  -- Step 1: Get profile's country, and their stored zip if override is not provided
  SELECT 
    COALESCE(p_override_zip, p.zip_code, LEFT(p.zip_plus4, 5)), 
    COALESCE(p.country_code, 'USA')
  INTO v_zip, v_country_iso_3
  FROM profiles p
  WHERE p.id = p_seller_id
  LIMIT 1;

  -- If still no zip, return early
  IF v_zip IS NULL THEN RETURN; END IF;

  -- Step 2: Resolve county from the chosen zip
  SELECT z.county_id INTO v_county_id
  FROM zip_codes z
  WHERE z.zip_code = v_zip
    AND z.country_iso_3 = v_country_iso_3
  LIMIT 1;

  IF v_county_id IS NULL THEN RETURN; END IF;

  -- Step 3: Match county-level quarantines only
  RETURN QUERY
  SELECT
    qz.pest_name,
    co.name AS county_name,
    st.name AS state_name,
    qz.source_url,
    qz.reason,
    qz.keywords
  FROM quarantine_zones qz
  JOIN counties co ON co.id = qz.county_id
  LEFT JOIN states st ON st.id = qz.state_id
  WHERE qz.is_active = true
    AND qz.county_id = v_county_id
    AND (qz.ends_at IS NULL OR qz.ends_at >= CURRENT_DATE)
    AND (qz.category = p_category OR qz.category = 'ALL');
END;
$$;
