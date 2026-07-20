-- Add delivery_instructions to market_orders
ALTER TABLE market_orders ADD COLUMN IF NOT EXISTS delivery_instructions TEXT;
COMMENT ON COLUMN market_orders.delivery_instructions IS 'Delivery instructions entered by the buyer during checkout.';

-- Drop function overloading to avoid ambiguity
DROP FUNCTION IF EXISTS public.place_market_order(UUID, INTEGER, TEXT, TEXT, NUMERIC, UUID, JSONB);
DROP FUNCTION IF EXISTS public.place_market_order(UUID, INTEGER, TEXT, TEXT, NUMERIC, UUID, JSONB, TEXT);

-- Recreate place_market_order with p_delivery_instructions support,
-- updated pickup tax ZIP resolution, and delivery-only cross-state checks.
CREATE OR REPLACE FUNCTION public.place_market_order(
  p_product_id UUID,
  p_quantity INTEGER,
  p_fulfillment_type TEXT,
  p_buyer_zip TEXT DEFAULT NULL,
  p_expected_price NUMERIC DEFAULT NULL,
  p_hold_id UUID DEFAULT NULL,
  p_fb_metadata JSONB DEFAULT '{}'::jsonb,
  p_delivery_instructions TEXT DEFAULT NULL
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
  v_seller_state_code TEXT;
  v_seller_zip TEXT;
  v_tax_zip TEXT;
  v_quarantined BOOLEAN;
  v_hold RECORD;
  v_seller_plan TEXT;
BEGIN
  v_buyer_id := auth.uid();
  IF v_buyer_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  -- Verify hold belongs to buyer (if provided)
  IF p_hold_id IS NOT NULL THEN
    SELECT * INTO v_hold
    FROM market_holds
    WHERE id = p_hold_id
      AND buyer_id = v_buyer_id
      AND status = 'active';

    IF v_hold IS NULL THEN
      RETURN jsonb_build_object('error', 'Hold not found or not active');
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

  IF p_quantity <= 0 THEN
    RETURN jsonb_build_object('error', 'Quantity must be at least 1');
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

  -- Resolve booth from the product's booth_id
  SELECT * INTO v_booth FROM market_booths WHERE id = v_product.booth_id;
  IF v_booth IS NULL THEN
    RETURN jsonb_build_object('error', 'Stand not found');
  END IF;

  -- Cannot buy your own products
  IF v_product.seller_id = v_buyer_id THEN
    RETURN jsonb_build_object('error', 'Cannot purchase your own products');
  END IF;

  -- Quarantine enforcement (disabled)
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

  -- If buyer zip is not provided, try to resolve it from the buyer's profile
  IF p_buyer_zip IS NULL THEN
    SELECT COALESCE(zip_code, LEFT(zip_plus4, 5)) INTO p_buyer_zip
    FROM profiles
    WHERE id = v_buyer_id;
  END IF;

  -- Resolve buyer's state
  IF p_buyer_zip IS NOT NULL THEN
    SELECT s.code INTO v_state_code
    FROM zip_codes zc
    JOIN cities ci ON ci.id = zc.city_id
    JOIN states s ON s.id = ci.state_id
    WHERE zc.zip_code = p_buyer_zip
    LIMIT 1;
  END IF;

  -- Resolve seller's state and ZIP
  SELECT s.code, COALESCE(p.zip_code, LEFT(p.zip_plus4, 5))
  INTO v_seller_state_code, v_seller_zip
  FROM profiles p
  JOIN zip_codes zc ON zc.zip_code = COALESCE(p.zip_code, LEFT(p.zip_plus4, 5))
    AND zc.country_iso_3 = COALESCE(p.country_code, 'USA')
  JOIN cities ci ON ci.id = zc.city_id
  JOIN states s ON s.id = ci.state_id
  WHERE p.id = v_product.seller_id
  LIMIT 1;

  -- Tax nexus: delivery = buyer zip (destination), pickup = booth/pickup zip (origin)
  IF p_fulfillment_type = 'pickup' THEN
    v_tax_zip := COALESCE(v_booth.pickup_zip, v_booth.booth_zip, v_seller_zip);
  ELSE
    v_tax_zip := p_buyer_zip;
  END IF;

  -- Cross-state validation: Delivery only (buyer vs seller state)
  IF p_fulfillment_type = 'delivery' THEN
    IF v_state_code IS NOT NULL AND v_seller_state_code IS NOT NULL
       AND v_state_code <> v_seller_state_code THEN
      RETURN jsonb_build_object(
        'error', 'Cross-state purchases are not allowed. You can only buy from sellers in your state.',
        'code', 'cross_state',
        'buyer_state', v_state_code,
        'seller_state', v_seller_state_code
      );
    END IF;
  END IF;

  -- Compute tax rate based on active tax ZIP state
  IF v_tax_zip IS NOT NULL THEN
    SELECT s.code INTO v_state_code
    FROM zip_codes zc
    JOIN cities ci ON ci.id = zc.city_id
    JOIN states s ON s.id = ci.state_id
    WHERE zc.zip_code = v_tax_zip
    LIMIT 1;
  END IF;

  IF v_state_code IS NOT NULL AND v_product.category IS NOT NULL THEN
    SELECT * INTO v_tax_rule
    FROM category_tax_rules
    WHERE state_code = v_state_code
      AND category_name = v_product.category
      AND effective_until IS NULL
    LIMIT 1;

    IF v_tax_rule IS NOT NULL AND v_tax_rule.rule_type = 'fixed' THEN
      v_tax_rate := COALESCE(v_tax_rule.rate_pct, 0);
    ELSE
      SELECT * INTO v_cached_rate
      FROM zip_tax_cache
      WHERE zip_code = v_tax_zip
        AND expires_at > now();

      IF v_cached_rate.zip_code IS NOT NULL THEN
        v_tax_rate := v_cached_rate.combined_rate;
      ELSE
        RETURN jsonb_build_object(
          'error', 'Tax rate not available. Please try again.',
          'code', 'tax_cache_miss'
        );
      END IF;
    END IF;
  END IF;

  v_tax_amount := ROUND(v_subtotal * v_tax_rate / 100, 2);

  -- Platform fee
  v_fee_rate := get_seller_fee_rate(v_product.seller_id);
  v_seller_plan := CASE WHEN v_fee_rate <= 5 THEN 'pro' ELSE 'free' END;
  v_fee_amount := ROUND(v_subtotal * v_fee_rate / 100, 2);
  v_total := v_subtotal + v_tax_amount;

  -- Decrement inventory
  UPDATE market_products
  SET inventory = inventory - p_quantity,
      updated_at = now()
  WHERE id = p_product_id;

  -- Insert order with delivery instructions
  INSERT INTO market_orders (
    buyer_id, seller_id, booth_id, product_id, product_name,
    quantity, unit_price_usd, subtotal_usd,
    tax_rate_pct, tax_amount_usd,
    platform_fee_pct, platform_fee_usd,
    total_usd, fulfillment_type, status,
    delivery_address, delivery_instructions, hold_id, seller_plan,
    fb_metadata
  ) VALUES (
    v_buyer_id, v_booth.owner_id, v_booth.id, p_product_id, v_product.name,
    p_quantity, v_product.price_usd, v_subtotal,
    v_tax_rate, v_tax_amount,
    v_fee_rate, v_fee_amount,
    v_total, p_fulfillment_type, 'pending',
    CASE WHEN p_fulfillment_type = 'delivery' THEN v_buyer_address ELSE NULL END,
    CASE WHEN p_fulfillment_type = 'delivery' THEN p_delivery_instructions ELSE NULL END,
    p_hold_id, v_seller_plan,
    p_fb_metadata
  )
  RETURNING id INTO v_order_id;

  -- Update hold spent amount
  IF p_hold_id IS NOT NULL THEN
    UPDATE market_holds
    SET spent_amount_cents = spent_amount_cents + (v_total * 100)::INTEGER,
        updated_at = now()
    WHERE id = p_hold_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'subtotal_usd', v_subtotal,
    'tax_rate_pct', v_tax_rate,
    'tax_amount_usd', v_tax_amount,
    'platform_fee_pct', v_fee_rate,
    'platform_fee_usd', v_fee_amount,
    'total_usd', v_total,
    'total_cents', (v_total * 100)::INTEGER
  );
END;
$$;
