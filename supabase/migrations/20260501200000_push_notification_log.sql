-- ============================================================================
-- Migration: Create push_notification_log table and auto-cleanup
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.push_notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  url TEXT,
  tag TEXT,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.push_notification_log ENABLE ROW LEVEL SECURITY;

-- Allow service role to insert logs
CREATE POLICY "Service role can insert push logs" 
  ON public.push_notification_log FOR INSERT TO service_role
  WITH CHECK (true);

-- Allow users to view their own push logs (optional, for debugging)
CREATE POLICY "Users can view own push logs" 
  ON public.push_notification_log FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Schedule daily cleanup of Push logs at 4:30 AM UTC
SELECT cron.schedule(
  'cleanup-old-push-logs',
  '30 4 * * *',
  $$DELETE FROM public.push_notification_log WHERE created_at < NOW() - INTERVAL '30 days'$$
);
