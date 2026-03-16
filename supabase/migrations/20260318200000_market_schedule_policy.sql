-- ============================================================================
-- Admin Market Schedule Policy
--
-- Allows admins to configure which days/hours the market is open.
-- Also provides a "products_never_expire" override.
-- ============================================================================

-- ============================================================
-- 1. Market schedule table (admin-managed)
-- ============================================================
CREATE TABLE IF NOT EXISTS market_schedule_policies (
  day_of_week   INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Sun, 6=Sat
  day_name      TEXT NOT NULL,
  open_time     TEXT NOT NULL DEFAULT '08:00',  -- HH:MM format
  close_time    TEXT NOT NULL DEFAULT '14:00',  -- HH:MM format
  is_enabled    BOOLEAN NOT NULL DEFAULT true,
  updated_at    TIMESTAMPTZ DEFAULT now(),
  updated_by    UUID REFERENCES profiles(id),
  PRIMARY KEY (day_of_week)
);

-- ============================================================
-- 2. Market settings table (admin overrides)
-- ============================================================
CREATE TABLE IF NOT EXISTS market_settings (
  key           TEXT PRIMARY KEY,
  value         TEXT NOT NULL,
  description   TEXT,
  updated_at    TIMESTAMPTZ DEFAULT now(),
  updated_by    UUID REFERENCES profiles(id)
);

-- Enable RLS
ALTER TABLE market_schedule_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_settings ENABLE ROW LEVEL SECURITY;

-- Everyone can read schedule (needed for market app)
CREATE POLICY "Anyone can read schedule" ON market_schedule_policies FOR SELECT USING (true);
CREATE POLICY "Anyone can read settings" ON market_settings FOR SELECT USING (true);

-- ============================================================
-- 3. Seed default schedule (open every day 6AM-11PM for dev)
-- ============================================================
INSERT INTO market_schedule_policies (day_of_week, day_name, open_time, close_time, is_enabled) VALUES
  (0, 'Sunday',    '06:00', '23:00', true),
  (1, 'Monday',    '06:00', '23:00', true),
  (2, 'Tuesday',   '06:00', '23:00', true),
  (3, 'Wednesday', '06:00', '23:00', true),
  (4, 'Thursday',  '06:00', '23:00', true),
  (5, 'Friday',    '06:00', '23:00', true),
  (6, 'Saturday',  '06:00', '23:00', true)
ON CONFLICT (day_of_week) DO NOTHING;

-- Seed the products_never_expire setting (default: false)
INSERT INTO market_settings (key, value, description) VALUES
  ('products_never_expire', 'false', 'When true, products do not expire after their market_date. Admin override.')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 4. RPC to load schedule + settings in one call
-- ============================================================
CREATE OR REPLACE FUNCTION get_market_config()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_schedule JSONB;
  v_never_expire BOOLEAN;
BEGIN
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'dayOfWeek', msp.day_of_week,
      'dayName', msp.day_name,
      'openTime', msp.open_time,
      'closeTime', msp.close_time,
      'isEnabled', msp.is_enabled
    ) ORDER BY msp.day_of_week
  ), '[]'::jsonb)
  INTO v_schedule
  FROM market_schedule_policies msp
  WHERE msp.is_enabled = true;

  SELECT COALESCE(ms.value, 'false')::BOOLEAN
  INTO v_never_expire
  FROM market_settings ms
  WHERE ms.key = 'products_never_expire';

  RETURN jsonb_build_object(
    'schedule', v_schedule,
    'productsNeverExpire', COALESCE(v_never_expire, false)
  );
END;
$$;

-- ============================================================
-- 5. Update nearby_booths to respect products_never_expire
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

  -- Check if products_never_expire is set
  SELECT COALESCE(ms.value, 'false')::BOOLEAN INTO v_never_expire
  FROM market_settings ms WHERE ms.key = 'products_never_expire';

  RETURN QUERY
  WITH booth_distances AS (
    SELECT b.id, b.owner_id, b.name, b.description, b.decorative_theme, b.header_image_url,
      b.offers_delivery, b.offers_pickup, b.delivery_radius_miles, b.pickup_address,
      b.delivery_windows, b.pickup_windows,
      ST_Distance(b.pickup_location::geography, user_point::geography) / 1609.34 AS dist_miles
    FROM market_booths b
    -- Exclude banned sellers
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
      -- Only count non-expired active products (unless never_expire is on)
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
          AND (v_never_expire OR mp.market_date >= CURRENT_DATE)  -- Respect never_expire
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
-- 6. Update refresh_product_data to respect products_never_expire
-- ============================================================
CREATE OR REPLACE FUNCTION refresh_product_data(product_ids UUID[])
RETURNS TABLE(id UUID, price_usd NUMERIC, inventory INTEGER, is_active BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_never_expire BOOLEAN;
BEGIN
  SELECT COALESCE(ms.value, 'false')::BOOLEAN INTO v_never_expire
  FROM market_settings ms WHERE ms.key = 'products_never_expire';

  RETURN QUERY
  SELECT mp.id, mp.price_usd, mp.inventory,
    (mp.is_active AND (v_never_expire OR mp.market_date >= CURRENT_DATE)) AS is_active
  FROM market_products mp
  WHERE mp.id = ANY(product_ids);
END;
$$;
