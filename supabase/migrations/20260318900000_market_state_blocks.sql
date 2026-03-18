-- ============================================================================
-- Migration: Market State Blocks — State-isolated free market mode
--
-- Two compliance rules:
-- 1. State isolation: buyers only see booths from sellers in their own state
-- 2. Blocked states: sellers in listed states can only list at $0 (free)
--
-- Legal context: States like NY and CT don't recognize agent of payee,
-- so paid transactions cannot occur. Free sharing is allowed.
-- ============================================================================

-- Ensure PostGIS types are visible (extension may live in 'extensions' schema)
SET search_path TO public, extensions;

-- 0. Update minimum-order constraint to allow free ($0) products
--    The existing chk_minimum_product_potential blocks $0 products, but free
--    sharing mode needs them. Allow $0 prices (exempt from minimum order check).
ALTER TABLE market_products DROP CONSTRAINT IF EXISTS chk_minimum_product_potential;
ALTER TABLE market_products ADD CONSTRAINT chk_minimum_product_potential
  CHECK (price_usd = 0 OR (price_usd * inventory::numeric) >= 5.00);

-- 1. Policy table: states where paid transactions are blocked
CREATE TABLE market_state_blocks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_id   UUID NOT NULL REFERENCES states(id) ON DELETE CASCADE,
  reason     TEXT,  -- e.g. "Agent of payee not recognized"
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(state_id)
);

ALTER TABLE market_state_blocks ENABLE ROW LEVEL SECURITY;

-- Public can read (market app checks this), only service role can write
CREATE POLICY "Anyone can read market_state_blocks"
  ON market_state_blocks FOR SELECT USING (true);

-- 2. Trigger: enforce price_usd = 0 for sellers in blocked states
CREATE OR REPLACE FUNCTION enforce_free_market_price()
RETURNS TRIGGER AS $$
DECLARE
  v_state_code TEXT;
  v_is_blocked BOOLEAN;
BEGIN
  -- Get seller's state_code from profiles
  SELECT state_code INTO v_state_code
  FROM profiles WHERE id = NEW.seller_id;

  -- Check if their state is blocked
  SELECT EXISTS(
    SELECT 1 FROM market_state_blocks msb
    JOIN states s ON msb.state_id = s.id
    WHERE s.code = v_state_code AND s.country_iso_3 = 'USA'
  ) INTO v_is_blocked;

  -- If blocked, force price to 0
  IF v_is_blocked THEN
    NEW.price_usd := 0;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_enforce_free_market_price
  BEFORE INSERT OR UPDATE ON market_products
  FOR EACH ROW
  EXECUTE FUNCTION enforce_free_market_price();

-- 3. Helper function: check if a user is in a blocked state
CREATE OR REPLACE FUNCTION is_market_blocked_for_user(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_blocked BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM market_state_blocks msb
    JOIN states s ON msb.state_id = s.id
    JOIN profiles p ON p.state_code = s.code
    WHERE p.id = p_user_id AND s.country_iso_3 = 'USA'
  ) INTO v_blocked;
  RETURN COALESCE(v_blocked, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION is_market_blocked_for_user TO authenticated;

-- 4. Update nearby_booths RPC: add buyer_state_code for state isolation
CREATE OR REPLACE FUNCTION nearby_booths(
  user_lat DOUBLE PRECISION,
  user_lng DOUBLE PRECISION,
  max_miles DOUBLE PRECISION DEFAULT 25,
  fulfillment_filter TEXT DEFAULT 'all',
  product_search TEXT DEFAULT NULL,
  min_price NUMERIC DEFAULT NULL,
  max_price NUMERIC DEFAULT NULL,
  category_filter TEXT DEFAULT NULL,
  buyer_state_code TEXT DEFAULT NULL          -- NEW: state isolation
)
RETURNS TABLE(
  booth_id UUID, owner_id UUID, booth_name TEXT, description TEXT,
  decorative_theme TEXT, header_image_url TEXT,
  offers_delivery BOOLEAN, offers_pickup BOOLEAN,
  delivery_radius_miles INTEGER, pickup_address TEXT,
  delivery_windows JSONB, pickup_windows JSONB,
  distance_miles DOUBLE PRECISION, product_count BIGINT,
  matched_products JSONB,
  seller_avatar_url TEXT,
  seller_avg_rating NUMERIC,
  seller_rating_count INTEGER
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  user_point geometry;
BEGIN
  user_point := ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326);

  RETURN QUERY
  WITH booth_distances AS (
    SELECT b.id, b.owner_id, b.name, b.description, b.decorative_theme, b.header_image_url,
      b.offers_delivery, b.offers_pickup, b.delivery_radius_miles, b.pickup_address,
      b.delivery_windows, b.pickup_windows,
      ST_Distance(b.pickup_location::geography, user_point::geography) / 1609.34 AS dist_miles
    FROM market_booths b
    WHERE b.pickup_location IS NOT NULL
      AND ST_DWithin(b.pickup_location::geography, user_point::geography, max_miles * 1609.34)
      -- State isolation: only show booths from sellers in the buyer's state
      AND (buyer_state_code IS NULL OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = b.owner_id AND p.state_code = buyer_state_code
      ))
  ),
  filtered AS (
    SELECT bd.* FROM booth_distances bd
    WHERE CASE fulfillment_filter
      WHEN 'delivery' THEN bd.offers_delivery AND bd.dist_miles <= bd.delivery_radius_miles
      WHEN 'pickup'   THEN bd.offers_pickup
      ELSE (bd.offers_delivery OR bd.offers_pickup)
    END
  ),
  products AS (
    SELECT mp.seller_id,
      COUNT(*) FILTER (WHERE mp.is_active)::BIGINT AS total_count,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', mp.id, 'name', mp.name, 'description', mp.description,
            'price_usd', mp.price_usd, 'unit', mp.unit,
            'photo', mp.photos[1], 'inventory', mp.inventory,
            'category', mp.category, 'harvested_at', mp.harvested_at
          ) ORDER BY mp.created_at
        ) FILTER (WHERE mp.is_active
          AND (product_search IS NULL OR mp.name ILIKE '%' || product_search || '%')
          AND (min_price IS NULL OR mp.price_usd >= min_price)
          AND (max_price IS NULL OR mp.price_usd <= max_price)
          AND (category_filter IS NULL OR mp.category = category_filter)
        ), '[]'::jsonb
      ) AS prods
    FROM market_products mp GROUP BY mp.seller_id
  )
  SELECT f.id, f.owner_id, f.name, f.description, f.decorative_theme, f.header_image_url,
    f.offers_delivery, f.offers_pickup, f.delivery_radius_miles, f.pickup_address,
    f.delivery_windows, f.pickup_windows,
    ROUND(f.dist_miles::numeric, 1)::DOUBLE PRECISION AS distance_miles,
    COALESCE(p.total_count, 0) AS product_count,
    COALESCE(p.prods, '[]'::jsonb) AS matched_products,
    pr.avatar_url AS seller_avatar_url,
    pr.seller_avg_rating,
    pr.seller_rating_count
  FROM filtered f
  LEFT JOIN products p ON p.seller_id = f.owner_id
  LEFT JOIN profiles pr ON pr.id = f.owner_id
  WHERE (product_search IS NULL AND category_filter IS NULL AND min_price IS NULL AND max_price IS NULL)
    OR jsonb_array_length(COALESCE(p.prods, '[]'::jsonb)) > 0
  ORDER BY f.dist_miles;
END;
$$;
