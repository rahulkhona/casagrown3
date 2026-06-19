-- Share nudge cron job: nudges sellers every 30 minutes when their approved
-- listings have zero orders and zero link clicks after 2-4 hours.
-- Sends in-app notification, push notification, and email to encourage sharing.

SELECT cron.unschedule('share-nudge') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'share-nudge'
);

SELECT cron.schedule(
  'share-nudge',
  '*/30 * * * *',  -- Every 30 minutes
  $$
  SELECT net.http_post(
    url := get_edge_fn_base_url() || '/market-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || get_service_role_key()
    ),
    body := '{"action":"share_nudge"}'::jsonb
  );
  $$
);
