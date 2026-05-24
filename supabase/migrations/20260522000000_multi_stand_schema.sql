-- ============================================================================
-- Migration: Multi-Stand Architecture
-- ============================================================================
-- Transforms CasaGrown from single-booth-per-seller to multi-stand model.
--
-- Changes:
--   1. Drops UNIQUE(owner_id) on market_booths
--   2. Adds is_default, delivery_zipcodes to market_booths
--   3. Adds booth_id FK to market_products (with backfill)
--   4. Creates catalog_items table (DFC-compatible, one implicit catalog per seller)
--   5. Adds catalog_item_id FK to market_products
--   6. Creates catalog_item_allocations view
--   7. Creates dfc_category_map reference table
--   8. Refactors place_market_order() to use product.booth_id
--   9. Refactors nearby_booths() to join via booth_id
--  10. Updates notification triggers to include stand name
--  11. Adds create_stand() and allocate_from_catalog() RPCs
-- ============================================================================

SET search_path TO public, extensions;

-- ============================================================
-- PART 1: Multi-Stand Support on market_booths
-- ============================================================

-- 1a. Drop the 1:1 unique constraint
ALTER TABLE market_booths DROP CONSTRAINT IF EXISTS market_booths_owner_id_key;

-- 1b. Add is_default flag
ALTER TABLE market_booths ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

-- 1c. Add zip-based delivery zones (for farmers delivering to specific towns)
ALTER TABLE market_booths ADD COLUMN IF NOT EXISTS delivery_zipcodes TEXT[] DEFAULT '{}';

-- 1d. Backfill: mark all existing booths as default
UPDATE market_booths SET is_default = true WHERE is_default = false;

-- 1e. Partial unique index: at most one default stand per owner
CREATE UNIQUE INDEX IF NOT EXISTS idx_market_booths_default_per_owner
  ON market_booths (owner_id) WHERE is_default = true;


-- ============================================================
-- PART 2: Link Products to Booths
-- ============================================================

-- 2a. Add booth_id FK to products
ALTER TABLE market_products
  ADD COLUMN IF NOT EXISTS booth_id UUID REFERENCES market_booths(id);

-- 2b. Backfill: set booth_id from seller's existing (single) booth
UPDATE market_products mp
SET booth_id = mb.id
FROM market_booths mb
WHERE mb.owner_id = mp.seller_id
  AND mp.booth_id IS NULL;

-- 2c. Make NOT NULL after backfill
ALTER TABLE market_products
  ALTER COLUMN booth_id SET NOT NULL;

-- 2d. Index for booth-scoped queries
CREATE INDEX IF NOT EXISTS idx_market_products_booth_id ON market_products(booth_id);


-- ============================================================
-- PART 3: DFC-Compatible Product Catalog
-- ============================================================

-- One implicit catalog per seller — if you have catalog_items, you have a catalog.
-- No separate seller_catalogs table needed.

CREATE TABLE IF NOT EXISTS catalog_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Core Identity (DFC: description, hasType)
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'other',     -- maps to DFC hasType taxonomy
  photos TEXT[] DEFAULT '{}',                 -- DFC: image (array for multiple)

  -- Quantity & Units (DFC: hasQuantity → QuantitativeValue)
  default_price_usd NUMERIC(10,2),
  default_unit TEXT DEFAULT 'each',           -- 'each','lb','bunch','dozen','jar','bag','box','basket'
  quantity_value NUMERIC(10,3),               -- DFC: QuantitativeValue.value (e.g., 1.0 for "1 lb")
  quantity_unit TEXT,                          -- DFC: QuantitativeValue.hasUnit ('g','kg','oz','lb','ml','l','fl_oz','unit')

  -- Inventory (DFC: totalTheoriticalStock)
  total_inventory INTEGER NOT NULL DEFAULT 0,

  -- Product Characteristics (DFC Facets)
  certifications TEXT[] DEFAULT '{}',         -- DFC: hasCertification
  allergens TEXT[] DEFAULT '{}',              -- DFC: hasAllergenCharacteristic
  geographical_origin TEXT,                   -- DFC: hasGeographicalOrigin

  -- Physical Characteristics (DFC: hasPhysicalCharacteristic)
  weight_value NUMERIC(10,3),
  weight_unit TEXT,                            -- 'oz','lb','g','kg'
  volume_value NUMERIC(10,3),
  volume_unit TEXT,                            -- 'fl_oz','cup','pint','quart','gallon','ml','l'

  -- Nutritional (DFC: hasNutrientCharacteristic)
  nutrition_info JSONB DEFAULT '{}',

  -- Lifecycle (DFC: lifetime)
  shelf_life_days INTEGER,
  storage_instructions TEXT,

  -- Agriculture-Specific
  variety TEXT,                               -- cultivar: "Brandywine", "Cherokee Purple"
  growing_method TEXT,                        -- 'conventional','organic','hydroponic','aquaponic','greenhouse','field_grown'
  harvest_season TEXT,                        -- 'spring','summer','fall','winter','year_round'
  sku TEXT,                                   -- optional internal reference

  -- DFC Interop (for future import/export)
  dfc_external_id TEXT,
  dfc_product_type TEXT,

  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE catalog_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS catalog_items_owner_all ON catalog_items;
CREATE POLICY catalog_items_owner_all ON catalog_items
  FOR ALL USING (owner_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_catalog_items_owner ON catalog_items(owner_id);
CREATE INDEX IF NOT EXISTS idx_catalog_items_category ON catalog_items(category);

-- Link products to catalog items (optional — NULL = standalone listing)
ALTER TABLE market_products
  ADD COLUMN IF NOT EXISTS catalog_item_id UUID REFERENCES catalog_items(id);


-- ============================================================
-- PART 4: Catalog Inventory Allocation View
-- ============================================================

CREATE OR REPLACE VIEW catalog_item_allocations AS
SELECT
  ci.id AS catalog_item_id,
  ci.owner_id,
  ci.name,
  ci.category,
  ci.total_inventory,
  COALESCE(SUM(mp.inventory), 0)::INTEGER AS allocated_inventory,
  (ci.total_inventory - COALESCE(SUM(mp.inventory), 0))::INTEGER AS available_inventory,
  COUNT(DISTINCT mp.booth_id)::INTEGER AS stand_count
FROM catalog_items ci
LEFT JOIN market_products mp
  ON mp.catalog_item_id = ci.id
  AND mp.is_active = true
  AND mp.is_deleted = false
GROUP BY ci.id;

GRANT SELECT ON catalog_item_allocations TO authenticated;


-- ============================================================
-- PART 5: DFC Category Mapping Reference Table
-- ============================================================

CREATE TABLE IF NOT EXISTS dfc_category_map (
  casagrown_category TEXT PRIMARY KEY,
  dfc_product_type TEXT NOT NULL,
  dfc_product_family TEXT,
  display_label TEXT NOT NULL
);

INSERT INTO dfc_category_map (casagrown_category, dfc_product_type, dfc_product_family, display_label) VALUES
  ('eggs',        'dfc-pt:egg',            'dfc-pt:egg',        'Eggs'),
  ('fruits',      'dfc-pt:fruit',          'dfc-pt:fruit',      'Fruits'),
  ('vegetables',  'dfc-pt:vegetable',      'dfc-pt:vegetable',  'Vegetables'),
  ('herbs',       'dfc-pt:aromatic-plant', 'dfc-pt:vegetable',  'Herbs'),
  ('honey',       'dfc-pt:honey',          'dfc-pt:honey',      'Honey'),
  ('dairy',       'dfc-pt:dairy',          'dfc-pt:dairy',      'Dairy'),
  ('baked_goods', 'dfc-pt:bakery',         'dfc-pt:bakery',     'Baked Goods'),
  ('preserves',   'dfc-pt:jam',            'dfc-pt:jam',        'Preserves'),
  ('plants',      'dfc-pt:plant',          'dfc-pt:plant',      'Plants & Starts'),
  ('meat',        'dfc-pt:meat',           'dfc-pt:meat',       'Meat'),
  ('seafood',     'dfc-pt:fish',           'dfc-pt:fish',       'Seafood'),
  ('other',       'dfc-pt:non-pigeon-holed', 'dfc-pt:non-pigeon-holed', 'Other')
ON CONFLICT (casagrown_category) DO NOTHING;

ALTER TABLE dfc_category_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY dfc_category_map_read ON dfc_category_map FOR SELECT USING (true);


-- ============================================================
-- PART 6: Refactor place_market_order() — use product.booth_id
-- ============================================================

DROP FUNCTION IF EXISTS place_market_order(UUID, INTEGER, TEXT, TEXT, NUMERIC, UUID);

CREATE OR REPLACE FUNCTION place_market_order(
  p_product_id UUID,
  p_quantity INTEGER,
  p_fulfillment_type TEXT,
  p_buyer_zip TEXT DEFAULT NULL,
  p_expected_price NUMERIC DEFAULT NULL,
  p_hold_id UUID DEFAULT NULL
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
  v_hold RECORD;
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

  -- Insert order (with hold_id if provided)
  INSERT INTO market_orders (
    buyer_id, seller_id, booth_id, product_id, product_name,
    quantity, unit_price_usd, subtotal_usd,
    tax_rate_pct, tax_amount_usd,
    platform_fee_pct, platform_fee_usd,
    total_usd, fulfillment_type, status,
    delivery_address, hold_id
  ) VALUES (
    v_buyer_id, v_booth.owner_id, v_booth.id, p_product_id, v_product.name,
    p_quantity, v_product.price_usd, v_subtotal,
    v_tax_rate, v_tax_amount,
    v_fee_rate, v_fee_amount,
    v_total, p_fulfillment_type, 'pending',
    CASE WHEN p_fulfillment_type = 'delivery' THEN v_buyer_address ELSE NULL END,
    p_hold_id
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
    'total_cents', (v_total * 100)::INTEGER,
    'product_name', v_product.name,
    'remaining_inventory', v_product.inventory - p_quantity
  );
END;
$$;


-- ============================================================
-- PART 7: Refactor nearby_booths() — join via booth_id
-- ============================================================

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public CASCADE;

CREATE OR REPLACE FUNCTION nearby_booths(
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
  p_offset INTEGER DEFAULT 0
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
) LANGUAGE plpgsql SECURITY DEFINER AS $$
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
    SELECT bd.* FROM booth_distances bd
    WHERE CASE fulfillment_filter
      WHEN 'delivery' THEN bd.offers_delivery AND bd.dist_miles <= bd.delivery_radius_miles
      WHEN 'pickup'   THEN bd.offers_pickup
      ELSE (bd.offers_delivery OR bd.offers_pickup)
    END
  ),
  -- *** MULTI-STAND FIX: group products by booth_id instead of seller_id ***
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
      )::BIGINT AS total_count,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', mp.id, 'name', mp.name, 'description', mp.description,
            'price_usd', mp.price_usd, 'unit', mp.unit,
            'photo', mp.photos[1], 'inventory', mp.inventory,
            'category', mp.category, 'harvested_at', mp.harvested_at,
            'window_dates', mp.window_dates,
            'product_delivery_windows', mp.product_delivery_windows,
            'product_pickup_windows', mp.product_pickup_windows
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
        ), '[]'::jsonb
      ) AS prods
    FROM market_products mp GROUP BY mp.booth_id
  )
  SELECT f.id, f.owner_id, f.name, f.description, f.decorative_theme, f.header_image_url,
    f.offers_delivery, f.offers_pickup, f.delivery_radius_miles,
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
  -- *** MULTI-STAND FIX: join via booth_id instead of seller_id ***
  LEFT JOIN products p ON p.product_booth_id = f.id
  LEFT JOIN profiles pr ON pr.id = f.owner_id
  WHERE jsonb_array_length(COALESCE(p.prods, '[]'::jsonb)) > 0
  ORDER BY f.dist_miles
  LIMIT p_limit
  OFFSET p_offset;

  GET DIAGNOSTICS v_real_count = ROW_COUNT;

  -- Only append demo booths on the first page (offset = 0)
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


-- ============================================================
-- PART 8: Update Notification Triggers for Stand Names
-- ============================================================

-- 8a. Order PLACED — include stand name
CREATE OR REPLACE FUNCTION trg_market_order_placed_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_booth_name TEXT;
BEGIN
  SELECT name INTO v_booth_name FROM market_booths WHERE id = NEW.booth_id;

  PERFORM notify_market_event(
    NEW.seller_id,
    '🛒 New order: ' || NEW.quantity || '× ' || NEW.product_name ||
      ' ($' || NEW.total_usd || ') at ' || COALESCE(v_booth_name, 'your stand'),
    '/orders'
  );
  RETURN NEW;
END;
$$;

-- 8b. Order STATUS changes — include stand name
CREATE OR REPLACE FUNCTION trg_market_order_status_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_booth_name TEXT;
  v_pickup_addr TEXT;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  SELECT b.name, COALESCE(b.pickup_display_address, b.pickup_address)
  INTO v_booth_name, v_pickup_addr
  FROM market_booths b WHERE b.id = NEW.booth_id;

  CASE NEW.status
    WHEN 'confirmed' THEN
      PERFORM notify_market_event(
        NEW.buyer_id,
        '✅ Your order for ' || NEW.product_name || ' at ' || COALESCE(v_booth_name, 'the stand') || ' has been accepted!',
        '/orders'
      );

    WHEN 'delivered' THEN
      PERFORM notify_market_event(
        NEW.buyer_id,
        '🚚 Your ' || NEW.product_name || ' from ' || COALESCE(v_booth_name, 'the stand') || ' has been delivered! Please confirm receipt.',
        '/orders'
      );

    WHEN 'completed' THEN
      PERFORM notify_market_event(
        NEW.buyer_id,
        '✅ Order completed: ' || NEW.product_name || ' from ' || COALESCE(v_booth_name, 'the stand') || '. Rate your experience!',
        '/orders/' || NEW.id
      );
      PERFORM notify_market_event(
        NEW.seller_id,
        '💰 Sale completed at ' || COALESCE(v_booth_name, 'your stand') || ': ' || NEW.product_name || ' — $' || NEW.subtotal_usd || ' earned. Rate the buyer!',
        '/orders/' || NEW.id
      );

    WHEN 'declined' THEN
      PERFORM notify_market_event(
        NEW.buyer_id,
        '❌ Your order for ' || NEW.product_name || ' at ' || COALESCE(v_booth_name, 'the stand') || ' was declined' ||
          CASE WHEN NEW.decline_reason IS NOT NULL THEN ': ' || NEW.decline_reason ELSE '' END,
        '/orders'
      );

    WHEN 'disputed' THEN
      DECLARE
        v_dispute_label TEXT;
      BEGIN
        SELECT CASE d.dispute_type
          WHEN 'not_delivered' THEN 'Order Not Delivered'
          WHEN 'wrong_item' THEN 'Wrong Item Received'
          WHEN 'poor_quality' THEN 'Quality Issue Reported'
          WHEN 'quantity_mismatch' THEN 'Quantity Mismatch'
          ELSE 'Dispute Opened'
        END INTO v_dispute_label
        FROM order_disputes d WHERE d.order_id = NEW.id
        ORDER BY d.created_at DESC LIMIT 1;

        v_dispute_label := coalesce(v_dispute_label, 'Dispute Opened');

        PERFORM notify_market_event(
          NEW.buyer_id,
          '⚠️ ' || v_dispute_label || ' for your ' || NEW.product_name || ' order at ' || COALESCE(v_booth_name, 'the stand') || '.',
          '/orders'
        );
        PERFORM notify_market_event(
          NEW.seller_id,
          '⚠️ ' || v_dispute_label || ' for ' || NEW.product_name || ' sale at ' || COALESCE(v_booth_name, 'your stand') || '.',
          '/orders'
        );
      END;

    WHEN 'escalated' THEN
      PERFORM notify_market_event(
        NEW.buyer_id,
        '📋 Your dispute for ' || NEW.product_name || ' at ' || COALESCE(v_booth_name, 'the stand') || ' has been escalated to admin review.',
        '/orders'
      );
      PERFORM notify_market_event(
        NEW.seller_id,
        '📋 The dispute for ' || NEW.product_name || ' at ' || COALESCE(v_booth_name, 'your stand') || ' has been escalated to admin review.',
        '/orders'
      );

    WHEN 'resolved' THEN
      PERFORM notify_market_event(
        NEW.buyer_id,
        '✅ Your dispute for ' || NEW.product_name || ' at ' || COALESCE(v_booth_name, 'the stand') || ' has been resolved.',
        '/orders'
      );
      PERFORM notify_market_event(
        NEW.seller_id,
        '✅ The dispute for ' || NEW.product_name || ' at ' || COALESCE(v_booth_name, 'your stand') || ' has been resolved.',
        '/orders'
      );

    WHEN 'cancelled' THEN
      PERFORM notify_market_event(
        NEW.buyer_id,
        '🔄 Your order for ' || NEW.product_name || ' at ' || COALESCE(v_booth_name, 'the stand') || ' has been cancelled.',
        '/orders'
      );

    ELSE
      NULL;
  END CASE;

  RETURN NEW;
END;
$$;

-- 8c. Product added — use NEW.booth_id instead of seller_id lookup
CREATE OR REPLACE FUNCTION trg_product_added_notify_followers()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_booth RECORD;
  v_follower RECORD;
  v_follower_ids UUID[];
BEGIN
  -- *** MULTI-STAND FIX: use NEW.booth_id directly ***
  SELECT id, name INTO v_booth
  FROM market_booths
  WHERE id = NEW.booth_id;

  IF v_booth IS NULL THEN RETURN NEW; END IF;

  SELECT array_agg(follower_id) INTO v_follower_ids
  FROM followers WHERE followed_id = NEW.seller_id;

  IF v_follower_ids IS NULL OR array_length(v_follower_ids, 1) = 0 THEN
    RETURN NEW;
  END IF;

  FOR v_follower IN
    SELECT follower_id FROM followers WHERE followed_id = NEW.seller_id
  LOOP
    INSERT INTO notifications (user_id, content, link_url)
    VALUES (
      v_follower.follower_id,
      '🌱 ' || v_booth.name || ' added new item: ' || NEW.name || ' ($' || NEW.price_usd || '/' || NEW.unit || ')',
      '/market'
    );
  END LOOP;

  PERFORM send_push_via_edge(
    v_follower_ids,
    v_booth.name || ' — New Item!',
    NEW.name || ' now available ($' || NEW.price_usd || '/' || NEW.unit || ')',
    '/market'
  );

  RETURN NEW;
END;
$$;

-- 8d. Ready for pickup — include stand name and address
-- This is handled by the separate_ready_for_pickup migration's trigger.
-- We update it here to include stand info in the notification.
CREATE OR REPLACE FUNCTION trg_ready_for_pickup_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_booth_name TEXT;
  v_pickup_addr TEXT;
BEGIN
  IF NEW.ready_for_pickup_at IS NOT NULL AND
     (OLD.ready_for_pickup_at IS NULL OR OLD.ready_for_pickup_at <> NEW.ready_for_pickup_at) THEN
    SELECT b.name, COALESCE(b.pickup_display_address, b.pickup_address)
    INTO v_booth_name, v_pickup_addr
    FROM market_booths b WHERE b.id = NEW.booth_id;

    PERFORM notify_market_event(
      NEW.buyer_id,
      '📦 Your ' || NEW.product_name || ' is ready for pickup at ' ||
        COALESCE(v_booth_name, 'the stand') ||
        CASE WHEN v_pickup_addr IS NOT NULL THEN ' (' || v_pickup_addr || ')' ELSE '' END,
      '/orders'
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS trg_ready_for_pickup_notification ON market_orders;
CREATE TRIGGER trg_ready_for_pickup_notification
  AFTER UPDATE OF ready_for_pickup_at ON market_orders
  FOR EACH ROW
  EXECUTE FUNCTION trg_ready_for_pickup_notify();


-- ============================================================
-- PART 9: Booth location sync — support multiple stands
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_booth_location_from_profile()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.home_location IS NOT NULL AND
     (OLD.home_location IS NULL OR OLD.home_location::text != NEW.home_location::text) THEN
    -- Only sync to stands that haven't been explicitly configured
    UPDATE market_booths
    SET pickup_location = NEW.home_location
    WHERE owner_id = NEW.id
    AND pickup_location IS NULL;
  END IF;
  RETURN NEW;
END;
$$;


-- ============================================================
-- PART 10: create_stand() RPC
-- ============================================================

CREATE OR REPLACE FUNCTION create_stand(
  p_name TEXT,
  p_pickup_address TEXT DEFAULT NULL,
  p_offers_delivery BOOLEAN DEFAULT false,
  p_offers_pickup BOOLEAN DEFAULT true,
  p_delivery_radius_miles INTEGER DEFAULT NULL,
  p_delivery_zipcodes TEXT[] DEFAULT '{}',
  p_is_default BOOLEAN DEFAULT false
) RETURNS UUID AS $$
DECLARE
  v_booth_id UUID;
  v_has_booths BOOLEAN;
BEGIN
  -- If first stand, force as default
  SELECT EXISTS(SELECT 1 FROM market_booths WHERE owner_id = auth.uid())
    INTO v_has_booths;
  IF NOT v_has_booths THEN
    p_is_default := true;
  END IF;

  -- If setting as default, unset existing default
  IF p_is_default THEN
    UPDATE market_booths SET is_default = false
    WHERE owner_id = auth.uid() AND is_default = true;
  END IF;

  INSERT INTO market_booths (
    id, owner_id, name, pickup_address,
    offers_delivery, offers_pickup,
    delivery_radius_miles, delivery_zipcodes, is_default
  ) VALUES (
    gen_random_uuid(), auth.uid(), p_name, p_pickup_address,
    p_offers_delivery, p_offers_pickup,
    p_delivery_radius_miles, p_delivery_zipcodes, p_is_default
  ) RETURNING id INTO v_booth_id;

  RETURN v_booth_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- PART 11: allocate_from_catalog() RPC
-- ============================================================

CREATE OR REPLACE FUNCTION allocate_from_catalog(
  p_catalog_item_id UUID,
  p_booth_id UUID,
  p_quantity INTEGER,
  p_price_override NUMERIC(10,2) DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_item catalog_items;
  v_available INTEGER;
  v_product_id UUID;
BEGIN
  -- Lock the catalog item
  SELECT * INTO v_item FROM catalog_items
  WHERE id = p_catalog_item_id AND owner_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Catalog item not found';
  END IF;

  -- Verify stand belongs to caller
  IF NOT EXISTS(SELECT 1 FROM market_booths WHERE id = p_booth_id AND owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'Stand not found';
  END IF;

  -- Check available inventory
  SELECT v_item.total_inventory - COALESCE(SUM(mp.inventory), 0)
  INTO v_available
  FROM market_products mp
  WHERE mp.catalog_item_id = p_catalog_item_id
    AND mp.is_active = true
    AND mp.is_deleted = false;

  IF v_available IS NULL THEN
    v_available := v_item.total_inventory;
  END IF;

  IF v_available < p_quantity THEN
    RAISE EXCEPTION 'Insufficient catalog inventory. Available: %, Requested: %',
      v_available, p_quantity;
  END IF;

  -- Create the listing in the target stand
  INSERT INTO market_products (
    seller_id, booth_id, catalog_item_id,
    name, description, photos, category,
    price_usd, unit, inventory,
    market_date, harvested_at, expires_at
  ) VALUES (
    auth.uid(), p_booth_id, p_catalog_item_id,
    v_item.name, v_item.description, v_item.photos, v_item.category,
    COALESCE(p_price_override, v_item.default_price_usd), v_item.default_unit,
    p_quantity,
    CURRENT_DATE,
    CASE WHEN v_item.harvest_date IS NOT NULL THEN v_item.harvest_date::timestamptz ELSE now() END,
    (CURRENT_DATE + interval '2 days')
  ) RETURNING id INTO v_product_id;

  RETURN v_product_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- PART 12: Grant API access for new tables/functions
-- ============================================================

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON catalog_items TO authenticated;
GRANT SELECT ON dfc_category_map TO authenticated;
GRANT SELECT ON catalog_item_allocations TO authenticated;
GRANT EXECUTE ON FUNCTION create_stand TO authenticated;
GRANT EXECUTE ON FUNCTION allocate_from_catalog TO authenticated;


-- ============================================================
-- PART 13: Redefine auto_create_booth_on_profile trigger
-- ============================================================

CREATE OR REPLACE FUNCTION public.auto_create_booth_on_profile()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Only create if no stand exists yet for this user
  IF NOT EXISTS (SELECT 1 FROM public.market_booths WHERE owner_id = NEW.id) THEN
    INSERT INTO public.market_booths (owner_id, name, helper_passcode, is_default)
    VALUES (
      NEW.id,
      COALESCE(NEW.full_name, 'My Stand') || '''s Stand',
      upper(substr(md5(random()::text), 1, 6)),
      true
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Don't block profile creation if stand creation fails
  RAISE WARNING 'Auto stand creation failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;


-- ============================================================
-- PART 14: Auto-resolve booth_id for legacy inserts
-- ============================================================

CREATE OR REPLACE FUNCTION public.auto_resolve_product_booth_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.booth_id IS NULL THEN
    -- Try to find the default stand first
    SELECT id INTO NEW.booth_id
    FROM market_booths
    WHERE owner_id = NEW.seller_id AND is_default = true
    LIMIT 1;

    -- Fallback to any stand if no default exists
    IF NEW.booth_id IS NULL THEN
      SELECT id INTO NEW.booth_id
      FROM market_booths
      WHERE owner_id = NEW.seller_id
      LIMIT 1;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_resolve_product_booth_id ON market_products;
CREATE TRIGGER trg_auto_resolve_product_booth_id
  BEFORE INSERT ON market_products
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_resolve_product_booth_id();


