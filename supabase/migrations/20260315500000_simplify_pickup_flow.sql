-- Simplify pickup flow: mirror delivery (seller marks handed → 4h auto-complete, optional photos)
-- Removes dual-passcode exchange, uses same delivered status + auto_complete_at timer

-- Replace seller_mark_ready_pickup: now acts like seller_mark_delivered but with shorter timer
CREATE OR REPLACE FUNCTION seller_mark_ready_pickup(p_order_id UUID, p_proof JSONB DEFAULT '[]'::jsonb)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order RECORD;
BEGIN
  SELECT * INTO v_order FROM market_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order IS NULL THEN RETURN jsonb_build_object('error', 'Order not found'); END IF;
  IF v_order.seller_id != auth.uid() THEN RETURN jsonb_build_object('error', 'Not authorized'); END IF;
  IF v_order.status != 'pending' THEN RETURN jsonb_build_object('error', 'Can only hand off pending orders'); END IF;
  IF v_order.fulfillment_type != 'pickup' THEN RETURN jsonb_build_object('error', 'Only pickup orders'); END IF;

  -- Set to delivered (same status as delivery), with 4h auto-complete
  UPDATE market_orders
  SET status = 'delivered',
      delivered_at = now(),
      delivery_proof = CASE WHEN p_proof::text != '[]' THEN p_proof ELSE delivery_proof END,
      auto_complete_at = now() + interval '4 hours',
      updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO notifications (user_id, content, link_url)
  VALUES (v_order.buyer_id,
    'Your order for "' || v_order.product_name || '" has been handed off! Confirm pickup within 4 hours. 📍',
    '/orders/' || p_order_id);

  RETURN jsonb_build_object('success', true, 'auto_complete_at', (now() + interval '4 hours'));
END;
$$;
