-- ============================================================================
-- Migration: Auto-cleanup old SMS logs
-- Deletes SMS notification logs older than 30 days via pg_cron daily job 
-- to prevent long-term database bloat while retaining a sufficient 
-- audit and rate-limiting window.
-- ============================================================================

-- Schedule daily cleanup of SMS logs at 4 AM UTC
SELECT cron.schedule(
  'cleanup-old-sms-logs',
  '0 4 * * *',
  $$DELETE FROM public.sms_notification_log WHERE created_at < NOW() - INTERVAL '30 days'$$
);
