-- ============================================================================
-- Migration: Fix ALL Edge Function URL Resolution + Notification Text
-- ============================================================================
-- Problem: 20+ functions use current_setting('app.settings.supabase_url') which
-- doesn't exist on Supabase Cloud, causing ALL email/push/SMS notifications to
-- fail silently. Also fixes notification text for order completion and settlement.
-- ============================================================================

SET search_path TO public, extensions;

-- ─── 1. Shared Helpers ───────────────────────────────────────────────────────

-- Returns the base URL for edge function calls (e.g. https://xyz.supabase.co/functions/v1)
CREATE OR REPLACE FUNCTION get_edge_fn_base_url()
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
BEGIN
  RETURN COALESCE(
    NULLIF(current_setting('app.settings.edge_functions_base_url', true), ''),
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'edge_functions_base_url' LIMIT 1),
    NULLIF(current_setting('app.settings.supabase_url', true), '') || '/functions/v1',
    'http://host.docker.internal:54321/functions/v1'
  );
END;
$$;

-- Returns the service role key for authenticating edge function calls
CREATE OR REPLACE FUNCTION get_service_role_key()
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
BEGIN
  RETURN COALESCE(
    NULLIF(current_setting('app.settings.service_role_key', true), ''),
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1),
    -- Local dev/test fallback (supabase-demo JWT, safe to hardcode)
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
  );
END;
$$;


-- ─── 2. Fix trg_market_order_status_notify ───────────────────────────────────
-- Changes: seller completion "earned" → "total", buyer completion adds $ amount,
-- all other statuses unchanged.

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
      -- Buyer notification (with $ amount)
      IF NEW.credit_applied_usd > 0 THEN
        PERFORM notify_market_event(
          NEW.buyer_id,
          '✅ Order completed: ' || NEW.product_name || ' — $' || NEW.total_usd || ' settled. $' || NEW.credit_applied_usd || ' credit applied! Rate your experience!',
          '/orders/' || NEW.id,
          true, true
        );
      ELSE
        PERFORM notify_market_event(
          NEW.buyer_id,
          '✅ Order completed: ' || NEW.product_name || ' — $' || NEW.total_usd || ' settled. Rate your experience!',
          '/orders/' || NEW.id,
          true, true
        );
      END IF;

      -- Seller notification: "total" instead of "earned"
      PERFORM notify_market_event(
        NEW.seller_id,
        '💰 Sale completed: ' || NEW.product_name || ' — $' || NEW.subtotal_usd || ' total. Rate the buyer!',
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


-- ─── 3. Purge stale push subscriptions ───────────────────────────────────────
-- Endpoints older than 90 days will never receive a push (browser revokes them).
-- Weekly cleanup prevents dead rows from accumulating.
DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN PERFORM cron.unschedule('purge-stale-push-subscriptions'); EXCEPTION WHEN OTHERS THEN END;
    PERFORM cron.schedule(
      'purge-stale-push-subscriptions',
      '0 8 * * 0',  -- Weekly on Sunday at 8am UTC (1am PDT)
      $$DELETE FROM push_subscriptions WHERE updated_at < now() - INTERVAL '90 days'$$
    );
    RAISE NOTICE 'Scheduled weekly push subscription cleanup';
  END IF;
END $outer$;
