-- ============================================================================
-- Fix allocate_from_catalog: compute fulfillment windows + expiry from booth
--
-- Previously hardcoded expires_at = CURRENT_DATE + 2 days.
-- Now reads booth's weekly_delivery_windows and weekly_pickup_windows,
-- builds window_dates / product_delivery_windows / product_pickup_windows
-- for the next 7 days, and sets expires_at to the last matching day.
-- ============================================================================

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
  v_has_windows BOOLEAN;
  v_booth RECORD;
  v_day_names TEXT[] := ARRAY['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  v_check_date DATE;
  v_day_key TEXT;
  v_window_dates JSONB := '[]'::jsonb;
  v_prod_dw JSONB := '{}'::jsonb;
  v_prod_pw JSONB := '{}'::jsonb;
  v_latest_date DATE := CURRENT_DATE + 1;
  v_dw_slots JSONB;
  v_pw_slots JSONB;
  v_date_str TEXT;
BEGIN
  -- Lock the catalog item
  SELECT * INTO v_item FROM catalog_items
  WHERE id = p_catalog_item_id AND owner_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Catalog item not found';
  END IF;

  -- Verify stand belongs to caller and fetch window config
  SELECT id, offers_delivery, offers_pickup,
         weekly_delivery_windows, weekly_pickup_windows
  INTO v_booth
  FROM market_booths WHERE id = p_booth_id AND owner_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stand not found';
  END IF;

  -- Check booth has fulfillment windows configured
  SELECT (
    (v_booth.weekly_delivery_windows IS NOT NULL
     AND v_booth.weekly_delivery_windows != '{}'::jsonb
     AND v_booth.weekly_delivery_windows != '[]'::jsonb)
    OR (v_booth.weekly_pickup_windows IS NOT NULL
     AND v_booth.weekly_pickup_windows != '{}'::jsonb
     AND v_booth.weekly_pickup_windows != '[]'::jsonb)
    OR v_booth.offers_delivery OR v_booth.offers_pickup
  ) INTO v_has_windows;

  IF NOT v_has_windows THEN
    RAISE EXCEPTION 'This booth has no fulfillment windows configured. Please set up delivery or pickup windows in booth settings first.';
  END IF;

  -- Build window_dates and product windows from booth's weekly schedule
  FOR i IN 0..6 LOOP
    v_check_date := CURRENT_DATE + i;
    -- day of week: 0=Sunday .. 6=Saturday (matches extract(dow ...))
    v_day_key := v_day_names[1 + extract(dow FROM v_check_date)::int];

    v_dw_slots := COALESCE(v_booth.weekly_delivery_windows -> v_day_key, '[]'::jsonb);
    v_pw_slots := COALESCE(v_booth.weekly_pickup_windows -> v_day_key, '[]'::jsonb);

    -- Only include days that have at least one window
    IF jsonb_array_length(v_dw_slots) > 0 OR jsonb_array_length(v_pw_slots) > 0 THEN
      v_date_str := to_char(v_check_date, 'YYYY-MM-DD');
      v_window_dates := v_window_dates || to_jsonb(v_date_str);

      IF jsonb_array_length(v_dw_slots) > 0 THEN
        v_prod_dw := v_prod_dw || jsonb_build_object(v_date_str, v_dw_slots);
      END IF;
      IF jsonb_array_length(v_pw_slots) > 0 THEN
        v_prod_pw := v_prod_pw || jsonb_build_object(v_date_str, v_pw_slots);
      END IF;

      v_latest_date := v_check_date;
    END IF;
  END LOOP;

  -- If no matching days found, fall back to today + tomorrow
  IF jsonb_array_length(v_window_dates) = 0 THEN
    v_window_dates := jsonb_build_array(
      to_char(CURRENT_DATE, 'YYYY-MM-DD'),
      to_char(CURRENT_DATE + 1, 'YYYY-MM-DD')
    );
    v_latest_date := CURRENT_DATE + 1;
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

  -- Create the listing in the target stand with booth's fulfillment windows
  INSERT INTO market_products (
    seller_id, booth_id, catalog_item_id,
    name, description, photos, category,
    price_usd, unit, inventory,
    market_date, harvested_at, expires_at,
    window_dates, product_delivery_windows, product_pickup_windows
  ) VALUES (
    auth.uid(), p_booth_id, p_catalog_item_id,
    v_item.name, v_item.description, v_item.photos, v_item.category,
    COALESCE(p_price_override, v_item.default_price_usd), v_item.default_unit,
    p_quantity,
    CURRENT_DATE,
    CASE WHEN v_item.harvest_date IS NOT NULL THEN v_item.harvest_date::timestamptz ELSE now() END,
    (v_latest_date + interval '1 day' - interval '1 second'),  -- end of last window day
    v_window_dates, v_prod_dw, v_prod_pw
  ) RETURNING id INTO v_product_id;

  RETURN v_product_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
