-- Migration: ofn_product_cache
-- Purpose: Store OFN enterprises and catalog items locally to ensure < 100ms marketplace fallback search.

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.ofn_enterprises (
    id text PRIMARY KEY,
    name text NOT NULL,
    description text,
    contact_email text,
    contact_phone text,
    website text,
    address_text text,
    city text,
    state text,
    zipcode text,
    lat double precision,
    lng double precision,
    location_geom extensions.geography(Point, 4326),
    last_synced_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.ofn_product_cache (
    id text PRIMARY KEY,
    enterprise_id text NOT NULL REFERENCES public.ofn_enterprises(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    category text,
    price_usd numeric(10,2),
    unit text,
    image_url text,
    stock_available numeric DEFAULT 0,
    last_synced_at timestamptz DEFAULT now() NOT NULL
);

-- Indices for rapid lookup
CREATE INDEX IF NOT EXISTS idx_ofn_enterprises_geom ON public.ofn_enterprises USING GIST(location_geom);
CREATE INDEX IF NOT EXISTS idx_ofn_enterprises_zipcode ON public.ofn_enterprises(zipcode);
CREATE INDEX IF NOT EXISTS idx_ofn_product_cache_enterprise ON public.ofn_product_cache(enterprise_id);
CREATE INDEX IF NOT EXISTS idx_ofn_product_cache_category ON public.ofn_product_cache(category);

-- Full text search index on products
ALTER TABLE public.ofn_product_cache ADD COLUMN text_search tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(category, '')), 'C')
) STORED;

CREATE INDEX IF NOT EXISTS idx_ofn_product_cache_text_search ON public.ofn_product_cache USING GIN(text_search);

-- RLS
ALTER TABLE public.ofn_enterprises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ofn_product_cache ENABLE ROW LEVEL SECURITY;

-- Allow public read access to these cache tables (as they are publicly available on OFN)
CREATE POLICY "Allow public read access to OFN enterprises"
    ON public.ofn_enterprises FOR SELECT TO public USING (true);

CREATE POLICY "Allow public read access to OFN product cache"
    ON public.ofn_product_cache FOR SELECT TO public USING (true);

-- Grant permissions for service role / edge functions to manage the cache
GRANT ALL ON public.ofn_enterprises TO service_role;
GRANT ALL ON public.ofn_product_cache TO service_role;
GRANT SELECT ON public.ofn_enterprises TO anon, authenticated;
GRANT SELECT ON public.ofn_product_cache TO anon, authenticated;
