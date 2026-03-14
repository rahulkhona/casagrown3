-- Add category filter to nearby_booths RPC + include seller avatar and rating

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
