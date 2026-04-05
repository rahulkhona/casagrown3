-- ════════════════════════════════════════════════════════════
-- Migration: Separate "Ready for Pickup" from "Delivered"
--
-- Problem: seller_mark_ready_pickup was setting status='delivered' and
-- delivered_at=now(), conflating two distinct events:
--   1. Seller signals readiness (notification to buyer)
--   2. Actual fulfillment (buyer picks up, seller provides proof)
--
-- Fix:
--   - Add ready_for_pickup_at column
--   - seller_mark_ready_pickup: sets ready_for_pickup_at, keeps status=pending
--   - seller_mark_delivered: sets delivered_at, status=delivered (unchanged)
--   - Auto-complete handles both paths:
--     Path A: ready but no-show → pending→completed after window+24hr
--     Path B: fulfilled, buyer silent → delivered→completed after 4hr
-- ════════════════════════════════════════════════════════════


-- 1. Add the new column
ALTER TABLE market_orders ADD COLUMN IF NOT EXISTS ready_for_pickup_at TIMESTAMPTZ;

-- 2. Backfill: existing pickup orders that went through the old flow
--    have delivered_at set when seller clicked "ready for pickup".
--    Copy that timestamp to the new column.
UPDATE market_orders
SET ready_for_pickup_at = delivered_at
WHERE fulfillment_type = 'pickup'
  AND delivered_at IS NOT NULL
  AND ready_for_pickup_at IS NULL;


-- ────────────────────────────────────────────────────────────
-- 3. Rewrite seller_mark_ready_pickup
--    Now: keeps status=pending, sets ready_for_pickup_at, sets auto_complete_at
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION seller_mark_ready_pickup(
  p_order_id UUID,
  p_proof JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order RECORD;
  v_window_end TIMESTAMPTZ;
  v_grace_end TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_order FROM market_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order IS NULL THEN RETURN jsonb_build_object('error', 'Order not found'); END IF;
  IF v_order.seller_id != auth.uid() THEN RETURN jsonb_build_object('error', 'Not authorized'); END IF;
  IF v_order.status != 'pending' THEN RETURN jsonb_build_object('error', 'Can only mark pending orders as ready'); END IF;
  IF v_order.fulfillment_type != 'pickup' THEN RETURN jsonb_build_object('error', 'Only pickup orders'); END IF;

  -- Prevent double-click
  IF v_order.ready_for_pickup_at IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'Already marked as ready for pickup');
  END IF;

  -- Compute latest pickup window end from product
  v_window_end := _get_latest_window_end(v_order.product_id, 'pickup');

  -- Seller must mark ready BEFORE the pickup window expires
  IF v_window_end IS NOT NULL AND v_window_end <= now() THEN
    RETURN jsonb_build_object('error', 'Pickup window has expired. You can no longer mark this order as ready.');
  END IF;

  -- Grace period: 24hr after the window end (or 24hr from now if no windows set)
  v_grace_end := COALESCE(v_window_end, now()) + interval '24 hours';

  -- Record readiness — status stays 'pending', delivered_at stays NULL
  UPDATE market_orders
  SET ready_for_pickup_at = now(),
      delivery_proof = CASE WHEN p_proof::text != '[]' THEN p_proof ELSE delivery_proof END,
      auto_complete_at = v_grace_end,
      updated_at = now()
  WHERE id = p_order_id;

  -- Notify buyer that their order is ready for pickup
  PERFORM notify_market_event(
    v_order.buyer_id,
    '📍 Your ' || v_order.product_name || ' is ready for pickup! Please pick up before the window closes.',
    '/orders/' || p_order_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'ready_for_pickup_at', now(),
    'auto_complete_at', v_grace_end
  );
END;
$function$;


-- ────────────────────────────────────────────────────────────
-- 4. Update auto_complete_expired_pickups
--    Now handles BOTH paths:
--    Path A: pending + ready_for_pickup_at set + auto_complete_at expired → completed
--    Path B: delivered + auto_complete_at expired → completed (existing behavior)
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION auto_complete_expired_pickups()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order RECORD;
BEGIN
  -- Path B: Delivered orders (pickup or delivery) where auto-complete timer expired
  -- This is the existing behavior: buyer picked up / received, didn't confirm in 4hr
  FOR v_order IN
    SELECT id, buyer_id, seller_id, product_name
    FROM market_orders
    WHERE status = 'delivered'
      AND auto_complete_at IS NOT NULL
      AND auto_complete_at <= now()
  LOOP
    UPDATE market_orders
    SET status = 'completed', completed_at = now(), updated_at = now()
    WHERE id = v_order.id;
    -- trg_market_order_status_notify fires automatically
  END LOOP;

  -- Path A: Pending pickup orders where seller marked ready but buyer never showed up
  -- Grace period (window + 24hr) has expired → auto-complete
  FOR v_order IN
    SELECT id, buyer_id, seller_id, product_name
    FROM market_orders
    WHERE status = 'pending'
      AND fulfillment_type = 'pickup'
      AND ready_for_pickup_at IS NOT NULL
      AND auto_complete_at IS NOT NULL
      AND auto_complete_at <= now()
  LOOP
    UPDATE market_orders
    SET status = 'completed',
        delivered_at = COALESCE(delivered_at, ready_for_pickup_at),  -- backfill for settlements
        completed_at = now(),
        updated_at = now()
    WHERE id = v_order.id;
    -- trg_market_order_status_notify fires automatically
  END LOOP;
END;
$function$;


-- ────────────────────────────────────────────────────────────
-- 5. Update get_escalation_detail_admin
--    Use actual ready_for_pickup_at column, not delivered_at
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_escalation_detail_admin(p_dispute_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_dispute RECORD;
  v_order RECORD;
  v_messages JSONB;
  v_credits JSONB;
  v_booth RECORD;
  v_product RECORD;
  v_fulfillment_verification JSONB;
  v_proof_lat NUMERIC;
  v_proof_lng NUMERIC;
  v_proof_ts TIMESTAMPTZ;
  v_delivery_windows JSONB;
  v_pickup_windows JSONB;
  v_window_end TIMESTAMPTZ;
  v_booth_lat NUMERIC;
  v_booth_lng NUMERIC;
  v_distance_miles NUMERIC;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Staff access required';
  END IF;

  SELECT * INTO v_dispute FROM order_disputes WHERE id = p_dispute_id;
  IF v_dispute IS NULL THEN
    RETURN jsonb_build_object('error', 'Dispute not found');
  END IF;

  SELECT * INTO v_order FROM market_orders WHERE id = v_dispute.order_id;

  -- Get booth and product for verification
  SELECT * INTO v_booth FROM market_booths WHERE id = v_order.booth_id;
  SELECT * INTO v_product FROM market_products WHERE id = v_order.product_id;

  -- Get dispute messages
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', m.id,
    'sender_id', m.sender_id,
    'sender_name', COALESCE(p.full_name, 'System'),
    'is_staff', EXISTS(SELECT 1 FROM staff_members sm WHERE sm.user_id = m.sender_id),
    'is_buyer', m.sender_id = v_order.buyer_id,
    'is_seller', m.sender_id = v_order.seller_id,
    'body', m.body,
    'photos', m.photos,
    'created_at', m.created_at
  ) ORDER BY m.created_at ASC), '[]'::jsonb)
  INTO v_messages
  FROM order_dispute_messages m
  LEFT JOIN profiles p ON p.id = m.sender_id
  WHERE m.dispute_id = p_dispute_id;

  -- Get any credits issued for this dispute
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', uc.id,
    'user_id', uc.user_id,
    'recipient_name', p.full_name,
    'amount_usd', uc.amount_usd,
    'remaining_usd', uc.remaining_usd,
    'credit_type', uc.credit_type,
    'max_pct_per_txn', uc.max_pct_per_txn,
    'reason', uc.reason,
    'created_at', uc.created_at
  )), '[]'::jsonb)
  INTO v_credits
  FROM user_credits uc
  LEFT JOIN profiles p ON p.id = uc.user_id
  WHERE uc.source = 'escalation_resolution' AND uc.source_id = p_dispute_id;

  -- ──── Fulfillment Verification ────
  -- Extract proof geotag and timestamp from delivery_proof JSONB
  IF v_order.delivery_proof IS NOT NULL AND jsonb_typeof(v_order.delivery_proof) = 'array'
     AND jsonb_array_length(v_order.delivery_proof) > 0 THEN
    v_proof_lat := (v_order.delivery_proof->0->>'latitude')::NUMERIC;
    v_proof_lng := (v_order.delivery_proof->0->>'longitude')::NUMERIC;
    v_proof_ts  := (v_order.delivery_proof->0->>'timestamp')::TIMESTAMPTZ;
  END IF;

  -- Get fulfillment windows from product
  IF v_order.fulfillment_type = 'delivery' THEN
    v_delivery_windows := v_product.product_delivery_windows;
    v_window_end := _get_latest_window_end(v_order.product_id, 'delivery');
  ELSE
    v_pickup_windows := v_product.product_pickup_windows;
    v_window_end := _get_latest_window_end(v_order.product_id, 'pickup');
  END IF;

  -- For pickup: compute distance from booth location to proof geotag
  IF v_order.fulfillment_type = 'pickup' AND v_booth.pickup_location IS NOT NULL
     AND v_proof_lat IS NOT NULL THEN
    v_booth_lat := ST_Y(v_booth.pickup_location::geometry);
    v_booth_lng := ST_X(v_booth.pickup_location::geometry);
    -- Haversine approximation in miles
    v_distance_miles := ROUND(
      3959 * acos(
        LEAST(1, cos(radians(v_booth_lat)) * cos(radians(v_proof_lat)) *
        cos(radians(v_proof_lng) - radians(v_booth_lng)) +
        sin(radians(v_booth_lat)) * sin(radians(v_proof_lat)))
      )::NUMERIC, 2);
  END IF;

  v_fulfillment_verification := jsonb_build_object(
    'fulfillment_type', v_order.fulfillment_type,
    -- Proof data
    'proof_geotag', CASE WHEN v_proof_lat IS NOT NULL
      THEN jsonb_build_object('latitude', v_proof_lat, 'longitude', v_proof_lng)
      ELSE NULL END,
    'proof_timestamp', v_proof_ts,
    'delivered_at', v_order.delivered_at,
    -- Window data
    'window_end', v_window_end,
    'proof_within_window', CASE
      WHEN v_window_end IS NOT NULL AND v_order.delivered_at IS NOT NULL
      THEN v_order.delivered_at <= v_window_end
      ELSE NULL END,
    -- Delivery-specific
    'delivery_address', v_order.delivery_address,
    'delivery_windows', v_delivery_windows,
    -- Pickup-specific: use actual ready_for_pickup_at column (not delivered_at)
    'ready_for_pickup_at', v_order.ready_for_pickup_at,
    'pickup_windows', v_pickup_windows,
    'pickup_address', v_booth.pickup_display_address,
    'booth_location', CASE WHEN v_booth_lat IS NOT NULL
      THEN jsonb_build_object('latitude', v_booth_lat, 'longitude', v_booth_lng)
      ELSE NULL END,
    'proof_distance_from_pickup_miles', v_distance_miles,
    'proof_distance_ok', CASE
      WHEN v_distance_miles IS NOT NULL THEN v_distance_miles <= 0.5
      ELSE NULL END,
    -- NEW: explicit flag for whether seller marked ready before window expired
    'seller_marked_ready', v_order.ready_for_pickup_at IS NOT NULL,
    'seller_marked_ready_within_window', CASE
      WHEN v_window_end IS NOT NULL AND v_order.ready_for_pickup_at IS NOT NULL
      THEN v_order.ready_for_pickup_at <= v_window_end
      ELSE NULL END
  );

  RETURN jsonb_build_object(
    'dispute', jsonb_build_object(
      'id', v_dispute.id,
      'order_id', v_dispute.order_id,
      'initiated_by', v_dispute.initiated_by,
      'reason', v_dispute.reason,
      'dispute_type', v_dispute.dispute_type,
      'photos', v_dispute.photos,
      'status', v_dispute.status,
      'staff_decision', v_dispute.staff_decision,
      'staff_notes', v_dispute.staff_notes,
      'resolved_by', v_dispute.resolved_by,
      'resolved_by_name', (SELECT full_name FROM profiles WHERE id = v_dispute.resolved_by),
      'resolved_at', v_dispute.resolved_at,
      'created_at', v_dispute.created_at
    ),
    'order', jsonb_build_object(
      'id', v_order.id,
      'product_name', v_order.product_name,
      'product_id', v_order.product_id,
      'quantity', v_order.quantity,
      'unit_price_usd', v_order.unit_price_usd,
      'subtotal_usd', v_order.subtotal_usd,
      'tax_amount_usd', v_order.tax_amount_usd,
      'platform_fee_usd', v_order.platform_fee_usd,
      'total_usd', v_order.total_usd,
      'fulfillment_type', v_order.fulfillment_type,
      'status', v_order.status,
      'delivery_proof', v_order.delivery_proof,
      'delivered_at', v_order.delivered_at,
      'ready_for_pickup_at', v_order.ready_for_pickup_at,
      'delivery_address', v_order.delivery_address,
      'created_at', v_order.created_at,
      'credit_applied_usd', v_order.credit_applied_usd
    ),
    'buyer', (SELECT jsonb_build_object(
      'id', p.id,
      'name', p.full_name,
      'email', u.email,
      'created_at', p.created_at
    ) FROM profiles p JOIN auth.users u ON u.id = p.id WHERE p.id = v_order.buyer_id),
    'seller', (SELECT jsonb_build_object(
      'id', p.id,
      'name', p.full_name,
      'email', u.email,
      'created_at', p.created_at
    ) FROM profiles p JOIN auth.users u ON u.id = p.id WHERE p.id = v_order.seller_id),
    'messages', v_messages,
    'credits_issued', v_credits,
    'fulfillment_verification', v_fulfillment_verification
  );
END;
$$;


-- ────────────────────────────────────────────────────────────
-- 6. Update get_dispute_evidence (chargeback)
--    Include ready_for_pickup_at in fulfillment evidence
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_dispute_evidence(p_dispute_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_dispute   RECORD;
  v_buyer     RECORD;
  v_result    JSONB;
  v_purchases JSONB;
  v_sales     JSONB;
  v_status_logs JSONB;
  v_chat_logs JSONB;
  v_escalation_history JSONB;
  v_opening_balance NUMERIC := 0;
  v_net       JSONB;
  v_purchases_total NUMERIC := 0;
  v_sales_total     NUMERIC := 0;
  v_platform_fee    NUMERIC := 0;
  v_refunds         NUMERIC := 0;
  v_market_start TIMESTAMPTZ;
  v_market_end   TIMESTAMPTZ;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Staff access required';
  END IF;

  SELECT * INTO v_dispute FROM stripe_disputes WHERE id = p_dispute_id;
  IF v_dispute IS NULL THEN
    RETURN jsonb_build_object('error', 'Dispute not found');
  END IF;

  v_market_start := COALESCE(v_dispute.market_date::timestamptz, v_dispute.created_at - interval '1 day');
  v_market_end   := v_market_start + interval '1 day';

  SELECT p.full_name, u.email, p.created_at AS profile_created
  INTO v_buyer
  FROM auth.users u LEFT JOIN profiles p ON p.id = u.id
  WHERE u.id = v_dispute.buyer_id;

  -- Opening balance from market_ledger
  SELECT COALESCE(SUM(
    CASE WHEN direction = 'credit' THEN amount_usd
         WHEN direction = 'debit' THEN -amount_usd
         ELSE 0 END
  ), 0)
  INTO v_opening_balance
  FROM market_ledger
  WHERE user_id = v_dispute.buyer_id
    AND created_at < v_market_start;

  -- Purchases (now includes ready_for_pickup_at)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'order_id', o.id,
    'seller_name', sp.full_name,
    'product_name', o.product_name,
    'quantity', o.quantity,
    'unit_price', o.unit_price_usd,
    'total', o.total_usd,
    'status', o.status,
    'fulfillment_method', o.fulfillment_type,
    'delivery_proof', o.delivery_proof,
    'delivered_at', o.delivered_at,
    'ready_for_pickup_at', o.ready_for_pickup_at,
    'created_at', o.created_at
  ) ORDER BY o.created_at), '[]'::jsonb)
  INTO v_purchases
  FROM market_orders o
  LEFT JOIN profiles sp ON sp.id = o.seller_id
  WHERE o.buyer_id = v_dispute.buyer_id
    AND o.created_at >= v_market_start AND o.created_at < v_market_end;

  SELECT COALESCE(SUM(o.total_usd), 0) INTO v_purchases_total
  FROM market_orders o WHERE o.buyer_id = v_dispute.buyer_id
    AND o.created_at >= v_market_start AND o.created_at < v_market_end;

  -- Sales (now includes ready_for_pickup_at)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'order_id', o.id,
    'buyer_name', bp.full_name,
    'product_name', o.product_name,
    'quantity', o.quantity,
    'unit_price', o.unit_price_usd,
    'total', o.total_usd,
    'status', o.status,
    'fulfillment_method', o.fulfillment_type,
    'delivery_proof', o.delivery_proof,
    'delivered_at', o.delivered_at,
    'ready_for_pickup_at', o.ready_for_pickup_at,
    'created_at', o.created_at
  ) ORDER BY o.created_at), '[]'::jsonb)
  INTO v_sales
  FROM market_orders o
  LEFT JOIN profiles bp ON bp.id = o.buyer_id
  WHERE o.seller_id = v_dispute.buyer_id
    AND o.created_at >= v_market_start AND o.created_at < v_market_end;

  SELECT COALESCE(SUM(o.total_usd), 0) INTO v_sales_total
  FROM market_orders o WHERE o.seller_id = v_dispute.buyer_id
    AND o.created_at >= v_market_start AND o.created_at < v_market_end;

  -- Order status logs
  v_status_logs := '[]'::jsonb;

  -- Chat logs
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'from_name', fp.full_name,
    'text', m.content,
    'sent_at', m.created_at
  ) ORDER BY m.created_at), '[]'::jsonb)
  INTO v_chat_logs
  FROM market_chat_messages m
  LEFT JOIN profiles fp ON fp.id = m.sender_id
  WHERE m.sender_id = v_dispute.buyer_id
    AND m.created_at BETWEEN (v_market_start - interval '1 day') AND (v_market_end + interval '1 day');

  -- Platform fee
  SELECT COALESCE(SUM(amount_usd), 0) INTO v_platform_fee
  FROM market_ledger
  WHERE user_id = v_dispute.buyer_id
    AND created_at >= v_market_start AND created_at < v_market_end
    AND event_type = 'fee_charged';

  -- Refunds
  SELECT COALESCE(SUM(amount_usd), 0) INTO v_refunds
  FROM market_ledger
  WHERE user_id = v_dispute.buyer_id
    AND created_at >= v_market_start AND created_at < v_market_end
    AND event_type = 'refund_issued';

  v_net := jsonb_build_object(
    'opening_balance', v_opening_balance,
    'purchases_total', v_purchases_total,
    'sales_total', v_sales_total,
    'platform_fee', v_platform_fee,
    'refunds', v_refunds,
    'net_charged', v_purchases_total - v_sales_total + v_opening_balance + v_platform_fee - v_refunds
  );

  -- Escalation resolution history
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'dispute_id', d.id,
    'order_id', d.order_id,
    'product_name', o.product_name,
    'reason', d.reason,
    'dispute_type', d.dispute_type,
    'status', d.status,
    'staff_decision', d.staff_decision,
    'staff_notes', d.staff_notes,
    'refund_amount_usd', d.refund_amount_usd,
    'resolved_at', d.resolved_at,
    'created_at', d.created_at,
    'messages', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'sender_name', mp.full_name,
        'is_staff', EXISTS(SELECT 1 FROM staff_members sm WHERE sm.user_id = m.sender_id),
        'body', m.body,
        'created_at', m.created_at
      ) ORDER BY m.created_at), '[]'::jsonb)
      FROM order_dispute_messages m
      LEFT JOIN profiles mp ON mp.id = m.sender_id
      WHERE m.dispute_id = d.id
    ),
    'credits_issued', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'recipient_name', cp.full_name,
        'amount_usd', uc.amount_usd,
        'credit_type', uc.credit_type,
        'reason', uc.reason
      )), '[]'::jsonb)
      FROM user_credits uc
      LEFT JOIN profiles cp ON cp.id = uc.user_id
      WHERE uc.source = 'escalation_resolution' AND uc.source_id = d.id
    )
  ) ORDER BY d.created_at), '[]'::jsonb)
  INTO v_escalation_history
  FROM order_disputes d
  JOIN market_orders o ON o.id = d.order_id
  WHERE (o.buyer_id = v_dispute.buyer_id OR o.seller_id = v_dispute.buyer_id)
    AND o.created_at >= v_market_start AND o.created_at < v_market_end;

  v_result := jsonb_build_object(
    'dispute', row_to_json(v_dispute)::jsonb,
    'buyer', jsonb_build_object(
      'name', v_buyer.full_name,
      'email', v_buyer.email,
      'profile_created', v_buyer.profile_created
    ),
    'opening_balance', jsonb_build_object(
      'amount_usd', v_opening_balance,
      'source', 'Prior market day unsettled balance'
    ),
    'purchases', v_purchases,
    'sales', v_sales,
    'net_calculation', v_net,
    'order_status_logs', v_status_logs,
    'chat_logs', v_chat_logs,
    'escalation_history', v_escalation_history,
    'fulfillment_photos', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'order_id', o.id,
        'fulfillment_method', o.fulfillment_type,
        'proof', o.delivery_proof,
        'delivered_at', o.delivered_at,
        'ready_for_pickup_at', o.ready_for_pickup_at
      )), '[]'::jsonb)
      FROM market_orders o
      WHERE (o.buyer_id = v_dispute.buyer_id OR o.seller_id = v_dispute.buyer_id)
        AND o.created_at >= v_market_start AND o.created_at < v_market_end
        AND (o.delivery_proof IS NOT NULL OR o.ready_for_pickup_at IS NOT NULL)
    )
  );

  RETURN v_result;
END;
$$;


-- ────────────────────────────────────────────────────────────
-- 7. Grant RLS: allow read access to ready_for_pickup_at
--    (inherits existing market_orders policies)
-- ────────────────────────────────────────────────────────────
-- No additional RLS changes needed — the column is on market_orders
-- which already has buyer/seller read policies.


-- ────────────────────────────────────────────────────────────
-- 8. Update seller_mark_delivered to also work for pickup orders
--    where buyer arrived and seller fulfills directly
--    (seller may or may not have pressed "ready for pickup" first)
-- ────────────────────────────────────────────────────────────

-- No change needed to seller_mark_delivered — it already handles
-- pending pickup orders (status='pending' → 'delivered').
-- The only change: if ready_for_pickup_at was previously set,
-- we keep it (it records when seller signaled readiness).
-- delivered_at records the actual handoff time.
