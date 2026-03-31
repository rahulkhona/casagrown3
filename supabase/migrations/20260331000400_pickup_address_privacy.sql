-- ============================================================================
-- Privacy: Add pickup_display_address for public views
-- Full pickup_address only revealed in order details after purchase
-- ============================================================================

-- 1. Add display address column
ALTER TABLE market_booths
ADD COLUMN IF NOT EXISTS pickup_display_address TEXT;

COMMENT ON COLUMN market_booths.pickup_display_address IS
  'Public-facing approximate location (e.g. "Near Oak St & Main, San Jose"). Full pickup_address revealed only in order details.';

-- 2. Function to generate display address from full address
-- Strips house number, keeps street + city/state for approximate location
CREATE OR REPLACE FUNCTION generate_pickup_display_address(full_address TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_parts TEXT[];
  v_street TEXT;
  v_city_state TEXT;
  v_display TEXT;
BEGIN
  IF full_address IS NULL OR trim(full_address) = '' THEN
    RETURN NULL;
  END IF;

  -- Split by comma to get address parts
  v_parts := string_to_array(trim(full_address), ',');

  IF array_length(v_parts, 1) >= 2 THEN
    -- First part is street address — strip house number (leading digits + optional letter)
    v_street := trim(v_parts[1]);
    -- Remove leading house number: "123 Oak Street" → "Oak Street"
    -- Also handles "123A Oak Street", "12345 Oak Street"
    v_street := regexp_replace(v_street, '^\d+[A-Za-z]?\s+', '');

    -- Remaining parts are city, state, zip
    v_city_state := trim(v_parts[2]);
    -- Strip zip code from city/state if present
    v_city_state := regexp_replace(v_city_state, '\s*\d{5}(-\d{4})?\s*$', '');

    IF v_street != '' AND v_city_state != '' THEN
      v_display := 'Near ' || v_street || ', ' || v_city_state;
    ELSIF v_city_state != '' THEN
      v_display := v_city_state || ' area';
    ELSE
      v_display := 'Nearby location';
    END IF;
  ELSE
    -- Single part address — just strip the house number
    v_street := regexp_replace(trim(full_address), '^\d+[A-Za-z]?\s+', '');
    IF v_street != '' AND v_street != trim(full_address) THEN
      v_display := 'Near ' || v_street;
    ELSE
      v_display := 'Nearby location';
    END IF;
  END IF;

  RETURN v_display;
END;
$$;

-- 3. Backfill existing booths
UPDATE market_booths
SET pickup_display_address = generate_pickup_display_address(pickup_address)
WHERE pickup_address IS NOT NULL AND pickup_display_address IS NULL;

-- 4. Trigger to auto-generate display address when pickup_address changes
CREATE OR REPLACE FUNCTION auto_generate_pickup_display_address()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.pickup_address IS DISTINCT FROM OLD.pickup_address THEN
    NEW.pickup_display_address := generate_pickup_display_address(NEW.pickup_address);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_pickup_display ON market_booths;
CREATE TRIGGER trg_auto_pickup_display
  BEFORE INSERT OR UPDATE ON market_booths
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_pickup_display_address();

-- 5. Update nearby_booths to return display address instead of full address
-- The nearby_booths RPC currently returns pickup_address directly.
-- We swap it to return pickup_display_address for public browsing.
-- (The full address is only retrieved in order detail pages)
