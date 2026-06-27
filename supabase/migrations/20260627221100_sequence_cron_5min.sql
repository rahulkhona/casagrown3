-- ============================================================================
-- Migration: Increase sequence cron frequency from 15min to 5min
--
-- With batch-prefetched metadata and multi-pass processing, the cron can
-- now handle thousands of enrollments per invocation.  Running every 5 min
-- ensures enrollees are processed promptly within their send windows.
-- ============================================================================

DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN

    -- Unschedule old 15-minute job
    BEGIN
      PERFORM cron.unschedule('process-sequence-step-cron');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- Schedule to run every 5 minutes
    PERFORM cron.schedule(
      'process-sequence-step-cron',
      '*/5 * * * *',
      format(
        'SELECT net.http_post(url := %L, headers := %L::jsonb, body := %L::jsonb)',
        COALESCE(
          current_setting('app.settings.edge_functions_base_url', true),
          'http://host.docker.internal:54321/functions/v1'
        ) || '/process-sequence-step',
        json_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || COALESCE(
            current_setting('app.settings.service_role_key', true),
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
          )
        )::text,
        '{}'::text
      )
    );

    RAISE NOTICE 'Scheduled process-sequence-step-cron to run every 5 minutes';

  ELSE
    RAISE NOTICE 'pg_cron not available, skipping process-sequence-step cron job';
  END IF;
END $outer$;
