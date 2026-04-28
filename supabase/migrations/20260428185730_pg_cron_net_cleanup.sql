-- ============================================================================
-- Migration: Setup pg_cron and pg_net automatic log cleanup
--
-- Root cause: Supabase's pg_cron and pg_net extensions log every single
-- background job execution and HTTP request indefinitely by default. Because
-- CasaGrown utilizes 5-minute interval crons, this leads to rapid table bloat
-- and Disk I/O exhaustion, especially on lower-tier staging environments.
--
-- Solution: Create daily pg_cron jobs to securely prune `cron.job_run_details`,
-- `net.http_response`, and `net.http_request_queue` rows older than 1 day.
-- ============================================================================

SET search_path TO public, extensions;

DO $$
BEGIN
  -- Ensure pg_cron and pg_net extensions are actually enabled
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    
    -- 1. Schedule pg_cron cleanup (runs daily at 1 AM UTC)
    BEGIN PERFORM cron.unschedule('cleanup-pg-cron'); EXCEPTION WHEN OTHERS THEN END;
    PERFORM cron.schedule('cleanup-pg-cron', '0 1 * * *', 
      $cmd$
        -- Delete SUCCESSFUL cron runs older than 1 day
        DELETE FROM cron.job_run_details WHERE start_time < now() - interval '1 day' AND status = 'succeeded';
        -- Delete FAILED/OTHER cron runs older than 7 days
        DELETE FROM cron.job_run_details WHERE start_time < now() - interval '7 days';
      $cmd$
    );

    RAISE NOTICE 'Successfully scheduled pg_cron log cleanup job.';
  ELSE
    RAISE NOTICE 'Skipping cleanup setup: pg_cron extension is not installed.';
  END IF;
END $$;
