-- ============================================================================
-- BUG-10: Non-Produce Categories — Tax Rules Missing for 49 States
-- 
-- Two fixes:
--   1. Update place_market_order: when v_tax_rule IS NULL, fall through to
--      cache check (treat as 'evaluate'). On any cache miss, return an error
--      forcing the frontend to call get-tax-rate to warm the cache and retry.
--   2. Seed 'evaluate' rules for non-produce categories in all sales-tax
--      states, and 'fixed, 0' for the 5 no-tax states.
-- ============================================================================

-- ── 1. Patch place_market_order ─────────────────────────────────────────────

-- Drop all possible overloaded versions to clean up
DROP FUNCTION IF EXISTS public.place_market_order(UUID, INTEGER, TEXT, TEXT, NUMERIC);
DROP FUNCTION IF EXISTS public.place_market_order(UUID, INTEGER, TEXT, TEXT, NUMERIC, UUID);
DROP FUNCTION IF EXISTS public.place_market_order(UUID, INTEGER, TEXT, TEXT, NUMERIC, UUID, JSONB);

CREATE OR REPLACE FUNCTION public.place_market_order(
  p_product_id UUID,
  p_quantity INTEGER,
  p_fulfillment_type TEXT,
  p_buyer_zip TEXT DEFAULT NULL,
  p_expected_price NUMERIC DEFAULT NULL,
  p_hold_id UUID DEFAULT NULL,
  p_fb_metadata JSONB DEFAULT '{}'::jsonb
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

  -- *** MULTI-STAND FIX: resolve booth from the product's booth_id ***
  SELECT * INTO v_booth FROM market_booths WHERE id = v_product.booth_id;
  IF v_booth IS NULL THEN
    RETURN jsonb_build_object('error', 'Stand not found');
  END IF;

  -- Cannot buy your own products
  IF v_product.seller_id = v_buyer_id THEN
    RETURN jsonb_build_object('error', 'Cannot purchase your own products');
  END IF;

  -- *** QUARANTINE ENFORCEMENT (disabled per 20260728000000_disable_quarantine_database_enforcement.sql) ***
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

  -- *** SAME-STATE ENFORCEMENT ***
  IF p_buyer_zip IS NOT NULL THEN
    SELECT s.code INTO v_state_code
    FROM zip_codes zc
    JOIN cities ci ON ci.id = zc.city_id
    JOIN states s ON s.id = ci.state_id
    WHERE zc.zip_code = p_buyer_zip
    LIMIT 1;
  END IF;

  SELECT s.code, COALESCE(p.zip_code, LEFT(p.zip_plus4, 5))
  INTO v_seller_state_code, v_seller_zip
  FROM profiles p
  JOIN zip_codes zc ON zc.zip_code = COALESCE(p.zip_code, LEFT(p.zip_plus4, 5))
    AND zc.country_iso_3 = COALESCE(p.country_code, 'USA')
  JOIN cities ci ON ci.id = zc.city_id
  JOIN states s ON s.id = ci.state_id
  WHERE p.id = v_product.seller_id
  LIMIT 1;

  -- Tax nexus: delivery = buyer zip (destination), pickup = seller zip (origin)
  IF p_fulfillment_type = 'pickup' THEN
    v_tax_zip := v_seller_zip;
  ELSE
    v_tax_zip := p_buyer_zip;
  END IF;

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

    IF v_tax_rule IS NOT NULL AND v_tax_rule.rule_type = 'fixed' THEN
      -- Fixed rate: use it directly (0 for exempt, >0 for known rate)
      v_tax_rate := COALESCE(v_tax_rule.rate_pct, 0);
    ELSE
      -- Either rule is 'evaluate' or no rule found (treat as evaluate):
      -- look up cached rate from zip_tax_cache
      SELECT * INTO v_cached_rate
      FROM zip_tax_cache
      WHERE zip_code = v_tax_zip
        AND expires_at > now();

      IF v_cached_rate IS NOT NULL THEN
        v_tax_rate := v_cached_rate.combined_rate;
      ELSE
        -- Cache miss: force frontend to call get-tax-rate and retry
        RETURN jsonb_build_object(
          'error', 'Tax rate not available. Please try again.',
          'code', 'tax_cache_miss'
        );
      END IF;
    END IF;
  END IF;

  v_tax_amount := ROUND(v_subtotal * v_tax_rate / 100, 2);

  -- *** PRO SUBSCRIPTION: Plan-aware platform fee ***
  v_fee_rate := get_seller_fee_rate(v_product.seller_id);

  -- Determine seller plan for order tagging
  v_seller_plan := CASE WHEN v_fee_rate <= 5 THEN 'pro' ELSE 'free' END;

  v_fee_amount := ROUND(v_subtotal * v_fee_rate / 100, 2);
  v_total := v_subtotal + v_tax_amount;

  -- Decrement inventory
  UPDATE market_products
  SET inventory = inventory - p_quantity,
      updated_at = now()
  WHERE id = p_product_id;

  -- Insert order (with hold_id and fb_metadata)
  INSERT INTO market_orders (
    buyer_id, seller_id, booth_id, product_id, product_name,
    quantity, unit_price_usd, subtotal_usd,
    tax_rate_pct, tax_amount_usd,
    platform_fee_pct, platform_fee_usd,
    total_usd, fulfillment_type, status,
    delivery_address, hold_id, seller_plan,
    fb_metadata
  ) VALUES (
    v_buyer_id, v_booth.owner_id, v_booth.id, p_product_id, v_product.name,
    p_quantity, v_product.price_usd, v_subtotal,
    v_tax_rate, v_tax_amount,
    v_fee_rate, v_fee_amount,
    v_total, p_fulfillment_type, 'pending',
    CASE WHEN p_fulfillment_type = 'delivery' THEN v_buyer_address ELSE NULL END,
    p_hold_id, v_seller_plan,
    p_fb_metadata
  )
  RETURNING id INTO v_order_id;

  -- Update hold spent amount (if hold provided)
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

-- ── 2. Seed tax rules for non-produce categories ────────────────────────────
-- Categories: flowers, flower_arrangements, garden_equipment, pots, soil,
--             seeds, eggs, honey, plants, seedlings
--
-- 5 no-tax states get 'fixed, 0'. All other 45 states + DC get 'evaluate, NULL'.

-- No-tax states: AK, DE, MT, NH, OR → fixed, rate_pct = 0
INSERT INTO category_tax_rules (state_code, category_name, rule_type, rate_pct, notes, effective_from) VALUES
  -- AK
  ('AK', 'flowers',             'fixed', 0, 'No state sales tax', '2026-01-01'),
  ('AK', 'flower_arrangements', 'fixed', 0, 'No state sales tax', '2026-01-01'),
  ('AK', 'garden_equipment',    'fixed', 0, 'No state sales tax', '2026-01-01'),
  ('AK', 'pots',                'fixed', 0, 'No state sales tax', '2026-01-01'),
  ('AK', 'soil',                'fixed', 0, 'No state sales tax', '2026-01-01'),
  ('AK', 'seeds',               'fixed', 0, 'No state sales tax', '2026-01-01'),
  ('AK', 'eggs',                'fixed', 0, 'No state sales tax', '2026-01-01'),
  ('AK', 'honey',               'fixed', 0, 'No state sales tax', '2026-01-01'),
  ('AK', 'plants',              'fixed', 0, 'No state sales tax', '2026-01-01'),
  ('AK', 'seedlings',           'fixed', 0, 'No state sales tax', '2026-01-01'),
  -- DE
  ('DE', 'flowers',             'fixed', 0, 'No state sales tax', '2026-01-01'),
  ('DE', 'flower_arrangements', 'fixed', 0, 'No state sales tax', '2026-01-01'),
  ('DE', 'garden_equipment',    'fixed', 0, 'No state sales tax', '2026-01-01'),
  ('DE', 'pots',                'fixed', 0, 'No state sales tax', '2026-01-01'),
  ('DE', 'soil',                'fixed', 0, 'No state sales tax', '2026-01-01'),
  ('DE', 'seeds',               'fixed', 0, 'No state sales tax', '2026-01-01'),
  ('DE', 'eggs',                'fixed', 0, 'No state sales tax', '2026-01-01'),
  ('DE', 'honey',               'fixed', 0, 'No state sales tax', '2026-01-01'),
  ('DE', 'plants',              'fixed', 0, 'No state sales tax', '2026-01-01'),
  ('DE', 'seedlings',           'fixed', 0, 'No state sales tax', '2026-01-01'),
  -- MT
  ('MT', 'flowers',             'fixed', 0, 'No state sales tax', '2026-01-01'),
  ('MT', 'flower_arrangements', 'fixed', 0, 'No state sales tax', '2026-01-01'),
  ('MT', 'garden_equipment',    'fixed', 0, 'No state sales tax', '2026-01-01'),
  ('MT', 'pots',                'fixed', 0, 'No state sales tax', '2026-01-01'),
  ('MT', 'soil',                'fixed', 0, 'No state sales tax', '2026-01-01'),
  ('MT', 'seeds',               'fixed', 0, 'No state sales tax', '2026-01-01'),
  ('MT', 'eggs',                'fixed', 0, 'No state sales tax', '2026-01-01'),
  ('MT', 'honey',               'fixed', 0, 'No state sales tax', '2026-01-01'),
  ('MT', 'plants',              'fixed', 0, 'No state sales tax', '2026-01-01'),
  ('MT', 'seedlings',           'fixed', 0, 'No state sales tax', '2026-01-01'),
  -- NH
  ('NH', 'flowers',             'fixed', 0, 'No state sales tax', '2026-01-01'),
  ('NH', 'flower_arrangements', 'fixed', 0, 'No state sales tax', '2026-01-01'),
  ('NH', 'garden_equipment',    'fixed', 0, 'No state sales tax', '2026-01-01'),
  ('NH', 'pots',                'fixed', 0, 'No state sales tax', '2026-01-01'),
  ('NH', 'soil',                'fixed', 0, 'No state sales tax', '2026-01-01'),
  ('NH', 'seeds',               'fixed', 0, 'No state sales tax', '2026-01-01'),
  ('NH', 'eggs',                'fixed', 0, 'No state sales tax', '2026-01-01'),
  ('NH', 'honey',               'fixed', 0, 'No state sales tax', '2026-01-01'),
  ('NH', 'plants',              'fixed', 0, 'No state sales tax', '2026-01-01'),
  ('NH', 'seedlings',           'fixed', 0, 'No state sales tax', '2026-01-01'),
  -- OR
  ('OR', 'flowers',             'fixed', 0, 'No state sales tax', '2026-01-01'),
  ('OR', 'flower_arrangements', 'fixed', 0, 'No state sales tax', '2026-01-01'),
  ('OR', 'garden_equipment',    'fixed', 0, 'No state sales tax', '2026-01-01'),
  ('OR', 'pots',                'fixed', 0, 'No state sales tax', '2026-01-01'),
  ('OR', 'soil',                'fixed', 0, 'No state sales tax', '2026-01-01'),
  ('OR', 'seeds',               'fixed', 0, 'No state sales tax', '2026-01-01'),
  ('OR', 'eggs',                'fixed', 0, 'No state sales tax', '2026-01-01'),
  ('OR', 'honey',               'fixed', 0, 'No state sales tax', '2026-01-01'),
  ('OR', 'plants',              'fixed', 0, 'No state sales tax', '2026-01-01'),
  ('OR', 'seedlings',           'fixed', 0, 'No state sales tax', '2026-01-01')
ON CONFLICT DO NOTHING;

-- 45 states + DC with sales tax → evaluate, NULL
INSERT INTO category_tax_rules (state_code, category_name, rule_type, rate_pct, notes, effective_from) VALUES
  -- AL
  ('AL', 'flowers', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('AL', 'flower_arrangements', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('AL', 'garden_equipment', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('AL', 'pots', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('AL', 'soil', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('AL', 'seeds', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('AL', 'eggs', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('AL', 'honey', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('AL', 'plants', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('AL', 'seedlings', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  -- AR
  ('AR', 'flowers', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('AR', 'flower_arrangements', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('AR', 'garden_equipment', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('AR', 'pots', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('AR', 'soil', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('AR', 'seeds', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('AR', 'eggs', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('AR', 'honey', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('AR', 'plants', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('AR', 'seedlings', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  -- AZ
  ('AZ', 'flowers', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('AZ', 'flower_arrangements', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('AZ', 'garden_equipment', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('AZ', 'pots', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('AZ', 'soil', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('AZ', 'seeds', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('AZ', 'eggs', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('AZ', 'honey', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('AZ', 'plants', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('AZ', 'seedlings', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  -- CA (flowers etc. already seeded, but ON CONFLICT DO NOTHING handles it)
  ('CA', 'seeds', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('CA', 'eggs', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('CA', 'honey', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('CA', 'plants', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('CA', 'seedlings', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  -- CO
  ('CO', 'flowers', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('CO', 'flower_arrangements', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('CO', 'garden_equipment', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('CO', 'pots', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('CO', 'soil', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('CO', 'seeds', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('CO', 'eggs', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('CO', 'honey', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('CO', 'plants', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('CO', 'seedlings', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  -- CT
  ('CT', 'flowers', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('CT', 'flower_arrangements', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('CT', 'garden_equipment', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('CT', 'pots', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('CT', 'soil', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('CT', 'seeds', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('CT', 'eggs', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('CT', 'honey', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('CT', 'plants', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('CT', 'seedlings', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  -- DC
  ('DC', 'flowers', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('DC', 'flower_arrangements', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('DC', 'garden_equipment', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('DC', 'pots', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('DC', 'soil', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('DC', 'seeds', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('DC', 'eggs', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('DC', 'honey', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('DC', 'plants', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('DC', 'seedlings', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  -- FL
  ('FL', 'flowers', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('FL', 'flower_arrangements', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('FL', 'garden_equipment', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('FL', 'pots', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('FL', 'soil', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('FL', 'seeds', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('FL', 'eggs', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('FL', 'honey', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('FL', 'plants', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('FL', 'seedlings', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  -- GA
  ('GA', 'flowers', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('GA', 'flower_arrangements', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('GA', 'garden_equipment', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('GA', 'pots', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('GA', 'soil', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('GA', 'seeds', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('GA', 'eggs', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('GA', 'honey', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('GA', 'plants', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('GA', 'seedlings', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  -- HI
  ('HI', 'flowers', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('HI', 'flower_arrangements', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('HI', 'garden_equipment', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('HI', 'pots', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('HI', 'soil', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('HI', 'seeds', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('HI', 'eggs', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('HI', 'honey', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('HI', 'plants', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('HI', 'seedlings', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  -- IA
  ('IA', 'flowers', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('IA', 'flower_arrangements', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('IA', 'garden_equipment', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('IA', 'pots', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('IA', 'soil', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('IA', 'seeds', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('IA', 'eggs', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('IA', 'honey', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('IA', 'plants', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('IA', 'seedlings', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  -- ID
  ('ID', 'flowers', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('ID', 'flower_arrangements', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('ID', 'garden_equipment', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('ID', 'pots', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('ID', 'soil', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('ID', 'seeds', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('ID', 'eggs', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('ID', 'honey', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('ID', 'plants', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('ID', 'seedlings', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  -- IL
  ('IL', 'flowers', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('IL', 'flower_arrangements', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('IL', 'garden_equipment', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('IL', 'pots', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('IL', 'soil', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('IL', 'seeds', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('IL', 'eggs', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('IL', 'honey', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('IL', 'plants', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('IL', 'seedlings', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  -- IN
  ('IN', 'flowers', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('IN', 'flower_arrangements', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('IN', 'garden_equipment', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('IN', 'pots', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('IN', 'soil', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('IN', 'seeds', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('IN', 'eggs', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('IN', 'honey', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('IN', 'plants', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('IN', 'seedlings', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  -- KS
  ('KS', 'flowers', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('KS', 'flower_arrangements', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('KS', 'garden_equipment', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('KS', 'pots', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('KS', 'soil', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('KS', 'seeds', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('KS', 'eggs', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('KS', 'honey', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('KS', 'plants', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('KS', 'seedlings', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  -- KY
  ('KY', 'flowers', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('KY', 'flower_arrangements', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('KY', 'garden_equipment', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('KY', 'pots', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('KY', 'soil', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('KY', 'seeds', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('KY', 'eggs', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('KY', 'honey', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('KY', 'plants', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('KY', 'seedlings', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  -- LA
  ('LA', 'flowers', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('LA', 'flower_arrangements', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('LA', 'garden_equipment', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('LA', 'pots', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('LA', 'soil', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('LA', 'seeds', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('LA', 'eggs', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('LA', 'honey', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('LA', 'plants', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('LA', 'seedlings', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  -- MA
  ('MA', 'flowers', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MA', 'flower_arrangements', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MA', 'garden_equipment', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MA', 'pots', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MA', 'soil', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MA', 'seeds', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MA', 'eggs', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MA', 'honey', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MA', 'plants', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MA', 'seedlings', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  -- MD
  ('MD', 'flowers', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MD', 'flower_arrangements', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MD', 'garden_equipment', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MD', 'pots', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MD', 'soil', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MD', 'seeds', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MD', 'eggs', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MD', 'honey', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MD', 'plants', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MD', 'seedlings', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  -- ME
  ('ME', 'flowers', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('ME', 'flower_arrangements', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('ME', 'garden_equipment', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('ME', 'pots', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('ME', 'soil', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('ME', 'seeds', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('ME', 'eggs', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('ME', 'honey', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('ME', 'plants', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('ME', 'seedlings', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  -- MI
  ('MI', 'flowers', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MI', 'flower_arrangements', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MI', 'garden_equipment', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MI', 'pots', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MI', 'soil', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MI', 'seeds', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MI', 'eggs', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MI', 'honey', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MI', 'plants', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MI', 'seedlings', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  -- MN
  ('MN', 'flowers', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MN', 'flower_arrangements', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MN', 'garden_equipment', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MN', 'pots', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MN', 'soil', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MN', 'seeds', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MN', 'eggs', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MN', 'honey', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MN', 'plants', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MN', 'seedlings', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  -- MO
  ('MO', 'flowers', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MO', 'flower_arrangements', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MO', 'garden_equipment', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MO', 'pots', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MO', 'soil', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MO', 'seeds', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MO', 'eggs', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MO', 'honey', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MO', 'plants', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MO', 'seedlings', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  -- MS
  ('MS', 'flowers', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MS', 'flower_arrangements', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MS', 'garden_equipment', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MS', 'pots', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MS', 'soil', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MS', 'seeds', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MS', 'eggs', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MS', 'honey', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MS', 'plants', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('MS', 'seedlings', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  -- NC
  ('NC', 'flowers', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NC', 'flower_arrangements', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NC', 'garden_equipment', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NC', 'pots', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NC', 'soil', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NC', 'seeds', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NC', 'eggs', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NC', 'honey', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NC', 'plants', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NC', 'seedlings', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  -- ND
  ('ND', 'flowers', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('ND', 'flower_arrangements', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('ND', 'garden_equipment', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('ND', 'pots', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('ND', 'soil', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('ND', 'seeds', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('ND', 'eggs', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('ND', 'honey', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('ND', 'plants', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('ND', 'seedlings', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  -- NE
  ('NE', 'flowers', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NE', 'flower_arrangements', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NE', 'garden_equipment', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NE', 'pots', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NE', 'soil', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NE', 'seeds', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NE', 'eggs', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NE', 'honey', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NE', 'plants', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NE', 'seedlings', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  -- NJ
  ('NJ', 'flowers', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NJ', 'flower_arrangements', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NJ', 'garden_equipment', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NJ', 'pots', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NJ', 'soil', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NJ', 'seeds', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NJ', 'eggs', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NJ', 'honey', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NJ', 'plants', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NJ', 'seedlings', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  -- NM
  ('NM', 'flowers', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NM', 'flower_arrangements', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NM', 'garden_equipment', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NM', 'pots', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NM', 'soil', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NM', 'seeds', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NM', 'eggs', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NM', 'honey', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NM', 'plants', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NM', 'seedlings', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  -- NV
  ('NV', 'flowers', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NV', 'flower_arrangements', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NV', 'garden_equipment', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NV', 'pots', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NV', 'soil', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NV', 'seeds', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NV', 'eggs', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NV', 'honey', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NV', 'plants', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NV', 'seedlings', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  -- NY
  ('NY', 'flowers', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NY', 'flower_arrangements', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NY', 'garden_equipment', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NY', 'pots', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NY', 'soil', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NY', 'seeds', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NY', 'eggs', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NY', 'honey', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NY', 'plants', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('NY', 'seedlings', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  -- OH
  ('OH', 'flowers', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('OH', 'flower_arrangements', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('OH', 'garden_equipment', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('OH', 'pots', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('OH', 'soil', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('OH', 'seeds', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('OH', 'eggs', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('OH', 'honey', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('OH', 'plants', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('OH', 'seedlings', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  -- OK
  ('OK', 'flowers', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('OK', 'flower_arrangements', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('OK', 'garden_equipment', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('OK', 'pots', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('OK', 'soil', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('OK', 'seeds', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('OK', 'eggs', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('OK', 'honey', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('OK', 'plants', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('OK', 'seedlings', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  -- PA
  ('PA', 'flowers', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('PA', 'flower_arrangements', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('PA', 'garden_equipment', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('PA', 'pots', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('PA', 'soil', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('PA', 'seeds', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('PA', 'eggs', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('PA', 'honey', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('PA', 'plants', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('PA', 'seedlings', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  -- RI
  ('RI', 'flowers', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('RI', 'flower_arrangements', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('RI', 'garden_equipment', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('RI', 'pots', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('RI', 'soil', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('RI', 'seeds', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('RI', 'eggs', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('RI', 'honey', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('RI', 'plants', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('RI', 'seedlings', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  -- SC
  ('SC', 'flowers', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('SC', 'flower_arrangements', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('SC', 'garden_equipment', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('SC', 'pots', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('SC', 'soil', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('SC', 'seeds', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('SC', 'eggs', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('SC', 'honey', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('SC', 'plants', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('SC', 'seedlings', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  -- SD
  ('SD', 'flowers', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('SD', 'flower_arrangements', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('SD', 'garden_equipment', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('SD', 'pots', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('SD', 'soil', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('SD', 'seeds', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('SD', 'eggs', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('SD', 'honey', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('SD', 'plants', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('SD', 'seedlings', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  -- TN
  ('TN', 'flowers', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('TN', 'flower_arrangements', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('TN', 'garden_equipment', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('TN', 'pots', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('TN', 'soil', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('TN', 'seeds', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('TN', 'eggs', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('TN', 'honey', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('TN', 'plants', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('TN', 'seedlings', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  -- TX
  ('TX', 'flowers', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('TX', 'flower_arrangements', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('TX', 'garden_equipment', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('TX', 'pots', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('TX', 'soil', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('TX', 'seeds', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('TX', 'eggs', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('TX', 'honey', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('TX', 'plants', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('TX', 'seedlings', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  -- UT
  ('UT', 'flowers', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('UT', 'flower_arrangements', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('UT', 'garden_equipment', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('UT', 'pots', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('UT', 'soil', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('UT', 'seeds', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('UT', 'eggs', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('UT', 'honey', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('UT', 'plants', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('UT', 'seedlings', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  -- VA
  ('VA', 'flowers', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('VA', 'flower_arrangements', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('VA', 'garden_equipment', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('VA', 'pots', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('VA', 'soil', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('VA', 'seeds', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('VA', 'eggs', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('VA', 'honey', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('VA', 'plants', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('VA', 'seedlings', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  -- VT
  ('VT', 'flowers', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('VT', 'flower_arrangements', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('VT', 'garden_equipment', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('VT', 'pots', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('VT', 'soil', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('VT', 'seeds', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('VT', 'eggs', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('VT', 'honey', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('VT', 'plants', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('VT', 'seedlings', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  -- WA
  ('WA', 'flowers', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('WA', 'flower_arrangements', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('WA', 'garden_equipment', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('WA', 'pots', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('WA', 'soil', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('WA', 'seeds', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('WA', 'eggs', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('WA', 'honey', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('WA', 'plants', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('WA', 'seedlings', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  -- WI
  ('WI', 'flowers', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('WI', 'flower_arrangements', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('WI', 'garden_equipment', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('WI', 'pots', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('WI', 'soil', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('WI', 'seeds', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('WI', 'eggs', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('WI', 'honey', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('WI', 'plants', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('WI', 'seedlings', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  -- WV
  ('WV', 'flowers', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('WV', 'flower_arrangements', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('WV', 'garden_equipment', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('WV', 'pots', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('WV', 'soil', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('WV', 'seeds', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('WV', 'eggs', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('WV', 'honey', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('WV', 'plants', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('WV', 'seedlings', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  -- WY
  ('WY', 'flowers', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('WY', 'flower_arrangements', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('WY', 'garden_equipment', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('WY', 'pots', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('WY', 'soil', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('WY', 'seeds', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('WY', 'eggs', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('WY', 'honey', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('WY', 'plants', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01'),
  ('WY', 'seedlings', 'evaluate', NULL, 'Taxable — rate varies by jurisdiction', '2026-01-01')
ON CONFLICT DO NOTHING;
