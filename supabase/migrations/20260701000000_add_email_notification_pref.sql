-- Add email notification preference column to profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS email_notifications_enabled BOOLEAN DEFAULT true;

-- Add video post opt-in toggles per platform on seller_fb_connections
ALTER TABLE public.seller_fb_connections
  ADD COLUMN IF NOT EXISTS video_posts_enabled BOOLEAN DEFAULT true;

ALTER TABLE public.seller_fb_connections
  ADD COLUMN IF NOT EXISTS ig_video_posts_enabled BOOLEAN DEFAULT true;
