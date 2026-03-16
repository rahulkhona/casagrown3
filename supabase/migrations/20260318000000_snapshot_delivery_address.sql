-- ============================================================================
-- Migration: Snapshot delivery address + Profile audit log
--
-- 1. Audit log: track profile changes (especially address) for disputes
-- 2. Delivery address snapshot: capture buyer address at order creation
-- ============================================================================

-- ============================================================================
-- A. Profile audit log — records every profile change for dispute resolution
-- ============================================================================
CREATE TABLE IF NOT EXISTS profile_audit_log (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by  UUID,  -- auth.uid() at time of change
  old_values  JSONB NOT NULL DEFAULT '{}'::jsonb,
  new_values  JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_profile_audit_user ON profile_audit_log(user_id, changed_at DESC);

-- RLS: only the user themselves and staff can read their audit log
ALTER TABLE profile_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own audit log"
  ON profile_audit_log FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Trigger function: log changed columns
CREATE OR REPLACE FUNCTION trg_profile_audit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old JSONB := '{}'::jsonb;
  v_new JSONB := '{}'::jsonb;
BEGIN
  -- Only log fields that actually changed
  IF OLD.full_name IS DISTINCT FROM NEW.full_name THEN
    v_old := v_old || jsonb_build_object('full_name', OLD.full_name);
    v_new := v_new || jsonb_build_object('full_name', NEW.full_name);
  END IF;
  IF OLD.street_address IS DISTINCT FROM NEW.street_address THEN
    v_old := v_old || jsonb_build_object('street_address', OLD.street_address);
    v_new := v_new || jsonb_build_object('street_address', NEW.street_address);
  END IF;
  IF OLD.zip_code IS DISTINCT FROM NEW.zip_code THEN
    v_old := v_old || jsonb_build_object('zip_code', OLD.zip_code);
    v_new := v_new || jsonb_build_object('zip_code', NEW.zip_code);
  END IF;
  IF OLD.city IS DISTINCT FROM NEW.city THEN
    v_old := v_old || jsonb_build_object('city', OLD.city);
    v_new := v_new || jsonb_build_object('city', NEW.city);
  END IF;
  IF OLD.state_code IS DISTINCT FROM NEW.state_code THEN
    v_old := v_old || jsonb_build_object('state_code', OLD.state_code);
    v_new := v_new || jsonb_build_object('state_code', NEW.state_code);
  END IF;
  IF OLD.home_location IS DISTINCT FROM NEW.home_location THEN
    v_old := v_old || jsonb_build_object('home_location', ST_AsText(OLD.home_location));
    v_new := v_new || jsonb_build_object('home_location', ST_AsText(NEW.home_location));
  END IF;
  IF OLD.avatar_url IS DISTINCT FROM NEW.avatar_url THEN
    v_old := v_old || jsonb_build_object('avatar_url', OLD.avatar_url);
    v_new := v_new || jsonb_build_object('avatar_url', NEW.avatar_url);
  END IF;

  -- Only insert if something changed
  IF v_old <> '{}'::jsonb THEN
    INSERT INTO profile_audit_log (user_id, changed_by, old_values, new_values)
    VALUES (NEW.id, auth.uid(), v_old, v_new);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profile_audit ON profiles;
CREATE TRIGGER trg_profile_audit
  AFTER UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION trg_profile_audit();

-- ============================================================================
-- B. Snapshot delivery address on market_orders
-- ============================================================================

-- 1. Add delivery_address column (nullable for existing orders)
ALTER TABLE market_orders
  ADD COLUMN IF NOT EXISTS delivery_address TEXT;

-- 2. Backfill existing orders with buyer's current address
UPDATE market_orders mo
SET delivery_address = p.street_address
FROM profiles p
WHERE mo.buyer_id = p.id
  AND mo.delivery_address IS NULL
  AND mo.fulfillment_type = 'delivery';

-- 3. Update place_market_order RPC to snapshot the address
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
