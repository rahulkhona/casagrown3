-- Migration: Add combo resolution support to admin_resolve_escalation
-- Allows: refund + seller credit, credit buyer + credit seller, etc.
-- Adds p_secondary_credit_* params for the OTHER party

-- Add new combo resolution types
ALTER TYPE escalation_resolution_type ADD VALUE IF NOT EXISTS 'refund_full_credit_seller';
ALTER TYPE escalation_resolution_type ADD VALUE IF NOT EXISTS 'refund_partial_credit_seller';
ALTER TYPE escalation_resolution_type ADD VALUE IF NOT EXISTS 'credit_both';

-- Drop old 7-param overload so CREATE OR REPLACE doesn't create a second function
DROP FUNCTION IF EXISTS admin_resolve_escalation(
  UUID, escalation_resolution_type, TEXT, NUMERIC, NUMERIC, credit_type, NUMERIC
);

-- Replace the function with combo support
CREATE OR REPLACE FUNCTION admin_resolve_escalation(
  p_order_id                UUID,
  p_resolution_type         escalation_resolution_type,
  p_reason                  TEXT,
  p_refund_amount_usd       NUMERIC DEFAULT NULL,
  p_credit_amount_usd       NUMERIC DEFAULT NULL,
  p_credit_type             credit_type DEFAULT 'purchase',
  p_credit_max_pct          NUMERIC DEFAULT 20,
  -- NEW: secondary credit for the other party
  p_secondary_credit_usd    NUMERIC DEFAULT NULL,
  p_secondary_credit_type   credit_type DEFAULT 'purchase',
  p_secondary_credit_max_pct NUMERIC DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_admin_id UUID;
  v_order RECORD;
  v_dispute RECORD;
  v_credit_recipient UUID;
  v_credit_id UUID;
  v_secondary_credit_id UUID;
  v_buyer_name TEXT;
  v_seller_name TEXT;
  v_msg TEXT;
  v_effective_max_pct NUMERIC;
  v_secondary_effective_max_pct NUMERIC;
BEGIN
  v_admin_id := auth.uid();

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

  -- Cap percentages
  v_effective_max_pct := CASE
    WHEN p_credit_type = 'platform_fee' THEN LEAST(p_credit_max_pct, 10)
    ELSE p_credit_max_pct
  END;
  v_secondary_effective_max_pct := CASE
    WHEN p_secondary_credit_type = 'platform_fee' THEN LEAST(p_secondary_credit_max_pct, 10)
    ELSE p_secondary_credit_max_pct
  END;

  -- Get names for notifications
  SELECT full_name INTO v_buyer_name FROM profiles WHERE id = v_order.buyer_id;
  SELECT full_name INTO v_seller_name FROM profiles WHERE id = v_order.seller_id;

  -- ──── Resolution actions ────

  CASE p_resolution_type
    WHEN 'refund_full' THEN
      INSERT INTO market_ledger (user_id, event_type, direction, amount_usd, order_id, balance_after, metadata)
      VALUES (v_order.buyer_id, 'refund_issued', 'credit', v_order.total_usd, p_order_id, 0,
        jsonb_build_object('resolution', 'full_refund', 'admin', v_admin_id, 'reason', p_reason));
      v_msg := 'Full refund of $' || v_order.total_usd || ' issued to buyer.';

    WHEN 'refund_partial' THEN
      IF p_refund_amount_usd IS NULL OR p_refund_amount_usd <= 0 THEN
        RETURN jsonb_build_object('error', 'Partial refund requires a positive amount');
      END IF;
      IF p_refund_amount_usd > v_order.total_usd THEN
        RETURN jsonb_build_object('error', 'Refund amount exceeds order total');
      END IF;
      INSERT INTO market_ledger (user_id, event_type, direction, amount_usd, order_id, balance_after, metadata)
      VALUES (v_order.buyer_id, 'refund_issued', 'credit', p_refund_amount_usd, p_order_id, 0,
        jsonb_build_object('resolution', 'partial_refund', 'admin', v_admin_id, 'reason', p_reason));
      v_msg := 'Partial refund of $' || p_refund_amount_usd || ' issued to buyer.';

    WHEN 'credit_buyer' THEN
      IF p_credit_amount_usd IS NULL OR p_credit_amount_usd <= 0 THEN
        RETURN jsonb_build_object('error', 'Credit amount required');
      END IF;
      INSERT INTO user_credits (user_id, amount_usd, remaining_usd, credit_type, max_pct_per_txn,
        source, source_id, reason, granted_by)
      VALUES (v_order.buyer_id, p_credit_amount_usd, p_credit_amount_usd,
        p_credit_type, v_effective_max_pct,
        'escalation_resolution', v_dispute.id, p_reason, v_admin_id)
      RETURNING id INTO v_credit_id;
      v_msg := '$' || p_credit_amount_usd || ' credit issued to buyer.';

    WHEN 'credit_seller' THEN
      IF p_credit_amount_usd IS NULL OR p_credit_amount_usd <= 0 THEN
        RETURN jsonb_build_object('error', 'Credit amount required');
      END IF;
      INSERT INTO user_credits (user_id, amount_usd, remaining_usd, credit_type, max_pct_per_txn,
        source, source_id, reason, granted_by)
      VALUES (v_order.seller_id, p_credit_amount_usd, p_credit_amount_usd,
        p_credit_type, v_effective_max_pct,
        'escalation_resolution', v_dispute.id, p_reason, v_admin_id)
      RETURNING id INTO v_credit_id;
      v_msg := '$' || p_credit_amount_usd || ' credit issued to seller.';

    -- ───── NEW COMBO TYPES ─────

    WHEN 'refund_full_credit_seller' THEN
      -- Full refund to buyer + credit to seller
      INSERT INTO market_ledger (user_id, event_type, direction, amount_usd, order_id, balance_after, metadata)
      VALUES (v_order.buyer_id, 'refund_issued', 'credit', v_order.total_usd, p_order_id, 0,
        jsonb_build_object('resolution', 'full_refund_credit_seller', 'admin', v_admin_id, 'reason', p_reason));

      IF p_secondary_credit_usd IS NOT NULL AND p_secondary_credit_usd > 0 THEN
        INSERT INTO user_credits (user_id, amount_usd, remaining_usd, credit_type, max_pct_per_txn,
          source, source_id, reason, granted_by)
        VALUES (v_order.seller_id, p_secondary_credit_usd, p_secondary_credit_usd,
          p_secondary_credit_type, v_secondary_effective_max_pct,
          'escalation_resolution', v_dispute.id,
          'Goodwill credit: ' || p_reason, v_admin_id)
        RETURNING id INTO v_secondary_credit_id;
      END IF;
      v_msg := 'Full refund of $' || v_order.total_usd || ' to buyer + $' || COALESCE(p_secondary_credit_usd, 0) || ' credit to seller.';

    WHEN 'refund_partial_credit_seller' THEN
      -- Partial refund to buyer + credit to seller
      IF p_refund_amount_usd IS NULL OR p_refund_amount_usd <= 0 THEN
        RETURN jsonb_build_object('error', 'Partial refund requires a positive amount');
      END IF;
      INSERT INTO market_ledger (user_id, event_type, direction, amount_usd, order_id, balance_after, metadata)
      VALUES (v_order.buyer_id, 'refund_issued', 'credit', p_refund_amount_usd, p_order_id, 0,
        jsonb_build_object('resolution', 'partial_refund_credit_seller', 'admin', v_admin_id, 'reason', p_reason));

      IF p_secondary_credit_usd IS NOT NULL AND p_secondary_credit_usd > 0 THEN
        INSERT INTO user_credits (user_id, amount_usd, remaining_usd, credit_type, max_pct_per_txn,
          source, source_id, reason, granted_by)
        VALUES (v_order.seller_id, p_secondary_credit_usd, p_secondary_credit_usd,
          p_secondary_credit_type, v_secondary_effective_max_pct,
          'escalation_resolution', v_dispute.id,
          'Goodwill credit: ' || p_reason, v_admin_id)
        RETURNING id INTO v_secondary_credit_id;
      END IF;
      v_msg := 'Partial refund of $' || p_refund_amount_usd || ' to buyer + $' || COALESCE(p_secondary_credit_usd, 0) || ' credit to seller.';

    WHEN 'credit_both' THEN
      -- Credit to buyer + credit to seller
      IF p_credit_amount_usd IS NULL OR p_credit_amount_usd <= 0 THEN
        RETURN jsonb_build_object('error', 'Buyer credit amount required');
      END IF;
      INSERT INTO user_credits (user_id, amount_usd, remaining_usd, credit_type, max_pct_per_txn,
        source, source_id, reason, granted_by)
      VALUES (v_order.buyer_id, p_credit_amount_usd, p_credit_amount_usd,
        p_credit_type, v_effective_max_pct,
        'escalation_resolution', v_dispute.id, p_reason, v_admin_id)
      RETURNING id INTO v_credit_id;

      IF p_secondary_credit_usd IS NOT NULL AND p_secondary_credit_usd > 0 THEN
        INSERT INTO user_credits (user_id, amount_usd, remaining_usd, credit_type, max_pct_per_txn,
          source, source_id, reason, granted_by)
        VALUES (v_order.seller_id, p_secondary_credit_usd, p_secondary_credit_usd,
          p_secondary_credit_type, v_secondary_effective_max_pct,
          'escalation_resolution', v_dispute.id,
          'Goodwill credit: ' || p_reason, v_admin_id)
        RETURNING id INTO v_secondary_credit_id;
      END IF;
      v_msg := '$' || p_credit_amount_usd || ' credit to buyer + $' || COALESCE(p_secondary_credit_usd, 0) || ' credit to seller.';

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
        WHEN p_resolution_type IN ('refund_full', 'refund_full_credit_seller') THEN 'full'
        WHEN p_resolution_type IN ('refund_partial', 'refund_partial_credit_seller') THEN 'partial'
        ELSE refund_type END,
      refund_amount_usd = CASE
        WHEN p_resolution_type IN ('refund_full', 'refund_full_credit_seller') THEN v_order.total_usd
        WHEN p_resolution_type IN ('refund_partial', 'refund_partial_credit_seller') THEN p_refund_amount_usd
        ELSE refund_amount_usd END
  WHERE id = v_dispute.id;

  -- ──── Update order status ────
  UPDATE market_orders
  SET status = 'resolved', updated_at = now()
  WHERE id = p_order_id;

  -- ──── Admin message ────
  INSERT INTO order_dispute_messages (dispute_id, sender_id, body)
  VALUES (v_dispute.id, v_admin_id,
    '🔒 Admin Resolution: ' || v_msg || E'\nReason: ' || p_reason);

  -- ──── Notifications ────
  -- Buyer notification
  PERFORM notify_market_event(
    v_order.buyer_id,
    '✅ Your dispute on "' || v_order.product_name || '" has been resolved. ' || v_msg,
    '/orders/' || p_order_id
  );

  -- Seller notification
  PERFORM notify_market_event(
    v_order.seller_id,
    '📋 Dispute on "' || v_order.product_name || '" resolved. ' || v_msg,
    '/orders/' || p_order_id
  );

  -- Credit notifications
  IF p_resolution_type IN ('credit_buyer', 'credit_both') THEN
    PERFORM notify_market_event(v_order.buyer_id,
      '💰 You received $' || p_credit_amount_usd || ' in ' || p_credit_type || ' credits. Use up to ' || p_credit_max_pct || '% per transaction.',
      '/orders/' || p_order_id);
  END IF;

  IF p_resolution_type IN ('credit_seller', 'credit_both', 'refund_full_credit_seller', 'refund_partial_credit_seller') AND p_secondary_credit_usd IS NOT NULL THEN
    PERFORM notify_market_event(v_order.seller_id,
      '💰 You received $' || p_secondary_credit_usd || ' in ' || p_secondary_credit_type || ' credits as goodwill.',
      '/orders/' || p_order_id);
  ELSIF p_resolution_type = 'credit_seller' THEN
    PERFORM notify_market_event(v_order.seller_id,
      '💰 You received $' || p_credit_amount_usd || ' in ' || p_credit_type || ' credits.',
      '/orders/' || p_order_id);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'resolution_type', p_resolution_type,
    'message', v_msg,
    'credit_id', v_credit_id,
    'secondary_credit_id', v_secondary_credit_id
  );
END;
$$;
