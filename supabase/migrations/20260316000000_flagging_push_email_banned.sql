-- ============================================================================
-- Flagging: Push + Email Notifications + Banned Users
--
-- 1. Update flag trigger to send push + email via pg_net
-- 2. Add is_banned column to profiles
-- ============================================================================

-- ============================================================
-- 1. Updated flag threshold trigger
-- Now also fires push notification and email via edge function
-- ============================================================
CREATE OR REPLACE FUNCTION check_product_flag_threshold()
RETURNS TRIGGER AS $$
DECLARE
  v_flag_count INTEGER;
  v_product RECORD;
  v_seller RECORD;
  v_edge_url TEXT;
BEGIN
  SELECT COUNT(*) INTO v_flag_count
  FROM product_flags WHERE product_id = NEW.product_id;

  IF v_flag_count >= 3 THEN
    SELECT id, seller_id, name, is_active INTO v_product
    FROM market_products WHERE id = NEW.product_id;

    IF v_product.is_active THEN
      -- Deactivate + mark as flagged
      UPDATE market_products
      SET is_active = false, is_flagged = true, updated_at = now()
      WHERE id = NEW.product_id;

      -- Get seller info for notifications
      SELECT id, email, full_name INTO v_seller
      FROM profiles WHERE id = v_product.seller_id;

      -- 1. In-app notification (existing)
      INSERT INTO notifications (user_id, content, link_url)
      VALUES (
        v_product.seller_id,
        'Your product "' || v_product.name || '" has been flagged by community members and has been hidden. Edit the product to resolve and republish.',
        '/my-booth/products/' || v_product.id
      );

      -- 2. Push notification via send-push-notification edge function
      v_edge_url := coalesce(
        current_setting('app.settings.edge_function_url', true),
        'http://host.docker.internal:54321/functions/v1'
      );

      BEGIN
        PERFORM net.http_post(
          url := v_edge_url || '/send-push-notification',
          body := jsonb_build_object(
            'user_ids', jsonb_build_array(v_product.seller_id::text),
            'title', '⚠️ Product Flagged',
            'body', 'Your product "' || v_product.name || '" has been hidden due to reports. Tap to edit and republish.',
            'url', '/my-booth/products/' || v_product.id,
            'tag', 'product-flagged-' || v_product.id
          ),
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || coalesce(
              current_setting('app.settings.service_role_key', true),
              current_setting('supabase.service_role_key', true)
            )
          )
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Push notification for flagged product failed (non-blocking): %', SQLERRM;
      END;

      -- 3. Email notification via notify-product-flagged edge function
      BEGIN
        PERFORM net.http_post(
          url := v_edge_url || '/notify-product-flagged',
          body := jsonb_build_object(
            'seller_id', v_product.seller_id,
            'seller_email', v_seller.email,
            'seller_name', coalesce(v_seller.full_name, 'Seller'),
            'product_name', v_product.name,
            'product_id', v_product.id,
            'flag_count', v_flag_count
          ),
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || coalesce(
              current_setting('app.settings.service_role_key', true),
              current_setting('supabase.service_role_key', true)
            )
          )
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Email notification for flagged product failed (non-blocking): %', SQLERRM;
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 2. Add is_banned column to profiles
-- ============================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ban_reason TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;

-- ============================================================
-- 3. Update nearby_booths to exclude banned sellers
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
BEGIN
  user_point := ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326);

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
