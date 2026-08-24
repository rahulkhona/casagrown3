-- Migration: Daily Price Benchmarks Cron & Resolution RPC
-- Description: Provides stored procedure to fetch suggested produce price and configures 4:00 AM cron to sync Kroger & USDA benchmarks.

CREATE OR REPLACE FUNCTION public.get_suggested_produce_price(
  p_produce_name TEXT,
  p_zip_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result RECORD;
BEGIN
  SELECT 
    produce_name,
    zip_code,
    avg_retail_price,
    suggested_price,
    unit,
    source,
    updated_at
  INTO v_result
  FROM public.market_price_benchmarks
  WHERE lower(produce_name) = lower(trim(p_produce_name))
    AND zip_code = trim(p_zip_code)
    AND updated_at > now() - interval '7 days'
  LIMIT 1;

  IF v_result IS NOT NULL THEN
    RETURN jsonb_build_object(
      'found', true,
      'produce_name', v_result.produce_name,
      'zip_code', v_result.zip_code,
      'avg_retail_price', v_result.avg_retail_price,
      'suggested_price', v_result.suggested_price,
      'unit', v_result.unit,
      'source', v_result.source,
      'updated_at', v_result.updated_at
    );
  END IF;

  RETURN jsonb_build_object('found', false);
END;
$$;

COMMENT ON FUNCTION public.get_suggested_produce_price IS 'Returns suggested produce pricing derived from 20% discounted Kroger retail or 1.5x USDA wholesale benchmarks.';

GRANT EXECUTE ON FUNCTION public.get_suggested_produce_price(TEXT, TEXT) TO anon, authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('daily_price_benchmarks_cron');
    PERFORM cron.schedule(
      'daily_price_benchmarks_cron',
      '0 11 * * *',
      $cron$SELECT net.http_post(
          url := 'http://localhost:54321/functions/v1/sync-produce-benchmarks',
          headers := '{"Content-Type": "application/json"}'::jsonb,
          body := '{"mode": "batch"}'::jsonb
        );$cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available or unschedule skipped';
END $$;
