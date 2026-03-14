-- ============================================================================
-- Migration: Browse Market — Booth location + nearby booths RPC
-- Adds PostGIS pickup_location to market_booths for spatial queries
-- Creates RPC for finding nearby booths with distance calculation
-- ============================================================================

-- 1. Add pickup location (PostGIS point) to market_booths
ALTER TABLE market_booths
  ADD COLUMN IF NOT EXISTS pickup_location geometry(Point, 4326);

CREATE INDEX IF NOT EXISTS idx_market_booths_pickup_loc
  ON market_booths USING GIST(pickup_location);

-- 2. RPC: Find nearby booths with distance, filtering, and product search
CREATE OR REPLACE FUNCTION nearby_booths(
  user_lat DOUBLE PRECISION,
  user_lng DOUBLE PRECISION,
  max_miles DOUBLE PRECISION DEFAULT 25,
  fulfillment_filter TEXT DEFAULT 'all',       -- 'delivery', 'pickup', 'all'
  product_search TEXT DEFAULT NULL
)
RETURNS TABLE(
  booth_id UUID,
  owner_id UUID,
  booth_name TEXT,
  description TEXT,
  decorative_theme TEXT,
  header_image_url TEXT,
  offers_delivery BOOLEAN,
  offers_pickup BOOLEAN,
  delivery_radius_miles INTEGER,
  pickup_address TEXT,
  delivery_windows JSONB,
  pickup_windows JSONB,
  distance_miles DOUBLE PRECISION,
  product_count BIGINT,
  matched_products JSONB
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  user_point geometry;
BEGIN
  user_point := ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326);

  RETURN QUERY
  WITH booth_distances AS (
    SELECT
      b.id,
      b.owner_id,
      b.name,
      b.description,
      b.decorative_theme,
      b.header_image_url,
      b.offers_delivery,
      b.offers_pickup,
      b.delivery_radius_miles,
      b.pickup_address,
      b.delivery_windows,
      b.pickup_windows,
      -- Distance in miles (ST_Distance returns meters for geography cast)
      ST_Distance(b.pickup_location::geography, user_point::geography) / 1609.34 AS dist_miles
    FROM market_booths b
    WHERE b.pickup_location IS NOT NULL
      -- Bounding box pre-filter: ~25 miles ≈ 0.4 degrees
      AND ST_DWithin(
        b.pickup_location::geography,
        user_point::geography,
        max_miles * 1609.34
      )
  ),
  filtered AS (
    SELECT bd.*
    FROM booth_distances bd
    WHERE
      CASE fulfillment_filter
        WHEN 'delivery' THEN bd.offers_delivery AND bd.dist_miles <= bd.delivery_radius_miles
        WHEN 'pickup'   THEN bd.offers_pickup
        ELSE (bd.offers_delivery OR bd.offers_pickup)
      END
  ),
  products AS (
    SELECT
      mp.seller_id,
      COUNT(*)::BIGINT AS prod_count,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', mp.id,
            'name', mp.name,
            'price_usd', mp.price_usd,
            'unit', mp.unit,
            'photo', mp.photos[1],
            'inventory', mp.inventory,
            'category', mp.category,
            'harvested_at', mp.harvested_at
          ) ORDER BY mp.created_at
        ) FILTER (WHERE mp.is_active),
        '[]'::jsonb
      ) AS prods
    FROM market_products mp
    WHERE mp.is_active = true
    GROUP BY mp.seller_id
  )
  SELECT
    f.id AS booth_id,
    f.owner_id,
    f.name AS booth_name,
    f.description,
    f.decorative_theme,
    f.header_image_url,
    f.offers_delivery,
    f.offers_pickup,
    f.delivery_radius_miles,
    f.pickup_address,
    f.delivery_windows,
    f.pickup_windows,
    ROUND(f.dist_miles::numeric, 1)::DOUBLE PRECISION AS distance_miles,
    COALESCE(p.prod_count, 0) AS product_count,
    COALESCE(p.prods, '[]'::jsonb) AS matched_products
  FROM filtered f
  LEFT JOIN products p ON p.seller_id = f.owner_id
  WHERE
    -- If product search specified, only show booths with matching products
    (product_search IS NULL OR EXISTS (
      SELECT 1 FROM market_products mp2
      WHERE mp2.seller_id = f.owner_id
        AND mp2.is_active = true
        AND mp2.name ILIKE '%' || product_search || '%'
    ))
  ORDER BY f.dist_miles;
END;
$$;

-- Grant execute to authenticated and anon users (public browse)
GRANT EXECUTE ON FUNCTION nearby_booths TO authenticated, anon;
