-- ============================================================
-- Migration: Escalation Resolution & User Credits System
-- Admin dispute resolution with credit grants for future orders
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. ENUMS
-- ────────────────────────────────────────────────────────────

CREATE TYPE credit_source AS ENUM (
  'escalation_resolution',
  'goodwill',
  'promotion'
);

CREATE TYPE credit_type AS ENUM (
  'purchase',
  'platform_fee'
);

CREATE TYPE escalation_resolution_type AS ENUM (
  'refund_full',
  'refund_partial',
  'credit_buyer',
  'credit_seller',
  'no_action'
);


-- ────────────────────────────────────────────────────────────
-- 2. USER CREDITS TABLE — FIFO credit ledger
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_credits (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount_usd     NUMERIC(10,2) NOT NULL CHECK (amount_usd > 0),
  remaining_usd  NUMERIC(10,2) NOT NULL CHECK (remaining_usd >= 0),
  credit_type    credit_type NOT NULL DEFAULT 'purchase',
  max_pct_per_txn NUMERIC(5,2) NOT NULL DEFAULT 20.00
    CHECK (max_pct_per_txn > 0 AND max_pct_per_txn <= 100),
  source         credit_source NOT NULL,
  source_id      UUID,                    -- polymorphic: order_disputes.id, campaigns.id, etc.
  reason         TEXT,
  granted_by     UUID REFERENCES profiles(id),  -- NULL = system-granted
  expires_at     TIMESTAMPTZ DEFAULT (now() + interval '1 year'),
  created_at     TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_user_credits_fifo
  ON user_credits (user_id, created_at ASC)
  WHERE remaining_usd > 0;

CREATE INDEX idx_user_credits_user
  ON user_credits (user_id);


-- ────────────────────────────────────────────────────────────
-- 3. CREDIT USAGE LOG — tracks consumption per order
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS credit_usage_log (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  credit_id  UUID NOT NULL REFERENCES user_credits(id),
  order_id   UUID NOT NULL REFERENCES market_orders(id),
  amount_usd NUMERIC(10,2) NOT NULL CHECK (amount_usd > 0),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_credit_usage_order ON credit_usage_log(order_id);
CREATE INDEX idx_credit_usage_credit ON credit_usage_log(credit_id);


-- ────────────────────────────────────────────────────────────
-- 4. ADD credit_applied_usd TO market_orders
-- ────────────────────────────────────────────────────────────

ALTER TABLE market_orders
  ADD COLUMN IF NOT EXISTS credit_applied_usd NUMERIC(10,2) DEFAULT 0;

-- Add resolved_by to track which admin resolved the dispute
ALTER TABLE order_disputes
  ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES profiles(id);


-- ────────────────────────────────────────────────────────────
-- 5. RLS POLICIES
-- ────────────────────────────────────────────────────────────

ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_usage_log ENABLE ROW LEVEL SECURITY;

-- Users can see their own credits
CREATE POLICY "Users can view own credits"
  ON user_credits FOR SELECT
  USING (user_id = auth.uid());

-- Staff can see all credits
CREATE POLICY "Staff can view all credits"
  ON user_credits FOR SELECT
  USING (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()));

-- Service role manages credits (via RPCs with SECURITY DEFINER)
CREATE POLICY "Service role manages credits"
  ON user_credits FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Users can see usage on their own orders
CREATE POLICY "Users can view own credit usage"
  ON credit_usage_log FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM market_orders o WHERE o.id = order_id
      AND (o.buyer_id = auth.uid() OR o.seller_id = auth.uid()))
  );

-- Staff can see all usage
CREATE POLICY "Staff can view all credit usage"
  ON credit_usage_log FOR SELECT
  USING (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()));

-- Service role manages usage log
CREATE POLICY "Service role manages credit usage"
  ON credit_usage_log FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Staff can view and post dispute messages (admin comments)
CREATE POLICY "Staff can view dispute messages"
  ON order_dispute_messages FOR SELECT
  USING (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()));

CREATE POLICY "Staff can insert dispute messages"
  ON order_dispute_messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid())
  );

-- Staff can view all order disputes
CREATE POLICY "Staff can view all disputes"
  ON order_disputes FOR SELECT
  USING (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()));

-- Staff can update order disputes (resolve)
CREATE POLICY "Staff can update disputes"
  ON order_disputes FOR UPDATE
  USING (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()));


-- ────────────────────────────────────────────────────────────
-- 6. RPC: get_user_credit_balance
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_user_credit_balance(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_purchase NUMERIC := 0;
  v_platform_fee NUMERIC := 0;
BEGIN
  SELECT COALESCE(SUM(remaining_usd), 0) INTO v_purchase
  FROM user_credits
  WHERE user_id = p_user_id
    AND credit_type = 'purchase'
    AND remaining_usd > 0
    AND (expires_at IS NULL OR expires_at > now());

  SELECT COALESCE(SUM(remaining_usd), 0) INTO v_platform_fee
  FROM user_credits
  WHERE user_id = p_user_id
    AND credit_type = 'platform_fee'
    AND remaining_usd > 0
    AND (expires_at IS NULL OR expires_at > now());

  RETURN jsonb_build_object(
    'purchase_credits_usd', v_purchase,
    'platform_fee_credits_usd', v_platform_fee,
    'total_credits_usd', v_purchase + v_platform_fee
  );
END;
$$;


-- ────────────────────────────────────────────────────────────
-- 7. RPC: apply_credits_to_order (FIFO consumption)
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION apply_credits_to_order(
  p_order_id UUID,
  p_user_id  UUID
)
RETURNS NUMERIC
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_order RECORD;
  v_credit RECORD;
  v_total_applied NUMERIC := 0;
  v_max_for_credit NUMERIC;
  v_to_apply NUMERIC;
  v_remaining_order NUMERIC;
BEGIN
  -- Lock the order
  SELECT * INTO v_order FROM market_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order IS NULL THEN RETURN 0; END IF;

  v_remaining_order := v_order.total_usd;

  -- Iterate credits FIFO (oldest first), only 'purchase' type credits
  FOR v_credit IN
    SELECT * FROM user_credits
    WHERE user_id = p_user_id
      AND credit_type = 'purchase'
      AND remaining_usd > 0
      AND (expires_at IS NULL OR expires_at > now())
    ORDER BY created_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining_order <= 0;

    -- Cap by max_pct_per_txn of original order total
    v_max_for_credit := ROUND(v_order.total_usd * v_credit.max_pct_per_txn / 100, 2);
    -- Cap at what's left on the order
    v_max_for_credit := LEAST(v_max_for_credit, v_remaining_order);
    -- Cap at what's remaining in this credit
    v_to_apply := LEAST(v_credit.remaining_usd, v_max_for_credit);

    IF v_to_apply > 0 THEN
      -- Deduct from credit
      UPDATE user_credits SET remaining_usd = remaining_usd - v_to_apply
      WHERE id = v_credit.id;

      -- Log usage
      INSERT INTO credit_usage_log (credit_id, order_id, amount_usd)
      VALUES (v_credit.id, p_order_id, v_to_apply);

      v_total_applied := v_total_applied + v_to_apply;
      v_remaining_order := v_remaining_order - v_to_apply;
    END IF;
  END LOOP;

  -- Update order with total credits applied
  IF v_total_applied > 0 THEN
    UPDATE market_orders
    SET credit_applied_usd = v_total_applied
    WHERE id = p_order_id;
  END IF;

  RETURN v_total_applied;
END;
$$;


-- ────────────────────────────────────────────────────────────
-- 8. RPC: admin_resolve_escalation
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_resolve_escalation(
  p_order_id           UUID,
  p_resolution_type    escalation_resolution_type,
  p_reason             TEXT,
  p_refund_amount_usd  NUMERIC DEFAULT NULL,
  p_credit_amount_usd  NUMERIC DEFAULT NULL,
  p_credit_type        credit_type DEFAULT 'purchase',
  p_credit_max_pct     NUMERIC DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_admin_id UUID;
  v_order RECORD;
  v_dispute RECORD;
  v_credit_recipient UUID;
  v_credit_id UUID;
  v_buyer_name TEXT;
  v_seller_name TEXT;
  v_msg TEXT;
  v_effective_max_pct NUMERIC;
BEGIN
  v_admin_id := auth.uid();

  -- Platform fee credits max at 10% (the platform fee rate)
  v_effective_max_pct := CASE
    WHEN p_credit_type = 'platform_fee' THEN LEAST(p_credit_max_pct, 10)
    ELSE p_credit_max_pct
  END;

  -- Staff check
  IF NOT EXISTS (SELECT 1 FROM staff_members WHERE user_id = v_admin_id) THEN
    RETURN jsonb_build_object('error', 'Staff access required');
  END IF;

  -- Lock order
  SELECT * INTO v_order FROM market_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order IS NULL THEN
    RETURN jsonb_build_object('error', 'Order not found');
  END IF;

  IF v_order.status NOT IN ('disputed', 'escalated') THEN
    RETURN jsonb_build_object('error', 'Order must be in disputed or escalated status',
      'current_status', v_order.status);
  END IF;

  -- Get dispute record
  SELECT * INTO v_dispute FROM order_disputes WHERE order_id = p_order_id;
  IF v_dispute IS NULL THEN
    RETURN jsonb_build_object('error', 'No dispute found for this order');
  END IF;

  -- Get names for notifications
  SELECT full_name INTO v_buyer_name FROM profiles WHERE id = v_order.buyer_id;
  SELECT full_name INTO v_seller_name FROM profiles WHERE id = v_order.seller_id;

  -- ──── Resolution actions ────

  CASE p_resolution_type
    WHEN 'refund_full' THEN
      -- Full refund: record in ledger, Stripe refund via edge function later
      INSERT INTO market_ledger (user_id, event_type, direction, amount_usd, order_id, balance_after, metadata)
      VALUES (
        v_order.buyer_id, 'refund_issued', 'credit', v_order.total_usd, p_order_id, 0,
        jsonb_build_object('resolution', 'full_refund', 'admin', v_admin_id, 'reason', p_reason)
      );
      v_msg := 'Full refund of $' || v_order.total_usd || ' issued.';

    WHEN 'refund_partial' THEN
      IF p_refund_amount_usd IS NULL OR p_refund_amount_usd <= 0 THEN
        RETURN jsonb_build_object('error', 'Partial refund requires a positive amount');
      END IF;
      IF p_refund_amount_usd > v_order.total_usd THEN
        RETURN jsonb_build_object('error', 'Refund amount exceeds order total');
      END IF;

      INSERT INTO market_ledger (user_id, event_type, direction, amount_usd, order_id, balance_after, metadata)
      VALUES (
        v_order.buyer_id, 'refund_issued', 'credit', p_refund_amount_usd, p_order_id, 0,
        jsonb_build_object('resolution', 'partial_refund', 'admin', v_admin_id, 'reason', p_reason)
      );
      v_msg := 'Partial refund of $' || p_refund_amount_usd || ' issued.';

    WHEN 'credit_buyer' THEN
      IF p_credit_amount_usd IS NULL OR p_credit_amount_usd <= 0 THEN
        RETURN jsonb_build_object('error', 'Credit amount required');
      END IF;
      v_credit_recipient := v_order.buyer_id;

      INSERT INTO user_credits (user_id, amount_usd, remaining_usd, credit_type, max_pct_per_txn,
        source, source_id, reason, granted_by)
      VALUES (v_credit_recipient, p_credit_amount_usd, p_credit_amount_usd,
        p_credit_type, v_effective_max_pct,
        'escalation_resolution', v_dispute.id, p_reason, v_admin_id)
      RETURNING id INTO v_credit_id;

      v_msg := '$' || p_credit_amount_usd || ' credit issued to buyer.';

    WHEN 'credit_seller' THEN
      IF p_credit_amount_usd IS NULL OR p_credit_amount_usd <= 0 THEN
        RETURN jsonb_build_object('error', 'Credit amount required');
      END IF;
      v_credit_recipient := v_order.seller_id;

      INSERT INTO user_credits (user_id, amount_usd, remaining_usd, credit_type, max_pct_per_txn,
        source, source_id, reason, granted_by)
      VALUES (v_credit_recipient, p_credit_amount_usd, p_credit_amount_usd,
        p_credit_type, v_effective_max_pct,
        'escalation_resolution', v_dispute.id, p_reason, v_admin_id)
      RETURNING id INTO v_credit_id;

      v_msg := '$' || p_credit_amount_usd || ' credit issued to seller.';

    WHEN 'no_action' THEN
      v_msg := 'Resolved in seller''s favor — no refund or credit issued.';

  END CASE;

  -- ──── Update dispute record ────
  UPDATE order_disputes
  SET status = 'staff_resolved',
      staff_decision = p_resolution_type::TEXT,
      staff_notes = p_reason,
      resolved_by = v_admin_id,
      resolved_at = now(),
      updated_at = now(),
      refund_type = CASE
        WHEN p_resolution_type = 'refund_full' THEN 'full'
        WHEN p_resolution_type = 'refund_partial' THEN 'partial'
        ELSE refund_type END,
      refund_amount_usd = CASE
        WHEN p_resolution_type = 'refund_full' THEN v_order.total_usd
        WHEN p_resolution_type = 'refund_partial' THEN p_refund_amount_usd
        ELSE refund_amount_usd END
  WHERE id = v_dispute.id;

  -- ──── Update order status ────
  UPDATE market_orders
  SET status = 'resolved', updated_at = now()
  WHERE id = p_order_id;

  -- ──── Add admin message to dispute thread ────
  INSERT INTO order_dispute_messages (dispute_id, sender_id, body)
  VALUES (v_dispute.id, v_admin_id,
    '🔒 Admin Resolution: ' || v_msg || E'\nReason: ' || p_reason);

  -- ──── Notify buyer ────
  PERFORM notify_market_event(
    v_order.buyer_id,
    CASE p_resolution_type
      WHEN 'refund_full' THEN '✅ Your dispute on "' || v_order.product_name || '" has been resolved. Full refund of $' || v_order.total_usd || ' issued.'
      WHEN 'refund_partial' THEN '✅ Your dispute on "' || v_order.product_name || '" has been resolved. Partial refund of $' || p_refund_amount_usd || ' issued.'
      WHEN 'credit_buyer' THEN '✅ Your dispute on "' || v_order.product_name || '" has been resolved. You received $' || p_credit_amount_usd || ' in platform credits for future purchases.'
      WHEN 'credit_seller' THEN '✅ Your dispute on "' || v_order.product_name || '" has been resolved.'
      WHEN 'no_action' THEN '✅ Your dispute on "' || v_order.product_name || '" has been reviewed and resolved. No further action taken.'
    END,
    '/orders/' || p_order_id
  );

  -- ──── Notify seller ────
  PERFORM notify_market_event(
    v_order.seller_id,
    CASE p_resolution_type
      WHEN 'refund_full' THEN '📋 Dispute on "' || v_order.product_name || '" resolved. Full refund issued to buyer.'
      WHEN 'refund_partial' THEN '📋 Dispute on "' || v_order.product_name || '" resolved. Partial refund of $' || p_refund_amount_usd || ' issued to buyer.'
      WHEN 'credit_buyer' THEN '📋 Dispute on "' || v_order.product_name || '" resolved. Credits issued to buyer.'
      WHEN 'credit_seller' THEN '✅ Dispute on "' || v_order.product_name || '" resolved. You received $' || p_credit_amount_usd || ' in platform credits for future purchases.'
      WHEN 'no_action' THEN '✅ Dispute on "' || v_order.product_name || '" resolved in your favor. No action taken.'
    END,
    '/orders/' || p_order_id
  );

  -- ──── Notify credit recipient about credit details ────
  IF p_resolution_type IN ('credit_buyer', 'credit_seller') THEN
    PERFORM notify_market_event(
      v_credit_recipient,
      '💰 You received $' || p_credit_amount_usd || ' in ' || p_credit_type || ' credits. Use up to ' || p_credit_max_pct || '% per transaction. Expires in 1 year.',
      '/orders/' || p_order_id
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'resolution_type', p_resolution_type,
    'message', v_msg,
    'credit_id', v_credit_id
  );
END;
$$;


-- ────────────────────────────────────────────────────────────
-- 9. RPC: admin_add_dispute_comment
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_add_dispute_comment(
  p_dispute_id       UUID,
  p_body             TEXT,
  p_request_info_from TEXT DEFAULT NULL  -- 'buyer' | 'seller' | NULL (for highlighting who needs to respond)
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_admin_id UUID;
  v_admin_name TEXT;
  v_dispute RECORD;
  v_order RECORD;
BEGIN
  v_admin_id := auth.uid();

  IF NOT EXISTS (SELECT 1 FROM staff_members WHERE user_id = v_admin_id) THEN
    RETURN jsonb_build_object('error', 'Staff access required');
  END IF;

  SELECT full_name INTO v_admin_name FROM profiles WHERE id = v_admin_id;

  SELECT * INTO v_dispute FROM order_disputes WHERE id = p_dispute_id;
  IF v_dispute IS NULL THEN
    RETURN jsonb_build_object('error', 'Dispute not found');
  END IF;

  SELECT * INTO v_order FROM market_orders WHERE id = v_dispute.order_id;

  -- Insert admin message into the shared dispute thread
  INSERT INTO order_dispute_messages (dispute_id, sender_id, body)
  VALUES (p_dispute_id, v_admin_id, p_body);

  -- Notify BOTH parties about new admin message (same as buyer/seller message notifications)
  PERFORM notify_market_event(
    v_order.buyer_id,
    '📩 CasaGrown Support (' || COALESCE(v_admin_name, 'Admin') || ') added a note to your dispute on "' || v_order.product_name || '".' ||
    CASE WHEN p_request_info_from = 'buyer' THEN ' Please provide the requested information.' ELSE '' END,
    '/orders/' || v_order.id
  );

  PERFORM notify_market_event(
    v_order.seller_id,
    '📩 CasaGrown Support (' || COALESCE(v_admin_name, 'Admin') || ') added a note to the dispute on "' || v_order.product_name || '".' ||
    CASE WHEN p_request_info_from = 'seller' THEN ' Please provide the requested information.' ELSE '' END,
    '/orders/' || v_order.id
  );

  RETURN jsonb_build_object('success', true);
END;
$$;


-- ────────────────────────────────────────────────────────────
-- 10. RPC: get_escalated_orders_admin (list for admin page)
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_escalated_orders_admin(
  p_status TEXT DEFAULT NULL,  -- 'open' | 'resolved' | 'my_claims' | NULL (all)
  p_limit  INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_result JSONB;
  v_admin_id UUID;
BEGIN
  v_admin_id := auth.uid();

  IF NOT EXISTS (SELECT 1 FROM staff_members WHERE user_id = v_admin_id) THEN
    RAISE EXCEPTION 'Staff access required';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(r)::jsonb ORDER BY r.created_at DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      d.id AS dispute_id,
      d.order_id,
      d.reason,
      d.dispute_type,
      d.status AS dispute_status,
      d.staff_decision,
      d.resolved_at,
      d.created_at,
      d.photos,
      d.claimed_by,
      cp.full_name AS claimed_by_name,
      o.product_name,
      o.total_usd,
      o.fulfillment_type,
      o.status AS order_status,
      o.delivery_proof,
      o.delivered_at,
      bp.full_name AS buyer_name,
      bu.email AS buyer_email,
      sp.full_name AS seller_name,
      su.email AS seller_email,
      (SELECT count(*) FROM order_dispute_messages m WHERE m.dispute_id = d.id) AS message_count,
      -- Unread messages for current admin
      (SELECT count(*) FROM order_dispute_messages m
       WHERE m.dispute_id = d.id
         AND m.created_at > COALESCE(
           (SELECT viewed_at FROM dispute_admin_views dav
            WHERE dav.dispute_id = d.id AND dav.admin_id = v_admin_id),
           '1970-01-01'::timestamptz)
      ) AS unread_messages
    FROM order_disputes d
    JOIN market_orders o ON o.id = d.order_id
    LEFT JOIN profiles bp ON bp.id = o.buyer_id
    LEFT JOIN auth.users bu ON bu.id = o.buyer_id
    LEFT JOIN profiles sp ON sp.id = o.seller_id
    LEFT JOIN auth.users su ON su.id = o.seller_id
    LEFT JOIN profiles cp ON cp.id = d.claimed_by
    WHERE o.status IN ('disputed', 'escalated', 'resolved')
      AND (p_status IS NULL
        OR (p_status = 'open' AND d.status IN ('open', 'seller_responded', 'escalated'))
        OR (p_status = 'resolved' AND d.status = 'staff_resolved')
        OR (p_status = 'my_claims' AND d.claimed_by = v_admin_id))
    ORDER BY d.created_at DESC
    LIMIT p_limit OFFSET p_offset
  ) r;

  RETURN v_result;
END;
$$;


-- ────────────────────────────────────────────────────────────
-- 11. RPC: get_escalation_detail_admin (single dispute detail)
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
  v_ready_for_pickup_at TIMESTAMPTZ;
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

  -- For pickup: find when "ready for pickup" was clicked (delivered_at for pickup orders)
  -- delivered_at = when seller_mark_ready_pickup was called
  IF v_order.fulfillment_type = 'pickup' THEN
    v_ready_for_pickup_at := v_order.delivered_at;
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
    -- Pickup-specific
    'ready_for_pickup_at', v_ready_for_pickup_at,
    'pickup_windows', v_pickup_windows,
    'pickup_address', v_booth.pickup_display_address,
    'booth_location', CASE WHEN v_booth_lat IS NOT NULL
      THEN jsonb_build_object('latitude', v_booth_lat, 'longitude', v_booth_lng)
      ELSE NULL END,
    'proof_distance_from_pickup_miles', v_distance_miles,
    'proof_distance_ok', CASE
      WHEN v_distance_miles IS NOT NULL THEN v_distance_miles <= 0.5
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
-- 12. RPC: get_escalation_stats_admin
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_escalation_stats_admin()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Staff access required';
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'open', COUNT(*) FILTER (WHERE d.status = 'open'),
      'resolved', COUNT(*) FILTER (WHERE d.status = 'staff_resolved'),
      'total', COUNT(*),
      'total_disputed_usd', COALESCE(SUM(o.total_usd) FILTER (WHERE d.status = 'open'), 0),
      'resolved_today', COUNT(*) FILTER (WHERE d.resolved_at::date = CURRENT_DATE),
      'credits_issued_usd', COALESCE((
        SELECT SUM(uc.amount_usd) FROM user_credits uc
        WHERE uc.source = 'escalation_resolution'
      ), 0),
      'refunds_issued_usd', COALESCE(SUM(d.refund_amount_usd) FILTER (WHERE d.staff_decision IN ('refund_full', 'refund_partial')), 0)
    )
    FROM order_disputes d
    JOIN market_orders o ON o.id = d.order_id
    WHERE o.status IN ('disputed', 'escalated', 'resolved')
  );
END;
$$;


-- ────────────────────────────────────────────────────────────
-- 13. UPDATE: get_dispute_evidence — include escalation 
--     resolution in chargeback evidence
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

  -- Purchases
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

  -- Sales
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

  -- ──── NEW: Escalation resolution history ────
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
        'delivered_at', o.delivered_at
      )), '[]'::jsonb)
      FROM market_orders o
      WHERE (o.buyer_id = v_dispute.buyer_id OR o.seller_id = v_dispute.buyer_id)
        AND o.created_at >= v_market_start AND o.created_at < v_market_end
        AND o.delivery_proof IS NOT NULL
    )
  );

  RETURN v_result;
END;
$$;


-- ────────────────────────────────────────────────────────────
-- 14. TRIGGER: Notify admins on escalation
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_notify_admins_on_escalation()
RETURNS trigger AS $$
DECLARE
  v_staff RECORD;
  v_buyer_name TEXT;
  v_seller_name TEXT;
BEGIN
  IF NEW.status = 'escalated' AND (OLD.status IS NULL OR OLD.status <> 'escalated') THEN
    SELECT full_name INTO v_buyer_name FROM profiles WHERE id = NEW.buyer_id;
    SELECT full_name INTO v_seller_name FROM profiles WHERE id = NEW.seller_id;

    -- Notify each staff member
    FOR v_staff IN SELECT user_id FROM staff_members WHERE user_id IS NOT NULL
    LOOP
      PERFORM notify_market_event(
        v_staff.user_id,
        '⚠️ New escalation: "' || NEW.product_name || '" — ' ||
          COALESCE(v_buyer_name, 'buyer') || ' vs ' || COALESCE(v_seller_name, 'seller') ||
          ' ($' || NEW.total_usd || ')',
        '/escalations'
      );
    END LOOP;

    -- Queue admin email notification
    BEGIN
      INSERT INTO net._http_response (id) VALUES (0); -- wake the queue
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_market_order_escalation_notify ON market_orders;
CREATE TRIGGER trg_market_order_escalation_notify
  AFTER UPDATE ON market_orders
  FOR EACH ROW
  WHEN (NEW.status = 'escalated')
  EXECUTE FUNCTION trg_notify_admins_on_escalation();

-- ────────────────────────────────────────────────────────────
-- 15. ADD claimed_by COLUMN + admin views tracking
-- ────────────────────────────────────────────────────────────

ALTER TABLE order_disputes
  ADD COLUMN IF NOT EXISTS claimed_by UUID REFERENCES profiles(id);

-- Track when each admin last viewed a dispute (for unread indicator)
CREATE TABLE IF NOT EXISTS dispute_admin_views (
  dispute_id UUID NOT NULL REFERENCES order_disputes(id) ON DELETE CASCADE,
  admin_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  viewed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (dispute_id, admin_id)
);

ALTER TABLE dispute_admin_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage own views"
  ON dispute_admin_views FOR ALL
  USING (admin_id = auth.uid() AND EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()))
  WITH CHECK (admin_id = auth.uid() AND EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()));

CREATE POLICY "Service role manages views"
  ON dispute_admin_views FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');


-- ────────────────────────────────────────────────────────────
-- 16. RPC: admin_claim_escalation
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_claim_escalation(p_dispute_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_admin_id UUID;
  v_dispute RECORD;
  v_admin_name TEXT;
BEGIN
  v_admin_id := auth.uid();

  IF NOT EXISTS (SELECT 1 FROM staff_members WHERE user_id = v_admin_id) THEN
    RETURN jsonb_build_object('error', 'Staff access required');
  END IF;

  SELECT * INTO v_dispute FROM order_disputes WHERE id = p_dispute_id FOR UPDATE;
  IF v_dispute IS NULL THEN
    RETURN jsonb_build_object('error', 'Dispute not found');
  END IF;

  IF v_dispute.claimed_by IS NOT NULL AND v_dispute.claimed_by != v_admin_id THEN
    SELECT full_name INTO v_admin_name FROM profiles WHERE id = v_dispute.claimed_by;
    RETURN jsonb_build_object('error', 'Already claimed by ' || COALESCE(v_admin_name, 'another admin'));
  END IF;

  UPDATE order_disputes SET claimed_by = v_admin_id, updated_at = now()
  WHERE id = p_dispute_id;

  RETURN jsonb_build_object('success', true);
END;
$$;


-- ────────────────────────────────────────────────────────────
-- 16b. RPC: admin_relinquish_escalation
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_relinquish_escalation(p_dispute_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_admin_id UUID;
  v_dispute RECORD;
BEGIN
  v_admin_id := auth.uid();

  IF NOT EXISTS (SELECT 1 FROM staff_members WHERE user_id = v_admin_id) THEN
    RETURN jsonb_build_object('error', 'Staff access required');
  END IF;

  SELECT * INTO v_dispute FROM order_disputes WHERE id = p_dispute_id FOR UPDATE;
  IF v_dispute IS NULL THEN
    RETURN jsonb_build_object('error', 'Dispute not found');
  END IF;

  IF v_dispute.claimed_by IS NULL THEN
    RETURN jsonb_build_object('error', 'Dispute is not claimed');
  END IF;

  IF v_dispute.claimed_by != v_admin_id THEN
    RETURN jsonb_build_object('error', 'Only the claimant can relinquish');
  END IF;

  UPDATE order_disputes SET claimed_by = NULL, updated_at = now()
  WHERE id = p_dispute_id;

  RETURN jsonb_build_object('success', true);
END;
$$;


-- ────────────────────────────────────────────────────────────
-- 16c. RPC: admin_view_escalation (stamp last-viewed for unread tracking)
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_view_escalation(p_dispute_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_admin_id UUID;
BEGIN
  v_admin_id := auth.uid();

  IF NOT EXISTS (SELECT 1 FROM staff_members WHERE user_id = v_admin_id) THEN
    RETURN jsonb_build_object('error', 'Staff access required');
  END IF;

  INSERT INTO dispute_admin_views (dispute_id, admin_id, viewed_at)
  VALUES (p_dispute_id, v_admin_id, now())
  ON CONFLICT (dispute_id, admin_id) DO UPDATE SET viewed_at = now();

  RETURN jsonb_build_object('success', true);
END;
$$;


-- ────────────────────────────────────────────────────────────
-- 17. RPC: admin_grant_credit (standalone, independent of disputes)
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_grant_credit(
  p_user_id        UUID,
  p_amount_usd     NUMERIC,
  p_credit_type    credit_type DEFAULT 'purchase',
  p_max_pct        NUMERIC DEFAULT 20,
  p_source         credit_source DEFAULT 'goodwill',
  p_source_id      UUID DEFAULT NULL,
  p_reason         TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_admin_id UUID;
  v_credit_id UUID;
  v_effective_max_pct NUMERIC;
BEGIN
  v_admin_id := auth.uid();

  IF NOT EXISTS (SELECT 1 FROM staff_members WHERE user_id = v_admin_id) THEN
    RETURN jsonb_build_object('error', 'Staff access required');
  END IF;

  IF p_amount_usd IS NULL OR p_amount_usd <= 0 THEN
    RETURN jsonb_build_object('error', 'Amount must be positive');
  END IF;

  -- Platform fee credits max at 10% (the platform fee rate)
  v_effective_max_pct := CASE
    WHEN p_credit_type = 'platform_fee' THEN LEAST(p_max_pct, 10)
    ELSE p_max_pct
  END;

  INSERT INTO user_credits (user_id, amount_usd, remaining_usd, credit_type, max_pct_per_txn,
    source, source_id, reason, granted_by)
  VALUES (p_user_id, p_amount_usd, p_amount_usd,
    p_credit_type, v_effective_max_pct,
    p_source, p_source_id, p_reason, v_admin_id)
  RETURNING id INTO v_credit_id;

  -- Notify recipient
  PERFORM notify_market_event(
    p_user_id,
    '💰 You received $' || p_amount_usd || ' in ' || p_credit_type ||
      ' credits. Use up to ' || v_effective_max_pct || '% per transaction. Expires in 1 year.',
    '/account/credits'
  );

  RETURN jsonb_build_object(
    'success', true,
    'credit_id', v_credit_id,
    'effective_max_pct', v_effective_max_pct
  );
END;
$$;


-- ────────────────────────────────────────────────────────────
-- 18. TRIGGER: Notify claimed admin on new dispute messages
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_notify_admin_on_dispute_message()
RETURNS trigger AS $$
DECLARE
  v_dispute RECORD;
  v_order RECORD;
  v_sender_name TEXT;
  v_is_staff BOOLEAN;
  v_claimed_admin UUID;
  v_staff RECORD;
BEGIN
  -- Get dispute and order
  SELECT * INTO v_dispute FROM order_disputes WHERE id = NEW.dispute_id;
  SELECT * INTO v_order FROM market_orders WHERE id = v_dispute.order_id;
  SELECT full_name INTO v_sender_name FROM profiles WHERE id = NEW.sender_id;

  -- Check if sender is staff (don't notify admins about their own messages)
  v_is_staff := EXISTS(SELECT 1 FROM staff_members WHERE user_id = NEW.sender_id);
  IF v_is_staff THEN RETURN NEW; END IF;

  -- If escalated and claimed, notify only the claimed admin
  IF v_dispute.claimed_by IS NOT NULL THEN
    PERFORM notify_market_event(
      v_dispute.claimed_by,
      '💬 New message from ' || COALESCE(v_sender_name, 'user') ||
        ' on dispute for "' || v_order.product_name || '"',
      '/escalations/' || v_dispute.id
    );
  ELSE
    -- Notify all staff if unclaimed
    FOR v_staff IN SELECT user_id FROM staff_members WHERE user_id IS NOT NULL
    LOOP
      PERFORM notify_market_event(
        v_staff.user_id,
        '💬 New message from ' || COALESCE(v_sender_name, 'user') ||
          ' on dispute for "' || v_order.product_name || '"',
        '/escalations/' || v_dispute.id
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_dispute_message_notify_admin ON order_dispute_messages;
CREATE TRIGGER trg_dispute_message_notify_admin
  AFTER INSERT ON order_dispute_messages
  FOR EACH ROW
  EXECUTE FUNCTION trg_notify_admin_on_dispute_message();


-- ────────────────────────────────────────────────────────────
-- 19. GRANT EXECUTE
-- ────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION admin_resolve_escalation TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin_add_dispute_comment TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin_claim_escalation TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin_relinquish_escalation TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin_view_escalation TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin_grant_credit TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_escalated_orders_admin TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_escalation_detail_admin TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_escalation_stats_admin TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_user_credit_balance TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION apply_credits_to_order TO authenticated, service_role;
