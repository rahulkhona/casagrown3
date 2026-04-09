-- ============================================================================
-- Fix: Apply moderation_status filter to nearby_booths + approve existing products
-- ============================================================================
-- The paginated nearby_booths (20260401100000) was missing the moderation_status
-- filter, allowing pending/flagged products to appear in the marketplace.
-- Also: existing products defaulted to 'pending' when the moderation_status column
-- was added (20260325085329) but were never approved. This fixes both issues.
-- ============================================================================

SET search_path TO public, extensions;

-- 1. Auto-approve all existing products (market is always-on, no moderation workflow yet)
UPDATE public.market_products
SET moderation_status = 'approved'
WHERE moderation_status = 'pending';

-- 2. Drop the old 10-param nearby_booths overload (replaced by 12-param paginated version)
DROP FUNCTION IF EXISTS nearby_booths(
  double precision, double precision, double precision,
  text, text, numeric, numeric, text, text, boolean
);

-- 3. Re-create the paginated nearby_booths with moderation_status filter
CREATE OR REPLACE FUNCTION nearby_booths(
  user_lat DOUBLE PRECISION,
  user_lng DOUBLE PRECISION,
  max_miles DOUBLE PRECISION DEFAULT 25,
  fulfillment_filter TEXT DEFAULT 'all',
  product_search TEXT DEFAULT NULL,
  min_price NUMERIC DEFAULT NULL,
  max_price NUMERIC DEFAULT NULL,
  category_filter TEXT DEFAULT NULL,
  buyer_state_code TEXT DEFAULT NULL,
  exclude_demos BOOLEAN DEFAULT false,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
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
  seller_rating_count INTEGER,
  is_demo BOOLEAN
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  user_point geometry;
  v_never_expire BOOLEAN;
  v_min_total INTEGER;
  v_real_count INTEGER;
  v_is_blocked_state BOOLEAN;
  v_tmpl RECORD;
  v_demo_products JSONB;
  v_jitter_lat DOUBLE PRECISION;
  v_jitter_lng DOUBLE PRECISION;
  v_demo_dist DOUBLE PRECISION;
  v_demo_rating NUMERIC;
  v_demo_rating_count INTEGER;
BEGIN
  user_point := ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326);

  SELECT COALESCE(ms.products_never_expire, false), COALESCE(ms.demo_booth_min_total, 12)
    INTO v_never_expire, v_min_total
  FROM market_settings ms WHERE ms.id = true;

  v_is_blocked_state := false;
  IF buyer_state_code IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM market_state_blocks msb
      JOIN states s ON s.id = msb.state_id
      WHERE s.code = buyer_state_code
    ) INTO v_is_blocked_state;
  END IF;

  RETURN QUERY
  WITH booth_distances AS (
    SELECT b.id, b.owner_id, b.name, b.description, b.decorative_theme, b.header_image_url,
      b.offers_delivery, b.offers_pickup, b.delivery_radius_miles,
      COALESCE(b.pickup_display_address, b.pickup_address) AS pickup_address,
      b.delivery_windows, b.pickup_windows,
      ST_Distance(b.pickup_location::geography, user_point::geography) / 1609.34 AS dist_miles
    FROM market_booths b
    JOIN profiles pr_check ON pr_check.id = b.owner_id AND NOT pr_check.is_banned
    WHERE b.pickup_location IS NOT NULL
      AND ST_DWithin(b.pickup_location::geography, user_point::geography, max_miles * 1609.34)
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
      COUNT(*) FILTER (WHERE mp.is_active AND NOT mp.is_draft
        AND COALESCE(mp.moderation_status, 'approved') = 'approved'
        AND (v_never_expire OR mp.expires_at IS NULL OR mp.expires_at > now())
        AND NOT EXISTS (
          SELECT 1 FROM quarantine_zones qz
          JOIN profiles seller_p ON seller_p.id = mp.seller_id
          LEFT JOIN zip_codes seller_z ON seller_z.zip_code = seller_p.zip_code AND seller_z.country_iso_3 = seller_p.country_code
          LEFT JOIN cities seller_ci ON seller_ci.id = seller_z.city_id
          WHERE qz.is_active = true
            AND qz.starts_at <= CURRENT_DATE
            AND (qz.ends_at IS NULL OR qz.ends_at >= CURRENT_DATE)
            AND (qz.category = mp.category OR qz.category = 'ALL')
            AND (
              (qz.county_id IS NOT NULL AND qz.county_id = seller_z.county_id)
              OR (qz.state_id IS NOT NULL AND qz.county_id IS NULL AND qz.state_id = seller_ci.state_id)
              OR (qz.country_iso_3 IS NOT NULL AND qz.state_id IS NULL AND qz.county_id IS NULL
                  AND qz.country_iso_3 = seller_p.country_code)
              OR (qz.country_iso_3 IS NULL AND qz.state_id IS NULL AND qz.county_id IS NULL AND qz.city_id IS NULL)
            )
        )
      )::BIGINT AS total_count,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', mp.id, 'name', mp.name, 'description', mp.description,
            'price_usd', mp.price_usd, 'unit', mp.unit,
            'photo', mp.photos[1], 'inventory', mp.inventory,
            'category', mp.category, 'harvested_at', mp.harvested_at,
            'window_dates', mp.window_dates,
            'product_delivery_windows', mp.product_delivery_windows,
            'product_pickup_windows', mp.product_pickup_windows
          ) ORDER BY mp.created_at
        ) FILTER (WHERE mp.is_active AND NOT mp.is_draft
          AND COALESCE(mp.moderation_status, 'approved') = 'approved'
          AND (v_never_expire OR mp.expires_at IS NULL OR mp.expires_at > now())
          AND (product_search IS NULL OR NOT EXISTS (
            SELECT 1 FROM unnest(string_to_array(lower(product_search), ' ')) AS word
            WHERE length(word) >= 2
            AND NOT (lower(concat_ws(' ', mp.name, mp.description, mp.category)) LIKE '%' || word || '%')
          ))
          AND (min_price IS NULL OR mp.price_usd >= min_price)
          AND (max_price IS NULL OR mp.price_usd <= max_price)
          AND (category_filter IS NULL OR mp.category = category_filter)
          AND NOT EXISTS (
            SELECT 1 FROM quarantine_zones qz
            JOIN profiles seller_p ON seller_p.id = mp.seller_id
            LEFT JOIN zip_codes seller_z ON seller_z.zip_code = seller_p.zip_code AND seller_z.country_iso_3 = seller_p.country_code
            LEFT JOIN cities seller_ci ON seller_ci.id = seller_z.city_id
            WHERE qz.is_active = true
              AND qz.starts_at <= CURRENT_DATE
              AND (qz.ends_at IS NULL OR qz.ends_at >= CURRENT_DATE)
              AND (qz.category = mp.category OR qz.category = 'ALL')
              AND (
                (qz.county_id IS NOT NULL AND qz.county_id = seller_z.county_id)
                OR (qz.state_id IS NOT NULL AND qz.county_id IS NULL AND qz.state_id = seller_ci.state_id)
                OR (qz.country_iso_3 IS NOT NULL AND qz.state_id IS NULL AND qz.county_id IS NULL
                    AND qz.country_iso_3 = seller_p.country_code)
                OR (qz.country_iso_3 IS NULL AND qz.state_id IS NULL AND qz.county_id IS NULL AND qz.city_id IS NULL)
              )
          )
        ), '[]'::jsonb
      ) AS prods
    FROM market_products mp GROUP BY mp.seller_id
  )
  SELECT f.id, f.owner_id, f.name, f.description, f.decorative_theme, f.header_image_url,
    f.offers_delivery, f.offers_pickup, f.delivery_radius_miles,
    f.pickup_address,
    f.delivery_windows, f.pickup_windows,
    ROUND(f.dist_miles::numeric, 1)::DOUBLE PRECISION AS distance_miles,
    COALESCE(p.total_count, 0) AS product_count,
    COALESCE(p.prods, '[]'::jsonb) AS matched_products,
    pr.avatar_url AS seller_avatar_url,
    pr.seller_avg_rating,
    pr.seller_rating_count,
    false AS is_demo
  FROM filtered f
  LEFT JOIN products p ON p.seller_id = f.owner_id
  LEFT JOIN profiles pr ON pr.id = f.owner_id
  WHERE jsonb_array_length(COALESCE(p.prods, '[]'::jsonb)) > 0
  ORDER BY f.dist_miles
  LIMIT p_limit
  OFFSET p_offset;

  GET DIAGNOSTICS v_real_count = ROW_COUNT;

  -- Only append demo booths on the first page (offset = 0)
  IF NOT exclude_demos AND p_offset = 0 AND v_real_count < v_min_total THEN
    FOR v_tmpl IN
      SELECT * FROM demo_booth_templates ORDER BY random() LIMIT (v_min_total - v_real_count)
    LOOP
      v_jitter_lat := user_lat + (random() * 0.01 - 0.005);
      v_jitter_lng := user_lng + (random() * 0.01 - 0.005);
      v_demo_dist := ROUND((random() * 2.5 + 0.2)::numeric, 1)::DOUBLE PRECISION;

      v_demo_rating := ROUND((v_tmpl.rating_min + random() * (v_tmpl.rating_max - v_tmpl.rating_min))::numeric, 1);
      v_demo_rating_count := v_tmpl.rating_count_min + floor(random() * (v_tmpl.rating_count_max - v_tmpl.rating_count_min + 1))::integer;

      SELECT COALESCE(jsonb_agg(prod_obj), '[]'::jsonb) INTO v_demo_products
      FROM (
        SELECT jsonb_build_object(
          'id', 'demo-' || dpc.id,
          'name', dpc.name,
          'description', dpc.description,
          'price_usd', CASE WHEN v_is_blocked_state THEN 0.00 ELSE dpc.price_usd END,
          'unit', dpc.unit,
          'photo', dpc.photo_url,
          'inventory', (floor(random() * 20) + 5)::int,
          'category', dpc.category,
          'harvested_at', NULL
        ) AS prod_obj
        FROM demo_product_catalog dpc
        WHERE (category_filter IS NULL OR dpc.category = category_filter)
          AND (product_search IS NULL OR NOT EXISTS (
            SELECT 1 FROM unnest(string_to_array(lower(product_search), ' ')) AS word
            WHERE length(word) >= 2
            AND NOT (lower(concat_ws(' ', dpc.name, dpc.description, dpc.category)) LIKE '%' || word || '%')
          ))
          AND (min_price IS NULL OR (CASE WHEN v_is_blocked_state THEN 0 ELSE dpc.price_usd END) >= min_price)
          AND (max_price IS NULL OR (CASE WHEN v_is_blocked_state THEN 0 ELSE dpc.price_usd END) <= max_price)
        ORDER BY random()
        LIMIT (4 + floor(random() * 3))::int
      ) sub;

      IF jsonb_array_length(v_demo_products) = 0 THEN
        CONTINUE;
      END IF;

      booth_id := gen_random_uuid();
      owner_id := gen_random_uuid();
      booth_name := v_tmpl.booth_name;
      description := v_tmpl.description;
      decorative_theme := v_tmpl.decorative_theme;
      header_image_url := NULL;
      offers_delivery := true;
      offers_pickup := false;
      delivery_radius_miles := v_tmpl.delivery_radius_miles;
      pickup_address := 'Your neighborhood';
      delivery_windows := '["Sat 9am-12pm","Sun 10am-1pm"]'::jsonb;
      pickup_windows := NULL;
      distance_miles := v_demo_dist;
      product_count := jsonb_array_length(v_demo_products)::bigint;
      matched_products := v_demo_products;
      seller_avatar_url := NULL;
      seller_avg_rating := v_demo_rating;
      seller_rating_count := v_demo_rating_count;
      is_demo := true;
      RETURN NEXT;
    END LOOP;
  END IF;

  RETURN;
END;
$$;
