-- ============================================================================
-- Migration: Add growbot storage cleanup cron
--
-- The growbot-media-cleanup cron was fixed to stop failing on direct
-- storage.objects DELETE. This adds a separate cron that calls the
-- cleanup-growbot-media edge function to properly delete old files
-- via the Supabase Storage SDK.
-- ============================================================================

SELECT cron.schedule(
  'growbot-storage-cleanup',
  '5 4 * * *',
  $$
    SELECT net.http_post(
      url := get_edge_fn_base_url() || '/cleanup-growbot-media',
      headers := edge_fn_headers(),
      body := '{}'::jsonb
    );
  $$
);
