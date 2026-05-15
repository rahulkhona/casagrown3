-- Cleanup cron: purge old GrowBot poll images from storage and old poll records
-- Runs daily at 04:00 UTC (off-peak)
-- Retention: 180 days for both images and poll records

BEGIN;
  -- Unschedule if already exists
  SELECT cron.unschedule('growbot-media-cleanup')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'growbot-media-cleanup');
COMMIT;

SELECT cron.schedule(
  'growbot-media-cleanup',
  '0 4 * * *',
  $$
    -- Delete poll records older than 180 days (cascades to votes and suggestions)
    DELETE FROM public.growbot_shared_responses
    WHERE created_at < now() - interval '180 days';

    -- Delete storage objects in chat-media/growbot/ older than 180 days
    DELETE FROM storage.objects
    WHERE bucket_id = 'chat-media'
      AND name LIKE 'growbot/%'
      AND created_at < now() - interval '180 days';
  $$
);
