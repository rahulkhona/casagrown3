-- Migration: Welcome Email Trigger
-- Fires `send-notification-email` edge function immediately upon a profile being completed (assigning a home_community_h3_index).

CREATE OR REPLACE FUNCTION public.trigger_welcome_email()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_supabase_url TEXT;
  v_service_key TEXT;
BEGIN
  -- We consider a profile "completed" when they are assigned a community for the very first time.
  IF OLD.home_community_h3_index IS NULL AND NEW.home_community_h3_index IS NOT NULL THEN
    
    -- Get Supabase URL and service role key for authenticated edge function call
    v_supabase_url := coalesce(
      current_setting('app.settings.supabase_url', true),
      'http://host.docker.internal:54321'
    );
    v_service_key := coalesce(
      current_setting('app.settings.service_role_key', true),
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
    );

    -- Fire via pg_net `http_post` asynchronously
    PERFORM net.http_post(
      url := v_supabase_url || '/functions/v1/send-notification-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body := jsonb_build_object(
        'type', 'welcome',
        'recipients', jsonb_build_array(
          jsonb_build_object(
            'email', NEW.email,
            'name', NEW.full_name
          )
        )
      )
    );

  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never fail a profile update just because the welcome email async request failed
  RAISE WARNING 'Welcome email async trigger failed for profile %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- Drop trigger if exists to ensure idempotency
DROP TRIGGER IF EXISTS on_profile_completed ON public.profiles;

-- Create the trigger
CREATE TRIGGER on_profile_completed
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_welcome_email();
