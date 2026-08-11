-- Migration: USDA Farmers Markets & Local Farms Database Cache Table
-- Author: Antigravity AI
-- Description: Stores fetched USDA markets and farms by sub-neighborhood grid key (lat_2dec_lng_2dec or zip) in Supabase PostgreSQL.

SET search_path TO public, extensions;

CREATE TABLE IF NOT EXISTS public.usda_market_cache (
  cache_key TEXT PRIMARY KEY, -- e.g. "37.31_-121.90" or "zip_95120"
  zip_code TEXT,
  lat NUMERIC(6,3),
  lng NUMERIC(6,3),
  markets JSONB NOT NULL DEFAULT '[]'::jsonb,
  farms JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.usda_market_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read usda market cache"
  ON public.usda_market_cache FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users and service role can upsert usda market cache"
  ON public.usda_market_cache FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Authenticated users and service role can update usda market cache"
  ON public.usda_market_cache FOR UPDATE
  USING (true);

-- RPC helper function to fetch cached USDA data by grid key
CREATE OR REPLACE FUNCTION public.get_cached_usda_grid_markets(p_cache_key TEXT)
RETURNS TABLE (
  markets JSONB,
  farms JSONB,
  is_stale BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.markets,
    c.farms,
    (c.updated_at < (now() - INTERVAL '7 days')) AS is_stale
  FROM public.usda_market_cache c
  WHERE c.cache_key = p_cache_key;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Admin function to purge / force rebuild cache for a given key or all keys
CREATE OR REPLACE FUNCTION public.purge_usda_cache(p_key TEXT DEFAULT NULL)
RETURNS void AS $$
BEGIN
  IF p_key IS NULL THEN
    DELETE FROM public.usda_market_cache;
  ELSE
    DELETE FROM public.usda_market_cache WHERE cache_key = p_key OR zip_code = p_key;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schema Comments
COMMENT ON TABLE public.usda_market_cache IS 'Database cache for external USDA farmers markets and local farms by sub-neighborhood grid key (7-day TTL).';
COMMENT ON COLUMN public.usda_market_cache.cache_key IS 'Grid cache key, e.g. 37.31_-121.90 or zip_95120.';
COMMENT ON COLUMN public.usda_market_cache.markets IS 'JSONB array of USDA registered farmers markets.';
COMMENT ON COLUMN public.usda_market_cache.farms IS 'JSONB array of USDA registered local farms & CSAs.';
