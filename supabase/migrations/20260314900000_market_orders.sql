-- Market Orders & Holds
-- Tracks buyer purchases with Stripe hold (authorize-then-capture)

CREATE TYPE market_order_status AS ENUM ('pending', 'confirmed', 'cancelled');

CREATE TABLE market_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID NOT NULL REFERENCES profiles(id),
  seller_id UUID NOT NULL REFERENCES profiles(id),
  booth_id UUID NOT NULL REFERENCES market_booths(id),
  product_id UUID NOT NULL REFERENCES market_products(id),
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_usd NUMERIC(10,2) NOT NULL,
  subtotal_usd NUMERIC(10,2) NOT NULL,
  tax_rate_pct NUMERIC(7,4) NOT NULL DEFAULT 0,
  tax_amount_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  platform_fee_pct NUMERIC(5,2) NOT NULL DEFAULT 10,
  platform_fee_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_usd NUMERIC(10,2) NOT NULL,
  fulfillment_type TEXT NOT NULL CHECK (fulfillment_type IN ('delivery', 'pickup')),
  status market_order_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE market_orders ENABLE ROW LEVEL SECURITY;

-- Buyers can see their own orders
CREATE POLICY "Buyers can read own orders"
  ON market_orders FOR SELECT TO authenticated
  USING (buyer_id = auth.uid());

-- Sellers can see orders for their products
CREATE POLICY "Sellers can read orders for their products"
  ON market_orders FOR SELECT TO authenticated
  USING (seller_id = auth.uid());

-- Market Holds — tracks Stripe PaymentIntents per buyer
-- A buyer has at most ONE active hold. On second purchase, PI is cancelled+recreated with higher amount.
CREATE TABLE market_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID NOT NULL REFERENCES profiles(id),
  stripe_payment_intent_id TEXT NOT NULL,
  stripe_client_secret TEXT NOT NULL,
  hold_amount_cents INTEGER NOT NULL, -- total authorized amount
  spent_amount_cents INTEGER NOT NULL DEFAULT 0, -- total of order totals against this hold
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'captured', 'cancelled', 'expired')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (buyer_id, status) -- only one active hold per buyer (partial unique with WHERE doesn't work for all PG versions)
);

-- Drop the full unique and use a partial index instead
ALTER TABLE market_holds DROP CONSTRAINT IF EXISTS market_holds_buyer_id_status_key;
CREATE UNIQUE INDEX idx_market_holds_buyer_active ON market_holds (buyer_id) WHERE status = 'active';

ALTER TABLE market_holds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Buyers can read own holds"
  ON market_holds FOR SELECT TO authenticated
  USING (buyer_id = auth.uid());

-- Link orders to holds
ALTER TABLE market_orders ADD COLUMN hold_id UUID REFERENCES market_holds(id);

-- ============================================================================
-- RPC: place_market_order
-- Atomic: validates inventory, decrements, inserts order, returns order details
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

  -- Price mismatch guard: reject if price changed since buyer viewed it
  IF p_expected_price IS NOT NULL AND v_product.price_usd <> p_expected_price THEN
    RETURN jsonb_build_object('error', 'Price has changed',
      'code', 'price_changed',
      'expected_price', p_expected_price,
      'current_price', v_product.price_usd);
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
  v_subtotal := v_product.price_usd * p_quantity;
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

  -- Insert order
  INSERT INTO market_orders (
    buyer_id, seller_id, booth_id, product_id, product_name,
    quantity, unit_price_usd, subtotal_usd,
    tax_rate_pct, tax_amount_usd,
    platform_fee_pct, platform_fee_usd,
    total_usd, fulfillment_type, status
  ) VALUES (
    v_buyer_id, v_booth.owner_id, v_booth.id, p_product_id, v_product.name,
    p_quantity, v_product.price_usd, v_subtotal,
    v_tax_rate, v_tax_amount,
    v_fee_rate, v_fee_amount,
    v_total, p_fulfillment_type, 'pending'
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
