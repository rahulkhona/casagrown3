-- Add card_last4/card_brand to cc_charge entries in get_transaction_log
-- Currently the cc_charge row only shows stripe_pi, captured, released
-- We JOIN to payment_transactions to get the card metadata

-- Get current function definition to determine correct arg signature
DO $$
DECLARE v_args TEXT;
BEGIN
  SELECT pg_catalog.pg_get_function_arguments(p.oid) INTO v_args
  FROM pg_proc p WHERE p.proname = 'get_transaction_log' LIMIT 1;
  RAISE NOTICE 'get_transaction_log args: %', v_args;
END $$;

-- Recreate with card info in cc_charge metadata
CREATE OR REPLACE FUNCTION get_transaction_log(
  p_user_id  UUID,
  p_start    TIMESTAMPTZ DEFAULT '2000-01-01',
  p_end      TIMESTAMPTZ DEFAULT now(),
  p_limit    INT DEFAULT 50,
  p_offset   INT DEFAULT 0
)
RETURNS TABLE(
  tx_id TEXT,
  tx_type TEXT,
  tx_date TIMESTAMPTZ,
  description TEXT,
  amount NUMERIC(10,2),
  direction TEXT,
  status TEXT,
  related_order_id UUID,
  metadata JSONB
) LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE
  v_uid UUID := p_user_id;
  v_start TIMESTAMPTZ := p_start;
  v_end TIMESTAMPTZ := p_end;
BEGIN
RETURN QUERY

  -- ── Purchases (buyer) ──
  SELECT
    'purchase-' || o.id::TEXT,
    'purchase'::TEXT,
    o.created_at,
    o.product_name,
    o.total_usd,
    'debit'::TEXT,
    o.status::TEXT,
    o.id,
    jsonb_build_object(
      'seller_id', o.seller_id,
      'quantity', o.quantity,
      'unit', o.unit,
      'subtotal', o.subtotal_usd,
      'platform_fee', o.platform_fee_usd
    )
  FROM market_orders o
  WHERE o.buyer_id = v_uid
    AND o.created_at >= v_start AND o.created_at < v_end

  UNION ALL

  -- ── Sales (seller) ──
  SELECT
    'sale-' || o.id::TEXT,
    'sale'::TEXT,
    o.created_at,
    o.product_name || ' (sold)',
    o.subtotal_usd,
    'credit'::TEXT,
    o.status::TEXT,
    o.id,
    jsonb_build_object(
      'buyer_id', o.buyer_id,
      'quantity', o.quantity,
      'unit', o.unit,
      'platform_fee', o.platform_fee_usd,
      'net_payout', (o.subtotal_usd - o.platform_fee_usd)
    )
  FROM market_orders o
  WHERE o.seller_id = v_uid
    AND o.created_at >= v_start AND o.created_at < v_end

  UNION ALL

  -- ── Settlement credits ──
  SELECT
    'settlement-' || us.id::TEXT,
    'settlement_credit'::TEXT,
    us.created_at,
    'Market settlement payout',
    us.net_payout_usd,
    'credit'::TEXT,
    us.status::TEXT,
    NULL::UUID,
    jsonb_build_object(
      'gross_sales', us.gross_sales_usd,
      'platform_fee', us.platform_fee_usd,
      'net_payout', us.net_payout_usd,
      'order_count', us.order_count,
      'settlement_id', us.settlement_id,
      'settlement_status', ms.status,
      'available_at', ms.available_at
    ) || COALESCE(
      (SELECT jsonb_build_object('orders', jsonb_agg(jsonb_build_object(
        'product_name', o2.product_name,
        'quantity', o2.quantity,
        'subtotal', o2.subtotal_usd,
        'fee', o2.platform_fee_usd
      )))
      FROM market_orders o2 WHERE o2.settlement_id = us.settlement_id AND o2.seller_id = v_uid AND o2.status = 'completed'),
      '{}'::jsonb
    )
  FROM user_settlements us
  LEFT JOIN market_settlements ms ON ms.id = us.settlement_id
  WHERE us.user_id = v_uid
    AND us.created_at >= v_start AND us.created_at < v_end

  UNION ALL

  -- ── CC charges (settlement captures) — now with card info ──
  SELECT
    'capture-' || sc.id::TEXT,
    'cc_charge'::TEXT,
    sc.created_at,
    'Card charge for market settlement',
    sc.capture_amount_usd,
    'debit'::TEXT,
    sc.capture_status::TEXT,
    NULL::UUID,
    jsonb_build_object(
      'capture_id', sc.id,
      'hold_amount', sc.hold_amount_usd,
      'captured', sc.capture_amount_usd,
      'released', sc.release_amount_usd,
      'stripe_pi', sc.stripe_payment_intent_id,
      'stripe_charge_id', sc.stripe_capture_id,
      'settlement_id', sc.settlement_id
    ) || COALESCE(
      -- Join to payment_transactions to get card_last4 and card_brand
      (SELECT jsonb_build_object(
        'card_last4', pt.metadata->>'card_last4',
        'card_brand', pt.metadata->>'card_brand'
      )
      FROM payment_transactions pt
      WHERE pt.stripe_payment_intent_id = sc.stripe_payment_intent_id
      LIMIT 1),
      '{}'::jsonb
    )
  FROM settlement_captures sc
  WHERE sc.buyer_id = v_uid
    AND sc.created_at >= v_start AND sc.created_at < v_end

  UNION ALL

  -- ── Platform fees from ledger ──
  SELECT
    'ledger-' || ml.id::TEXT,
    'platform_fee'::TEXT,
    ml.created_at,
    'Platform fee (10%)',
    ml.amount_usd,
    ml.direction::TEXT,
    'completed'::TEXT,
    NULL::UUID,
    ml.metadata
  FROM market_ledger ml
  WHERE ml.user_id = v_uid
    AND ml.event_type = 'platform_fee'
    AND ml.created_at >= v_start AND ml.created_at < v_end

  UNION ALL

  -- ── Gift card / donation redemptions ──
  SELECT
    'redeem-' || r.id::TEXT,
    CASE WHEN rm.type = 'charity' THEN 'charity' ELSE 'gift_card' END::TEXT,
    r.created_at,
    COALESCE(rm.name, r.metadata->>'brand_name', 'Withdrawal'),
    (r.point_cost::NUMERIC / 100)::NUMERIC(10,2),
    'debit'::TEXT,
    r.status::TEXT,
    NULL::UUID,
    jsonb_build_object(
      'item_name', COALESCE(rm.name, r.metadata->>'brand_name'),
      'points', r.point_cost,
      'provider', r.provider
    ) || CASE WHEN r.metadata ? 'card_url' THEN jsonb_build_object('gift_card_url', r.metadata->>'card_url') ELSE '{}'::jsonb END
      || CASE WHEN r.metadata ? 'card_code' THEN jsonb_build_object('gift_card_code', r.metadata->>'card_code') ELSE '{}'::jsonb END
      || CASE WHEN r.metadata ? 'charity_receipt_url' THEN jsonb_build_object('charity_receipt_url', r.metadata->>'charity_receipt_url') ELSE '{}'::jsonb END
      || CASE WHEN r.metadata ? 'gg_receipt_number' THEN jsonb_build_object('gg_receipt_number', r.metadata->>'gg_receipt_number') ELSE '{}'::jsonb END
      || CASE WHEN r.metadata ? 'tax_deductible_amount' THEN jsonb_build_object('tax_deductible_amount', r.metadata->>'tax_deductible_amount') ELSE '{}'::jsonb END
  FROM redemptions r
  LEFT JOIN redemption_merchandize rm ON rm.id = r.item_id
  WHERE r.user_id = v_uid
    AND r.created_at >= v_start AND r.created_at < v_end

  UNION ALL

  -- ── Cashout (PayPal/Venmo) ──
  SELECT
    'cashout-' || r.id::TEXT,
    'cashout'::TEXT,
    r.created_at,
    COALESCE(r.metadata->>'brand_name', 'PayPal Payout'),
    (r.point_cost::NUMERIC / 100)::NUMERIC(10,2),
    'debit'::TEXT,
    r.status::TEXT,
    NULL::UUID,
    jsonb_build_object(
      'payout_method', COALESCE(r.metadata->>'type', 'paypal'),
      'cashout_txn_id', r.provider_order_id
    )
  FROM redemptions r
  WHERE r.user_id = v_uid
    AND r.provider IN ('paypal', 'venmo')
    AND r.created_at >= v_start AND r.created_at < v_end

  UNION ALL

  -- ── Balance credits/debits from market_ledger ──
  SELECT
    'balance-' || ml.id::TEXT,
    CASE
      WHEN ml.event_type IN ('refund_issued', 'refund_received') THEN 'refund'
      WHEN ml.event_type = 'credit' THEN 'credit'
      ELSE ml.event_type
    END::TEXT,
    ml.created_at,
    COALESCE(ml.metadata->>'description', ml.event_type),
    ml.amount_usd,
    ml.direction::TEXT,
    'completed'::TEXT,
    NULL::UUID,
    ml.metadata
  FROM market_ledger ml
  WHERE ml.user_id = v_uid
    AND ml.event_type NOT IN ('platform_fee')
    AND ml.created_at >= v_start AND ml.created_at < v_end

  UNION ALL

  -- ── CC Purchases (point purchases via Stripe) ──
  SELECT
    'payment-' || pt.id::TEXT,
    'cc_purchase'::TEXT,
    pt.created_at,
    'Point purchase (' || pt.points_amount || ' pts)',
    (pt.amount_cents::NUMERIC / 100)::NUMERIC(10,2),
    'debit'::TEXT,
    pt.status::TEXT,
    NULL::UUID,
    jsonb_build_object(
      'stripe_pi', pt.stripe_payment_intent_id,
      'points_amount', pt.points_amount,
      'service_fee_cents', pt.service_fee_cents,
      'provider', pt.provider
    ) || COALESCE(pt.metadata, '{}'::jsonb)
  FROM payment_transactions pt
  WHERE pt.user_id = v_uid
    AND pt.created_at >= v_start AND pt.created_at < v_end

  ORDER BY 3 DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$fn$;
