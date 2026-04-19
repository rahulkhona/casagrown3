-- Allow get_platform_fee_for_user to safely be called anonymously by frontend clients
-- It will gracefully default to the 'USA' config row in platform_fees.

DROP FUNCTION IF EXISTS public.get_platform_fee_for_user(uuid);

CREATE OR REPLACE FUNCTION public.get_platform_fee_for_user(
  p_user_id uuid DEFAULT NULL,
  p_country_code varchar(3) DEFAULT NULL
)
RETURNS float AS $$
DECLARE
  v_country_code varchar(3) := 'USA'; -- Absolute default
  v_fee_rate float;
BEGIN
  IF p_user_id IS NOT NULL THEN
    SELECT COALESCE(country_code, 'USA') INTO v_country_code
    FROM profiles
    WHERE id = p_user_id;

    -- If profile strictly doesn't exist, gracefully maintain fallback
    IF v_country_code IS NULL THEN v_country_code := 'USA'; END IF;
  ELSIF p_country_code IS NOT NULL THEN
    v_country_code := p_country_code;
  END IF;
  
  -- Lookup the latest active fee configuration
  SELECT fees INTO v_fee_rate
  FROM platform_fees
  WHERE country_code = v_country_code
  ORDER BY creation_date DESC
  LIMIT 1;
  
  -- Only trigger hardcoded structural logic if the platform_fees config table is literally empty
  IF v_fee_rate IS NULL THEN
    v_fee_rate := 0.10;
  END IF;
  
  RETURN v_fee_rate;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
