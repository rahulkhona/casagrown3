-- ============================================================================
-- Fix Market Never Closes Schedule Overload
-- Prevents get_market_config() from destructively overriding the schedule 
-- so CRM notifications can still access genuine operational hours.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_market_config()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_schedule JSONB;
  v_settings RECORD;
BEGIN
  -- Load settings
  SELECT ms.products_never_expire, ms.market_never_closes
  INTO v_settings
  FROM market_settings ms
  WHERE ms.id = true;

  -- Load genuine schedule array (front-end uses marketNeverCloses to logically bypass constraints independently)
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

  RETURN jsonb_build_object(
    'schedule', COALESCE(v_schedule, '[]'::jsonb),
    'productsNeverExpire', COALESCE(v_settings.products_never_expire, false),
    'marketNeverCloses', COALESCE(v_settings.market_never_closes, false)
  );
END;
$$;
