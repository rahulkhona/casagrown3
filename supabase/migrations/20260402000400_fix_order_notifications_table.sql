-- ===========================================================================
-- Fix: Migrate order functions from old 'notifications' table to
-- notify_market_event / rely on trg_market_order_status_notify trigger
--
-- Functions that change market_orders.status: the trigger already handles
-- notification, so we just REMOVE the stale INSERT INTO notifications.
--
-- Functions that DON'T change order status (e.g. seller_respond_dispute):
-- we REPLACE with PERFORM notify_market_event(...).
-- ===========================================================================

-- 1. buyer_confirm_delivery
-- Sets status='completed' → trigger fires → remove stale insert
CREATE OR REPLACE FUNCTION buyer_confirm_delivery(p_order_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_order RECORD;
BEGIN
  SELECT * INTO v_order FROM market_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order IS NULL THEN RETURN jsonb_build_object('error', 'Order not found'); END IF;
  IF v_order.buyer_id != auth.uid() THEN RETURN jsonb_build_object('error', 'Not authorized'); END IF;
  IF v_order.status != 'delivered' THEN RETURN jsonb_build_object('error', 'Order is not in delivered status'); END IF;

  UPDATE market_orders SET status = 'completed', completed_at = now(), updated_at = now() WHERE id = p_order_id;
  -- NOTE: notification handled by trg_market_order_status_notify on status → completed

  -- Generate receipt + send receipt emails
  PERFORM _complete_market_order_with_receipt(p_order_id);

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 2. buyer_resolve_dispute
-- Sets market_orders.status='resolved' → trigger fires → remove stale insert
CREATE OR REPLACE FUNCTION buyer_resolve_dispute(p_dispute_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_dispute RECORD;
  v_order RECORD;
BEGIN
  SELECT * INTO v_dispute FROM order_disputes WHERE id = p_dispute_id FOR UPDATE;
  IF v_dispute IS NULL THEN RETURN jsonb_build_object('error', 'Dispute not found'); END IF;

  SELECT * INTO v_order FROM market_orders WHERE id = v_dispute.order_id;
  IF v_order.buyer_id != auth.uid() THEN RETURN jsonb_build_object('error', 'Not authorized'); END IF;
  IF v_dispute.status IN ('buyer_accepted', 'staff_resolved') THEN RETURN jsonb_build_object('error', 'Already resolved'); END IF;

  UPDATE order_disputes SET status = 'buyer_accepted', resolved_at = now(), updated_at = now() WHERE id = p_dispute_id;
  UPDATE market_orders SET status = 'resolved', updated_at = now() WHERE id = v_dispute.order_id;
  -- NOTE: notification handled by trg_market_order_status_notify on status → resolved

  -- Natively inject into chat
  INSERT INTO order_chat_messages (order_id, sender_id, content)
  VALUES (v_order.id, auth.uid(), '✅ Issue resolved — dispute withdrawn.');

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 3. seller_respond_dispute
-- Does NOT change market_orders.status → must use notify_market_event directly
CREATE OR REPLACE FUNCTION seller_respond_dispute(p_dispute_id UUID, p_refund_type TEXT, p_refund_amount NUMERIC, p_pickup_offered BOOLEAN DEFAULT false)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_dispute RECORD;
  v_order RECORD;
  v_amt_str TEXT;
BEGIN
  SELECT * INTO v_dispute FROM order_disputes WHERE id = p_dispute_id FOR UPDATE;
  IF v_dispute IS NULL THEN RETURN jsonb_build_object('error', 'Dispute not found'); END IF;

  SELECT * INTO v_order FROM market_orders WHERE id = v_dispute.order_id;
  IF v_order.seller_id != auth.uid() THEN RETURN jsonb_build_object('error', 'Not authorized'); END IF;
  IF v_dispute.status != 'open' THEN RETURN jsonb_build_object('error', 'Dispute already responded to'); END IF;

  UPDATE order_disputes
  SET status = 'seller_responded',
      refund_type = p_refund_type,
      refund_amount_usd = p_refund_amount,
      pickup_offered = p_pickup_offered,
      updated_at = now()
  WHERE id = p_dispute_id;

  -- Notify buyer via bell + push + email
  PERFORM notify_market_event(
    v_order.buyer_id,
    '💰 Seller responded to your dispute for ' || v_order.product_name || ' with a ' || p_refund_type || ' refund offer.',
    '/orders/' || v_order.id
  );

  -- Natively inject into chat feed
  v_amt_str := TO_CHAR(p_refund_amount, 'FM999999999.00');
  INSERT INTO order_chat_messages (order_id, sender_id, content)
  VALUES (v_order.id, auth.uid(), '💰 Refund offered: ' || (CASE WHEN p_refund_type='full' THEN 'Full' ELSE 'Partial' END) || ' refund of $' || v_amt_str);

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 4. escalate_dispute
-- Sets market_orders.status='escalated' → trigger fires → remove stale insert
CREATE OR REPLACE FUNCTION escalate_dispute(p_dispute_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_dispute RECORD;
  v_order RECORD;
BEGIN
  SELECT * INTO v_dispute FROM order_disputes WHERE id = p_dispute_id FOR UPDATE;
  IF v_dispute IS NULL THEN RETURN jsonb_build_object('error', 'Dispute not found'); END IF;

  SELECT * INTO v_order FROM market_orders WHERE id = v_dispute.order_id;
  IF v_order.buyer_id != auth.uid() AND v_order.seller_id != auth.uid() THEN
    RETURN jsonb_build_object('error', 'Not authorized');
  END IF;
  IF v_dispute.status IN ('buyer_accepted', 'staff_resolved') THEN
    RETURN jsonb_build_object('error', 'Dispute already resolved');
  END IF;

  UPDATE order_disputes SET status = 'escalated', updated_at = now() WHERE id = p_dispute_id;
  UPDATE market_orders SET status = 'escalated', updated_at = now() WHERE id = v_dispute.order_id;
  -- NOTE: notification handled by trg_market_order_status_notify on status → escalated

  -- Natively inject into chat
  INSERT INTO order_chat_messages (order_id, sender_id, content)
  VALUES (v_order.id, auth.uid(), '🔺 Dispute escalated to CasaGrown staff for review.');

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 5. auto_complete_delivered_orders
-- Sets status='completed' → trigger fires → remove stale insert
CREATE OR REPLACE FUNCTION auto_complete_delivered_orders()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_count INTEGER := 0;
  v_rec RECORD;
BEGIN
  -- 1. Auto-complete 'delivered' orders past their auto_complete_at (4hr window)
  FOR v_rec IN
    SELECT id, buyer_id, seller_id, product_name
    FROM market_orders
    WHERE status = 'delivered'
      AND auto_complete_at IS NOT NULL
      AND auto_complete_at <= now()
    FOR UPDATE
  LOOP
    UPDATE market_orders
    SET status = 'completed', completed_at = now(), updated_at = now()
    WHERE id = v_rec.id;
    -- NOTE: notification handled by trg_market_order_status_notify on status → completed

    -- Generate receipt + send receipt emails
    PERFORM _complete_market_order_with_receipt(v_rec.id);

    v_count := v_count + 1;
  END LOOP;

  -- 2. Auto-complete pending pickup orders whose product has expired
  FOR v_rec IN
    SELECT mo.id, mo.buyer_id, mo.seller_id, mo.product_name, mo.product_id
    FROM market_orders mo
    JOIN market_products mp ON mp.id = mo.product_id
    WHERE mo.status = 'pending'
      AND mo.fulfillment_type = 'pickup'
      AND mp.expires_at IS NOT NULL
      AND mp.expires_at <= now()
    FOR UPDATE OF mo
  LOOP
    UPDATE market_orders
    SET status = 'completed', completed_at = now(), updated_at = now()
    WHERE id = v_rec.id;
    -- NOTE: notification handled by trg_market_order_status_notify on status → completed

    -- Generate receipt + send receipt emails
    PERFORM _complete_market_order_with_receipt(v_rec.id);

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- 6. settle_stale_orders
-- Auto-cancels pending orders from before today, sets status='cancelled' → trigger fires
CREATE OR REPLACE FUNCTION settle_stale_orders()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_count INTEGER := 0;
  v_rec RECORD;
BEGIN
  -- Cancel pending delivery orders from before today (undelivered)
  FOR v_rec IN
    SELECT id, buyer_id, seller_id, product_id, product_name, quantity
    FROM market_orders
    WHERE status = 'pending'
      AND fulfillment_type = 'delivery'
      AND created_at < CURRENT_DATE
    FOR UPDATE
  LOOP
    UPDATE market_orders
    SET status = 'cancelled',
        decline_reason = 'Auto-cancelled: undelivered by end of market day',
        updated_at = now()
    WHERE id = v_rec.id;
    -- NOTE: notification handled by trg_market_order_status_notify on status → cancelled

    -- Restore inventory
    UPDATE market_products
    SET inventory = inventory + v_rec.quantity, updated_at = now()
    WHERE id = v_rec.product_id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- 7. auto_cancel_stale_orders (if exists, same pattern)
-- Sets status='cancelled' → trigger fires → remove stale insert
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'auto_cancel_stale_orders') THEN
    EXECUTE $func$
    CREATE OR REPLACE FUNCTION auto_cancel_stale_orders()
    RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $inner$
    DECLARE
      v_count INTEGER := 0;
      v_rec RECORD;
    BEGIN
      -- Cancel pending delivery orders from before today
      FOR v_rec IN
        SELECT id, buyer_id, seller_id, product_id, product_name, quantity
        FROM market_orders
        WHERE status = 'pending'
          AND fulfillment_type = 'delivery'
          AND created_at < CURRENT_DATE
        FOR UPDATE
      LOOP
        UPDATE market_orders
        SET status = 'cancelled',
            decline_reason = 'Auto-cancelled: undelivered by end of market day',
            updated_at = now()
        WHERE id = v_rec.id;
        -- NOTE: notification handled by trg_market_order_status_notify

        UPDATE market_products
        SET inventory = inventory + v_rec.quantity, updated_at = now()
        WHERE id = v_rec.product_id;

        v_count := v_count + 1;
      END LOOP;

      RETURN v_count;
    END;
    $inner$;
    $func$;
  END IF;
END;
$$;
