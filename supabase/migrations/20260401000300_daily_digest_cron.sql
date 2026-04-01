-- ============================================================================
-- Migration: Schedule daily grower/buyer digest at 10:00 AM PT (17:00 UTC)
--
-- Sends the unified daily opportunity digest via market-cron { action: "grower_digest" }
-- This email includes:
--   - Selling opportunities (neighbors searching for produce you can list)
--   - Buying opportunities (products matching your interests/searches now available)
-- Only sends if there are actionable items for the user.
-- ============================================================================

DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN

    -- Unschedule old name if it exists
    BEGIN
      PERFORM cron.unschedule('daily-grower-digest');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- Schedule at 17:00 UTC = 10:00 AM PT / 1:00 PM ET
    PERFORM cron.schedule(
      'daily-grower-digest',
      '0 17 * * *',
      format(
        'SELECT net.http_post(url := %L, headers := %L::jsonb, body := %L::jsonb)',
        COALESCE(
          current_setting('app.settings.edge_functions_base_url', true),
          'http://host.docker.internal:54321/functions/v1'
        ) || '/market-cron',
        json_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || COALESCE(
            current_setting('app.settings.service_role_key', true),
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
          )
        )::text,
        '{"action": "grower_digest"}'::text
      )
    );

    RAISE NOTICE 'Scheduled daily-grower-digest cron at 17:00 UTC (10am PT) daily';

  ELSE
    RAISE NOTICE 'pg_cron not available, skipping grower digest cron job';
  END IF;
END $outer$;
