-- ============================================================================
-- Migration: Add `get_user_jurisdiction` helper function
-- This function takes a user ID and returns their resolved jurisdiction record.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_user_jurisdiction(p_user_id UUID)
RETURNS TABLE (
  country_iso_3 TEXT,
  state_id UUID,
  county_id UUID,
  city_id UUID
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_country_iso_3 TEXT;
  v_state_id UUID;
  v_county_id UUID;
  v_city_id UUID;
  v_zip_code TEXT;
BEGIN
  -- 1. Get user's zip code and country from profiles
  SELECT profiles.zip_code, profiles.country_code
  INTO v_zip_code, v_country_iso_3
  FROM profiles
  WHERE id = p_user_id;

  IF v_zip_code IS NULL THEN
    RETURN; -- User doesn't have an address set
  END IF;

  -- 2. Lookup the zip_code in zip_codes table to get city, state, county
  SELECT 
    z.city_id,
    c.state_id,
    z.county_id
  INTO 
    v_city_id,
    v_state_id,
    v_county_id
  FROM zip_codes z
  LEFT JOIN cities c ON z.city_id = c.id
  WHERE z.zip_code = v_zip_code AND z.country_iso_3 = v_country_iso_3;

  -- 3. Return the composite record
  RETURN QUERY SELECT 
    v_country_iso_3,
    v_state_id,
    v_county_id,
    v_city_id;
END;
$$;
