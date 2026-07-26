-- ============================================================================
-- Migration: Update Abandoned Onboarding Cron
-- Checks profile_completed_at IS NULL instead of home_community_h3_index IS NULL
-- since 5-digit zipcode registration completes profile without requiring H3 index.
-- ============================================================================

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

  -- 1. Abandoned ToS Users (Created > 1h ago, no ToS accepted)
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

  -- 2. Abandoned Profile Users (Signed ToS > 1h ago, but profile_completed_at IS NULL)
  WITH updated_profiles AS (
    UPDATE public.profiles
    SET profile_reminder_sent_at = now()
    WHERE tos_accepted_at IS NOT NULL
      AND profile_completed_at IS NULL
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
