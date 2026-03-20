-- Market Settlement Cron Job
-- Runs daily at 23:59 (1 minute before midnight) to settle the day's completed orders.
-- Uses run_market_settlement() which defaults to current date when called with no argument.

DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove any existing settlement cron job
    BEGIN
      PERFORM cron.unschedule('daily-market-settlement');
    EXCEPTION WHEN OTHERS THEN
      -- Job doesn't exist yet, ignore
    END;

    -- Schedule: 23:59 every day
    PERFORM cron.schedule(
      'daily-market-settlement',
      '59 23 * * *',
      $$SELECT run_market_settlement()$$
    );

    RAISE NOTICE 'Scheduled daily-market-settlement cron job at 23:59';
  ELSE
    RAISE NOTICE 'pg_cron not available, skipping market settlement cron job';
  END IF;
END $outer$;
