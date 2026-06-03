-- Add columns to track pinned quantity comments for Facebook and Instagram posts
ALTER TABLE public.market_products
  ADD COLUMN IF NOT EXISTS facebook_comment_id TEXT,
  ADD COLUMN IF NOT EXISTS instagram_comment_id TEXT;

COMMENT ON COLUMN public.market_products.facebook_comment_id IS 'ID of the active quantity comment on Facebook';
COMMENT ON COLUMN public.market_products.instagram_comment_id IS 'ID of the active quantity comment on Instagram';

NOTIFY pgrst, 'reload schema';
