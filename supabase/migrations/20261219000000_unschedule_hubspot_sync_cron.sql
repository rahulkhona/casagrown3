-- Migration: Unschedule HubSpot Sync Cron
-- Description: Permanently unschedules the sync-hubspot-leads pg_cron job as HubSpot lead capture is deprecated.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('sync-hubspot-leads');
      RAISE NOTICE 'Successfully unscheduled sync-hubspot-leads cron job';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'sync-hubspot-leads was not scheduled or already unscheduled';
    END;
  END IF;
END $$;
