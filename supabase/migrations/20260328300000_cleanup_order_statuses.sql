-- ============================================================================
-- Clean up market_order_status enum
--
-- Remove dead statuses: confirmed, delivering, declined, ready_for_pickup, pickup_declined
-- Keep 7 active: pending, delivered, completed, cancelled, disputed, escalated, resolved
-- ============================================================================

-- 1. Fix any existing rows with dead statuses
UPDATE market_orders SET status = 'pending' WHERE status IN ('ready_for_pickup', 'confirmed', 'delivering');
UPDATE market_orders SET status = 'cancelled' WHERE status IN ('declined', 'pickup_declined');

-- 2. Since PostgreSQL doesn't support DROP VALUE from an enum,
--    and we have too many function dependencies to drop/recreate individually,
--    we use the rename approach but skip the column type change entirely.
--    Instead, we just leave the extra enum values as unused dead entries.
--    The UI and RPCs will only use the 7 active values going forward.

-- 3. Drop dead RPCs that reference removed statuses
DROP FUNCTION IF EXISTS seller_mark_delivering(UUID);
DROP FUNCTION IF EXISTS seller_mark_ready_pickup(UUID);
DROP FUNCTION IF EXISTS seller_mark_ready_pickup(UUID, JSONB);
DROP FUNCTION IF EXISTS buyer_decline_pickup(UUID, TEXT, JSONB);
DROP FUNCTION IF EXISTS buyer_confirm_pickup(UUID, TEXT);
DROP FUNCTION IF EXISTS enter_pickup_passcode(UUID, TEXT);

-- 4. Update auto_cancel_stale_orders to only check 'pending'
CREATE OR REPLACE FUNCTION auto_cancel_stale_orders()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rec RECORD;
BEGIN
  FOR v_rec IN
    SELECT * FROM market_orders
    WHERE status = 'pending'
      AND created_at < CURRENT_DATE::TIMESTAMPTZ
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE market_orders
    SET status = 'cancelled', updated_at = now()
    WHERE id = v_rec.id;

    UPDATE market_products
    SET inventory = inventory + v_rec.quantity, updated_at = now()
    WHERE id = v_rec.product_id;

    INSERT INTO notifications (user_id, content, link_url)
    VALUES
      (v_rec.buyer_id, 'Order for "' || v_rec.product_name || '" was auto-cancelled (market day ended). ✕', '/orders/' || v_rec.id),
      (v_rec.seller_id, 'Order for "' || v_rec.product_name || '" was auto-cancelled (market day ended). ✕', '/orders/' || v_rec.id);
  END LOOP;
END;
$$;

-- 5. Update seller_mark_delivered to only accept 'pending' (not 'delivering')
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

  INSERT INTO notifications (user_id, content, link_url)
  VALUES (v_order.buyer_id,
    CASE v_order.fulfillment_type
      WHEN 'delivery' THEN '📦 Your ' || v_order.product_name || ' has been delivered! Confirm within 4 hours.'
      ELSE '📦 Your ' || v_order.product_name || ' is ready! Confirm pickup within 4 hours.'
    END,
    '/orders/' || v_order.id);

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 6. Update get_helper_queue to only show pending/delivered (not confirming/delivering/ready_for_pickup)
CREATE OR REPLACE FUNCTION get_helper_queue()
RETURNS TABLE (
  order_id UUID,
  product_name TEXT,
  quantity INTEGER,
  status market_order_status,
  fulfillment_type TEXT,
  buyer_name TEXT,
  booth_name TEXT,
  booth_id UUID,
  seller_name TEXT,
  total_usd NUMERIC(10,2),
  created_at TIMESTAMPTZ,
  delivered_by_name TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  RETURN QUERY
  SELECT
    o.id AS order_id,
    o.product_name,
    o.quantity,
    o.status,
    o.fulfillment_type,
    COALESCE(bp.full_name, 'Buyer') AS buyer_name,
    COALESCE(mb.name, 'Booth') AS booth_name,
    o.booth_id,
    COALESCE(sp.full_name, 'Seller') AS seller_name,
    o.total_usd,
    o.created_at,
    dp.full_name AS delivered_by_name
  FROM market_orders o
  JOIN booth_helpers bh ON bh.booth_id = o.booth_id
    AND bh.helper_id = v_uid
    AND bh.status = 'accepted'
  JOIN market_booths mb ON mb.id = o.booth_id
  LEFT JOIN profiles bp ON bp.id = o.buyer_id
  LEFT JOIN profiles sp ON sp.id = o.seller_id
  LEFT JOIN profiles dp ON dp.id = o.delivered_by
  WHERE o.status IN ('pending', 'delivered')
  ORDER BY
    CASE o.status
      WHEN 'pending' THEN 1
      WHEN 'delivered' THEN 2
    END,
    o.created_at DESC;
END;
$$;

-- 7. Clean up notification trigger (remove confirmed/declined cases)
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
        '🚚 Your ' || NEW.product_name || ' has been delivered! Please confirm receipt.',
        '/orders',
        false
      );

    WHEN 'completed' THEN
      PERFORM notify_market_event(
        NEW.buyer_id,
        '✅ Order completed: ' || NEW.product_name || '. Rate your experience!',
        '/orders/' || NEW.id,
        false
      );
      PERFORM notify_market_event(
        NEW.seller_id,
        '💰 Sale completed: ' || NEW.product_name || ' — $' || NEW.subtotal_usd || ' earned. Rate the buyer!',
        '/orders/' || NEW.id,
        false
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
          '/orders',
          false
        );
        PERFORM notify_market_event(
          NEW.seller_id,
          '⚠️ ' || v_dispute_label || ' for your ' || NEW.product_name || ' sale.',
          '/orders',
          false
        );
      END;

    WHEN 'escalated' THEN
      PERFORM notify_market_event(
        NEW.buyer_id,
        '📋 Your dispute for ' || NEW.product_name || ' has been escalated to admin review.',
        '/orders'
      );
      PERFORM notify_market_event(
        NEW.seller_id,
        '📋 The dispute for ' || NEW.product_name || ' has been escalated to admin review.',
        '/orders'
      );

    WHEN 'resolved' THEN
      PERFORM notify_market_event(
        NEW.buyer_id,
        '✅ Your dispute for ' || NEW.product_name || ' has been resolved.',
        '/orders',
        false
      );
      PERFORM notify_market_event(
        NEW.seller_id,
        '✅ The dispute for ' || NEW.product_name || ' has been resolved.',
        '/orders',
        false
      );

    WHEN 'cancelled' THEN
      PERFORM notify_market_event(
        NEW.buyer_id,
        '🔄 Your order for ' || NEW.product_name || ' has been cancelled.',
        '/orders'
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
