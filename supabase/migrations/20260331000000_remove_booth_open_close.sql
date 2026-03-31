-- Migration: Remove booth open/close mechanics
-- With window-based fulfillment, booths are always available.
-- Products manage their own availability through fulfillment windows.

-- 1. Set all booths to is_open = true (booths are always "open" now)
UPDATE market_booths SET is_open = true WHERE is_open = false;

-- 2. Replace close_market_booths() with a no-op that only sweeps expired products
-- (the product expiry sweep is still useful, but the booth close + notifications are not)
CREATE OR REPLACE FUNCTION public.close_market_booths()
RETURNS void AS $$
BEGIN
  -- With window-based fulfillment, booths are always open.
  -- Only sweep expired products based on expires_at.
  UPDATE public.market_products 
  SET is_active = false 
  WHERE is_active = true 
    AND (market_date::date < current_date OR (expires_at IS NOT NULL AND expires_at < now()));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Replace send_market_lifecycle_ping to remove booth-open/close references
-- Keep it as a no-op since the old ping types ('prep', 'launch') referenced booth is_open state
CREATE OR REPLACE FUNCTION public.send_market_lifecycle_ping(ping_type text)
RETURNS void AS $$
BEGIN
  -- With window-based fulfillment, sellers no longer need "open your booth" reminders.
  -- Products are available during their configured windows automatically.
  NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Drop the booth open notify trigger (fired when is_open changed from false→true)
DROP TRIGGER IF EXISTS trg_booth_open_notify ON market_booths;
DROP FUNCTION IF EXISTS notify_booth_opened();
