-- ============================================================================
-- Fix: delivered notification uses fulfillment-type-aware messaging
-- Also removes duplicate notification from seller_mark_delivered RPC
-- (the trigger handles it via market_notifications + push)
-- ============================================================================

-- 1. Fix the trigger to show correct message for pickup vs delivery
DROP TRIGGER IF EXISTS trg_market_order_status_notifications ON market_orders;
DROP FUNCTION IF EXISTS trg_market_order_status_notify() CASCADE;

CREATE OR REPLACE FUNCTION trg_market_order_status_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  CASE NEW.status
    WHEN 'delivered' THEN
      PERFORM notify_market_event(
        NEW.buyer_id,
        CASE NEW.fulfillment_type
          WHEN 'delivery' THEN '🚚 Your ' || NEW.product_name || ' has been delivered! Please confirm receipt.'
          ELSE '📍 Your ' || NEW.product_name || ' is ready for pickup! Confirm within 4 hours.'
        END,
        '/orders/' || NEW.id
      );

    WHEN 'completed' THEN
      PERFORM notify_market_event(
        NEW.buyer_id,
        '✅ Order completed: ' || NEW.product_name || '. Rate your experience!',
        '/orders/' || NEW.id
      );
      PERFORM notify_market_event(
        NEW.seller_id,
        '💰 Sale completed: ' || NEW.product_name || ' — $' || NEW.subtotal_usd || ' earned. Rate the buyer!',
        '/orders/' || NEW.id
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

        PERFORM notify_market_event(
          NEW.buyer_id,
          '⚠️ ' || v_dispute_label || ' for your ' || NEW.product_name || ' order.',
          '/orders/' || NEW.id
        );
        PERFORM notify_market_event(
          NEW.seller_id,
          '⚠️ ' || v_dispute_label || ' for your ' || NEW.product_name || ' sale.',
          '/orders/' || NEW.id
        );
      END;

    WHEN 'escalated' THEN
      PERFORM notify_market_event(
        NEW.buyer_id,
        '📋 Your dispute for ' || NEW.product_name || ' has been escalated to admin review.',
        '/orders/' || NEW.id
      );
      PERFORM notify_market_event(
        NEW.seller_id,
        '📋 The dispute for ' || NEW.product_name || ' has been escalated to admin review.',
        '/orders/' || NEW.id
      );

    WHEN 'resolved' THEN
      PERFORM notify_market_event(
        NEW.buyer_id,
        '✅ Your dispute for ' || NEW.product_name || ' has been resolved.',
        '/orders/' || NEW.id
      );
      PERFORM notify_market_event(
        NEW.seller_id,
        '✅ The dispute for ' || NEW.product_name || ' has been resolved.',
        '/orders/' || NEW.id
      );

    WHEN 'cancelled' THEN
      PERFORM notify_market_event(
        NEW.buyer_id,
        '🔄 Your order for ' || NEW.product_name || ' has been cancelled.',
        '/orders/' || NEW.id
      );

    ELSE
      NULL;
  END CASE;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_market_order_status_notifications
  AFTER UPDATE OF status ON market_orders
  FOR EACH ROW
  EXECUTE FUNCTION trg_market_order_status_notify();

-- 2. Remove the duplicate notification INSERT from seller_mark_delivered
--    (the trigger above handles it with correct market_notifications + push)
CREATE OR REPLACE FUNCTION seller_mark_delivered(
  p_order_id UUID,
  p_photos JSONB DEFAULT '[]',
  p_helper_id UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order RECORD;
  v_is_helper BOOLEAN := false;
BEGIN
  SELECT * INTO v_order FROM market_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order IS NULL THEN RETURN jsonb_build_object('error', 'Order not found'); END IF;

  IF v_order.seller_id = auth.uid() THEN
    NULL;
  ELSIF p_helper_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM booth_helpers
      WHERE booth_id = v_order.booth_id
        AND helper_id = auth.uid()
        AND status = 'accepted'
    ) INTO v_is_helper;
    IF NOT v_is_helper THEN RETURN jsonb_build_object('error', 'Not authorized'); END IF;
  ELSE
    RETURN jsonb_build_object('error', 'Not authorized');
  END IF;

  IF v_order.status != 'pending' THEN
    RETURN jsonb_build_object('error', 'Can only deliver pending orders');
  END IF;

  UPDATE market_orders
  SET status = 'delivered',
      delivered_at = now(),
      delivery_proof = p_photos,
      auto_complete_at = now() + INTERVAL '4 hours',
      updated_at = now()
  WHERE id = p_order_id;

  -- NOTE: notification is now handled by trg_market_order_status_notify trigger
  -- which inserts into market_notifications (not old notifications table)
  -- and sends push notification via send_push_via_edge

  RETURN jsonb_build_object('success', true);
END;
$$;
