-- Fix duplicate buyer_dispute_order overload (text vs enum conflict)
-- Drop BOTH versions to clean up, then create a single definitive one

DROP FUNCTION IF EXISTS buyer_dispute_order(UUID, TEXT, JSONB);
DROP FUNCTION IF EXISTS buyer_dispute_order(UUID, TEXT, JSONB, TEXT, INTEGER);
DROP FUNCTION IF EXISTS buyer_dispute_order(UUID, TEXT, JSONB, dispute_type, INTEGER);

-- Add dispute_type TEXT column if not already present (the enum-based 'type' column may already exist)
ALTER TABLE order_disputes ADD COLUMN IF NOT EXISTS dispute_type TEXT;
ALTER TABLE order_disputes ADD COLUMN IF NOT EXISTS quantity_received INTEGER;

-- Copy data from old 'type' column to 'dispute_type' if needed
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_disputes' AND column_name = 'type') THEN
    UPDATE order_disputes SET dispute_type = type::TEXT WHERE dispute_type IS NULL AND type IS NOT NULL;
  END IF;
END $$;

-- Single definitive version: uses TEXT for dispute_type (avoids enum issues with PostgREST)
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
    v_suggested_refund := ROUND(
      ((v_order.quantity - p_quantity_received)::NUMERIC / GREATEST(v_order.quantity, 1)) * v_order.total_usd,
      2
    );
  ELSE
    v_suggested_refund := v_order.total_usd;
  END IF;

  UPDATE market_orders SET status = 'disputed', updated_at = now() WHERE id = p_order_id;

  INSERT INTO order_disputes (order_id, initiated_by, reason, photos, dispute_type, quantity_received, refund_amount_usd)
  VALUES (p_order_id, auth.uid(), p_reason, p_photos, p_dispute_type, p_quantity_received, v_suggested_refund)
  RETURNING id INTO v_dispute_id;

  -- Also set the enum 'type' column if it exists
  BEGIN
    EXECUTE 'UPDATE order_disputes SET type = $1::dispute_type WHERE id = $2' USING p_dispute_type, v_dispute_id;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- ignore if type column doesn't exist or value doesn't match enum
  END;

  INSERT INTO notifications (user_id, content, link_url)
  VALUES (v_order.seller_id, 'Buyer has disputed their order for "' || v_order.product_name || '". ⚠️', '/orders/' || p_order_id);

  RETURN jsonb_build_object('success', true, 'dispute_id', v_dispute_id, 'suggested_refund', v_suggested_refund);
END;
$$;
