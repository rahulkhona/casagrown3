-- ============================================================================
-- Migration: Market Hours + Product Expiry Enforcement
--
-- Adds two server-side guards to place_market_order:
--   1. Reject orders when market is closed (unless market_never_closes = true)
--   2. Reject orders on expired products whose market_date < today
--      (unless products_never_expire = true)
--
-- Uses: market_schedule_policies, market_settings, market_products.market_date
-- ============================================================================

CREATE OR REPLACE FUNCTION place_market_order(
  p_product_id UUID,
  p_quantity INTEGER,
  p_fulfillment_type TEXT,
  p_buyer_zip TEXT DEFAULT NULL,
  p_expected_price NUMERIC DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  v_min_qty INTEGER;
  v_settings RECORD;
  v_schedule RECORD;
  v_now_time TEXT;
  v_now_dow INTEGER;
BEGIN
  v_buyer_id := auth.uid();
  IF v_buyer_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  -- *** MARKET HOURS CHECK ***
  SELECT * INTO v_settings FROM market_settings WHERE id = true;
  IF v_settings IS NULL OR NOT v_settings.market_never_closes THEN
    -- Get current day of week (0=Sun, 6=Sat) and time
    v_now_dow := EXTRACT(DOW FROM now() AT TIME ZONE 'America/Los_Angeles')::INTEGER;
    v_now_time := to_char(now() AT TIME ZONE 'America/Los_Angeles', 'HH24:MI');

    SELECT * INTO v_schedule
    FROM market_schedule_policies
    WHERE day_of_week = v_now_dow AND is_enabled;

    IF v_schedule IS NULL THEN
      RETURN jsonb_build_object('error', 'The market is closed today. Check back on a market day!',
        'code', 'market_closed');
    END IF;

    IF v_now_time < v_schedule.open_time OR v_now_time >= v_schedule.close_time THEN
      RETURN jsonb_build_object('error',
        format('The market is closed right now. Hours today: %s – %s.', v_schedule.open_time, v_schedule.close_time),
        'code', 'market_closed');
    END IF;
  END IF;

  -- Lock product row to prevent race conditions
  SELECT * INTO v_product
  FROM market_products
  WHERE id = p_product_id AND is_active
  FOR UPDATE;

  IF v_product IS NULL THEN
    RETURN jsonb_build_object('error', 'Product not found or inactive');
  END IF;

  -- *** EXPIRED PRODUCT CHECK ***
  IF v_settings IS NULL OR NOT v_settings.products_never_expire THEN
    IF v_product.market_date < CURRENT_DATE THEN
      RETURN jsonb_build_object('error', 'This product was listed for a previous market day and is no longer available.',
        'code', 'product_expired',
        'market_date', v_product.market_date);
    END IF;
  END IF;

  IF v_product.inventory < p_quantity THEN
    RETURN jsonb_build_object('error', 'Insufficient inventory',
      'available', v_product.inventory, 'requested', p_quantity);
  END IF;

  -- Price mismatch guard: reject if price changed since buyer viewed it
  IF p_expected_price IS NOT NULL AND v_product.price_usd <> p_expected_price THEN
    RETURN jsonb_build_object('error', 'Price has changed',
      'code', 'price_changed',
      'expected_price', p_expected_price,
      'current_price', v_product.price_usd);
  END IF;

  -- *** $5 MINIMUM ORDER CHECK ***
  v_subtotal := v_product.price_usd * p_quantity;
  IF v_subtotal < 5.00 THEN
    v_min_qty := CEIL(5.00 / v_product.price_usd);
    RETURN jsonb_build_object('error', 'Minimum order is $5.00',
      'code', 'minimum_order',
      'subtotal', v_subtotal,
      'minimum', 5.00,
      'suggested_quantity', LEAST(v_min_qty, v_product.inventory),
      'price_per_unit', v_product.price_usd);
  END IF;

  -- Get booth (products link to sellers, booths link to owners)
  SELECT * INTO v_booth FROM market_booths WHERE owner_id = v_product.seller_id LIMIT 1;
  IF v_booth IS NULL THEN
    RETURN jsonb_build_object('error', 'Booth not found');
  END IF;

  -- Cannot buy your own products
  IF v_product.seller_id = v_buyer_id THEN
    RETURN jsonb_build_object('error', 'Cannot purchase your own products');
  END IF;

  -- Snapshot buyer's delivery address
  SELECT street_address INTO v_buyer_address
  FROM profiles
  WHERE id = v_buyer_id;

  -- Compute tax rate using category_tax_rules
  -- Resolve buyer state from zip code
  IF p_buyer_zip IS NOT NULL THEN
    SELECT s.code INTO v_state_code
    FROM zip_codes zc
    JOIN cities ci ON ci.id = zc.city_id
    JOIN states s ON s.id = ci.state_id
    WHERE zc.zip_code = p_buyer_zip
    LIMIT 1;
  END IF;

  IF v_state_code IS NOT NULL AND v_product.category IS NOT NULL THEN
    -- Check category tax rule
    SELECT * INTO v_tax_rule
    FROM category_tax_rules
    WHERE state_code = v_state_code
      AND category_name = v_product.category
      AND effective_until IS NULL
    LIMIT 1;

    IF v_tax_rule IS NOT NULL THEN
      IF v_tax_rule.rule_type = 'fixed' THEN
        v_tax_rate := COALESCE(v_tax_rule.rate_pct, 0);
      ELSE
        -- 'evaluate' type: check zip_tax_cache
        SELECT * INTO v_cached_rate
        FROM zip_tax_cache
        WHERE zip_code = p_buyer_zip
          AND expires_at > now();

        IF v_cached_rate IS NOT NULL THEN
          v_tax_rate := v_cached_rate.combined_rate;
        ELSE
          v_tax_rate := 0; -- Fallback if no cached rate
        END IF;
      END IF;
    END IF;
  END IF;

  -- Compute amounts
  v_tax_amount := ROUND(v_subtotal * v_tax_rate / 100, 2);

  -- Platform fee
  SELECT COALESCE(fees * 100, 10) INTO v_fee_rate
  FROM platform_fees
  WHERE country_code = 'USA'
  ORDER BY creation_date DESC
  LIMIT 1;

  v_fee_amount := ROUND(v_subtotal * v_fee_rate / 100, 2);
  -- total_usd is what the BUYER pays: subtotal + tax (platform fee is deducted from seller payout)
  v_total := v_subtotal + v_tax_amount;

  -- Decrement inventory
  UPDATE market_products
  SET inventory = inventory - p_quantity,
      updated_at = now()
  WHERE id = p_product_id;

  -- Insert order with snapshotted delivery address
  INSERT INTO market_orders (
    buyer_id, seller_id, booth_id, product_id, product_name,
    quantity, unit_price_usd, subtotal_usd,
    tax_rate_pct, tax_amount_usd,
    platform_fee_pct, platform_fee_usd,
    total_usd, fulfillment_type, status,
    delivery_address
  ) VALUES (
    v_buyer_id, v_booth.owner_id, v_booth.id, p_product_id, v_product.name,
    p_quantity, v_product.price_usd, v_subtotal,
    v_tax_rate, v_tax_amount,
    v_fee_rate, v_fee_amount,
    v_total, p_fulfillment_type, 'pending',
    CASE WHEN p_fulfillment_type = 'delivery' THEN v_buyer_address ELSE NULL END
  )
  RETURNING id INTO v_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'subtotal_usd', v_subtotal,
    'tax_rate_pct', v_tax_rate,
    'tax_amount_usd', v_tax_amount,
    'platform_fee_pct', v_fee_rate,
    'platform_fee_usd', v_fee_amount,
    'total_usd', v_total,
    'total_cents', (v_total * 100)::INTEGER,
    'product_name', v_product.name,
    'remaining_inventory', v_product.inventory - p_quantity
  );
END;
$$;
