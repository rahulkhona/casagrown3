-- Add dispute_type enum and quantity_received to order_disputes

CREATE TYPE dispute_type AS ENUM ('not_delivered', 'quantity_mismatch', 'wrong_item', 'poor_quality');

ALTER TABLE order_disputes
  ADD COLUMN IF NOT EXISTS type dispute_type,
  ADD COLUMN IF NOT EXISTS quantity_received INTEGER;

-- Update buyer_dispute_order to accept dispute type and quantity
CREATE OR REPLACE FUNCTION buyer_dispute_order(
  p_order_id UUID,
  p_reason TEXT,
  p_photos JSONB DEFAULT '[]',
  p_dispute_type dispute_type DEFAULT NULL,
  p_quantity_received INTEGER DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order RECORD;
  v_dispute_id UUID;
BEGIN
  SELECT * INTO v_order FROM market_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order IS NULL THEN RETURN jsonb_build_object('error', 'Order not found'); END IF;
  IF v_order.buyer_id != auth.uid() THEN RETURN jsonb_build_object('error', 'Not authorized'); END IF;
  IF v_order.status != 'delivered' THEN RETURN jsonb_build_object('error', 'Can only dispute delivered orders'); END IF;

  UPDATE market_orders SET status = 'disputed', updated_at = now() WHERE id = p_order_id;

  INSERT INTO order_disputes (order_id, initiated_by, reason, photos, type, quantity_received)
  VALUES (p_order_id, auth.uid(), p_reason, p_photos, p_dispute_type, p_quantity_received)
  RETURNING id INTO v_dispute_id;

  INSERT INTO notifications (user_id, content, link_url)
  VALUES (v_order.seller_id,
    'Buyer has disputed their order for "' || v_order.product_name || '"'
    || CASE WHEN p_dispute_type IS NOT NULL THEN ' (' || replace(p_dispute_type::text, '_', ' ') || ')' ELSE '' END
    || '. Please respond. ⚠️',
    '/orders/' || p_order_id);

  RETURN jsonb_build_object('success', true, 'dispute_id', v_dispute_id);
END;
$$;
