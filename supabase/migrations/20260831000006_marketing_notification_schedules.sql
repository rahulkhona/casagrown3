-- Migration: Add Push Notification fields, A/B Testing, and Local-Time Schedule configuration to crm_campaigns and crm_notification_schedules

-- 1. Update crm_campaigns channel check constraint to allow 'push'
ALTER TABLE public.crm_campaigns DROP CONSTRAINT IF EXISTS crm_campaigns_channel_check;
ALTER TABLE public.crm_campaigns ADD CONSTRAINT crm_campaigns_channel_check CHECK (channel IN ('email', 'sms', 'push'));

-- 2. Add Push Notification content fields to crm_campaigns
ALTER TABLE public.crm_campaigns ADD COLUMN IF NOT EXISTS push_title TEXT;
ALTER TABLE public.crm_campaigns ADD COLUMN IF NOT EXISTS push_body TEXT;
ALTER TABLE public.crm_campaigns ADD COLUMN IF NOT EXISTS push_target_url TEXT DEFAULT '/market';

-- 3. Add A/B Testing fields to crm_campaigns
ALTER TABLE public.crm_campaigns ADD COLUMN IF NOT EXISTS is_ab_test BOOLEAN DEFAULT false;
ALTER TABLE public.crm_campaigns ADD COLUMN IF NOT EXISTS variant_b_subject TEXT;
ALTER TABLE public.crm_campaigns ADD COLUMN IF NOT EXISTS variant_b_html_body TEXT;
ALTER TABLE public.crm_campaigns ADD COLUMN IF NOT EXISTS variant_b_push_title TEXT;
ALTER TABLE public.crm_campaigns ADD COLUMN IF NOT EXISTS variant_b_push_body TEXT;
ALTER TABLE public.crm_campaigns ADD COLUMN IF NOT EXISTS variant_b_sms_body TEXT;

-- 4. Add Embedded Local-Time Schedule fields to crm_campaigns
ALTER TABLE public.crm_campaigns ADD COLUMN IF NOT EXISTS schedule_enabled BOOLEAN DEFAULT false;
ALTER TABLE public.crm_campaigns ADD COLUMN IF NOT EXISTS schedule_windows JSONB DEFAULT '[{"name": "morning", "start": "09:00:00", "end": "11:00:00"}]'::jsonb;

-- 5. Add push_slots to crm_send_slot_defaults
ALTER TABLE public.crm_send_slot_defaults ADD COLUMN IF NOT EXISTS push_slots JSONB DEFAULT '[{"day": "mon", "start": "09:00", "end": "11:00"}]'::jsonb;

-- 6. Create backend crm_notification_schedules table for local-time execution
CREATE TABLE IF NOT EXISTS public.crm_notification_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_type TEXT NOT NULL UNIQUE,
  campaign_id UUID REFERENCES public.crm_campaigns(id) ON DELETE SET NULL,
  target_audience TEXT NOT NULL DEFAULT 'all',
  is_active BOOLEAN NOT NULL DEFAULT true,
  windows JSONB NOT NULL DEFAULT '[{"name": "morning", "start": "09:00:00", "end": "11:00:00"}]'::jsonb,
  channels JSONB NOT NULL DEFAULT '{"push": true, "email": true, "sms": false}'::jsonb,
  fallback_timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. Create crm_notification_window_logs table to track window dispatches for both registered users and guest devices
CREATE TABLE IF NOT EXISTS public.crm_notification_window_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID REFERENCES public.crm_notification_schedules(id) ON DELETE CASCADE,
  recipient_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NULL,
  guest_id TEXT NULL,
  dispatch_date DATE NOT NULL DEFAULT CURRENT_DATE,
  window_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.crm_notification_window_logs ALTER COLUMN recipient_id DROP NOT NULL;
ALTER TABLE public.crm_notification_window_logs ADD COLUMN IF NOT EXISTS guest_id TEXT NULL;

-- Index for guest window logs
CREATE INDEX IF NOT EXISTS idx_crm_notification_window_logs_guest ON public.crm_notification_window_logs(schedule_id, guest_id, dispatch_date, window_name);

-- 8. Register Built-in Guest & Unregistered Audiences in crm_audience_functions
INSERT INTO public.crm_audience_functions (name, label, description, is_rpc, is_active)
VALUES
  (
    'crm_audience_guest_push_subscribers',
    'Guest Push Subscribers',
    'Unauthenticated guest devices with active web/mobile push notification subscriptions.',
    false,
    true
  ),
  (
    'crm_audience_unregistered_guests',
    'Unregistered Guests & Prospects',
    'Visitors who have completed web activity or games but have not registered a full profile.',
    false,
    true
  )
ON CONFLICT (name) DO NOTHING;

-- Seed guest audiences in crm_audiences
INSERT INTO public.crm_audiences (name, description, recipient_type, audience_rpc_name, query_source, query_sql, is_dynamic)
SELECT
  'Guest Push Subscribers',
  'All active guest devices registered for web and mobile push notifications.',
  'leads',
  'crm_audience_guest_push_subscribers',
  'ai',
  'SELECT DISTINCT guest_id, timezone, zip_code, city, state_code FROM push_subscriptions WHERE guest_id IS NOT NULL AND user_id IS NULL',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.crm_audiences WHERE name = 'Guest Push Subscribers'
);

-- 9. Comments on tables and columns for query builder schema context
COMMENT ON TABLE public.crm_notification_schedules IS 'Local-time send window configurations for automated marketing notifications';
COMMENT ON TABLE public.crm_notification_window_logs IS 'Audit log of window dispatches to prevent duplicate sends per recipient/guest per day';

-- 10. RLS Policies
ALTER TABLE public.crm_notification_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_notification_window_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'crm_notification_schedules_select_all' AND tablename = 'crm_notification_schedules') THEN
    CREATE POLICY crm_notification_schedules_select_all ON public.crm_notification_schedules FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'crm_notification_schedules_update_all' AND tablename = 'crm_notification_schedules') THEN
    CREATE POLICY crm_notification_schedules_update_all ON public.crm_notification_schedules FOR UPDATE USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'crm_notification_window_logs_select_all' AND tablename = 'crm_notification_window_logs') THEN
    CREATE POLICY crm_notification_window_logs_select_all ON public.crm_notification_window_logs FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'crm_notification_window_logs_insert_all' AND tablename = 'crm_notification_window_logs') THEN
    CREATE POLICY crm_notification_window_logs_insert_all ON public.crm_notification_window_logs FOR INSERT WITH CHECK (true);
  END IF;
END $$;
