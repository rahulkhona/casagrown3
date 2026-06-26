-- ============================================================================
-- Migration: Schedule hourly sequence health check
--
-- Calls the check-sequence-health Edge Function every hour to verify
-- active sequences are sending at least 50% of expected messages.
-- Alerts admin@casagrown.com if any sequence falls below threshold.
-- ============================================================================

DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN

    -- Unschedule old job if it exists (for idempotency)
    BEGIN
      PERFORM cron.unschedule('check-sequence-health-cron');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- Schedule to run every hour at minute 0
    PERFORM cron.schedule(
      'check-sequence-health-cron',
      '0 * * * *',
      format(
        'SELECT net.http_post(url := %L, headers := %L::jsonb, body := %L::jsonb)',
        COALESCE(
          current_setting('app.settings.edge_functions_base_url', true),
          'http://host.docker.internal:54321/functions/v1'
        ) || '/check-sequence-health',
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

    RAISE NOTICE 'Scheduled check-sequence-health-cron to run every hour';

  ELSE
    RAISE NOTICE 'pg_cron not available, skipping sequence health check cron job';
  END IF;
END $outer$;
