-- ===========================================================================
-- Fix: delivery notification should mention 4-hour confirm window
-- Fix: seller_decline_order should use 'cancelled' + market_notifications
-- ===========================================================================

-- 1. Update the status notification trigger to include 4-hour window for delivery
CREATE OR REPLACE FUNCTION trg_market_order_status_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_dispute_label TEXT;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  CASE NEW.status
    WHEN 'delivered' THEN
      PERFORM notify_market_event(
        NEW.buyer_id,
        CASE NEW.fulfillment_type
          WHEN 'delivery' THEN '🚚 Your ' || NEW.product_name || ' has been delivered! Confirm receipt within 4 hours.'
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

-- 2. Fix seller_decline_order to use 'cancelled' status and market_notifications
CREATE OR REPLACE FUNCTION seller_decline_order(p_order_id UUID, p_reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_order RECORD;
BEGIN
  SELECT * INTO v_order FROM market_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order IS NULL THEN RETURN jsonb_build_object('error', 'Order not found'); END IF;
  IF v_order.seller_id != auth.uid() THEN RETURN jsonb_build_object('error', 'Not authorized'); END IF;
  IF v_order.status != 'pending' THEN RETURN jsonb_build_object('error', 'Can only decline pending orders'); END IF;

  -- Set status to 'cancelled' (not 'declined') so the trigger can fire
  UPDATE market_orders
  SET status = 'cancelled',
      decline_reason = p_reason,
      updated_at = now()
  WHERE id = p_order_id;

  -- Restore inventory
  UPDATE market_products
  SET inventory = inventory + v_order.quantity,
      updated_at = now()
  WHERE id = v_order.product_id;

  -- NOTE: notification is now handled by trg_market_order_status_notify trigger
  -- which fires on the status change to 'cancelled' and sends bell + push + email

  RETURN jsonb_build_object('success', true);
END;
$$;
