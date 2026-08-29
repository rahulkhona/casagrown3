-- Migration: Add is_default column and seed Default Market Schedule
-- Supports hierarchical schedule resolution: Specific City Override -> Global Default Schedule

ALTER TABLE public.market_city_schedules 
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.market_city_schedules.is_default IS 'Whether this row serves as the global platform-wide default market schedule for cities without an explicit override';

-- Seed platform default market schedule
INSERT INTO public.market_city_schedules (
  id,
  city,
  state,
  zipcodes,
  is_active,
  is_default,
  market_days,
  default_pickup_windows,
  default_delivery_windows,
  cutoff_hours_before_market
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'All Cities (Default)',
  'ALL',
  '{}',
  true,
  true,
  ARRAY['saturday'],
  '[{"day": "saturday", "start_time": "09:00", "end_time": "11:00"}]'::jsonb,
  '[{"day": "saturday", "start_time": "13:00", "end_time": "16:00"}]'::jsonb,
  12
) ON CONFLICT (id) DO UPDATE SET
  is_default = true,
  updated_at = now();
