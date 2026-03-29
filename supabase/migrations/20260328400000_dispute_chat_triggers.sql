-- Drop any old ones just in case
-- We are replacing the RPCs to natively insert order_chat_messages
-- so that disputes filed via API/tests also show up in the chat thread automatically

CREATE OR REPLACE FUNCTION buyer_dispute_order(p_order_id UUID, p_reason TEXT, p_photos JSONB DEFAULT '[]')
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order RECORD;
  v_dispute_id UUID;
  v_chat_body TEXT;
  v_rec RECORD;
BEGIN
  SELECT * INTO v_order FROM market_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order IS NULL THEN RETURN jsonb_build_object('error', 'Order not found'); END IF;
  IF v_order.buyer_id != auth.uid() THEN RETURN jsonb_build_object('error', 'Not authorized'); END IF;
  IF v_order.status != 'delivered' THEN RETURN jsonb_build_object('error', 'Can only dispute delivered orders'); END IF;

  UPDATE market_orders SET status = 'disputed', updated_at = now() WHERE id = p_order_id;

  INSERT INTO order_disputes (order_id, initiated_by, reason, photos)
  VALUES (p_order_id, auth.uid(), p_reason, p_photos)
  RETURNING id INTO v_dispute_id;

  INSERT INTO notifications (user_id, content, link_url)
  VALUES (v_order.seller_id, 'Buyer has disputed their order for "' || v_order.product_name || '". Please respond. ⚠️', '/orders/' || p_order_id);

  -- Natively inject into chat feed
  v_chat_body := '⚠️ Dispute filed: ' || p_reason;
  IF jsonb_array_length(p_photos) > 0 THEN
    FOR v_rec IN SELECT * FROM jsonb_array_elements(p_photos) LOOP
      IF v_rec.value->>'url' IS NOT NULL THEN
        v_chat_body := v_chat_body || chr(10) || (v_rec.value->>'url');
      END IF;
    END LOOP;
  END IF;

  INSERT INTO order_chat_messages (order_id, sender_id, content)
  VALUES (p_order_id, auth.uid(), v_chat_body);

  RETURN jsonb_build_object('success', true, 'dispute_id', v_dispute_id);
END;
$$;

CREATE OR REPLACE FUNCTION seller_respond_dispute(p_dispute_id UUID, p_refund_type TEXT, p_refund_amount NUMERIC, p_pickup_offered BOOLEAN DEFAULT false)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  INSERT INTO notifications (user_id, content, link_url)
  VALUES (v_order.buyer_id, 'Seller has responded to your dispute for "' || v_order.product_name || '" with a ' || p_refund_type || ' refund offer.', '/orders/' || v_order.id);

  -- Natively inject into chat feed
  v_amt_str := TO_CHAR(p_refund_amount, 'FM999999999.00');
  INSERT INTO order_chat_messages (order_id, sender_id, content)
  VALUES (v_order.id, auth.uid(), '💰 Refund offered: ' || (CASE WHEN p_refund_type='full' THEN 'Full' ELSE 'Partial' END) || ' refund of $' || v_amt_str);

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION buyer_accept_refund(p_dispute_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_dispute RECORD;
  v_order RECORD;
  v_amt_str TEXT;
BEGIN
  SELECT * INTO v_dispute FROM order_disputes WHERE id = p_dispute_id FOR UPDATE;
  IF v_dispute IS NULL THEN RETURN jsonb_build_object('error', 'Dispute not found'); END IF;

  SELECT * INTO v_order FROM market_orders WHERE id = v_dispute.order_id;
  IF v_order.buyer_id != auth.uid() THEN RETURN jsonb_build_object('error', 'Not authorized'); END IF;
  IF v_dispute.status != 'seller_responded' THEN RETURN jsonb_build_object('error', 'Seller has not responded yet'); END IF;

  UPDATE order_disputes SET status = 'buyer_accepted', resolved_at = now(), updated_at = now() WHERE id = p_dispute_id;
  UPDATE market_orders SET status = 'resolved', updated_at = now() WHERE id = v_dispute.order_id;

  INSERT INTO notifications (user_id, content, link_url)
  VALUES (v_order.seller_id, 'Buyer accepted your refund offer for "' || v_order.product_name || '". Dispute resolved. ✓', '/orders/' || v_order.id);

  -- Natively inject into chat
  v_amt_str := TO_CHAR(COALESCE(v_dispute.refund_amount_usd, 0), 'FM999999999.00');
  INSERT INTO order_chat_messages (order_id, sender_id, content)
  VALUES (v_order.id, auth.uid(), '✅ Refund accepted — $' || v_amt_str || ' refund approved.');

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION buyer_resolve_dispute(p_dispute_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  INSERT INTO notifications (user_id, content, link_url)
  VALUES (v_order.seller_id, 'Buyer resolved the dispute for "' || v_order.product_name || '". ✓', '/orders/' || v_order.id);

  -- Natively inject into chat
  INSERT INTO order_chat_messages (order_id, sender_id, content)
  VALUES (v_order.id, auth.uid(), '✅ Issue resolved — dispute withdrawn.');

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION escalate_dispute(p_dispute_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  INSERT INTO notifications (user_id, content, link_url) VALUES
    (v_order.buyer_id, 'Dispute for "' || v_order.product_name || '" has been escalated to CasaGrown staff.', '/orders/' || v_order.id),
    (v_order.seller_id, 'Dispute for "' || v_order.product_name || '" has been escalated to CasaGrown staff.', '/orders/' || v_order.id);

  -- Natively inject into chat
  INSERT INTO order_chat_messages (order_id, sender_id, content)
  VALUES (v_order.id, auth.uid(), '🚨 Dispute escalated to Staff Review.');

  RETURN jsonb_build_object('success', true);
END;
$$;

