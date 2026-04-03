-- ============================================================================
-- 24-Hour Grace Period for Order Auto-Completion / Auto-Cancellation
--
-- Uses product_delivery_windows / product_pickup_windows JSONB on
-- market_products to determine window expiration.
-- Format: {"2026-04-03": [{"id":"8-10","start":"08:00","end":"10:00"}, ...]}
--
-- PICKUP:
--   - Seller must mark "ready for pickup" BEFORE last pickup window ends
--   - If marked ready: auto-COMPLETE 24hr after last window end
--   - If never marked ready: auto-CANCEL 24hr after last window end
--
-- DELIVERY:
--   - On-time (marked delivered before last window end): 4hr auto-complete
--   - Late (marked after window, within 24hr grace): buyer MUST confirm
--   - Never delivered within 24hr grace: auto-CANCEL
-- ============================================================================

-- ──────────────────────────────────────────────────────────────
-- 0. Helper: compute the latest window end timestamp for a product
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _get_latest_window_end(
  p_product_id UUID,
  p_fulfillment_type TEXT
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_windows JSONB;
  v_latest TIMESTAMPTZ := NULL;
  v_date_key TEXT;
  v_slot JSONB;
  v_end_time TEXT;
  v_candidate TIMESTAMPTZ;
BEGIN
  -- Pick the right windows JSONB based on fulfillment type
  IF p_fulfillment_type = 'delivery' THEN
    SELECT product_delivery_windows INTO v_windows
    FROM market_products WHERE id = p_product_id;
  ELSE
    SELECT product_pickup_windows INTO v_windows
    FROM market_products WHERE id = p_product_id;
  END IF;

  IF v_windows IS NULL OR jsonb_typeof(v_windows) != 'object' THEN
    RETURN NULL;
  END IF;

  -- Iterate over date keys: {"2026-04-03": [{...}], "2026-04-04": [{...}]}
  FOR v_date_key IN SELECT jsonb_object_keys(v_windows)
  LOOP
    -- Iterate over slots for this date
    FOR v_slot IN SELECT jsonb_array_elements(v_windows -> v_date_key)
    LOOP
      v_end_time := v_slot ->> 'end';
      IF v_end_time IS NOT NULL THEN
        -- Combine date + end time → timestamp
        v_candidate := (v_date_key || ' ' || v_end_time)::TIMESTAMPTZ;
        IF v_latest IS NULL OR v_candidate > v_latest THEN
          v_latest := v_candidate;
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_latest;
END;
$$;


-- ──────────────────────────────────────────────────────────────
-- 1. seller_mark_ready_pickup — block after window, grace = window_end + 24hr
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION seller_mark_ready_pickup(p_order_id UUID, p_proof JSONB DEFAULT '[]'::jsonb)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order RECORD;
  v_window_end TIMESTAMPTZ;
  v_grace_end TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_order FROM market_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order IS NULL THEN RETURN jsonb_build_object('error', 'Order not found'); END IF;
  IF v_order.seller_id != auth.uid() THEN RETURN jsonb_build_object('error', 'Not authorized'); END IF;
  IF v_order.status != 'pending' THEN RETURN jsonb_build_object('error', 'Can only hand off pending orders'); END IF;
  IF v_order.fulfillment_type != 'pickup' THEN RETURN jsonb_build_object('error', 'Only pickup orders'); END IF;

  -- Compute latest pickup window end from product
  v_window_end := _get_latest_window_end(v_order.product_id, 'pickup');

  -- Seller must mark ready BEFORE the pickup window expires
  IF v_window_end IS NOT NULL AND v_window_end <= now() THEN
    RETURN jsonb_build_object('error', 'Pickup window has expired. You can no longer mark this order as ready.');
  END IF;

  -- Grace period: 24hr after the window end (or 24hr from now if no windows set)
  v_grace_end := COALESCE(v_window_end, now()) + interval '24 hours';

  UPDATE market_orders
  SET status = 'delivered',
      delivered_at = now(),
      delivery_proof = CASE WHEN p_proof::text != '[]' THEN p_proof ELSE delivery_proof END,
      auto_complete_at = v_grace_end,
      updated_at = now()
  WHERE id = p_order_id;

  -- Notification handled by trg_market_order_status_notify trigger

  RETURN jsonb_build_object(
    'success', true,
    'auto_complete_at', v_grace_end
  );
END;
$$;


-- ──────────────────────────────────────────────────────────────
-- 2. seller_mark_delivered — on-time vs late differentiation
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION seller_mark_delivered(
  p_order_id UUID,
  p_photos JSONB DEFAULT '[]',
  p_helper_id UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order RECORD;
  v_is_helper BOOLEAN := false;
  v_window_end TIMESTAMPTZ;
  v_is_late BOOLEAN := false;
  v_auto_complete TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_order FROM market_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order IS NULL THEN RETURN jsonb_build_object('error', 'Order not found'); END IF;

  -- Auth: seller or accepted helper
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

  -- Compute delivery window end
  v_window_end := _get_latest_window_end(v_order.product_id, 'delivery');
  v_is_late := (v_window_end IS NOT NULL AND v_window_end <= now());

  -- Block delivery more than 24hr past window end
  IF v_is_late AND v_window_end + interval '24 hours' <= now() THEN
    RETURN jsonb_build_object('error', 'The 24-hour grace period for late delivery has expired. This order will be auto-cancelled.');
  END IF;

  -- On-time: 4hr auto-complete (existing behavior)
  -- Late:    NULL (buyer MUST explicitly confirm, no auto-complete)
  IF v_is_late THEN
    v_auto_complete := NULL;
  ELSE
    v_auto_complete := now() + interval '4 hours';
  END IF;

  UPDATE market_orders
  SET status = 'delivered',
      delivered_at = now(),
      delivery_proof = p_photos,
      auto_complete_at = v_auto_complete,
      updated_at = now()
  WHERE id = p_order_id;

  -- Notification handled by trg_market_order_status_notify trigger

  RETURN jsonb_build_object('success', true, 'is_late', v_is_late);
END;
$$;


-- ──────────────────────────────────────────────────────────────
-- 3. Update notification trigger — fulfillment-aware messages
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_market_order_status_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_is_late BOOLEAN := false;
  v_window_end TIMESTAMPTZ;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  CASE NEW.status
    WHEN 'delivered' THEN
      -- Check if this is a late delivery for messaging
      v_window_end := _get_latest_window_end(NEW.product_id, NEW.fulfillment_type);
      v_is_late := (v_window_end IS NOT NULL AND v_window_end <= now());

      PERFORM notify_market_event(
        NEW.buyer_id,
        CASE
          WHEN NEW.fulfillment_type = 'delivery' AND v_is_late THEN
            '🚚 Your ' || NEW.product_name || ' has been delivered (late). Please confirm receipt — no auto-confirmation for late deliveries.'
          WHEN NEW.fulfillment_type = 'delivery' THEN
            '🚚 Your ' || NEW.product_name || ' has been delivered! Please confirm receipt within 4 hours.'
          ELSE
            '📍 Your ' || NEW.product_name || ' is ready for pickup! Confirm within 24 hours of the pickup window.'
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

DROP TRIGGER IF EXISTS trg_market_order_status_notifications ON market_orders;
CREATE TRIGGER trg_market_order_status_notifications
  AFTER UPDATE OF status ON market_orders
  FOR EACH ROW
  EXECUTE FUNCTION trg_market_order_status_notify();


-- ──────────────────────────────────────────────────────────────
-- 4. auto_complete_delivered_orders — rewritten with window-based logic
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION auto_complete_delivered_orders()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_count INTEGER := 0;
  v_rec RECORD;
  v_window_end TIMESTAMPTZ;
BEGIN

  -- ────────────────────────────────────────────
  -- PATH 1: On-time delivered orders past auto_complete_at
  --         (delivery: 4hr timer, pickup: window_end + 24hr timer)
  --         → AUTO-COMPLETE
  -- ────────────────────────────────────────────
  FOR v_rec IN
    SELECT id, buyer_id, seller_id, product_name, fulfillment_type
    FROM market_orders
    WHERE status = 'delivered'
      AND auto_complete_at IS NOT NULL
      AND auto_complete_at <= now()
    FOR UPDATE
  LOOP
    UPDATE market_orders
    SET status = 'completed', completed_at = now(), updated_at = now()
    WHERE id = v_rec.id;

    -- Notify seller
    PERFORM notify_market_event(
      v_rec.seller_id,
      CASE v_rec.fulfillment_type
        WHEN 'pickup' THEN
          '✅ Pickup order for "' || v_rec.product_name || '" auto-completed — you prepared the order but it was not picked up within the 24-hour grace period. You will be paid.'
        ELSE
          '✅ Order for "' || v_rec.product_name || '" auto-completed — buyer did not respond within 4 hours.'
      END,
      '/orders/' || v_rec.id
    );

    -- Notify buyer
    PERFORM notify_market_event(
      v_rec.buyer_id,
      CASE v_rec.fulfillment_type
        WHEN 'pickup' THEN
          '📍 Your pickup order for "' || v_rec.product_name || '" was auto-completed. The seller prepared your order but it was not picked up within 24 hours of the pickup window.'
        ELSE
          '📦 Your order for "' || v_rec.product_name || '" was auto-completed. Delivery was not confirmed within 4 hours.'
      END,
      '/orders/' || v_rec.id
    );

    -- Generate receipt
    PERFORM _complete_market_order_with_receipt(v_rec.id);

    v_count := v_count + 1;
  END LOOP;

  -- ────────────────────────────────────────────
  -- PATH 2: Late-delivered DELIVERY orders (auto_complete_at IS NULL)
  --         where window_end + 24hr has passed
  --         and buyer never confirmed
  --         → AUTO-CANCEL
  -- ────────────────────────────────────────────
  FOR v_rec IN
    SELECT mo.id, mo.buyer_id, mo.seller_id, mo.product_name, mo.product_id, mo.quantity
    FROM market_orders mo
    WHERE mo.status = 'delivered'
      AND mo.fulfillment_type = 'delivery'
      AND mo.auto_complete_at IS NULL
    FOR UPDATE
  LOOP
    v_window_end := _get_latest_window_end(v_rec.product_id, 'delivery');
    -- Products always have windows; skip if somehow missing
    IF v_window_end IS NULL THEN CONTINUE; END IF;

    IF v_window_end IS NOT NULL AND v_window_end + interval '24 hours' <= now() THEN
      UPDATE market_orders
      SET status = 'cancelled',
          decline_reason = 'Auto-cancelled: late delivery was not confirmed by buyer within the 24-hour grace period.',
          updated_at = now()
      WHERE id = v_rec.id;

      -- Restore inventory
      UPDATE market_products
      SET inventory = inventory + v_rec.quantity, updated_at = now()
      WHERE id = v_rec.product_id;

      PERFORM notify_market_event(
        v_rec.seller_id,
        '🔄 Late delivery of "' || v_rec.product_name || '" was auto-cancelled — buyer did not confirm receipt within the 24-hour grace period.',
        '/orders/' || v_rec.id
      );
      PERFORM notify_market_event(
        v_rec.buyer_id,
        '🔄 Your order for "' || v_rec.product_name || '" was auto-cancelled — late delivery was not confirmed within the grace period. You will not be charged.',
        '/orders/' || v_rec.id
      );

      v_count := v_count + 1;
    END IF;
  END LOOP;

  -- ────────────────────────────────────────────
  -- PATH 3: Pending DELIVERY orders — seller never delivered
  --         past window_end + 24hr
  --         → AUTO-CANCEL
  -- ────────────────────────────────────────────
  FOR v_rec IN
    SELECT mo.id, mo.buyer_id, mo.seller_id, mo.product_name, mo.product_id, mo.quantity
    FROM market_orders mo
    WHERE mo.status = 'pending'
      AND mo.fulfillment_type = 'delivery'
    FOR UPDATE
  LOOP
    v_window_end := _get_latest_window_end(v_rec.product_id, 'delivery');
    IF v_window_end IS NULL THEN CONTINUE; END IF;

    IF v_window_end IS NOT NULL AND v_window_end + interval '24 hours' <= now() THEN
      UPDATE market_orders
      SET status = 'cancelled',
          decline_reason = 'Auto-cancelled: seller did not deliver within the 24-hour grace period after the delivery window.',
          updated_at = now()
      WHERE id = v_rec.id;

      UPDATE market_products
      SET inventory = inventory + v_rec.quantity, updated_at = now()
      WHERE id = v_rec.product_id;

      PERFORM notify_market_event(
        v_rec.seller_id,
        '🔄 Order for "' || v_rec.product_name || '" auto-cancelled — not delivered within the 24-hour grace period.',
        '/orders/' || v_rec.id
      );
      PERFORM notify_market_event(
        v_rec.buyer_id,
        '🔄 Your order for "' || v_rec.product_name || '" was auto-cancelled — the seller did not deliver within the 24-hour grace period. You will not be charged.',
        '/orders/' || v_rec.id
      );

      v_count := v_count + 1;
    END IF;
  END LOOP;

  -- ────────────────────────────────────────────
  -- PATH 4: Pending PICKUP orders — seller never marked ready
  --         past window_end + 24hr
  --         → AUTO-CANCEL
  -- ────────────────────────────────────────────
  FOR v_rec IN
    SELECT mo.id, mo.buyer_id, mo.seller_id, mo.product_name, mo.product_id, mo.quantity
    FROM market_orders mo
    WHERE mo.status = 'pending'
      AND mo.fulfillment_type = 'pickup'
    FOR UPDATE
  LOOP
    v_window_end := _get_latest_window_end(v_rec.product_id, 'pickup');
    IF v_window_end IS NULL THEN CONTINUE; END IF;

    IF v_window_end IS NOT NULL AND v_window_end + interval '24 hours' <= now() THEN
      UPDATE market_orders
      SET status = 'cancelled',
          decline_reason = 'Auto-cancelled: seller did not prepare order for pickup within the 24-hour grace period.',
          updated_at = now()
      WHERE id = v_rec.id;

      UPDATE market_products
      SET inventory = inventory + v_rec.quantity, updated_at = now()
      WHERE id = v_rec.product_id;

      PERFORM notify_market_event(
        v_rec.seller_id,
        '🔄 Pickup order for "' || v_rec.product_name || '" auto-cancelled — not prepared within the 24-hour grace period.',
        '/orders/' || v_rec.id
      );
      PERFORM notify_market_event(
        v_rec.buyer_id,
        '🔄 Your pickup order for "' || v_rec.product_name || '" was auto-cancelled — the seller did not prepare it within the 24-hour grace period. You will not be charged.',
        '/orders/' || v_rec.id
      );

      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;


-- ──────────────────────────────────────────────────────────────
-- 5. settle_stale_orders — delegate to unified cron function
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION settle_stale_orders()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RETURN auto_complete_delivered_orders();
END;
$$;


-- ──────────────────────────────────────────────────────────────
-- 6. helper_mark_delivered — align with window-based late detection
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION helper_mark_delivered(
  p_order_id UUID,
  p_proof_urls TEXT[] DEFAULT '{}'
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_order RECORD;
  v_helper_name TEXT;
  v_window_end TIMESTAMPTZ;
  v_is_late BOOLEAN := false;
  v_auto_complete TIMESTAMPTZ;
BEGIN
  SELECT o.*, mb.name AS booth_name, mb.owner_id
  INTO v_order
  FROM market_orders o
  JOIN market_booths mb ON mb.id = o.booth_id
  WHERE o.id = p_order_id;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('error', 'Order not found');
  END IF;

  IF NOT is_booth_helper(v_order.booth_id) THEN
    RETURN jsonb_build_object('error', 'Not authorized — you are not a helper for this booth');
  END IF;

  IF v_order.status NOT IN ('pending', 'confirmed', 'delivering') THEN
    RETURN jsonb_build_object('error', 'Order cannot be delivered in its current state: ' || v_order.status);
  END IF;

  SELECT full_name INTO v_helper_name FROM profiles WHERE id = v_uid;

  -- Check if late using delivery windows
  v_window_end := _get_latest_window_end(v_order.product_id, v_order.fulfillment_type);
  v_is_late := (v_window_end IS NOT NULL AND v_window_end <= now());

  IF v_is_late THEN
    v_auto_complete := NULL;  -- buyer must confirm for late deliveries
  ELSE
    v_auto_complete := NOW() + INTERVAL '4 hours';  -- on-time: existing behavior
  END IF;

  UPDATE market_orders SET
    status = 'delivered',
    delivered_at = NOW(),
    delivered_by = v_uid,
    delivery_proof = CASE
      WHEN array_length(p_proof_urls, 1) > 0
      THEN to_jsonb(p_proof_urls)
      ELSE delivery_proof
    END,
    auto_complete_at = v_auto_complete,
    updated_at = NOW()
  WHERE id = p_order_id;

  PERFORM notify_market_event(
    v_order.owner_id,
    '📦 ' || COALESCE(v_helper_name, 'A helper') || ' delivered ' || v_order.product_name || ' to the buyer.',
    '/orders/' || p_order_id
  );

  PERFORM notify_market_event(
    v_order.buyer_id,
    '📦 Your ' || v_order.product_name || ' has been delivered by ' || COALESCE(v_helper_name, 'a helper') || '. Confirm receipt!',
    '/orders/' || p_order_id
  );

  RETURN jsonb_build_object('success', true, 'is_late', v_is_late);
END;
$$;
