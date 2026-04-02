-- Reconciliation cron job: catches stale pending redemptions every 5 minutes
-- This is the safety net for cases where:
--   1. The edge function crashes after the provider API call
--   2. A webhook fails to deliver

SELECT cron.unschedule('reconcile-redemptions') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'reconcile-redemptions'
);

SELECT cron.schedule(
  'reconcile-redemptions',
  '*/5 * * * *',  -- Every 5 minutes
  $$
  SELECT net.http_post(
    url := coalesce(current_setting('app.settings.supabase_url', true), 'http://host.docker.internal:54321')
           || '/functions/v1/market-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(
        current_setting('app.settings.service_role_key', true),
        current_setting('supabase.service_role_key', true)
      )
    ),
    body := '{"action":"reconcile_redemptions"}'::jsonb
  );
  $$
);
