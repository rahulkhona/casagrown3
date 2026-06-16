-- Drop the duplicate function signature without buyer_zip we created earlier
DROP FUNCTION IF EXISTS public.nearby_booths(double precision, double precision, double precision, text, text, numeric, numeric, text, text, boolean, integer, integer);

-- Redefine nearby_booths search RPC to resolve product-level overrides and ignore quarantine checks
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


-- Disable quarantine check in place_market_order
CREATE OR REPLACE FUNCTION "public"."place_market_order"("p_product_id" "uuid", "p_quantity" integer, "p_fulfillment_type" "text", "p_buyer_zip" "text" DEFAULT NULL::"text", "p_expected_price" numeric DEFAULT NULL::numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_product RECORD;
  v_booth RECORD;
  v_buyer_id UUID;
  v_buyer_address TEXT;
  v_tax_rate NUMERIC(7,4) := 0;
  v_subtotal NUMERIC(10,2);
  v_tax_amount NUMERIC(10,2);
  v_fee_rate NUMERIC(5,2);
  v_fee_amount NUMERIC(10,2);
  v_total NUMERIC(10,2);
  v_order_id UUID;
  v_tax_rule RECORD;
  v_cached_rate RECORD;
  v_state_code TEXT;
  v_seller_state_code TEXT;
  v_quarantined BOOLEAN;
BEGIN
  v_buyer_id := auth.uid();
  IF v_buyer_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  -- Lock product row to prevent race conditions
  SELECT * INTO v_product
  FROM market_products
  WHERE id = p_product_id AND is_active
  FOR UPDATE;

  IF v_product IS NULL THEN
    RETURN jsonb_build_object('error', 'Product not found or inactive');
  END IF;

  IF v_product.inventory < p_quantity THEN
    RETURN jsonb_build_object('error', 'Insufficient inventory',
      'available', v_product.inventory, 'requested', p_quantity);
  END IF;

  -- Price mismatch guard
  IF p_expected_price IS NOT NULL AND v_product.price_usd <> p_expected_price THEN
    RETURN jsonb_build_object('error', 'Price has changed',
      'code', 'price_changed',
      'expected_price', p_expected_price,
      'current_price', v_product.price_usd);
  END IF;

  v_subtotal := v_product.price_usd * p_quantity;

  -- Get booth
  SELECT * INTO v_booth FROM market_booths WHERE owner_id = v_product.seller_id LIMIT 1;
  IF v_booth IS NULL THEN
    RETURN jsonb_build_object('error', 'Booth not found');
  END IF;

  -- Cannot buy your own products
  IF v_product.seller_id = v_buyer_id THEN
    RETURN jsonb_build_object('error', 'Cannot purchase your own products');
  END IF;

  -- *** QUARANTINE ENFORCEMENT (disabled) ***
  v_quarantined := false;

  IF v_quarantined THEN
    RETURN jsonb_build_object(
      'error', 'This product is in a quarantined category and cannot be purchased at this time.',
      'code', 'quarantined'
    );
  END IF;

  -- Snapshot buyer's delivery address
  SELECT street_address INTO v_buyer_address
  FROM profiles
  WHERE id = v_buyer_id;

  -- *** SAME-STATE ENFORCEMENT ***
  -- Resolve buyer's state from their zip code
  IF p_buyer_zip IS NOT NULL THEN
    SELECT s.code INTO v_state_code
    FROM zip_codes zc
    JOIN cities ci ON ci.id = zc.city_id
    JOIN states s ON s.id = ci.state_id
    WHERE zc.zip_code = p_buyer_zip
    LIMIT 1;
  END IF;

  -- Resolve seller's state from their profile zip
  SELECT s.code INTO v_seller_state_code
  FROM profiles p
  JOIN zip_codes zc ON zc.zip_code = p.zip_code AND zc.country_iso_3 = COALESCE(p.country_code, 'USA')
  JOIN cities ci ON ci.id = zc.city_id
  JOIN states s ON s.id = ci.state_id
  WHERE p.id = v_product.seller_id
  LIMIT 1;

  -- Block cross-state purchases
  IF v_state_code IS NOT NULL AND v_seller_state_code IS NOT NULL
     AND v_state_code <> v_seller_state_code THEN
    RETURN jsonb_build_object(
      'error', 'Cross-state purchases are not allowed. You can only buy from sellers in your state.',
      'code', 'cross_state',
      'buyer_state', v_state_code,
      'seller_state', v_seller_state_code
    );
  END IF;

  -- Compute tax rate
  IF v_state_code IS NOT NULL AND v_product.category IS NOT NULL THEN
    SELECT * INTO v_tax_rule
    FROM sales_tax_rules
    WHERE state_code = v_state_code AND category_name = v_product.category
    LIMIT 1;

    IF v_tax_rule IS NOT NULL THEN
      v_tax_rate := v_tax_rule.tax_rate;
    ELSE
      -- Fallback to cached rate if exists
      SELECT rate INTO v_cached_rate
      FROM tax_rate_cache
      WHERE zip_code = p_buyer_zip
      LIMIT 1;
      IF v_cached_rate IS NOT NULL THEN
        v_tax_rate := v_cached_rate.rate;
      END IF;
    END IF;
  END IF;

  v_tax_amount := ROUND(v_subtotal * v_tax_rate, 2);

  -- Determine fee rate
  SELECT fee_percent INTO v_fee_rate
  FROM platform_fees
  WHERE country_iso_3 = COALESCE(v_booth.booth_state, 'USA')
  LIMIT 1;

  IF v_fee_rate IS NULL THEN
    v_fee_rate := 0.05; -- 5% fallback
  END IF;

  v_fee_amount := ROUND(v_subtotal * v_fee_rate, 2);
  v_total := v_subtotal + v_tax_amount + v_fee_amount;

  -- Insert order
  INSERT INTO market_orders (
    buyer_id, seller_id, product_id, quantity, unit, price_usd, subtotal, tax_amount, fee_amount, total, status, fulfillment_type, delivery_address
  ) VALUES (
    v_buyer_id, v_product.seller_id, v_product.id, p_quantity, v_product.unit, v_product.price_usd, v_subtotal, v_tax_amount, v_fee_amount, v_total, 'pending', p_fulfillment_type, v_buyer_address
  ) RETURNING id INTO v_order_id;

  -- Decrement inventory
  UPDATE market_products
  SET inventory = inventory - p_quantity
  WHERE id = v_product.id;

  -- Insert default order messages for context
  INSERT INTO market_order_messages (
    order_id, sender_id, message_type, content, quantity, unit, price_usd
  ) VALUES (
    v_order_id, v_buyer_id, 'system', 'Order placed. Pending seller acceptance.', p_quantity, v_product.unit, v_product.price_usd
  );

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'total', v_total
  );
END;
$$;
