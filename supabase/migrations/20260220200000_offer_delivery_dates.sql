-- ============================================================================
-- Add delivery_dates array + community columns to offers table
-- Mirrors the sell-form's drop-off dates and community selection patterns
-- ============================================================================

-- Multiple delivery dates (like want_to_sell_details.dropoff_dates)
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS delivery_dates date[] DEFAULT '{}';

-- Community context for the offer
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS community_h3_index text;

ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS additional_community_h3_indices text[] DEFAULT '{}';

-- Back-fill delivery_dates from legacy single delivery_date
UPDATE public.offers
SET delivery_dates = ARRAY[delivery_date]
WHERE delivery_date IS NOT NULL
  AND (delivery_dates IS NULL OR delivery_dates = '{}');
