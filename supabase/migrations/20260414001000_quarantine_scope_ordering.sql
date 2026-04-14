-- Add scope ordering: county → state → national
-- Also return a 'scope' field for section headers in the UI.

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
  created_by_admin boolean,
  scope text
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_county_id UUID;
  v_state_id UUID;
  v_country_iso_3 TEXT;
  v_zip5 TEXT;
BEGIN
  SELECT COALESCE(p.zip_code, LEFT(p.zip_plus4, 5)), COALESCE(p.country_code, 'USA')
  INTO v_zip5, v_country_iso_3
  FROM profiles p
  WHERE p.id = p_user_id
    AND (p.zip_code IS NOT NULL OR p.zip_plus4 IS NOT NULL);

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

  IF v_state_id IS NULL THEN
    SELECT s.id INTO v_state_id
    FROM profiles p JOIN states s ON s.code = p.state_code
    WHERE p.id = p_user_id AND p.state_code IS NOT NULL;
  END IF;

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
    qz.created_by_admin,
    CASE
      WHEN qz.county_id IS NOT NULL THEN 'county'
      WHEN qz.state_id IS NOT NULL AND qz.county_id IS NULL THEN 'state'
      ELSE 'national'
    END AS scope
  FROM quarantine_zones qz
  LEFT JOIN counties co ON co.id = qz.county_id
  LEFT JOIN states st ON st.id = qz.state_id
  WHERE qz.is_active = true
    AND (qz.ends_at IS NULL OR qz.ends_at >= CURRENT_DATE)
    AND (
      (qz.county_id IS NOT NULL AND v_county_id IS NOT NULL AND qz.county_id = v_county_id)
      OR (qz.state_id IS NOT NULL AND qz.county_id IS NULL AND qz.state_id = v_state_id)
      OR (qz.country_iso_3 IS NOT NULL AND qz.state_id IS NULL AND qz.county_id IS NULL
          AND qz.country_iso_3 = v_country_iso_3)
      OR (qz.country_iso_3 IS NULL AND qz.state_id IS NULL AND qz.county_id IS NULL AND qz.city_id IS NULL)
    )
  ORDER BY
    CASE
      WHEN qz.county_id IS NOT NULL THEN 1
      WHEN qz.state_id IS NOT NULL AND qz.county_id IS NULL THEN 2
      ELSE 3
    END,
    qz.pest_name;
END;
$$;
