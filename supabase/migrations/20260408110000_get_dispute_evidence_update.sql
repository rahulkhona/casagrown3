-- 1. UPDATE: get_dispute_evidence — include full DM chat logs and order detail chat logs + TOS signature

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
  v_order_chat_logs JSONB;
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

  -- Chat logs (Direct Messages) - now grabs bidirectional messages
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'from_name', fp.full_name,
    'text', m.content,
    'sent_at', m.created_at
  ) ORDER BY m.created_at), '[]'::jsonb)
  INTO v_chat_logs
  FROM market_chat_messages m
  JOIN market_conversations c ON c.id = m.conversation_id
  LEFT JOIN profiles fp ON fp.id = m.sender_id
  WHERE (c.participant_a = v_dispute.buyer_id OR c.participant_b = v_dispute.buyer_id)
    AND m.created_at BETWEEN (v_market_start - interval '1 day') AND (v_market_end + interval '1 day');

  -- Order Chat logs (Order conversations)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'from_name', COALESCE(fp.full_name, 'Unknown'),
    'order_id', m.order_id,
    'text', m.content,
    'sent_at', m.created_at
  ) ORDER BY m.created_at), '[]'::jsonb)
  INTO v_order_chat_logs
  FROM order_chat_messages m
  JOIN market_orders o ON o.id = m.order_id
  LEFT JOIN profiles fp ON fp.id = m.sender_id
  WHERE (o.buyer_id = v_dispute.buyer_id OR o.seller_id = v_dispute.buyer_id)
    AND m.created_at BETWEEN (v_market_start - interval '2 days') AND (v_market_end + interval '2 days');

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
      'profile_created', v_buyer.profile_created,
      'tos_accepted_at', v_buyer.profile_created
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
    'order_chat_logs', v_order_chat_logs,
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
