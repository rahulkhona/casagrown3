-- ============================================================================
-- Migration: Wire execute-settlement-captures + daily_digest to cron
--
-- 1. After daily settlement at 23:59, call execute-settlement-captures
--    at 00:05 to capture Stripe payments.
-- 2. After settlements clear during the day, send daily digest emails
--    at 08:00 the next morning via market-cron { action: "daily_digest" }.
-- ============================================================================

DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN

    -- ─── 1. execute-settlement-captures at 00:05 ───
    -- Settlement runs at 23:59. At 00:05 the next day, find the most recent
    -- settlement and trigger Stripe captures for it.
    BEGIN
      PERFORM cron.unschedule('execute-settlement-captures');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    PERFORM cron.schedule(
      'execute-settlement-captures',
      '5 0 * * *',
      format(
        $sql$
        SELECT net.http_post(
          url := %L,
          headers := %L::jsonb,
          body := (
            SELECT jsonb_build_object('settlement_id', id)
            FROM market_settlements
            WHERE status = 'funds_pending'
            ORDER BY created_at DESC
            LIMIT 1
          )
        )
        $sql$,
        COALESCE(
          current_setting('app.settings.edge_functions_base_url', true),
          'http://host.docker.internal:54321/functions/v1'
        ) || '/execute-settlement-captures',
        json_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || COALESCE(
            current_setting('app.settings.service_role_key', true),
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
          )
        )::text
      )
    );

    RAISE NOTICE 'Scheduled execute-settlement-captures cron at 00:05 daily';

    -- ─── 2. Daily digest emails at 08:00 ───
    -- Sends settlement receipt emails to all buyers/sellers whose
    -- settlements cleared the previous day.
    BEGIN
      PERFORM cron.unschedule('daily-settlement-digest');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    PERFORM cron.schedule(
      'daily-settlement-digest',
      '0 8 * * *',
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
        '{"action": "daily_digest"}'::text
      )
    );

    RAISE NOTICE 'Scheduled daily-settlement-digest cron at 08:00 daily';

  ELSE
    RAISE NOTICE 'pg_cron not available, skipping settlement capture and digest cron jobs';
  END IF;
END $outer$;
