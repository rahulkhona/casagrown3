-- Fix get_transaction_log regression from 20260502103500_fix_payout_ui.sql
-- That migration accidentally dropped the Purchases (buyer) and CC Purchases blocks.
-- This restores them and adds: payout_sent events + user_incentives credit grants.

CREATE OR REPLACE FUNCTION public.get_transaction_log(
  p_start_date timestamptz DEFAULT NULL::timestamptz,
  p_end_date timestamptz DEFAULT NULL::timestamptz,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  tx_id text, tx_type text, tx_date timestamp with time zone,
  description text, amount numeric, direction text,
  status text, counterparty text, metadata jsonb
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_start TIMESTAMPTZ := COALESCE(p_start_date, '2000-01-01'::TIMESTAMPTZ);
  v_end TIMESTAMPTZ := COALESCE(p_end_date, '2099-12-31'::TIMESTAMPTZ);
BEGIN
  RETURN QUERY

  -- ── Purchases (where user is buyer) ──
  SELECT
    'order-' || o.id::TEXT AS tx_id,
    'purchase'::TEXT AS tx_type,
    o.created_at AS tx_date,
    o.product_name || ' × ' || o.quantity AS description,
    o.total_usd AS amount,
    'debit'::TEXT AS direction,
    o.status::TEXT AS status,
    COALESCE(sp.full_name, 'Seller') AS counterparty,
    jsonb_build_object(
      'order_id', o.id,
      'product_name', o.product_name,
      'quantity', o.quantity,
      'unit_price', o.unit_price_usd,
      'subtotal', o.subtotal_usd,
      'tax_rate', o.tax_rate_pct,
      'tax_amount', o.tax_amount_usd,
      'total', o.total_usd,
      'balance_applied', o.balance_applied_usd,
      'card_amount', o.total_usd - o.balance_applied_usd,
      'fulfillment', o.fulfillment_type,
      'booth_id', o.booth_id,
      'settlement_id', o.settlement_id
    )
  FROM market_orders o
  LEFT JOIN profiles sp ON sp.id = o.seller_id
  WHERE o.buyer_id = v_uid
    AND o.created_at >= v_start AND o.created_at <= v_end

  UNION ALL

  -- ── Sales (where user is seller) ──
  SELECT
    'sale-' || o.id::TEXT,
    'sale'::TEXT,
    o.created_at,
    o.product_name || ' × ' || o.quantity,
    o.subtotal_usd,
    'credit'::TEXT,
    o.status::TEXT,
    COALESCE(bp.full_name, 'Buyer'),
    jsonb_build_object(
      'order_id', o.id,
      'product_name', o.product_name,
      'quantity', o.quantity,
      'unit_price', o.unit_price_usd,
      'subtotal', o.subtotal_usd,
      'tax_rate', o.tax_rate_pct,
      'tax_amount', o.tax_amount_usd,
      'platform_fee', o.platform_fee_usd,
      'net_payout', o.subtotal_usd - o.platform_fee_usd,
      'total', o.total_usd,
      'fulfillment', o.fulfillment_type,
      'booth_id', o.booth_id,
      'buyer_name', bp.full_name,
      'settlement_id', o.settlement_id
    )
  FROM market_orders o
  LEFT JOIN profiles bp ON bp.id = o.buyer_id
  WHERE o.seller_id = v_uid
    AND o.created_at >= v_start AND o.created_at <= v_end

  UNION ALL

  -- ── CC Charges from netting (settlement captures) ──
  SELECT
    'capture-' || sc.id::TEXT,
    'cc_charge'::TEXT,
    sc.created_at,
    'Card charge for market settlement',
    sc.capture_amount_usd,
    'debit'::TEXT,
    sc.capture_status::TEXT,
    NULL,
    jsonb_build_object(
      'capture_id', sc.id,
      'hold_amount', sc.hold_amount_usd,
      'captured', sc.capture_amount_usd,
      'released', sc.release_amount_usd,
      'stripe_pi', sc.stripe_payment_intent_id,
      'stripe_charge_id', sc.stripe_capture_id,
      'settlement_id', sc.settlement_id
    )
  FROM settlement_captures sc
  WHERE sc.buyer_id = v_uid
    AND sc.created_at >= v_start AND sc.created_at <= v_end

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
    NULL,
    ml.metadata || jsonb_build_object('settlement_id', ml.settlement_id)
  FROM market_ledger ml
  WHERE ml.user_id = v_uid
    AND ml.event_type = 'fee_charged'
    AND ml.created_at >= v_start AND ml.created_at <= v_end

  UNION ALL

  -- ── Settlement credits ──
  SELECT
    'ledger-' || ml.id::TEXT,
    'settlement_credit'::TEXT,
    ml.created_at,
    'Settlement earnings credited',
    ml.amount_usd,
    ml.direction::TEXT,
    'completed'::TEXT,
    NULL,
    ml.metadata || jsonb_build_object('settlement_id', ml.settlement_id)
  FROM market_ledger ml
  WHERE ml.user_id = v_uid
    AND ml.event_type = 'settlement_credit'
    AND ml.created_at >= v_start AND ml.created_at <= v_end

  UNION ALL

  -- ── Funds cleared (pending → available) ──
  SELECT
    'ledger-' || ml.id::TEXT,
    'funds_cleared'::TEXT,
    ml.created_at,
    'Funds available for withdrawal',
    ml.amount_usd,
    ml.direction::TEXT,
    'completed'::TEXT,
    NULL,
    ml.metadata || jsonb_build_object('settlement_id', ml.settlement_id)
  FROM market_ledger ml
  WHERE ml.user_id = v_uid
    AND ml.event_type = 'funds_cleared'
    AND ml.created_at >= v_start AND ml.created_at <= v_end

  UNION ALL

  -- ── Balance held for purchases ──
  SELECT
    'ledger-' || ml.id::TEXT,
    'balance_held'::TEXT,
    ml.created_at,
    'Balance applied to purchase',
    ml.amount_usd,
    'debit'::TEXT,
    'active'::TEXT,
    NULL,
    ml.metadata
  FROM market_ledger ml
  WHERE ml.user_id = v_uid
    AND ml.event_type = 'balance_held'
    AND ml.created_at >= v_start AND ml.created_at <= v_end

  UNION ALL

  -- ── Balance released (from cancellations/clearance) ──
  SELECT
    'ledger-' || ml.id::TEXT,
    'balance_released'::TEXT,
    ml.created_at,
    'Balance released from purchase hold',
    ml.amount_usd,
    'credit'::TEXT,
    'completed'::TEXT,
    NULL,
    ml.metadata
  FROM market_ledger ml
  WHERE ml.user_id = v_uid
    AND ml.event_type = 'balance_released'
    AND ml.created_at >= v_start AND ml.created_at <= v_end

  UNION ALL

  -- ── Refunds ──
  SELECT
    'ledger-' || ml.id::TEXT,
    CASE WHEN ml.metadata->>'type' = 'payout_refund' THEN 'payout_refund' ELSE 'refund' END::TEXT,
    ml.created_at,
    CASE WHEN ml.metadata->>'type' = 'payout_refund' THEN 'Payout cancelled & refunded'
         WHEN ml.direction = 'credit' THEN 'Refund received'
         ELSE 'Refund issued'
    END,
    ml.amount_usd,
    ml.direction::TEXT,
    'completed'::TEXT,
    NULL,
    ml.metadata
  FROM market_ledger ml
  WHERE ml.user_id = v_uid
    AND ml.event_type = 'refund_issued'
    AND ml.created_at >= v_start AND ml.created_at <= v_end

  UNION ALL

  -- ── Payout sent (payouts debited from balance) ──
  SELECT
    'ledger-' || ml.id::TEXT,
    'payout_sent'::TEXT,
    ml.created_at,
    'Payout processed',
    ml.amount_usd,
    ml.direction::TEXT,
    'completed'::TEXT,
    NULL,
    ml.metadata
  FROM market_ledger ml
  WHERE ml.user_id = v_uid
    AND ml.event_type = 'payout_sent'
    AND ml.created_at >= v_start AND ml.created_at <= v_end

  UNION ALL

  -- ── Redemptions (gift cards, charities, cashouts) ──
  SELECT
    'redeem-' || r.id::TEXT,
    CASE COALESCE(rm.type::text, r.metadata->>'item_type', r.metadata->>'redemption_type', 'cashout')
      WHEN 'gift_card' THEN 'gift_card'
      WHEN 'donation' THEN 'charity'
      ELSE 'cashout'
    END::TEXT,
    r.created_at,
    CASE COALESCE(rm.type::text, r.metadata->>'item_type', r.metadata->>'redemption_type', 'cashout')
      WHEN 'gift_card' THEN 'Gift card: ' || COALESCE(rm.name, r.metadata->>'brand_name', 'Unknown')
      WHEN 'donation' THEN 'Donation: ' || COALESCE(rm.name, r.metadata->>'organization', r.metadata->>'project_title', 'Charity')
      ELSE 'Payout completed via ' ||
        CASE
          WHEN (r.provider IN ('paypal','venmo') OR r.metadata->>'type' = 'paypal_cashout')
               AND (r.metadata->>'payout_target') ~ '^\+?[1-9][0-9]{6,14}$' THEN 'Venmo'
          WHEN r.provider = 'paypal' OR r.metadata->>'type' = 'paypal_cashout' THEN 'PayPal'
          WHEN r.provider = 'venmo' THEN 'Venmo'
          WHEN r.provider = 'zelle' THEN 'Zelle'
          WHEN r.provider = 'cashapp' THEN 'CashApp'
          WHEN r.provider IS NOT NULL
               AND lower(r.provider) NOT IN ('manual','admin_manual')
               THEN initcap(r.provider)
          WHEN r.metadata->>'fulfillment_source' IS NOT NULL
               AND lower(r.metadata->>'fulfillment_source') NOT IN ('manual','admin_manual','admin manual')
               THEN initcap(r.metadata->>'fulfillment_source')
          ELSE 'Admin'
        END
    END::TEXT,
    (r.point_cost::NUMERIC / 100)::NUMERIC(10,2),
    'debit'::TEXT,
    r.status::TEXT,
    COALESCE(rm.name, r.metadata->>'brand_name', r.metadata->>'fulfillment_source', r.provider),
    r.metadata || jsonb_build_object(
      'point_cost', r.point_cost,
      'item_name', COALESCE(rm.name, r.metadata->>'brand_name', r.metadata->>'fulfillment_source', r.provider),
      'item_type', COALESCE(rm.type::text, r.metadata->>'item_type', r.metadata->>'redemption_type', 'cashout')
    )
  FROM redemptions r
  LEFT JOIN redemption_merchandize rm ON rm.id = r.item_id
  WHERE r.user_id = v_uid
    AND r.created_at >= v_start AND r.created_at <= v_end

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
    NULL,
    jsonb_build_object(
      'stripe_pi', pt.stripe_payment_intent_id,
      'points_amount', pt.points_amount,
      'service_fee_cents', pt.service_fee_cents,
      'provider', pt.provider
    ) || COALESCE(pt.metadata, '{}'::jsonb)
  FROM payment_transactions pt
  WHERE pt.user_id = v_uid
    AND pt.created_at >= v_start AND pt.created_at <= v_end

  UNION ALL

  -- ── Admin Adjustments ──
  SELECT
    'ledger-' || ml.id::TEXT,
    'admin_adjustment'::TEXT,
    ml.created_at,
    'Admin Adjustment: ' || COALESCE(ml.metadata->>'reason', 'Correction'),
    ml.amount_usd,
    ml.direction::TEXT,
    'completed'::TEXT,
    'Admin',
    ml.metadata
  FROM market_ledger ml
  WHERE ml.user_id = v_uid
    AND ml.event_type = 'admin_adjustment'
    AND ml.created_at >= v_start AND ml.created_at <= v_end

  UNION ALL

  -- ── Credit Grants (promotional credits received) ──
  SELECT
    'credit-' || uc.id::TEXT,
    'credit_received'::TEXT,
    uc.created_at,
    '🎁 Credit received: ' || COALESCE(uc.reason, initcap(replace(uc.source::text, '_', ' '))),
    uc.amount_usd,
    'credit'::TEXT,
    CASE WHEN uc.remaining_usd > 0 AND (uc.expires_at IS NULL OR uc.expires_at > now()) THEN 'active' ELSE 'used' END::TEXT,
    NULL,
    jsonb_build_object(
      'credit_type', uc.credit_type,
      'source', uc.source,
      'reason', uc.reason,
      'remaining_usd', uc.remaining_usd,
      'expires_at', uc.expires_at
    )
  FROM user_credits uc
  WHERE uc.user_id = v_uid
    AND uc.created_at >= v_start AND uc.created_at <= v_end

  ORDER BY tx_date DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;
