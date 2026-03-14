-- ============================================================================
-- Migration: Market Reminders
-- Stores user reminder preferences for upcoming market days.
-- Entries are deleted after the reminder is sent.
-- ============================================================================

-- 1. Create market_reminders table
CREATE TABLE IF NOT EXISTS public.market_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  remind_at TIMESTAMPTZ NOT NULL,
  market_date TIMESTAMPTZ NOT NULL,
  reminder_minutes INTEGER NOT NULL DEFAULT 30,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ, -- set when reminder is fired, then row is deleted by cron
  UNIQUE(user_id, market_date)
);

-- 2. Enable RLS
ALTER TABLE public.market_reminders ENABLE ROW LEVEL SECURITY;

-- 3. Users can manage their own reminders
CREATE POLICY "Users can view own reminders"
  ON public.market_reminders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own reminders"
  ON public.market_reminders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own reminders"
  ON public.market_reminders FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own reminders"
  ON public.market_reminders FOR DELETE
  USING (auth.uid() = user_id);

-- 4. Index for cron job that finds reminders ready to send
CREATE INDEX idx_market_reminders_remind_at
  ON public.market_reminders (remind_at)
  WHERE sent_at IS NULL;

-- 5. Function to clean up sent reminders (called by cron or after sending)
CREATE OR REPLACE FUNCTION cleanup_sent_reminders()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.market_reminders
  WHERE sent_at IS NOT NULL;
$$;
