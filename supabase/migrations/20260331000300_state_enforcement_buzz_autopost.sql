-- ============================================================================
-- 1. Enforce same-state purchases in place_market_order
-- 2. Auto-post market products to Buzz when published
-- ============================================================================

-- ============================================================
-- 1. Same-state enforcement: buyer and seller must be in the same state
-- ============================================================
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
  v_seller_state_code TEXT;
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
    FROM category_tax_rules
    WHERE state_code = v_state_code
      AND category_name = v_product.category
      AND effective_until IS NULL
    LIMIT 1;

    IF v_tax_rule IS NOT NULL THEN
      IF v_tax_rule.rule_type = 'fixed' THEN
        v_tax_rate := COALESCE(v_tax_rule.rate_pct, 0);
      ELSE
        SELECT * INTO v_cached_rate
        FROM zip_tax_cache
        WHERE zip_code = p_buyer_zip
          AND expires_at > now();

        IF v_cached_rate IS NOT NULL THEN
          v_tax_rate := v_cached_rate.combined_rate;
        ELSE
          v_tax_rate := 0;
        END IF;
      END IF;
    END IF;
  END IF;

  v_tax_amount := ROUND(v_subtotal * v_tax_rate / 100, 2);

  -- Platform fee
  SELECT COALESCE(fees * 100, 10) INTO v_fee_rate
  FROM platform_fees
  WHERE country_code = 'USA'
  ORDER BY creation_date DESC
  LIMIT 1;

  v_fee_amount := ROUND(v_subtotal * v_fee_rate / 100, 2);
  v_total := v_subtotal + v_tax_amount;

  -- Decrement inventory
  UPDATE market_products
  SET inventory = inventory - p_quantity,
      updated_at = now()
  WHERE id = p_product_id;

  -- Insert order
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

-- ============================================================
-- 2. Auto-post market product to Buzz when published
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_post_market_product_to_buzz()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_h3_index TEXT;
  v_author_name TEXT;
  v_message TEXT;
  v_media JSONB;
  v_booth RECORD;
  v_fulfillment TEXT;
  v_photo_url TEXT;
BEGIN
  -- Only fire when product becomes active (new active product or draft→active)
  IF NEW.is_active = false THEN RETURN NEW; END IF;
  IF NEW.is_draft = true THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_active = true AND OLD.is_draft = false THEN
    -- Already was active, not a new publication
    RETURN NEW;
  END IF;

  -- Get seller's community and name
  SELECT home_community_h3_index, full_name
  INTO v_h3_index, v_author_name
  FROM profiles
  WHERE id = NEW.seller_id;

  IF v_h3_index IS NULL THEN RETURN NEW; END IF;

  -- Get booth info for fulfillment
  SELECT * INTO v_booth FROM market_booths WHERE owner_id = NEW.seller_id LIMIT 1;

  -- Build fulfillment text
  v_fulfillment := '';
  IF v_booth IS NOT NULL THEN
    IF v_booth.offers_delivery AND v_booth.offers_pickup THEN
      v_fulfillment := '🚗 Delivery · 📍 Pickup';
    ELSIF v_booth.offers_delivery THEN
      v_fulfillment := '🚗 Delivery';
    ELSIF v_booth.offers_pickup THEN
      v_fulfillment := '📍 Pickup';
    END IF;
  END IF;

  -- Build message text
  v_message := '🛒 **' || NEW.name || '** — $' || ROUND(NEW.price_usd, 2) || '/' || NEW.unit ||
    CASE WHEN NEW.inventory > 0 THEN ' · ' || NEW.inventory || ' available' ELSE '' END ||
    CASE WHEN v_fulfillment != '' THEN E'\n' || v_fulfillment ELSE '' END ||
    E'\n\nTap to view and purchase →';

  -- Build media array from product photos
  v_media := '[]'::jsonb;
  IF NEW.photos IS NOT NULL AND array_length(NEW.photos, 1) > 0 THEN
    SELECT jsonb_agg(jsonb_build_object(
      'url', photo,
      'storage_path', '',
      'media_type', 'image'
    )) INTO v_media
    FROM unnest(NEW.photos) AS photo;
  END IF;

  -- Insert into community chat — posted as the seller (not system)
  INSERT INTO community_chat_messages (
    community_h3_index, author_id, content,
    media, product_listing_id, is_system
  ) VALUES (
    v_h3_index, NEW.seller_id, v_message,
    COALESCE(v_media, '[]'::jsonb), NEW.id, false
  );

  RETURN NEW;
END;
$$;

-- Create the trigger on market_products
DROP TRIGGER IF EXISTS trg_auto_post_market_product_to_buzz ON market_products;
CREATE TRIGGER trg_auto_post_market_product_to_buzz
  AFTER INSERT OR UPDATE ON market_products
  FOR EACH ROW
  EXECUTE FUNCTION auto_post_market_product_to_buzz();
