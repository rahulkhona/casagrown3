-- Migration: Abandoned Onboarding Reminder Cron
-- Description: Adds tracking timestamps to profiles and creates an hourly cron job
-- to trigger edge function emails for users who stall during onboarding.

-- 1. Add tracking columns to ensure emails are sent only once per user
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS tos_reminder_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS profile_reminder_sent_at TIMESTAMPTZ;

-- 2. Create the processor function
CREATE OR REPLACE FUNCTION public.process_abandoned_onboarding()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_supabase_url TEXT;
  v_service_key TEXT;
  v_tos_payload JSONB;
  v_profile_payload JSONB;
BEGIN
  -- Get context
  v_supabase_url := coalesce(
    current_setting('app.settings.supabase_url', true),
    'http://host.docker.internal:54321'
  );
  v_service_key := current_setting('app.settings.service_role_key', true);

  -- ==========================================
  -- 1. Assemble Abandoned ToS Users (Created > 1h ago, no ToS, unsent)
  -- ==========================================
  WITH updated_tos AS (
    UPDATE public.profiles
    SET tos_reminder_sent_at = now()
    WHERE tos_accepted_at IS NULL
      AND tos_reminder_sent_at IS NULL
      AND created_at < now() - interval '1 hour'
    RETURNING email, full_name
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'email', updated_tos.email,
      'name', updated_tos.full_name
    )
  ) INTO v_tos_payload
  FROM updated_tos;

  -- Fire Edge Function for ToS Reminders
  IF v_tos_payload IS NOT NULL THEN
    PERFORM net.http_post(
      url := v_supabase_url || '/functions/v1/send-notification-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(v_service_key, '')
      ),
      body := jsonb_build_object(
        'type', 'abandoned_tos',
        'recipients', v_tos_payload
      )
    );
  END IF;

  -- ==========================================
  -- 2. Assemble Abandoned Profile Users (Signed ToS > 1h ago, no Community, unsent)
  -- ==========================================
  WITH updated_profiles AS (
    UPDATE public.profiles
    SET profile_reminder_sent_at = now()
    WHERE tos_accepted_at IS NOT NULL
      AND home_community_h3_index IS NULL
      AND profile_reminder_sent_at IS NULL
      AND tos_accepted_at < now() - interval '1 hour'
    RETURNING email, full_name
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'email', updated_profiles.email,
      'name', updated_profiles.full_name
    )
  ) INTO v_profile_payload
  FROM updated_profiles;

  -- Fire Edge Function for Profile Reminders
  IF v_profile_payload IS NOT NULL THEN
    PERFORM net.http_post(
      url := v_supabase_url || '/functions/v1/send-notification-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(v_service_key, '')
      ),
      body := jsonb_build_object(
        'type', 'abandoned_profile',
        'recipients', v_profile_payload
      )
    );
  END IF;

END;
$$;

-- 3. Schedule the Cron Job (Runs hourly)
SELECT cron.schedule(
  'abandoned-onboarding-job',
  '0 * * * *',
  'SELECT public.process_abandoned_onboarding();'
);
