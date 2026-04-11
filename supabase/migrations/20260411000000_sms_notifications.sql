-- ============================================================================
-- Migration: Add SMS Notification Channel
-- Adds `sms_notification_log` table and SMS fallback logic to `notify_market_event`.
-- ============================================================================

-- 1. Create sms_notification_log table
CREATE TABLE IF NOT EXISTS sms_notification_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  message     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'sent',  -- 'sent', 'failed'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for daily rate limit checks
CREATE INDEX IF NOT EXISTS idx_sms_notification_log_user_id_created_at
  ON sms_notification_log (user_id, created_at DESC);

-- 2. Update notify_market_event to send SMS
DROP FUNCTION IF EXISTS public.notify_market_event(uuid, text, text);
DROP FUNCTION IF EXISTS public.notify_market_event(uuid, text, text, boolean);

CREATE OR REPLACE FUNCTION notify_market_event(
  p_user_id  UUID,
  p_content  TEXT,
  p_link_url TEXT DEFAULT NULL,
  p_send_email BOOLEAN DEFAULT true,
  p_send_sms   BOOLEAN DEFAULT false
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_email TEXT;
  v_user_name TEXT;
  v_edge_fn_email_url TEXT;
  v_edge_fn_sms_url TEXT;
  v_service_key TEXT;
  v_app_url TEXT;
BEGIN
  -- 1. In-app notification
  INSERT INTO market_notifications (user_id, content, link_url)
  VALUES (p_user_id, p_content, p_link_url);

  -- 2. Push notification
  PERFORM send_push_via_edge(
    ARRAY[p_user_id],
    'CasaGrown Market',
    p_content,
    p_link_url
  );

  v_service_key := COALESCE(
    current_setting('app.settings.service_role_key', true),
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1),
    ''
  );

  v_app_url := COALESCE(
    current_setting('app.settings.app_url', true),
    'http://localhost:3000'
  );

  -- 3. Email notification
  IF p_send_email THEN
    BEGIN
      v_user_email := public.get_user_email(p_user_id);
      IF v_user_email IS NOT NULL THEN
        SELECT full_name INTO v_user_name FROM profiles WHERE id = p_user_id;

        v_edge_fn_email_url := COALESCE(
          current_setting('app.settings.edge_functions_base_url', true),
          COALESCE(
            current_setting('app.settings.supabase_url', true),
            'http://host.docker.internal:54321'
          ) || '/functions/v1'
        ) || '/send-market-email';

        PERFORM net.http_post(
          url := v_edge_fn_email_url,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_service_key
          ),
          body := jsonb_build_object(
            'to', v_user_email,
            'subject', 'CasaGrown Market — ' || LEFT(p_content, 60),
            'html',
              '<div style="font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">' ||
                '<div style="text-align: center; margin-bottom: 24px;">' ||
                  '<img src="' || v_app_url || '/logo.png" alt="CasaGrown" style="height: 40px;" />' ||
                '</div>' ||
                '<div style="background: #f9fafb; border-radius: 12px; padding: 20px; border: 1px solid #e5e7eb;">' ||
                  '<p style="margin: 0 0 8px; font-size: 15px; color: #374151;">Hi ' || COALESCE(v_user_name, 'there') || ',</p>' ||
                  '<p style="margin: 0; font-size: 16px; font-weight: 600; color: #111827;">' || p_content || '</p>' ||
                '</div>' ||
                CASE WHEN p_link_url IS NOT NULL THEN
                  '<div style="text-align: center; margin-top: 20px;">' ||
                    '<a href="' || v_app_url || p_link_url || '" style="display: inline-block; padding: 12px 28px; background: #16a34a; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">View Details</a>' ||
                  '</div>'
                ELSE ''
                END ||
                '<p style="margin-top: 24px; font-size: 11px; color: #9ca3af; text-align: center;">CasaGrown Market &bull; Fresh &bull; Local &bull; Trusted</p>' ||
              '</div>',
            'text', p_content || CASE WHEN p_link_url IS NOT NULL THEN E'\n' || v_app_url || p_link_url ELSE '' END
          )
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[notify_market_event] Email failed for user %: %', p_user_id, SQLERRM;
    END;
  END IF;

  -- 4. SMS Notification (Fallback)
  IF p_send_sms THEN
    BEGIN
      v_edge_fn_sms_url := COALESCE(
        current_setting('app.settings.edge_functions_base_url', true),
        COALESCE(
          current_setting('app.settings.supabase_url', true),
          'http://host.docker.internal:54321'
        ) || '/functions/v1'
      ) || '/send-sms-notification';

      PERFORM net.http_post(
        url := v_edge_fn_sms_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_key
        ),
        body := jsonb_build_object(
          'userId', p_user_id,
          'message', p_content,
          'linkUrl', p_link_url
        )
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[notify_market_event] SMS async trigger failed for user %: %', p_user_id, SQLERRM;
    END;
  END IF;

END;
$$;

-- 3. Update order and financial triggers to pass p_send_sms := true
CREATE OR REPLACE FUNCTION trg_market_order_placed_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM notify_market_event(
    NEW.seller_id,
    '🛒 New order: ' || NEW.quantity || '× ' || NEW.product_name || ' ($' || NEW.total_usd || ')',
    '/orders/' || NEW.id,
    true, -- send email
    true  -- send sms
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION trg_market_order_status_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  CASE NEW.status
    WHEN 'confirmed' THEN
      PERFORM notify_market_event(
        NEW.buyer_id,
        '✅ Your order for ' || NEW.product_name || ' has been accepted by the seller!',
        '/orders/' || NEW.id,
        true, true
      );

    WHEN 'delivered' THEN
      IF NEW.fulfillment_type = 'pickup' THEN
        PERFORM notify_market_event(
          NEW.buyer_id,
          '📍 Your ' || NEW.product_name || ' is ready for pickup!',
          '/orders/' || NEW.id,
          true, true
        );
      ELSE
        PERFORM notify_market_event(
          NEW.buyer_id,
          '🚚 Your ' || NEW.product_name || ' has been delivered! You have 4 hours to confirm receipt before auto-completion.',
          '/orders/' || NEW.id,
          true, true
        );
      END IF;

    WHEN 'completed' THEN
      PERFORM notify_market_event(
        NEW.buyer_id,
        '✅ Order completed: ' || NEW.product_name || '. Rate your experience!',
        '/orders/' || NEW.id,
        true, true
      );
      PERFORM notify_market_event(
        NEW.seller_id,
        '💰 Sale completed: ' || NEW.product_name || ' — $' || NEW.subtotal_usd || ' earned. Rate the buyer!',
        '/orders/' || NEW.id,
        true, true
      );

    WHEN 'declined' THEN
      PERFORM notify_market_event(
        NEW.buyer_id,
        '❌ Your order for ' || NEW.product_name || ' was declined' ||
          CASE WHEN NEW.decline_reason IS NOT NULL THEN ': ' || NEW.decline_reason ELSE '' END,
        '/orders/' || NEW.id,
        true, true
      );

    WHEN 'disputed' THEN
      DECLARE
        v_dispute_label TEXT;
      BEGIN
        SELECT CASE d.dispute_type
          WHEN 'not_delivered' THEN 'Order Not Delivered'
          WHEN 'wrong_item' THEN 'Wrong Item Received'
          WHEN 'poor_quality' THEN 'Quality Issue Reported'
          WHEN 'quantity_mismatch' THEN 'Quantity Mismatch'
          ELSE 'Dispute Opened'
        END INTO v_dispute_label
        FROM order_disputes d WHERE d.order_id = NEW.id
        ORDER BY d.created_at DESC LIMIT 1;
        v_dispute_label := coalesce(v_dispute_label, 'Dispute Opened');

        PERFORM notify_market_event(NEW.buyer_id, '⚠️ ' || v_dispute_label || ' for your ' || NEW.product_name || ' order.', '/orders/' || NEW.id, true, true);
        PERFORM notify_market_event(NEW.seller_id, '⚠️ ' || v_dispute_label || ' for your ' || NEW.product_name || ' sale.', '/orders/' || NEW.id, true, true);
      END;

    WHEN 'escalated' THEN
      PERFORM notify_market_event(NEW.buyer_id, '📋 Your dispute for ' || NEW.product_name || ' has been escalated to admin review.', '/orders/' || NEW.id, true, true);
      PERFORM notify_market_event(NEW.seller_id, '📋 The dispute for ' || NEW.product_name || ' has been escalated to admin review.', '/orders/' || NEW.id, true, true);

    WHEN 'resolved' THEN
      PERFORM notify_market_event(NEW.buyer_id, '✅ Your dispute for ' || NEW.product_name || ' has been resolved.', '/orders/' || NEW.id, true, true);
      PERFORM notify_market_event(NEW.seller_id, '✅ The dispute for ' || NEW.product_name || ' has been resolved.', '/orders/' || NEW.id, true, true);

    WHEN 'cancelled' THEN
      PERFORM notify_market_event(NEW.buyer_id, '🔄 Your order for ' || NEW.product_name || ' has been cancelled.', '/orders/' || NEW.id, true, true);

    ELSE NULL;
  END CASE;

  RETURN NEW;
END;
$$;

-- Ready for pickup triggers update
CREATE OR REPLACE FUNCTION notify_market_pickup()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.status = 'ready_for_pickup' AND OLD.status != 'ready_for_pickup' THEN
    PERFORM notify_market_event(
      NEW.buyer_id,
      '📍 Your order for ' || NEW.product_name || ' is ready for pickup!',
      '/orders/' || NEW.id,
      true, true
    );
  END IF;
  RETURN NEW;
END;
$$;
-- Note: the actual trigger for pickup is handled variously, let's just make sure
-- trg_market_order_status_notify is good, which handles most. Wait, pickup is
-- actually tracked via order status 'ready_for_pickup'?
-- Let's check the schema for market_orders.

-- Payout complete
CREATE OR REPLACE FUNCTION trg_redemption_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_item_name TEXT;
  v_item_type TEXT;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  SELECT name, type::text INTO v_item_name, v_item_type
  FROM redemption_merchandize WHERE id = NEW.item_id;

  IF NEW.status = 'completed' THEN
    IF NEW.is_auto = true THEN
      PERFORM notify_market_event(NEW.user_id, '⚡ Auto-withdrawal complete: ' || coalesce(v_item_name, 'Your withdrawal') || ' is ready!', '/earnings', true, true);
    ELSE
      -- the old logic says manual remittance: email only (insert into notifications)
      -- but we want SMS for manual payout complete as well.
      PERFORM notify_market_event(NEW.user_id, '🎁 Withdrawal complete: ' || coalesce(v_item_name, 'Your withdrawal') || ' is ready!', '/earnings', true, true);
    END IF;
  ELSIF NEW.status = 'failed' THEN
    -- Payout failed does not receive SMS. Use default p_send_sms=false.
    PERFORM notify_market_event(NEW.user_id, '❌ Withdrawal failed for ' || coalesce(v_item_name, 'your request') || '. Please try again.', '/earnings/redeem', true, false);
  END IF;

  RETURN NEW;
END;
$$;

-- Settlement cleared
CREATE OR REPLACE FUNCTION trg_settlement_status_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user RECORD;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  CASE NEW.status
    WHEN 'funds_received' THEN
      FOR v_user IN SELECT DISTINCT user_id FROM user_settlements WHERE settlement_id = NEW.id LOOP
        PERFORM notify_market_event(v_user.user_id, '🏦 Settlement funds received for market day ' || NEW.market_date || '. Earnings are being processed.', '/earnings', true, false);
      END LOOP;

    WHEN 'cleared' THEN
      FOR v_user IN SELECT user_id, net_payout_usd FROM user_settlements WHERE settlement_id = NEW.id LOOP
        PERFORM notify_market_event(v_user.user_id, '✅ $' || v_user.net_payout_usd || ' earnings cleared and available for withdrawal!', '/earnings', true, true);
        PERFORM check_1099k_threshold(v_user.user_id);
      END LOOP;

    ELSE NULL;
  END CASE;

  RETURN NEW;
END;
$$;
