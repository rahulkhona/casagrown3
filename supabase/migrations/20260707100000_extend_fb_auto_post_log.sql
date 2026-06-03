-- Migration: Extend fb_auto_post_log for scheduled video reels and posts

ALTER TABLE public.fb_auto_post_log 
  ADD COLUMN IF NOT EXISTS booth_id UUID REFERENCES public.market_booths(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'posted', 'failed')),
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_fb_auto_post_log_scheduled 
  ON public.fb_auto_post_log(status, scheduled_at);
