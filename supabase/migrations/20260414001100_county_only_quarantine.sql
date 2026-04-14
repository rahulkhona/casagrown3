-- ============================================================================
-- County-only quarantine enforcement
-- 1. New RPC: check_quarantine_for_product (county-only)
-- 2. Updated: get_quarantines_for_user (county-only)
-- 3. Updated: check_quarantine_for_seller (county-only)
-- 4. Updated: place_market_order quarantine check (county-only + ZIP+4 fix)
-- ============================================================================

-- 1. check_quarantine_for_product: used by PDP and cart
CREATE OR REPLACE FUNCTION check_quarantine_for_product(p_product_id UUID)
RETURNS TABLE (
  is_quarantined BOOLEAN,
  pest_name TEXT,
  county_name TEXT,
  source_url TEXT,
  reason TEXT,
  keywords TEXT[]
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_seller_id UUID;
  v_category TEXT;
  v_product_name TEXT;
  v_county_id UUID;
BEGIN
  -- Get product info
  SELECT mp.seller_id, mp.category, mp.name
  INTO v_seller_id, v_category, v_product_name
  FROM market_products mp
  WHERE mp.id = p_product_id;

  IF v_seller_id IS NULL THEN RETURN; END IF;

  -- Resolve seller county from zip
  SELECT z.county_id INTO v_county_id
  FROM profiles p
  JOIN zip_codes z ON z.zip_code = COALESCE(p.zip_code, LEFT(p.zip_plus4, 5))
    AND z.country_iso_3 = COALESCE(p.country_code, 'USA')
  WHERE p.id = v_seller_id
  LIMIT 1;

  IF v_county_id IS NULL THEN RETURN; END IF;

  -- Match county-level quarantines only
  RETURN QUERY
  SELECT
    true AS is_quarantined,
    qz.pest_name,
    co.name AS county_name,
    qz.source_url,
    qz.reason,
    qz.keywords
  FROM quarantine_zones qz
  JOIN counties co ON co.id = qz.county_id
  WHERE qz.is_active = true
    AND qz.county_id = v_county_id
    AND (qz.ends_at IS NULL OR qz.ends_at >= CURRENT_DATE)
    AND (qz.category = v_category OR qz.category = 'ALL')
  LIMIT 5;
END;
$$;


-- 2. get_quarantines_for_user: county-only for info page
DROP FUNCTION IF EXISTS get_quarantines_for_user(uuid);

CREATE OR REPLACE FUNCTION get_quarantines_for_user(p_user_id uuid)
RETURNS TABLE (
  quarantine_id uuid,
  pest_name text,
  category text,
  produce_categories text[],
  keywords text[],
  county_name text,
  state_name text,
  starts_at date,
  ends_at date,
  source_url text,
  reason text,
  created_by_admin boolean,
  scope text
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_county_id UUID;
  v_zip5 TEXT;
  v_country_iso_3 TEXT;
BEGIN
  -- Resolve user zip to county
  SELECT COALESCE(p.zip_code, LEFT(p.zip_plus4, 5)), COALESCE(p.country_code, 'USA')
  INTO v_zip5, v_country_iso_3
  FROM profiles p
  WHERE p.id = p_user_id
    AND (p.zip_code IS NOT NULL OR p.zip_plus4 IS NOT NULL);

  IF v_zip5 IS NOT NULL THEN
    SELECT z.county_id INTO v_county_id
    FROM zip_codes z
    WHERE z.zip_code = v_zip5
      AND z.country_iso_3 = v_country_iso_3
    LIMIT 1;
  END IF;

  IF v_county_id IS NULL THEN RETURN; END IF;

  -- Return only county-level quarantines
  RETURN QUERY
  SELECT
    qz.id AS quarantine_id,
    qz.pest_name,
    qz.category,
    qz.produce_categories,
    qz.keywords,
    co.name AS county_name,
    st.name AS state_name,
    qz.starts_at,
    qz.ends_at,
    qz.source_url,
    qz.reason,
    qz.created_by_admin,
    'county'::text AS scope
  FROM quarantine_zones qz
  JOIN counties co ON co.id = qz.county_id
  LEFT JOIN states st ON st.id = qz.state_id
  WHERE qz.is_active = true
    AND qz.county_id = v_county_id
    AND (qz.ends_at IS NULL OR qz.ends_at >= CURRENT_DATE)
  ORDER BY qz.pest_name;
END;
$$;


-- 3. check_quarantine_for_seller: county-only for product creation
DROP FUNCTION IF EXISTS check_quarantine_for_seller(uuid, text);

CREATE OR REPLACE FUNCTION check_quarantine_for_seller(p_seller_id uuid, p_category text)
RETURNS TABLE (
  pest_name text,
  county_name text,
  state_name text,
  source_url text,
  reason text,
  keywords text[]
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_county_id UUID;
BEGIN
  -- Resolve seller county from zip
  SELECT z.county_id INTO v_county_id
  FROM profiles p
  JOIN zip_codes z ON z.zip_code = COALESCE(p.zip_code, LEFT(p.zip_plus4, 5))
    AND z.country_iso_3 = COALESCE(p.country_code, 'USA')
  WHERE p.id = p_seller_id
  LIMIT 1;

  IF v_county_id IS NULL THEN RETURN; END IF;

  -- Match county-level quarantines only
  RETURN QUERY
  SELECT
    qz.pest_name,
    co.name AS county_name,
    st.name AS state_name,
    qz.source_url,
    qz.reason,
    qz.keywords
  FROM quarantine_zones qz
  JOIN counties co ON co.id = qz.county_id
  LEFT JOIN states st ON st.id = qz.state_id
  WHERE qz.is_active = true
    AND qz.county_id = v_county_id
    AND (qz.ends_at IS NULL OR qz.ends_at >= CURRENT_DATE)
    AND (qz.category = p_category OR qz.category = 'ALL');
END;
$$;


-- 4. Fix place_market_order: county-only quarantine + ZIP+4 COALESCE
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

  -- *** QUARANTINE ENFORCEMENT (county-level only) ***
  SELECT EXISTS(
    SELECT 1 FROM quarantine_zones qz
    JOIN profiles seller_p ON seller_p.id = v_product.seller_id
    LEFT JOIN zip_codes seller_z ON seller_z.zip_code = COALESCE(seller_p.zip_code, LEFT(seller_p.zip_plus4, 5))
      AND seller_z.country_iso_3 = COALESCE(seller_p.country_code, 'USA')
    WHERE qz.is_active = true
      AND qz.county_id IS NOT NULL
      AND qz.county_id = seller_z.county_id
      AND qz.starts_at <= CURRENT_DATE
      AND (qz.ends_at IS NULL OR qz.ends_at >= CURRENT_DATE)
      AND (qz.category = v_product.category OR qz.category = 'ALL')
  ) INTO v_quarantined;

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
  IF p_buyer_zip IS NOT NULL THEN
    SELECT s.code INTO v_state_code
    FROM zip_codes zc
    JOIN cities ci ON ci.id = zc.city_id
    JOIN states s ON s.id = ci.state_id
    WHERE zc.zip_code = p_buyer_zip
    LIMIT 1;
  END IF;

  SELECT s.code INTO v_seller_state_code
  FROM profiles p
  JOIN zip_codes zc ON zc.zip_code = COALESCE(p.zip_code, LEFT(p.zip_plus4, 5))
    AND zc.country_iso_3 = COALESCE(p.country_code, 'USA')
  JOIN cities ci ON ci.id = zc.city_id
  JOIN states s ON s.id = ci.state_id
  WHERE p.id = v_product.seller_id
  LIMIT 1;

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
