-- ============================================================================
-- Fix: Push Notification Delivery
--   1. send_push_via_edge — Vault key fallback so DB-triggered push/email works
--   2. trg_redemption_notify — manual payout matches auto: in-app+push+email+SMS
--                              withdrawal failed now includes SMS (mirrors push
--                              for all financial/payout events)
--   3. trg_settlement_status_notify — funds_received is an internal banking event
--                              for admins only; do not notify sellers/buyers.
--                              cleared (earnings available) stays: all channels.
-- ============================================================================

-- 1. Rewrite send_push_via_edge with Vault fallback for service_role_key
CREATE OR REPLACE FUNCTION send_push_via_edge(
  p_user_ids UUID[],
  p_title    TEXT,
  p_body     TEXT,
  p_url      TEXT DEFAULT NULL,
  p_tag      TEXT DEFAULT 'casagrown-market'
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_supabase_url  TEXT;
  v_service_key   TEXT;
  v_user_ids_json JSONB;
BEGIN
  v_supabase_url := COALESCE(
    current_setting('app.settings.supabase_url', true),
    'http://host.docker.internal:54321'
  );

  -- Try app.settings first (set via ALTER DATABASE), then Vault, then empty
  v_service_key := COALESCE(
    current_setting('app.settings.service_role_key', true),
    (SELECT decrypted_secret FROM vault.decrypted_secrets
     WHERE name = 'service_role_key' LIMIT 1),
    ''
  );

  -- Convert UUID[] to JSON array of strings
  SELECT jsonb_agg(to_jsonb(u::text)) INTO v_user_ids_json
  FROM unnest(p_user_ids) u;

  PERFORM net.http_post(
    url     := v_supabase_url || '/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := jsonb_build_object(
      'userIds', v_user_ids_json,
      'title',   p_title,
      'body',    p_body,
      'url',     COALESCE(p_url, '/notifications'),
      'tag',     p_tag
    )
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[send_push_via_edge] Push send failed: %', SQLERRM;
END;
$$;

-- 2. Fix manual redemption — route through notify_market_event so it gets
--    push + email, not just an in-app notification.
--    This brings it in line with auto redemption (is_auto = true).
CREATE OR REPLACE FUNCTION trg_redemption_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_item_name TEXT;
  v_item_type TEXT;
  v_is_auto   BOOLEAN;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  SELECT name, type::text INTO v_item_name, v_item_type
  FROM redemption_merchandize WHERE id = NEW.item_id;

  -- Fallback to metadata for market redemptions (no item_id)
  IF v_item_name IS NULL THEN
    v_item_name := NEW.metadata->>'brand_name';
  END IF;

  -- is_auto read from metadata (column may not exist on older DB instances)
  v_is_auto := COALESCE((NEW.metadata->>'source') = 'auto_payout', false);

  IF NEW.status = 'completed' THEN
    IF v_is_auto THEN
      -- Auto remittance: full notification (in-app + push + email + SMS)
      PERFORM notify_market_event(
        NEW.user_id,
        '⚡ Auto-withdrawal complete: ' || COALESCE(v_item_name, 'Your withdrawal') || ' is ready!',
        '/earnings',
        true,
        true
      );
    ELSE
      -- Manual remittance: full notification (in-app + push + email + SMS)
      -- Previously was bare INSERT (in-app only) — now parity with auto.
      PERFORM notify_market_event(
        NEW.user_id,
        '🎁 Withdrawal complete: ' || COALESCE(v_item_name, 'Your withdrawal') || ' is ready!',
        '/earnings',
        true,
        true
      );
    END IF;

  ELSIF NEW.status = 'failed' THEN
    -- Payout failed: in-app + push + email + SMS
    -- SMS mirrors push for all financial/payout events.
    PERFORM notify_market_event(
      NEW.user_id,
      '❌ Withdrawal failed for ' || COALESCE(v_item_name, 'your request') || '. Please try again.',
      '/earnings/redeem',
      true,
      true  -- SMS: yes — financial event
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Ensure the trigger is in place (idempotent)
DROP TRIGGER IF EXISTS trg_redemption_notifications ON redemptions;
CREATE TRIGGER trg_redemption_notifications
  AFTER UPDATE OF status ON redemptions
  FOR EACH ROW
  EXECUTE FUNCTION trg_redemption_notify();

-- 3. Rewrite trg_settlement_status_notify
--    funds_received: internal banking event — admin-only (no user notifications).
--                    Admins see this via the admin dashboard settlements table.
--    cleared:        earnings available — notify all affected sellers via all channels.
CREATE OR REPLACE FUNCTION trg_settlement_status_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user RECORD;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  CASE NEW.status
    WHEN 'funds_received' THEN
      -- Internal banking event: CasaGrown received the ACH/wire.
      -- Notify ALL admin staff via every channel (in-app + push + email + SMS).
      -- Sellers are NOT notified — they only care when their earnings are cleared.
      FOR v_user IN
        SELECT user_id FROM staff_members WHERE 'admin' = ANY(roles)
      LOOP
        PERFORM notify_market_event(
          v_user.user_id,
          '🏦 Settlement funds received — ID: ' || NEW.id || '. Review and clear when ready.',
          '/settlements/' || NEW.id,
          true,  -- email
          true   -- SMS
        );
      END LOOP;

    WHEN 'cleared' THEN
      -- Earnings available: notify each seller via all channels (in-app+push+email+SMS).
      FOR v_user IN
        SELECT user_id, net_payout_usd FROM user_settlements WHERE settlement_id = NEW.id
      LOOP
        PERFORM notify_market_event(
          v_user.user_id,
          '✅ $' || v_user.net_payout_usd || ' earnings cleared and available for withdrawal!',
          '/earnings',
          true,  -- email
          true   -- SMS: yes — financial event
        );
        PERFORM check_1099k_threshold(v_user.user_id);
      END LOOP;

    ELSE NULL;
  END CASE;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_settlement_status_notifications ON market_settlements;
CREATE TRIGGER trg_settlement_status_notifications
  AFTER UPDATE OF status ON market_settlements
  FOR EACH ROW
  EXECUTE FUNCTION trg_settlement_status_notify();
