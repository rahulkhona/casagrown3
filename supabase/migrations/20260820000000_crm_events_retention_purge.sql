-- ─── CRM Events & Visits Retention Purge Migration ─────────────────────────────
-- Retains:
--   - crm_page_events: 14 days (micro field/click events)
--   - client_errors: 14 days (frontend crashes & JS exceptions)
--   - crm_page_visits: 60 days (unconverted page visit sessions)
--   - crm_leads & profiles: Permanent

CREATE OR REPLACE FUNCTION purge_expired_crm_events()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_events_count INT := 0;
  deleted_errors_count INT := 0;
  deleted_visits_count INT := 0;
BEGIN
  -- 1. Purge raw micro-interaction events older than 14 days
  DELETE FROM public.crm_page_events
  WHERE occurred_at < NOW() - INTERVAL '14 days';
  GET DIAGNOSTICS deleted_events_count = ROW_COUNT;

  -- 2. Purge client UI error logs older than 14 days
  DELETE FROM public.client_errors
  WHERE created_at < NOW() - INTERVAL '14 days';
  GET DIAGNOSTICS deleted_errors_count = ROW_COUNT;

  -- 3. Purge unconverted visit sessions older than 60 days
  DELETE FROM public.crm_page_visits
  WHERE visited_at < NOW() - INTERVAL '60 days'
    AND converted = false;
  GET DIAGNOSTICS deleted_visits_count = ROW_COUNT;

  RAISE NOTICE 'CRM Retention Purge Complete: % page_events, % client_errors, % page_visits deleted.',
    deleted_events_count, deleted_errors_count, deleted_visits_count;
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION purge_expired_crm_events() TO service_role;

-- Schedule nightly cleanup at 3:00 AM UTC via pg_cron (if extension exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'purge-crm-events-nightly',
      '0 3 * * *',
      'SELECT purge_expired_crm_events();'
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron not active on this environment; function available for manual/web-hook invocation.';
END $$;
