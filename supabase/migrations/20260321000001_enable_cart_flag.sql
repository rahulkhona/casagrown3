-- ============================================================================
-- Add enable_cart experiment flag to market_settings
-- When enabled, buyers see "Add to Cart" instead of direct "Buy" flow
-- ============================================================================

ALTER TABLE market_settings ADD COLUMN IF NOT EXISTS enable_cart BOOLEAN NOT NULL DEFAULT false;

-- Update get_market_config to include enableCart
CREATE OR REPLACE FUNCTION get_market_config()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_schedule JSONB;
  v_settings RECORD;
BEGIN
  -- Load settings
  SELECT ms.products_never_expire, ms.market_never_closes, ms.enable_cart
  INTO v_settings
  FROM market_settings ms
  WHERE ms.id = true;

  -- If market_never_closes, return all days 00:00-23:59
  IF v_settings.market_never_closes THEN
    v_schedule := (
      SELECT jsonb_agg(
        jsonb_build_object(
          'dayOfWeek', msp.day_of_week,
          'dayName', msp.day_name,
          'openTime', '00:00',
          'closeTime', '23:59',
          'isEnabled', true
        ) ORDER BY msp.day_of_week
      )
      FROM market_schedule_policies msp
    );
  ELSE
    v_schedule := (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'dayOfWeek', msp.day_of_week,
          'dayName', msp.day_name,
          'openTime', msp.open_time,
          'closeTime', msp.close_time,
          'isEnabled', msp.is_enabled
        ) ORDER BY msp.day_of_week
      ), '[]'::jsonb)
      FROM market_schedule_policies msp
      WHERE msp.is_enabled = true
    );
  END IF;

  RETURN jsonb_build_object(
    'schedule', COALESCE(v_schedule, '[]'::jsonb),
    'productsNeverExpire', COALESCE(v_settings.products_never_expire, false),
    'marketNeverCloses', COALESCE(v_settings.market_never_closes, false),
    'enableCart', COALESCE(v_settings.enable_cart, false)
  );
END;
$$;
