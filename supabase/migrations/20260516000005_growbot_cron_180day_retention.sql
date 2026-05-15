-- Update retention period to 180 days (was 30/90 days in previous migration)
BEGIN;
  SELECT cron.unschedule('growbot-media-cleanup')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'growbot-media-cleanup');
COMMIT;

SELECT cron.schedule(
  'growbot-media-cleanup',
  '0 4 * * *',
  $$
    DELETE FROM public.growbot_shared_responses
    WHERE created_at < now() - interval '180 days';

    DELETE FROM storage.objects
    WHERE bucket_id = 'chat-media'
      AND name LIKE 'growbot/%'
      AND created_at < now() - interval '180 days';
  $$
);
