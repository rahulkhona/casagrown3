

-- =============================================================================
-- (d) dispute_order_with_message — add email notification for order disputed
-- =============================================================================

CREATE OR REPLACE FUNCTION public.dispute_order_with_message(
  p_order_id  uuid,
  p_buyer_id  uuid,
  p_reason    text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
  v_esc_id uuid;
  v_buyer_email text;
  v_seller_email text;
  v_buyer_name text;
  v_seller_name text;
  v_product text;
BEGIN
  SELECT * INTO v_order
  FROM orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('error', 'Order not found');
  END IF;

  IF v_order.buyer_id != p_buyer_id THEN
    RETURN jsonb_build_object('error', 'Only the buyer can dispute');
  END IF;

  IF v_order.status != 'delivered' THEN
    RETURN jsonb_build_object(
      'error', 'Can only dispute a delivered order',
      'currentStatus', v_order.status
    );
  END IF;

  UPDATE orders
  SET status = 'disputed', updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO escalations (order_id, initiator_id, reason)
  VALUES (p_order_id, p_buyer_id, p_reason)
  RETURNING id INTO v_esc_id;

  INSERT INTO chat_messages (conversation_id, sender_id, content, type)
  VALUES (
    v_order.conversation_id,
    p_buyer_id,
    'Delivery disputed: ' || p_reason || '. Seller can make a refund offer or either party can escalate to support.',
    'text'
  );

  -- === Email Notification ===
  v_product := coalesce(v_order.product, 'an item');
  v_buyer_email := public.get_user_email(v_order.buyer_id);
  v_seller_email := public.get_user_email(v_order.seller_id);
  SELECT full_name INTO v_buyer_name FROM profiles WHERE id = v_order.buyer_id;
  SELECT full_name INTO v_seller_name FROM profiles WHERE id = v_order.seller_id;

  DECLARE
    v_recipients jsonb := '[]'::jsonb;
  BEGIN
    IF v_buyer_email IS NOT NULL THEN
      v_recipients := v_recipients || jsonb_build_array(
        jsonb_build_object('email', v_buyer_email, 'name', coalesce(v_buyer_name, 'there'))
      );
    END IF;
    IF v_seller_email IS NOT NULL THEN
      v_recipients := v_recipients || jsonb_build_array(
        jsonb_build_object('email', v_seller_email, 'name', coalesce(v_seller_name, 'there'))
      );
    END IF;

    IF jsonb_array_length(v_recipients) > 0 THEN
      PERFORM public._send_notification_email(
        'order_disputed',
        v_recipients,
        jsonb_build_object(
          'product', v_product,
          'orderId', p_order_id,
          'disputeReason', p_reason
        )
      );
    END IF;
  END;

  RETURN jsonb_build_object('success', true, 'escalation_id', v_esc_id);
END;
$$;


-- =============================================================================
-- (e) resolve_dispute_with_message — add email notification for dispute resolved
-- =============================================================================

CREATE OR REPLACE FUNCTION public.resolve_dispute_with_message(
  p_order_id uuid,
  p_user_id  uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
  v_esc_id uuid;
  v_role text;
  v_total integer;
  v_fee integer;
  v_seller_payout integer;
  v_fee_rate numeric;
  v_buyer_email text;
  v_seller_email text;
  v_buyer_name text;
  v_seller_name text;
  v_product text;
BEGIN
  SELECT * INTO v_order
  FROM orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('error', 'Order not found');
  END IF;

  IF v_order.buyer_id != p_user_id AND v_order.seller_id != p_user_id THEN
    RETURN jsonb_build_object('error', 'Only buyer or seller can resolve');
  END IF;

  IF v_order.status NOT IN ('disputed', 'escalated') THEN
    RETURN jsonb_build_object(
      'error', 'Order must be in disputed or escalated status',
      'currentStatus', v_order.status
    );
  END IF;

  IF v_order.buyer_id = p_user_id THEN
    v_role := 'Buyer';
  ELSE
    v_role := 'Seller';
  END IF;

  v_fee_rate := public.get_platform_fee_for_user(v_order.seller_id);

  v_total := v_order.quantity * v_order.points_per_unit;
  v_fee := floor(v_total * v_fee_rate);
  v_seller_payout := v_total - v_fee;

  SELECT id INTO v_esc_id
  FROM escalations
  WHERE order_id = p_order_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_esc_id IS NOT NULL THEN
    UPDATE escalations
    SET status = 'resolved',
        resolution_type = 'resolved_without_refund',
        resolved_at = now(),
        updated_at = now()
    WHERE id = v_esc_id;
  END IF;

  INSERT INTO point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
  VALUES (
    v_order.seller_id,
    'payment',
    v_seller_payout,
    0,
    v_order.id,
    jsonb_build_object(
      'order_id', v_order.id,
      'total', v_total,
      'platform_fee', v_fee,
      'seller_payout', v_seller_payout
    )
  );

  INSERT INTO point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
  VALUES (
    v_order.seller_id,
    'platform_fee',
    -v_fee,
    0,
    v_order.id,
    jsonb_build_object('order_id', v_order.id, 'fee_rate', v_fee_rate)
  );

  UPDATE orders
  SET status = 'completed', updated_at = now()
  WHERE id = p_order_id;

  -- System message to buyer (no escrow language)
  INSERT INTO chat_messages (conversation_id, sender_id, content, type, metadata)
  VALUES (
    v_order.conversation_id,
    NULL,
    '✅ ' || v_role || ' resolved the dispute. ' || v_total || ' held points have been released to the seller. Order complete.',
    'system',
    jsonb_build_object('visible_to', v_order.buyer_id)
  );

  INSERT INTO chat_messages (conversation_id, sender_id, content, type, metadata)
  VALUES (
    v_order.conversation_id,
    NULL,
    '💰 Payment received: ' || v_seller_payout || ' points credited to your account (' || v_total || ' total - ' || v_fee || ' platform fee).',
    'system',
    jsonb_build_object('visible_to', v_order.seller_id)
  );

  -- === Email Notification ===
  v_product := coalesce(v_order.product, 'an item');
  v_buyer_email := public.get_user_email(v_order.buyer_id);
  v_seller_email := public.get_user_email(v_order.seller_id);
  SELECT full_name INTO v_buyer_name FROM profiles WHERE id = v_order.buyer_id;
  SELECT full_name INTO v_seller_name FROM profiles WHERE id = v_order.seller_id;

  DECLARE
    v_recipients jsonb := '[]'::jsonb;
  BEGIN
    IF v_buyer_email IS NOT NULL THEN
      v_recipients := v_recipients || jsonb_build_array(
        jsonb_build_object('email', v_buyer_email, 'name', coalesce(v_buyer_name, 'there'))
      );
    END IF;
    IF v_seller_email IS NOT NULL THEN
      v_recipients := v_recipients || jsonb_build_array(
        jsonb_build_object('email', v_seller_email, 'name', coalesce(v_seller_name, 'there'))
      );
    END IF;

    IF jsonb_array_length(v_recipients) > 0 THEN
      PERFORM public._send_notification_email(
        'dispute_resolved',
        v_recipients,
        jsonb_build_object(
          'product', v_product,
          'orderId', p_order_id,
          'resolutionOutcome', v_role || ' resolved without additional refund'
        )
      );
    END IF;
  END;

  RETURN jsonb_build_object('success', true);
END;
$$;
