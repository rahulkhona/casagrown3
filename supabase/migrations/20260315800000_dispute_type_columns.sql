-- Add dispute_type and quantity_received to order_disputes
ALTER TABLE order_disputes
  ADD COLUMN IF NOT EXISTS dispute_type TEXT,
  ADD COLUMN IF NOT EXISTS quantity_received INTEGER;

-- Drop old function (cannot CREATE OR REPLACE with different params)
DROP FUNCTION IF EXISTS buyer_dispute_order(UUID, TEXT, JSONB);

-- Recreate with dispute_type and quantity_received params
CREATE OR REPLACE FUNCTION buyer_dispute_order(
  p_order_id UUID,
  p_reason TEXT,
  p_photos JSONB DEFAULT '[]'::JSONB,
  p_dispute_type TEXT DEFAULT NULL,
  p_quantity_received INTEGER DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order RECORD;
  v_dispute_id UUID;
  v_suggested_refund NUMERIC;
BEGIN
  SELECT * INTO v_order FROM market_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order IS NULL THEN RETURN jsonb_build_object('error', 'Order not found'); END IF;
  IF v_order.buyer_id != auth.uid() THEN RETURN jsonb_build_object('error', 'Not authorized'); END IF;
  IF v_order.status NOT IN ('delivered', 'completed') THEN RETURN jsonb_build_object('error', 'Can only dispute delivered orders'); END IF;

  -- Check no existing open dispute
  IF EXISTS (SELECT 1 FROM order_disputes WHERE order_id = p_order_id AND status NOT IN ('buyer_accepted', 'staff_resolved')) THEN
    RETURN jsonb_build_object('error', 'Active dispute already exists');
  END IF;

  -- Auto-calculate suggested refund based on dispute type
  IF p_dispute_type IN ('not_delivered', 'wrong_item', 'poor_quality') THEN
    v_suggested_refund := v_order.total_usd;
  ELSIF p_dispute_type = 'quantity_mismatch' AND p_quantity_received IS NOT NULL THEN
    -- Proportional refund: (ordered - received) / ordered * total
    v_suggested_refund := ROUND(
      ((v_order.quantity - p_quantity_received)::NUMERIC / GREATEST(v_order.quantity, 1)) * v_order.total_usd,
      2
    );
  ELSE
    v_suggested_refund := v_order.total_usd; -- default to full
  END IF;

  UPDATE market_orders SET status = 'disputed', updated_at = now() WHERE id = p_order_id;

  INSERT INTO order_disputes (order_id, initiated_by, reason, photos, dispute_type, quantity_received, refund_amount_usd)
  VALUES (p_order_id, auth.uid(), p_reason, p_photos, p_dispute_type, p_quantity_received, v_suggested_refund)
  RETURNING id INTO v_dispute_id;

  INSERT INTO notifications (user_id, content, link_url)
  VALUES (v_order.seller_id, 'Buyer has disputed their order for "' || v_order.product_name || '". ⚠️', '/orders/' || p_order_id);

  -- Also notify admins (future: admin notification queue)

  RETURN jsonb_build_object('success', true, 'dispute_id', v_dispute_id, 'suggested_refund', v_suggested_refund);
END;
$$;
