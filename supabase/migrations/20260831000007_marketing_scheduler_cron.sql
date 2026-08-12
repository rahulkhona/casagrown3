-- Migration: Schedule marketing-scheduler via pg_cron every 15 minutes

DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN

    BEGIN
      PERFORM cron.unschedule('marketing_scheduler_cron');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    PERFORM cron.schedule(
      'marketing_scheduler_cron',
      '*/15 * * * *',
      format(
        'SELECT net.http_post(url := %L, headers := %L::jsonb, body := %L::jsonb)',
        COALESCE(
          current_setting('app.settings.edge_functions_base_url', true),
          'http://host.docker.internal:54321/functions/v1'
        ) || '/marketing-scheduler',
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

    RAISE NOTICE 'Scheduled marketing_scheduler_cron to run every 15 minutes';
  ELSE
    RAISE NOTICE 'pg_cron not available, skipping marketing_scheduler_cron job';
  END IF;
END $outer$;
