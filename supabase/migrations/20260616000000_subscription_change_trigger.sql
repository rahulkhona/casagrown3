-- Migration: Subscription Change Email Trigger
-- Fires `send-notification-email` edge function on seller subscription signup, upgrade, downgrade, or cancellation.

SET search_path TO public, extensions;

CREATE OR REPLACE FUNCTION public.trigger_subscription_change_email()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_supabase_url TEXT;
  v_service_key TEXT;
  v_email TEXT;
  v_full_name TEXT;
  v_action TEXT := NULL;
  v_plan TEXT;
BEGIN
  -- Resolve the plan representation (lite/free mapped to lite)
  v_plan := COALESCE(NEW.plan, 'lite');
  IF v_plan = 'free' THEN
    v_plan := 'lite';
  END IF;

  -- 1. Determine action
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IN ('active', 'trialing') THEN
      v_action := 'signup';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Transition from non-active to active
    IF (OLD.status IS NULL OR OLD.status IN ('inactive', 'canceled')) AND NEW.status IN ('active', 'trialing') THEN
      v_action := 'signup';
    -- Active plan change
    ELSIF OLD.status IN ('active', 'trialing') AND NEW.status IN ('active', 'trialing') AND OLD.plan != NEW.plan THEN
      DECLARE
        v_old_comparable TEXT := OLD.plan;
        v_new_comparable TEXT := NEW.plan;
      BEGIN
        IF v_old_comparable = 'free' THEN v_old_comparable := 'lite'; END IF;
        IF v_new_comparable = 'free' THEN v_new_comparable := 'lite'; END IF;

        IF v_old_comparable != v_new_comparable THEN
          -- Upgrades
          IF (v_old_comparable = 'lite' AND v_new_comparable IN ('pro', 'elite')) OR
             (v_old_comparable = 'pro' AND v_new_comparable = 'elite') THEN
            v_action := 'upgrade';
          -- Downgrades
          ELSIF (v_old_comparable = 'elite' AND v_new_comparable IN ('pro', 'lite')) OR
                (v_old_comparable = 'pro' AND v_new_comparable = 'lite') THEN
            v_action := 'downgrade';
          END IF;
        END IF;
      END;
    -- Cancellation (active/trialing to canceled transition)
    ELSIF OLD.status IN ('active', 'trialing') AND NEW.status = 'canceled' THEN
      v_action := 'cancel';
    END IF;
  END IF;

  -- If a valid action is detected, trigger the email
  IF v_action IS NOT NULL THEN
    -- Fetch profile details
    SELECT email, full_name INTO v_email, v_full_name
    FROM public.profiles
    WHERE id = NEW.user_id;

    IF v_email IS NOT NULL THEN
      v_supabase_url := get_edge_fn_base_url();
      v_service_key := get_service_role_key();

      PERFORM net.http_post(
        url := v_supabase_url || '/send-notification-email',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_key
        ),
        body := jsonb_build_object(
          'type', 'subscription_change',
          'plan', v_plan,
          'action', v_action,
          'recipients', jsonb_build_array(
            jsonb_build_object(
              'email', v_email,
              'name', COALESCE(v_full_name, 'Seller')
            )
          )
        )
      );
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Safeguard so transaction isn't aborted on email failure
  RAISE WARNING 'Subscription change email async trigger failed for user %: %', NEW.user_id, SQLERRM;
  RETURN NEW;
END;
$$;

-- Drop trigger if exists to ensure idempotency
DROP TRIGGER IF EXISTS on_subscription_changed ON public.seller_subscriptions;

-- Create the trigger
CREATE TRIGGER on_subscription_changed
  AFTER INSERT OR UPDATE ON public.seller_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_subscription_change_email();
