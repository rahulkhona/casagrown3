-- Migration: Google Address Validation and Stock Comment Debouncing
-- Date: July 26, 2026

SET search_path TO public, extensions;

-- 1. Create the address_resolution_cache table
CREATE TABLE IF NOT EXISTS public.address_resolution_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    address_hash TEXT UNIQUE NOT NULL,
    input_address JSONB NOT NULL,
    resolved_address JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookup by hash
CREATE INDEX IF NOT EXISTS idx_address_resolution_hash ON public.address_resolution_cache (address_hash);

-- Enable RLS and create policy for public read/write
ALTER TABLE public.address_resolution_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read/write to address_resolution_cache" ON public.address_resolution_cache
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- 2. Add last_stock_comment_sync_at tracking column to market_products
ALTER TABLE public.market_products 
ADD COLUMN IF NOT EXISTS last_stock_comment_sync_at TIMESTAMPTZ;

-- 3. Schedule the daily compliance cleanup pg_cron job
DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN 
      PERFORM cron.unschedule('cleanup-old-address-resolutions'); 
    EXCEPTION WHEN OTHERS THEN 
    END;
    
    PERFORM cron.schedule(
      'cleanup-old-address-resolutions',
      '0 4 * * *',
      $$DELETE FROM public.address_resolution_cache WHERE created_at < NOW() - INTERVAL '30 days'$$
    );

    RAISE NOTICE 'Scheduled Google Maps compliance address cache cleanup pg_cron job';
  END IF;
END $outer$;

