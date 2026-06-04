-- ============================================================================
-- Migration: Product-level Zip Code Overrides & Auto-Posting Trigger Fix
-- ============================================================================

-- 1. Add delivery_zipcodes column to market_products table
ALTER TABLE public.market_products ADD COLUMN IF NOT EXISTS delivery_zipcodes TEXT[] DEFAULT '{}';
COMMENT ON COLUMN public.market_products.delivery_zipcodes IS 'Explicit list of zip codes always eligible for delivery of this product, regardless of distance';

-- 2. Redefine Listing Post Sync Trigger Function to handle is_draft Transitions
CREATE OR REPLACE FUNCTION public.fn_listing_social_post_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_edge_url TEXT;
  v_service_key TEXT;
BEGIN
  -- Resolve edge function base URL and service key using the shared helpers
  v_edge_url := get_edge_fn_base_url();
  v_service_key := get_service_role_key();

  -- Skip if edge function URL or service key not configured
  IF v_edge_url IS NULL OR v_edge_url = '' OR v_service_key IS NULL OR v_service_key = '' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- ── INSERT: New listing published → queue post creation ──
  IF TG_OP = 'INSERT' AND NEW.is_active = true AND NEW.is_draft = false AND NEW.inventory > 0 THEN
    PERFORM net.http_post(
      url := v_edge_url || '/sync-listing-posts',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body := jsonb_build_object(
        'action', 'publish',
        'product_id', NEW.id,
        'seller_id', NEW.seller_id,
        'booth_id', NEW.booth_id
      )
    );
  END IF;

  -- ── UPDATE: Listing transitions ──
  IF TG_OP = 'UPDATE' THEN
    -- Was not public (inactive OR draft OR out of stock OR deleted), now public → queue new post
    IF (OLD.is_active = false OR OLD.is_draft = true OR OLD.inventory <= 0 OR OLD.is_deleted = true)
       AND NEW.is_active = true AND NEW.is_draft = false AND NEW.inventory > 0 AND NEW.is_deleted = false
       AND NEW.facebook_post_id IS NULL THEN
      PERFORM net.http_post(
        url := v_edge_url || '/sync-listing-posts',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_key
        ),
        body := jsonb_build_object(
          'action', 'publish',
          'product_id', NEW.id,
          'seller_id', NEW.seller_id,
          'booth_id', NEW.booth_id
        )
      );
    -- Was public, now deactivated or draft or out of stock or deleted → queue post deletion/expiration
    ELSIF (OLD.is_active = true AND OLD.is_draft = false AND OLD.inventory > 0 AND OLD.is_deleted = false)
       AND (NEW.is_active = false OR NEW.is_draft = true OR NEW.inventory <= 0 OR NEW.is_deleted = true) THEN
      PERFORM net.http_post(
        url := v_edge_url || '/sync-listing-posts',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_key
        ),
        body := jsonb_build_object(
          'action', 'expire',
          'product_id', NEW.id,
          'seller_id', NEW.seller_id,
          'facebook_post_id', OLD.facebook_post_id,
          'instagram_post_id', OLD.instagram_post_id,
          'google_post_id', OLD.google_post_id,
          'wa_catalog_item_id', OLD.wa_catalog_item_id
        )
      );
    END IF;

    -- Price, name, description, or photos changed on a public product → queue post update
    IF NEW.is_active = true AND NEW.is_draft = false AND NEW.inventory > 0 AND NEW.is_deleted = false
       AND NEW.facebook_post_id IS NOT NULL
       AND (OLD.price_usd IS DISTINCT FROM NEW.price_usd
            OR OLD.name IS DISTINCT FROM NEW.name
            OR OLD.description IS DISTINCT FROM NEW.description
            OR OLD.photos IS DISTINCT FROM NEW.photos) THEN
      PERFORM net.http_post(
        url := v_edge_url || '/sync-listing-posts',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_key
        ),
        body := jsonb_build_object(
          'action', 'update',
          'product_id', NEW.id,
          'seller_id', NEW.seller_id,
          'facebook_post_id', NEW.facebook_post_id,
          'instagram_post_id', NEW.instagram_post_id,
          'google_post_id', NEW.google_post_id
        )
      );
    END IF;

    -- Inventory changed on a public product with social posts → queue comments/GBP description update
    IF NEW.is_active = true AND NEW.is_draft = false AND NEW.inventory > 0 AND NEW.is_deleted = false
       AND (NEW.facebook_post_id IS NOT NULL OR NEW.instagram_post_id IS NOT NULL OR NEW.google_post_id IS NOT NULL)
       AND (OLD.inventory IS DISTINCT FROM NEW.inventory) THEN
      PERFORM net.http_post(
        url := v_edge_url || '/sync-listing-posts',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_key
        ),
        body := jsonb_build_object(
          'action', 'update_inventory',
          'product_id', NEW.id,
          'seller_id', NEW.seller_id,
          'facebook_post_id', NEW.facebook_post_id,
          'instagram_post_id', NEW.instagram_post_id,
          'google_post_id', NEW.google_post_id
        )
      );
    END IF;
  END IF;

  -- ── DELETE: Listing removed → queue post deletion ──
  IF TG_OP = 'DELETE' AND OLD.facebook_post_id IS NOT NULL THEN
    PERFORM net.http_post(
      url := v_edge_url || '/sync-listing-posts',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body := jsonb_build_object(
        'action', 'delete',
        'product_id', OLD.id,
        'seller_id', OLD.seller_id,
        'facebook_post_id', OLD.facebook_post_id,
        'instagram_post_id', OLD.instagram_post_id,
        'google_post_id', OLD.google_post_id,
        'wa_catalog_item_id', OLD.wa_catalog_item_id
      )
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 3. Redefine fn_expire_stale_listing_posts to include is_draft checks
CREATE OR REPLACE FUNCTION public.fn_expire_stale_listing_posts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_edge_url TEXT;
  v_service_key TEXT;
  v_listing RECORD;
BEGIN
  -- Resolve edge function base URL and service key using the shared helpers
  v_edge_url := get_edge_fn_base_url();
  v_service_key := get_service_role_key();

  IF v_edge_url IS NULL OR v_edge_url = '' OR v_service_key IS NULL OR v_service_key = '' THEN
    RETURN;
  END IF;

  -- Find listings with social posts that are past their market_date
  -- and haven't been expired yet
  FOR v_listing IN
    SELECT p.id, p.seller_id, p.facebook_post_id, p.instagram_post_id,
           p.google_post_id, p.wa_catalog_item_id
    FROM public.market_products p
    WHERE p.posts_expired_at IS NULL
      AND p.posts_published_at IS NOT NULL
      AND (p.facebook_post_id IS NOT NULL
           OR p.instagram_post_id IS NOT NULL
           OR p.google_post_id IS NOT NULL)
      AND (
        -- Market date has passed
        (p.market_date < CURRENT_DATE)
        -- OR product was deactivated / deleted / out of stock / draft
        OR p.is_active = false
        OR p.is_draft = true
        OR p.is_deleted = true
        OR p.inventory <= 0
      )
  LOOP
    PERFORM net.http_post(
      url := v_edge_url || '/sync-listing-posts',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body := jsonb_build_object(
        'action', 'expire',
        'product_id', v_listing.id,
        'seller_id', v_listing.seller_id,
        'facebook_post_id', v_listing.facebook_post_id,
        'instagram_post_id', v_listing.instagram_post_id,
        'google_post_id', v_listing.google_post_id,
        'wa_catalog_item_id', v_listing.wa_catalog_item_id
      )
    );

    -- Mark as expired so we don't re-process
    UPDATE public.market_products
    SET posts_expired_at = now()
    WHERE id = v_listing.id;
  END LOOP;
END;
$$;

-- 4. Redefine nearby_booths search RPC to resolve product-level overrides (with booth fallbacks)
CREATE OR REPLACE FUNCTION public.nearby_booths(
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
  p_offset INTEGER DEFAULT 0,
  buyer_zip TEXT DEFAULT NULL
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
) LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
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
      b.delivery_zipcodes,
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
    SELECT bd.id, bd.owner_id, bd.name, bd.description, bd.decorative_theme, bd.header_image_url,
      bd.offers_delivery, bd.offers_pickup, bd.delivery_radius_miles,
      bd.pickup_address, bd.delivery_windows, bd.pickup_windows, bd.dist_miles
    FROM booth_distances bd
  ),
  products AS (
    SELECT mp.booth_id AS product_booth_id,
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
        -- Check if the product matches the fulfillment and distance requirements
        AND CASE fulfillment_filter
          WHEN 'pickup' THEN (mp.product_pickup_windows IS DISTINCT FROM NULL)
          WHEN 'delivery' THEN (
            (mp.product_delivery_windows IS DISTINCT FROM NULL)
            AND (
              (bd.dist_miles <= COALESCE(mp.delivery_radius_miles, bd.delivery_radius_miles, 5))
              OR (buyer_zip IS NOT NULL AND bd.delivery_zipcodes IS NOT NULL
                  AND LEFT(buyer_zip, 5) = ANY(bd.delivery_zipcodes))
              OR (buyer_zip IS NOT NULL AND mp.delivery_zipcodes IS NOT NULL
                  AND LEFT(buyer_zip, 5) = ANY(mp.delivery_zipcodes))
            )
          )
          ELSE (
            (mp.product_pickup_windows IS DISTINCT FROM NULL)
            OR (
              (mp.product_delivery_windows IS DISTINCT FROM NULL)
              AND (
                (bd.dist_miles <= COALESCE(mp.delivery_radius_miles, bd.delivery_radius_miles, 5))
                OR (buyer_zip IS NOT NULL AND bd.delivery_zipcodes IS NOT NULL
                    AND LEFT(buyer_zip, 5) = ANY(bd.delivery_zipcodes))
                OR (buyer_zip IS NOT NULL AND mp.delivery_zipcodes IS NOT NULL
                    AND LEFT(buyer_zip, 5) = ANY(mp.delivery_zipcodes))
              )
            )
          )
        END
      )::BIGINT AS total_count,

      -- Compute resolved offers_delivery and max delivery_radius_miles
      COALESCE(
        bool_or(
          mp.is_active AND NOT mp.is_draft
          AND COALESCE(mp.moderation_status, 'approved') = 'approved'
          AND (v_never_expire OR mp.expires_at IS NULL OR mp.expires_at > now())
          AND (mp.product_delivery_windows IS DISTINCT FROM NULL)
        ), false
      ) AS resolved_offers_delivery,

      COALESCE(
        bool_or(
          mp.is_active AND NOT mp.is_draft
          AND COALESCE(mp.moderation_status, 'approved') = 'approved'
          AND (v_never_expire OR mp.expires_at IS NULL OR mp.expires_at > now())
          AND (mp.product_pickup_windows IS DISTINCT FROM NULL)
        ), false
      ) AS resolved_offers_pickup,

      COALESCE(
        MAX(COALESCE(mp.delivery_radius_miles, bd.delivery_radius_miles, 5)) FILTER (
          WHERE mp.is_active AND NOT mp.is_draft
          AND COALESCE(mp.moderation_status, 'approved') = 'approved'
          AND (v_never_expire OR mp.expires_at IS NULL OR mp.expires_at > now())
          AND (mp.product_delivery_windows IS DISTINCT FROM NULL)
        ), bd.delivery_radius_miles, 5
      ) AS resolved_delivery_radius_miles,

      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', mp.id, 'name', mp.name, 'description', mp.description,
            'price_usd', mp.price_usd, 'unit', mp.unit,
            'photo', mp.photos[1], 'inventory', mp.inventory,
            'category', mp.category, 'harvested_at', mp.harvested_at,
            'window_dates', mp.window_dates,
            'product_delivery_windows', mp.product_delivery_windows,
            'product_pickup_windows', mp.product_pickup_windows,
            'delivery_radius_miles', mp.delivery_radius_miles,
            'pickup_address', mp.pickup_address,
            'delivery_zipcodes', mp.delivery_zipcodes
          ) ORDER BY mp.created_at
        ) FILTER (WHERE mp.is_active AND NOT mp.is_draft
          AND COALESCE(mp.moderation_status, 'approved') = 'approved'
          AND (v_never_expire OR mp.expires_at IS NULL OR mp.expires_at > now())
          AND (product_search IS NULL OR NOT EXISTS (
            SELECT 1 FROM unnest(string_to_array(lower(product_search), ' ')) AS word
            WHERE length(word) >= 2
            AND NOT (lower(mp.name || ' ' || COALESCE(mp.description, '') || ' ' || mp.category) LIKE '%' || word || '%')
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
          -- Filter products by fulfillment type and distance eligibility
          AND CASE fulfillment_filter
            WHEN 'pickup' THEN (mp.product_pickup_windows IS DISTINCT FROM NULL)
            WHEN 'delivery' THEN (
              (mp.product_delivery_windows IS DISTINCT FROM NULL)
              AND (
                (bd.dist_miles <= COALESCE(mp.delivery_radius_miles, bd.delivery_radius_miles, 5))
                OR (buyer_zip IS NOT NULL AND bd.delivery_zipcodes IS NOT NULL
                    AND LEFT(buyer_zip, 5) = ANY(bd.delivery_zipcodes))
                OR (buyer_zip IS NOT NULL AND mp.delivery_zipcodes IS NOT NULL
                    AND LEFT(buyer_zip, 5) = ANY(mp.delivery_zipcodes))
              )
            )
            ELSE (
              (mp.product_pickup_windows IS DISTINCT FROM NULL)
              OR (
                (mp.product_delivery_windows IS DISTINCT FROM NULL)
                AND (
                  (bd.dist_miles <= COALESCE(mp.delivery_radius_miles, bd.delivery_radius_miles, 5))
                  OR (buyer_zip IS NOT NULL AND bd.delivery_zipcodes IS NOT NULL
                      AND LEFT(buyer_zip, 5) = ANY(bd.delivery_zipcodes))
                  OR (buyer_zip IS NOT NULL AND mp.delivery_zipcodes IS NOT NULL
                      AND LEFT(buyer_zip, 5) = ANY(mp.delivery_zipcodes))
                )
              )
            )
          END
        ), '[]'::jsonb
      ) AS prods
    FROM market_products mp
    JOIN booth_distances bd ON bd.id = mp.booth_id
    GROUP BY mp.booth_id, bd.delivery_radius_miles
  )
  SELECT f.id, f.owner_id, f.name, f.description, f.decorative_theme, f.header_image_url,
    COALESCE(p.resolved_offers_delivery, f.offers_delivery) AS offers_delivery,
    COALESCE(p.resolved_offers_pickup, f.offers_pickup) AS offers_pickup,
    COALESCE(p.resolved_delivery_radius_miles, f.delivery_radius_miles) AS delivery_radius_miles,
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
  LEFT JOIN products p ON p.product_booth_id = f.id
  LEFT JOIN profiles pr ON pr.id = f.owner_id
  WHERE jsonb_array_length(COALESCE(p.prods, '[]'::jsonb)) > 0
  ORDER BY f.dist_miles
  LIMIT p_limit
  OFFSET p_offset;

  GET DIAGNOSTICS v_real_count = ROW_COUNT;

  -- Only append demo booths on the first page
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
            AND NOT (lower(dpc.name || ' ' || COALESCE(dpc.description, '') || ' ' || dpc.category) LIKE '%' || word || '%')
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

NOTIFY pgrst, 'reload schema';
