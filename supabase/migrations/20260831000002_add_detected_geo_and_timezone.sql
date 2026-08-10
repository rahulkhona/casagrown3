-- Migration: Add detected timezone and geo fields to push_subscriptions, profiles, and crm_leads

SET search_path TO public, extensions;

-- 1. Add timezone & geo fields to push_subscriptions
ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/Los_Angeles';
ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS zip_code TEXT;
ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS state_code TEXT;

-- 2. Add detected location fields to profiles (for uncompleted profiles)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS detected_timezone TEXT DEFAULT 'America/Los_Angeles';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS detected_zip TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS detected_city TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS detected_state TEXT;

-- 3. Add detected location fields to crm_leads
ALTER TABLE public.crm_leads ADD COLUMN IF NOT EXISTS detected_timezone TEXT DEFAULT 'America/Los_Angeles';
ALTER TABLE public.crm_leads ADD COLUMN IF NOT EXISTS detected_zip TEXT;
ALTER TABLE public.crm_leads ADD COLUMN IF NOT EXISTS detected_city TEXT;
ALTER TABLE public.crm_leads ADD COLUMN IF NOT EXISTS detected_state TEXT;

-- Comments
COMMENT ON COLUMN public.push_subscriptions.timezone IS 'Detected client timezone (e.g., America/Los_Angeles) for local send windows.';
COMMENT ON COLUMN public.push_subscriptions.zip_code IS 'Detected or auto-mapped client ZIP code for geo-targeted push notifications.';
COMMENT ON COLUMN public.profiles.detected_timezone IS 'Auto-detected timezone for users who have not yet completed profile details.';
