-- Add booth_address, booth_location, and delivery_zipcodes to market_booths
-- booth_address: the seller's base address used to compute delivery radius
-- booth_location: geocoded point for spatial queries (delivery radius)
-- delivery_zipcodes: explicit list of zip codes eligible for delivery regardless of distance

ALTER TABLE public.market_booths
  ADD COLUMN IF NOT EXISTS booth_address TEXT,
  ADD COLUMN IF NOT EXISTS booth_location geometry(Point, 4326),
  ADD COLUMN IF NOT EXISTS delivery_zipcodes TEXT[] DEFAULT '{}';

-- Comment the new columns
COMMENT ON COLUMN public.market_booths.booth_address IS 'Seller base address — delivery radius is computed from this location';
COMMENT ON COLUMN public.market_booths.booth_location IS 'Geocoded point of booth_address for spatial delivery radius queries';
COMMENT ON COLUMN public.market_booths.delivery_zipcodes IS 'Explicit list of zip codes always eligible for delivery, regardless of distance';

-- Index for spatial queries on booth_location
CREATE INDEX IF NOT EXISTS idx_market_booths_booth_loc
  ON public.market_booths USING gist (booth_location);

-- Backfill: copy existing pickup_address/pickup_location as booth_address/booth_location
-- for sellers who already have a pickup address set
UPDATE public.market_booths
SET booth_address = pickup_address,
    booth_location = pickup_location
WHERE pickup_address IS NOT NULL
  AND booth_address IS NULL;

-- Notify PostgREST to pick up the new columns
NOTIFY pgrst, 'reload schema';
