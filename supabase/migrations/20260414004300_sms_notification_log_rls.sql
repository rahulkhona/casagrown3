-- ============================================================================
-- Migration: Secure SMS Notification Logs
-- Enables RLS on the sms_notification_log table without providing any 
-- client-side policies. This restricts all access to system-only.
-- ============================================================================

-- Enable RLS on the table
ALTER TABLE public.sms_notification_log ENABLE ROW LEVEL SECURITY;

-- Note: No SELECT, INSERT, UPDATE, or DELETE policies are created. 
-- By enabling RLS and providing no policies, this completely blocks 
-- ALL access from the client-side API (both anon and authenticated users).
-- 
-- Backend Edge Functions and Postgres Triggers running with the 
-- service_role key or SECURITY DEFINER bypass RLS automatically. 
-- They can still read the table for rate-limiting purposes and write 
-- new logs, completely securing the table from public exposure.
