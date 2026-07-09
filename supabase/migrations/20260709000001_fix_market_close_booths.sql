-- Migration: Fix close_market_booths() to remove stale market_date check
-- 
-- Problem: The market transitioned from a one-day-per-week farmers market model
-- to an always-open marketplace with window-based fulfillment. The
-- close_market_booths() function was never updated and still deactivates
-- products where market_date < current_date, which fires the day after any
-- product is created (since market_date defaults to today).
--
-- Fix: Remove the market_date check. Only deactivate products whose expires_at
-- has genuinely passed. expires_at is set by allocate_from_catalog() to the
-- end of the seller's last fulfillment window day — so this correctly handles
-- listings whose all windows have expired.
--
-- The 7 market_close_dow_* cron jobs stay active — after this fix they only
-- sweep products that have genuinely expired via expires_at.

CREATE OR REPLACE FUNCTION public.close_market_booths()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Market is always open with window-based fulfillment.
  -- Only deactivate products whose expires_at has passed.
  -- (expires_at is set by allocate_from_catalog() to the end of the last window day.)
  -- DO NOT use market_date — that field is legacy and no longer controls availability.
  UPDATE public.market_products
  SET is_active = false
  WHERE is_active = true
    AND expires_at IS NOT NULL
    AND expires_at < now();
END;
$$;

COMMENT ON FUNCTION public.close_market_booths() IS
  'Sweeps expired product listings. Only deactivates products whose expires_at has passed. '
  'market_date is intentionally NOT used — the market is always open with window-based fulfillment. '
  'Called nightly by market_close_dow_0 through market_close_dow_6 pg_cron jobs.';
