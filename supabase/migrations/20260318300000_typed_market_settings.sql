-- ============================================================================
-- Restructure market_settings: typed columns instead of key-value
-- Also fix schedule defaults to Saturday 8-11 AM
-- Add market_never_closes override for testing
-- ============================================================================

-- ============================================================
-- 1. Drop old key-value market_settings and recreate with typed columns
-- ============================================================
DROP TABLE IF EXISTS market_settings CASCADE;

CREATE TABLE market_settings (
  id                    BOOLEAN PRIMARY KEY DEFAULT true CHECK (id = true), -- singleton row
  products_never_expire BOOLEAN NOT NULL DEFAULT false,
  market_never_closes   BOOLEAN NOT NULL DEFAULT false,  -- testing override: market open 24/7
  updated_at            TIMESTAMPTZ DEFAULT now(),
  updated_by            UUID REFERENCES profiles(id)
);

ALTER TABLE market_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read settings" ON market_settings FOR SELECT USING (true);

-- Insert the single config row
INSERT INTO market_settings (id, products_never_expire, market_never_closes)
VALUES (true, false, false);

-- ============================================================
-- 2. Fix schedule defaults: Saturday 8-11 AM only
-- ============================================================
UPDATE market_schedule_policies SET is_enabled = false;
UPDATE market_schedule_policies
  SET is_enabled = true, open_time = '08:00', close_time = '11:00'
  WHERE day_of_week = 6;  -- Saturday

-- ============================================================
-- 3. Update get_market_config to use typed columns
-- ============================================================
CREATE OR REPLACE FUNCTION get_market_config()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_schedule JSONB;
  v_settings RECORD;
BEGIN
  -- Load settings
  SELECT ms.products_never_expire, ms.market_never_closes
  INTO v_settings
  FROM market_settings ms
  WHERE ms.id = true;

  -- If market_never_closes, return all days 00:00-23:59
  IF v_settings.market_never_closes THEN
    v_schedule := (
      SELECT jsonb_agg(
        jsonb_build_object(
          'dayOfWeek', msp.day_of_week,
          'dayName', msp.day_name,
          'openTime', '00:00',
          'closeTime', '23:59',
          'isEnabled', true
        ) ORDER BY msp.day_of_week
      )
      FROM market_schedule_policies msp
    );
  ELSE
    v_schedule := (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'dayOfWeek', msp.day_of_week,
          'dayName', msp.day_name,
          'openTime', msp.open_time,
          'closeTime', msp.close_time,
          'isEnabled', msp.is_enabled
        ) ORDER BY msp.day_of_week
      ), '[]'::jsonb)
      FROM market_schedule_policies msp
      WHERE msp.is_enabled = true
    );
  END IF;

  RETURN jsonb_build_object(
    'schedule', COALESCE(v_schedule, '[]'::jsonb),
    'productsNeverExpire', COALESCE(v_settings.products_never_expire, false),
    'marketNeverCloses', COALESCE(v_settings.market_never_closes, false)
  );
END;
$$;

-- ============================================================
-- 4. Update nearby_booths to use typed settings
-- ============================================================
CREATE OR REPLACE FUNCTION nearby_booths(
  user_lat DOUBLE PRECISION,
  user_lng DOUBLE PRECISION,
  max_miles DOUBLE PRECISION DEFAULT 25,
  fulfillment_filter TEXT DEFAULT 'all',
  product_search TEXT DEFAULT NULL,
  min_price NUMERIC DEFAULT NULL,
  max_price NUMERIC DEFAULT NULL,
  category_filter TEXT DEFAULT NULL
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
  v_never_expire BOOLEAN;
BEGIN
  user_point := ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326);

  -- Check products_never_expire from typed settings
  SELECT COALESCE(ms.products_never_expire, false) INTO v_never_expire
  FROM market_settings ms WHERE ms.id = true;

  RETURN QUERY
  WITH booth_distances AS (
    SELECT b.id, b.owner_id, b.name, b.description, b.decorative_theme, b.header_image_url,
      b.offers_delivery, b.offers_pickup, b.delivery_radius_miles, b.pickup_address,
      b.delivery_windows, b.pickup_windows,
      ST_Distance(b.pickup_location::geography, user_point::geography) / 1609.34 AS dist_miles
    FROM market_booths b
    JOIN profiles pr_check ON pr_check.id = b.owner_id AND NOT pr_check.is_banned
    WHERE b.pickup_location IS NOT NULL
      AND ST_DWithin(b.pickup_location::geography, user_point::geography, max_miles * 1609.34)
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
      COUNT(*) FILTER (WHERE mp.is_active AND (v_never_expire OR mp.market_date >= CURRENT_DATE))::BIGINT AS total_count,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', mp.id, 'name', mp.name, 'description', mp.description,
            'price_usd', mp.price_usd, 'unit', mp.unit,
            'photo', mp.photos[1], 'inventory', mp.inventory,
            'category', mp.category, 'harvested_at', mp.harvested_at
          ) ORDER BY mp.created_at
        ) FILTER (WHERE mp.is_active
          AND (v_never_expire OR mp.market_date >= CURRENT_DATE)
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

-- ============================================================
-- 5. Update refresh_product_data to use typed settings
-- ============================================================
CREATE OR REPLACE FUNCTION refresh_product_data(product_ids UUID[])
RETURNS TABLE(id UUID, price_usd NUMERIC, inventory INTEGER, is_active BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_never_expire BOOLEAN;
BEGIN
  SELECT COALESCE(ms.products_never_expire, false) INTO v_never_expire
  FROM market_settings ms WHERE ms.id = true;

  RETURN QUERY
  SELECT mp.id, mp.price_usd, mp.inventory,
    (mp.is_active AND (v_never_expire OR mp.market_date >= CURRENT_DATE)) AS is_active
  FROM market_products mp
  WHERE mp.id = ANY(product_ids);
END;
$$;
