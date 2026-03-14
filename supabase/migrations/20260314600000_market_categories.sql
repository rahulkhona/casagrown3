-- Add market-specific categories to sales_categories
-- Add FK from market_products.category to sales_categories
-- Create RPC to get allowed categories for a jurisdiction (buyer zip code)

INSERT INTO sales_categories (name, display_order) VALUES
  ('baked',     10),
  ('preserved', 11),
  ('dairy',     12),
  ('honey',     13),
  ('eggs',      14)
ON CONFLICT (name) DO NOTHING;

-- FK from market_products.category → sales_categories
ALTER TABLE market_products
  ADD CONSTRAINT fk_market_product_category
  FOREIGN KEY (category) REFERENCES sales_categories(name);

-- RPC: get categories allowed for a buyer, filtering out jurisdiction restrictions
-- Follows the same jurisdiction resolution pattern as get_user_jurisdiction:
-- zip_code → zip_codes table → city_id, state_id, county_id
-- Then checks category_restrictions at all levels (global, country, state, county, city)
CREATE OR REPLACE FUNCTION get_allowed_categories(buyer_zip TEXT DEFAULT NULL)
RETURNS TABLE(name TEXT, display_order INTEGER)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_country_iso_3 TEXT := 'USA';
  v_state_id UUID;
  v_county_id UUID;
  v_city_id UUID;
BEGIN
  -- Resolve jurisdiction from zip code (same pattern as get_user_jurisdiction)
  IF buyer_zip IS NOT NULL THEN
    SELECT z.city_id, c.state_id, z.county_id
    INTO v_city_id, v_state_id, v_county_id
    FROM zip_codes z
    LEFT JOIN cities c ON z.city_id = c.id
    WHERE z.zip_code = buyer_zip AND z.country_iso_3 = v_country_iso_3;
  END IF;

  RETURN QUERY
  SELECT sc.name, sc.display_order
  FROM sales_categories sc
  WHERE NOT EXISTS (
    -- Check restrictions at all jurisdiction levels (matching filtered_feed pattern)
    SELECT 1 FROM category_restrictions cr
    WHERE cr.category_name = sc.name
      AND (
        -- Global restriction (all jurisdiction columns NULL)
        (cr.country_iso_3 IS NULL AND cr.state_id IS NULL AND cr.county_id IS NULL AND cr.city_id IS NULL)
        -- Country-level restriction
        OR (cr.country_iso_3 = v_country_iso_3 AND cr.state_id IS NULL AND cr.county_id IS NULL AND cr.city_id IS NULL)
        -- State-level restriction
        OR (v_state_id IS NOT NULL AND cr.state_id = v_state_id AND cr.county_id IS NULL AND cr.city_id IS NULL)
        -- County-level restriction
        OR (v_county_id IS NOT NULL AND cr.county_id = v_county_id AND cr.city_id IS NULL)
        -- City-level restriction
        OR (v_city_id IS NOT NULL AND cr.city_id = v_city_id)
      )
  )
  ORDER BY sc.display_order;
END;
$$;

GRANT EXECUTE ON FUNCTION get_allowed_categories TO authenticated, anon;
