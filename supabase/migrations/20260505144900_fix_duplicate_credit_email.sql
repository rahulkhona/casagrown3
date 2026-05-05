-- ============================================================================
-- Migration: Fix duplicate credit notification emails
-- ============================================================================
-- The trg_credit_granted_notify() function was sending TWO emails:
--   1. A plain email via notify_market_event(..., p_send_email := true)
--      which calls send-market-email
--   2. A branded email via send-notification-email with type 'credit_granted'
--
-- Fix: Disable the email in notify_market_event (keep in-app + push)
-- since the branded send-notification-email path is the correct one.
-- ============================================================================

SET search_path TO public, extensions;

CREATE OR REPLACE FUNCTION trg_credit_granted_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_msg TEXT;
  v_usage_desc TEXT;
  v_cap_desc TEXT;
  v_expiry_desc TEXT;
  v_usage_rules TEXT;
  v_email TEXT;
  v_edge_fn_url TEXT;
  v_service_key TEXT;
BEGIN
  CASE NEW.credit_type::TEXT
    WHEN 'purchase' THEN v_usage_desc := 'This credit applies toward your purchases as a buyer.';
    WHEN 'platform_fee' THEN v_usage_desc := 'This credit reduces your seller platform fees.';
    WHEN 'universal' THEN v_usage_desc := 'This credit can be used toward purchases or seller fees.';
    ELSE v_usage_desc := 'This credit will be automatically applied.';
  END CASE;

  IF NEW.cap_type = 'percentage' THEN
    CASE NEW.credit_type::TEXT
      WHEN 'purchase' THEN v_cap_desc := 'Up to ' || NEW.cap_value || '% of your order total per transaction.';
      WHEN 'platform_fee' THEN v_cap_desc := 'Up to ' || NEW.cap_value || '% of your platform fees per sale.';
      WHEN 'universal' THEN v_cap_desc := 'Up to ' || NEW.cap_value || '% of transaction value per order.';
      ELSE v_cap_desc := 'Up to ' || NEW.cap_value || '% per transaction.';
    END CASE;
  ELSE
    CASE NEW.credit_type::TEXT
      WHEN 'purchase' THEN v_cap_desc := 'Up to $' || NEW.cap_value || ' off your purchase per order.';
      WHEN 'platform_fee' THEN v_cap_desc := 'Up to $' || NEW.cap_value || ' off your seller fees per sale.';
      WHEN 'universal' THEN v_cap_desc := 'Up to $' || NEW.cap_value || ' off per transaction.';
      ELSE v_cap_desc := 'Up to $' || NEW.cap_value || ' per transaction.';
    END CASE;
  END IF;

  IF NEW.expires_at IS NOT NULL THEN
    v_expiry_desc := 'Expires ' || to_char(NEW.expires_at AT TIME ZONE 'America/Los_Angeles', 'Mon DD, YYYY') || '.';
  ELSE
    v_expiry_desc := 'No expiration.';
  END IF;

  v_usage_rules := v_usage_desc || ' ' || v_cap_desc || ' ' || v_expiry_desc || ' Only 1 credit applies per transaction.';

  v_msg := '💰 You received $' || NEW.amount_usd || ' in ' || NEW.credit_type || ' credits'
    || CASE WHEN NEW.reason IS NOT NULL THEN ' — ' || NEW.reason ELSE '' END
    || '. ' || v_cap_desc;

  -- In-app notification + push only (p_send_email := false)
  -- The branded email is sent below via send-notification-email
  PERFORM notify_market_event(NEW.user_id, v_msg, '/earnings', false, false);

  -- Branded email via send-notification-email
  v_email := get_user_email(NEW.user_id);
  v_service_key := get_service_role_key();
  v_edge_fn_url := get_edge_fn_base_url() || '/send-notification-email';

  IF v_email IS NOT NULL AND v_service_key IS NOT NULL THEN
    PERFORM net.http_post(url := v_edge_fn_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key),
      body := jsonb_build_object('type', 'credit_granted',
        'recipients', jsonb_build_array(jsonb_build_object('email', v_email)),
        'creditAmountUsd', NEW.amount_usd, 'creditType', NEW.credit_type,
        'creditReason', COALESCE(NEW.reason, 'Credit issued'),
        'creditCapValue', NEW.cap_value, 'creditCapType', NEW.cap_type,
        'creditExpiresAt', NEW.expires_at));
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Credit notification failed for user %: %', NEW.user_id, SQLERRM;
  RETURN NEW;
END;
$$;
