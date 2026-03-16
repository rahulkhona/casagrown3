-- ============================================================================
-- Migration: Auto-cleanup old notifications
-- Deletes notifications older than 7 days via pg_cron daily job.
-- ============================================================================

-- Schedule daily cleanup at 3 AM UTC
SELECT cron.schedule(
  'cleanup-old-notifications',
  '0 3 * * *',
  $$DELETE FROM notifications WHERE created_at < NOW() - INTERVAL '7 days'$$
);
