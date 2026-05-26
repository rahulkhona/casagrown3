-- Auto-post log for tracking daily Facebook posts per seller
-- Used by generate-fb-posts to enforce daily rate limits
CREATE TABLE IF NOT EXISTS public.fb_auto_post_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  target TEXT NOT NULL,  -- 'seller_page' or 'casagrown_page'
  product_id UUID,
  fb_post_id TEXT,       -- Facebook's post ID after publishing
  message TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fb_auto_post_log_daily 
  ON public.fb_auto_post_log(user_id, target, created_at);

ALTER TABLE public.fb_auto_post_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY fb_auto_post_log_service ON public.fb_auto_post_log
  FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.fb_auto_post_log TO service_role;
GRANT ALL ON public.fb_auto_post_log TO postgres;
