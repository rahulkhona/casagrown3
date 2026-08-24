-- Migration: Market Price Benchmarks Table
-- Description: Caches 10%-discounted pricing fetched from USDA AMS and other sources.

CREATE TABLE IF NOT EXISTS public.market_price_benchmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produce_name TEXT NOT NULL,
  zip_code TEXT NOT NULL,
  avg_retail_price NUMERIC(10,2) NOT NULL,
  suggested_price NUMERIC(10,2) NOT NULL,
  unit TEXT NOT NULL DEFAULT 'lb',
  source TEXT NOT NULL DEFAULT 'usda_ams',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(produce_name, zip_code)
);

COMMENT ON TABLE public.market_price_benchmarks IS 'Caches 10%-discounted neighborhood pricing for crops by ZIP code, updated via cron.';

GRANT SELECT ON public.market_price_benchmarks TO anon, authenticated;
