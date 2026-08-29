-- Migration: City-by-City Market Days & Default Fulfillment Windows
-- Creates market_city_schedules table for managing localized market days, pickup, and delivery windows.

CREATE TABLE IF NOT EXISTS public.market_city_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'CA',
  zipcodes TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  market_days TEXT[] NOT NULL DEFAULT '{"saturday"}',
  default_pickup_windows JSONB NOT NULL DEFAULT '[{"day": "saturday", "start_time": "09:00", "end_time": "11:00"}]'::jsonb,
  default_delivery_windows JSONB NOT NULL DEFAULT '[{"day": "saturday", "start_time": "13:00", "end_time": "16:00"}]'::jsonb,
  cutoff_hours_before_market INT NOT NULL DEFAULT 12,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Documentation comments for Schema context & AI Query Builder
COMMENT ON TABLE public.market_city_schedules IS 'City-by-city market days and default fulfillment pickup and delivery windows';
COMMENT ON COLUMN public.market_city_schedules.city IS 'Canonical city name (e.g. San Jose)';
COMMENT ON COLUMN public.market_city_schedules.state IS '2-letter state code (e.g. CA)';
COMMENT ON COLUMN public.market_city_schedules.zipcodes IS 'Array of 5-digit ZIP codes within this city';
COMMENT ON COLUMN public.market_city_schedules.is_active IS 'Whether market days are active for this city';
COMMENT ON COLUMN public.market_city_schedules.market_days IS 'Array of active market day names, e.g. ["saturday", "sunday"]';
COMMENT ON COLUMN public.market_city_schedules.default_pickup_windows IS 'JSONB array of default pickup time windows: [{day: "saturday", start_time: "09:00", end_time: "11:00"}]. Query example: default_pickup_windows->0->>''start_time''';
COMMENT ON COLUMN public.market_city_schedules.default_delivery_windows IS 'JSONB array of default delivery time windows: [{day: "saturday", start_time: "13:00", end_time: "16:00"}]. Query example: default_delivery_windows->0->>''start_time''';
COMMENT ON COLUMN public.market_city_schedules.cutoff_hours_before_market IS 'Hours before market day when orders close for that fulfillment batch';

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_market_city_schedules_city_state 
  ON public.market_city_schedules (LOWER(TRIM(city)), UPPER(TRIM(state)));

CREATE INDEX IF NOT EXISTS idx_market_city_schedules_zipcodes 
  ON public.market_city_schedules USING GIN (zipcodes);

-- Enable RLS
ALTER TABLE public.market_city_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read city schedules" 
  ON public.market_city_schedules 
  FOR SELECT 
  USING (true);

CREATE POLICY "Admin & Service Role manage city schedules" 
  ON public.market_city_schedules 
  FOR ALL 
  USING (true) 
  WITH CHECK (true);

-- Seed initial launch cities
INSERT INTO public.market_city_schedules (
  city,
  state,
  zipcodes,
  is_active,
  market_days,
  default_pickup_windows,
  default_delivery_windows,
  cutoff_hours_before_market
) VALUES 
(
  'San Jose',
  'CA',
  ARRAY[
    '95101', '95103', '95106', '95108', '95109', '95110', '95111', '95112', '95113', '95115',
    '95116', '95117', '95118', '95119', '95120', '95121', '95122', '95123', '95124', '95125',
    '95126', '95127', '95128', '95129', '95130', '95131', '95132', '95133', '95134', '95135',
    '95136', '95138', '95139', '95140', '95141', '95148', '95150', '95151', '95152', '95153',
    '95154', '95155', '95156', '95157', '95158', '95159', '95160', '95161', '95164', '95170',
    '95172', '95173', '95190', '95191', '95192', '95193', '95194', '95196'
  ],
  true,
  ARRAY['saturday'],
  '[{"day": "saturday", "start_time": "09:00", "end_time": "11:00"}]'::jsonb,
  '[{"day": "saturday", "start_time": "13:00", "end_time": "16:00"}]'::jsonb,
  12
),
(
  'Los Gatos',
  'CA',
  ARRAY['95030', '95031', '95032', '95033'],
  true,
  ARRAY['sunday'],
  '[{"day": "sunday", "start_time": "10:00", "end_time": "12:00"}]'::jsonb,
  '[{"day": "sunday", "start_time": "13:00", "end_time": "15:00"}]'::jsonb,
  12
),
(
  'Campbell',
  'CA',
  ARRAY['95008', '95009', '95011'],
  true,
  ARRAY['sunday'],
  '[{"day": "sunday", "start_time": "09:00", "end_time": "11:00"}]'::jsonb,
  '[{"day": "sunday", "start_time": "13:00", "end_time": "15:00"}]'::jsonb,
  12
),
(
  'Santa Clara',
  'CA',
  ARRAY['95050', '95051', '95052', '95053', '95054', '95055', '95056'],
  true,
  ARRAY['saturday'],
  '[{"day": "saturday", "start_time": "09:00", "end_time": "11:00"}]'::jsonb,
  '[{"day": "saturday", "start_time": "13:00", "end_time": "16:00"}]'::jsonb,
  12
),
(
  'Sunnyvale',
  'CA',
  ARRAY['95085', '95086', '95087', '95088', '95089'],
  true,
  ARRAY['saturday'],
  '[{"day": "saturday", "start_time": "09:00", "end_time": "11:00"}]'::jsonb,
  '[{"day": "saturday", "start_time": "13:00", "end_time": "16:00"}]'::jsonb,
  12
)
ON CONFLICT (LOWER(TRIM(city)), UPPER(TRIM(state))) DO UPDATE SET
  zipcodes = EXCLUDED.zipcodes,
  is_active = EXCLUDED.is_active,
  market_days = EXCLUDED.market_days,
  default_pickup_windows = EXCLUDED.default_pickup_windows,
  default_delivery_windows = EXCLUDED.default_delivery_windows,
  updated_at = now();
