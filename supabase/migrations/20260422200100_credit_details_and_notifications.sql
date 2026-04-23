-- ============================================================================
-- Migration: Credit Details RPC + Credit Lifecycle Notifications
-- ============================================================================
-- #6: Add RPC to return individual credit rows with expiration for wallet UI
-- #7: Add trigger for credit-granted notifications + pg_cron for expiry alerts
-- ============================================================================

SET search_path TO public, extensions;

-- ─── 1. RPC: get_user_credit_details ─────────────────────────────────────────
-- Returns individual credit rows for the wallet table, including usage history.
CREATE OR REPLACE FUNCTION get_user_credit_details(p_user_id UUID)
RETURNS TABLE(
  credit_id UUID,
  credit_type TEXT,
  source TEXT,
  reason TEXT,
  amount_usd NUMERIC,
  remaining_usd NUMERIC,
  used_usd NUMERIC,
  cap_value NUMERIC,
  cap_type TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  is_expired BOOLEAN,
  is_fully_used BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    uc.id AS credit_id,
    uc.credit_type::TEXT,
    uc.source::TEXT,
    uc.reason,
    uc.amount_usd,
    uc.remaining_usd,
    (uc.amount_usd - uc.remaining_usd) AS used_usd,
    uc.cap_value,
    uc.cap_type::TEXT,
    uc.expires_at,
    uc.created_at,
    (uc.expires_at IS NOT NULL AND uc.expires_at <= now()) AS is_expired,
    (uc.remaining_usd <= 0) AS is_fully_used
  FROM user_credits uc
  WHERE uc.user_id = p_user_id
  ORDER BY
    -- Active credits first, then expired/used
    CASE WHEN uc.remaining_usd > 0 AND (uc.expires_at IS NULL OR uc.expires_at > now()) THEN 0 ELSE 1 END,
    uc.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_credit_details TO authenticated, service_role;


-- ─── 2. Trigger: Notify user when credits are granted ────────────────────────
-- Fires on INSERT to user_credits, sends in-app + push notification.
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
  -- Build usage description based on credit_type
  CASE NEW.credit_type::TEXT
    WHEN 'purchase' THEN
      v_usage_desc := 'This credit applies toward your purchases as a buyer.';
    WHEN 'platform_fee' THEN
      v_usage_desc := 'This credit reduces your seller platform fees.';
    WHEN 'universal' THEN
      v_usage_desc := 'This credit can be used toward purchases or seller fees.';
    ELSE
      v_usage_desc := 'This credit will be automatically applied.';
  END CASE;

  -- Build cap description based on cap_type + credit_type
  IF NEW.cap_type = 'percentage' THEN
    CASE NEW.credit_type::TEXT
      WHEN 'purchase' THEN
        v_cap_desc := 'Up to ' || NEW.cap_value || '% of your order total per transaction.';
      WHEN 'platform_fee' THEN
        v_cap_desc := 'Up to ' || NEW.cap_value || '% of your platform fees per sale.';
      WHEN 'universal' THEN
        v_cap_desc := 'Up to ' || NEW.cap_value || '% of transaction value per order.';
      ELSE
        v_cap_desc := 'Up to ' || NEW.cap_value || '% per transaction.';
    END CASE;
  ELSE
    CASE NEW.credit_type::TEXT
      WHEN 'purchase' THEN
        v_cap_desc := 'Up to $' || NEW.cap_value || ' off your purchase per order.';
      WHEN 'platform_fee' THEN
        v_cap_desc := 'Up to $' || NEW.cap_value || ' off your seller fees per sale.';
      WHEN 'universal' THEN
        v_cap_desc := 'Up to $' || NEW.cap_value || ' off per transaction.';
      ELSE
        v_cap_desc := 'Up to $' || NEW.cap_value || ' per transaction.';
    END CASE;
  END IF;

  -- Build expiry description
  IF NEW.expires_at IS NOT NULL THEN
    v_expiry_desc := 'Expires ' || to_char(NEW.expires_at AT TIME ZONE 'America/Los_Angeles', 'Mon DD, YYYY') || '.';
  ELSE
    v_expiry_desc := 'No expiration.';
  END IF;

  -- Combined usage rules for email
  v_usage_rules := v_usage_desc || ' ' || v_cap_desc || ' ' || v_expiry_desc
    || ' Only 1 credit applies per transaction.';

  -- In-app message (concise)
  v_msg := '💰 You received $' || NEW.amount_usd || ' in ' || NEW.credit_type || ' credits'
    || CASE WHEN NEW.reason IS NOT NULL THEN ' — ' || NEW.reason ELSE '' END
    || '. ' || v_cap_desc;

  -- In-app + push notification
  PERFORM notify_market_event(
    NEW.user_id,
    v_msg,
    '/earnings',
    true, true
  );

  -- Send email notification
  v_email := get_user_email(NEW.user_id);
  v_service_key := COALESCE(
    current_setting('app.settings.service_role_key', true),
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
  );
  v_edge_fn_url := COALESCE(
    current_setting('app.settings.edge_functions_base_url', true),
    current_setting('app.settings.supabase_url', true) || '/functions/v1',
    'http://host.docker.internal:54321/functions/v1'
  ) || '/send-notification-email';

  IF v_email IS NOT NULL AND v_service_key IS NOT NULL THEN
    PERFORM net.http_post(
      url := v_edge_fn_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body := jsonb_build_object(
        'type', 'credit_granted',
        'recipients', jsonb_build_array(jsonb_build_object('email', v_email)),
        'creditAmountUsd', NEW.amount_usd,
        'creditType', NEW.credit_type,
        'creditReason', COALESCE(NEW.reason, 'Credit issued'),
        'creditCapValue', NEW.cap_value,
        'creditCapType', NEW.cap_type,
        'creditExpiresAt', NEW.expires_at
      )
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Credit notification failed for user %: %', NEW.user_id, SQLERRM;
  RETURN NEW;
END;
$$;

-- Attach trigger
DROP TRIGGER IF EXISTS trg_credit_granted ON user_credits;
CREATE TRIGGER trg_credit_granted
  AFTER INSERT ON user_credits
  FOR EACH ROW
  EXECUTE FUNCTION trg_credit_granted_notify();


-- ─── 3. Function: Process credit expiry reminders ────────────────────────────
-- Called by pg_cron daily. Notifies users whose credits expire within 3 days.
CREATE OR REPLACE FUNCTION process_credit_expiry_reminders()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_credit RECORD;
  v_count INTEGER := 0;
  v_msg TEXT;
  v_email TEXT;
  v_edge_fn_url TEXT;
  v_service_key TEXT;
  v_days_left INTEGER;
BEGIN
  v_service_key := COALESCE(
    current_setting('app.settings.service_role_key', true),
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
  );
  v_edge_fn_url := COALESCE(
    current_setting('app.settings.edge_functions_base_url', true),
    current_setting('app.settings.supabase_url', true) || '/functions/v1',
    'http://host.docker.internal:54321/functions/v1'
  ) || '/send-notification-email';

  FOR v_credit IN
    SELECT uc.id, uc.user_id, uc.amount_usd, uc.remaining_usd, uc.credit_type,
           uc.expires_at,
           EXTRACT(DAY FROM (uc.expires_at - now()))::INTEGER AS days_remaining
    FROM user_credits uc
    WHERE uc.expires_at IS NOT NULL
      AND uc.remaining_usd > 0
      AND uc.expires_at > now()
      AND uc.expires_at <= now() + INTERVAL '3 days'
      -- Don't send duplicate reminders: check notifications table
      AND NOT EXISTS (
        SELECT 1 FROM market_notifications mn
        WHERE mn.user_id = uc.user_id
          AND mn.content LIKE '%credit expires%'
          AND mn.created_at > now() - INTERVAL '1 day'
      )
  LOOP
    v_days_left := GREATEST(v_credit.days_remaining, 0);

    IF v_days_left = 0 THEN
      v_msg := '⏰ Your $' || v_credit.remaining_usd || ' ' || v_credit.credit_type || ' credit expires today! Use it before midnight.';
    ELSE
      v_msg := '⏰ Your $' || v_credit.remaining_usd || ' ' || v_credit.credit_type || ' credit expires in ' || v_days_left || ' day' || CASE WHEN v_days_left > 1 THEN 's' ELSE '' END || '. Shop now before it disappears!';
    END IF;

    -- In-app + push
    PERFORM notify_market_event(v_credit.user_id, v_msg, '/earnings', true, true);

    -- Email
    v_email := get_user_email(v_credit.user_id);
    IF v_email IS NOT NULL AND v_service_key IS NOT NULL THEN
      PERFORM net.http_post(
        url := v_edge_fn_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_key
        ),
        body := jsonb_build_object(
          'type', 'credit_expiring',
          'recipients', jsonb_build_array(jsonb_build_object('email', v_email)),
          'creditRemainingUsd', v_credit.remaining_usd,
          'creditType', v_credit.credit_type,
          'creditExpiresAt', v_credit.expires_at,
          'creditDaysLeft', v_days_left
        )
      );
    END IF;

    v_count := v_count + 1;
  END LOOP;

  -- ── Also notify for credits that JUST expired (within last 24h) ──
  FOR v_credit IN
    SELECT uc.id, uc.user_id, uc.amount_usd, uc.remaining_usd, uc.credit_type,
           uc.expires_at
    FROM user_credits uc
    WHERE uc.expires_at IS NOT NULL
      AND uc.remaining_usd > 0
      AND uc.expires_at <= now()
      AND uc.expires_at > now() - INTERVAL '1 day'
      -- Don't send duplicate expired notifications
      AND NOT EXISTS (
        SELECT 1 FROM market_notifications mn
        WHERE mn.user_id = uc.user_id
          AND mn.content LIKE '%credit has expired%'
          AND mn.created_at > now() - INTERVAL '1 day'
      )
  LOOP
    v_msg := '❌ Your $' || v_credit.remaining_usd || ' ' || v_credit.credit_type || ' credit has expired. It can no longer be used for purchases.';

    -- In-app + push
    PERFORM notify_market_event(v_credit.user_id, v_msg, '/earnings', true, true);

    -- Email
    v_email := get_user_email(v_credit.user_id);
    IF v_email IS NOT NULL AND v_service_key IS NOT NULL THEN
      PERFORM net.http_post(
        url := v_edge_fn_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_key
        ),
        body := jsonb_build_object(
          'type', 'credit_expired',
          'recipients', jsonb_build_array(jsonb_build_object('email', v_email)),
          'creditRemainingUsd', v_credit.remaining_usd,
          'creditType', v_credit.credit_type,
          'creditExpiresAt', v_credit.expires_at
        )
      );
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION process_credit_expiry_reminders TO service_role;

-- ─── 4. pg_cron job: Daily credit expiry check ──────────────────────────────
-- Runs daily at 9am PT (4pm UTC) to notify users of expiring/expired credits
SELECT cron.schedule(
  'credit-expiry-reminders',
  '0 16 * * *',  -- 9:00 AM PT = 16:00 UTC
  $$SELECT process_credit_expiry_reminders()$$
);
