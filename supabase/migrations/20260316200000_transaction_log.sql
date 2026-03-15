-- ============================================================================
-- Transaction Log & Summary RPCs
--
-- Unified view of all financial activity per user:
--   purchases, sales, platform fees, CC charges (netting), gift cards,
--   charities, cashouts, settlements, refunds
-- ============================================================================

-- ============================================================
-- 1. get_transaction_log — paginated, filterable history
-- ============================================================
CREATE OR REPLACE FUNCTION get_transaction_log(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  tx_id TEXT,
  tx_type TEXT,           -- purchase | sale | cc_charge | platform_fee | gift_card | charity | cashout | settlement_credit | refund | hold_placed | hold_released
  tx_date TIMESTAMPTZ,
  description TEXT,
  amount NUMERIC(10,2),
  direction TEXT,         -- credit | debit
  status TEXT,
  counterparty TEXT,      -- buyer/seller name
  metadata JSONB          -- type-specific: card_last4, gift_card_url, charity_receipt_url, etc.
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_start TIMESTAMPTZ := COALESCE(p_start_date::TIMESTAMPTZ, '2000-01-01'::TIMESTAMPTZ);
  v_end TIMESTAMPTZ := COALESCE((p_end_date + 1)::TIMESTAMPTZ, '2099-12-31'::TIMESTAMPTZ);
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
      'platform_fee', o.platform_fee_usd,
      'total', o.total_usd,
      'fulfillment', o.fulfillment_type,
      'booth_id', o.booth_id,
      'seller_name', sp.full_name,
      'settlement_id', o.settlement_id
    ) AS metadata
  FROM market_orders o
  LEFT JOIN profiles sp ON sp.id = o.seller_id
  WHERE o.buyer_id = v_uid
    AND o.created_at >= v_start AND o.created_at < v_end

  UNION ALL

  -- ── Sales (where user is seller) ──
  SELECT
    'sale-' || o.id::TEXT,
    'sale'::TEXT,
    o.created_at,
    o.product_name || ' × ' || o.quantity,
    o.subtotal_usd,  -- gross sale (before fees)
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
    AND o.created_at >= v_start AND o.created_at < v_end

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
    NULL,
    ml.metadata || jsonb_build_object('settlement_id', ml.settlement_id)
  FROM market_ledger ml
  WHERE ml.user_id = v_uid
    AND ml.event_type = 'fee_charged'
    AND ml.created_at >= v_start AND ml.created_at < v_end

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
    AND ml.created_at >= v_start AND ml.created_at < v_end

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
    AND ml.created_at >= v_start AND ml.created_at < v_end

  UNION ALL

  -- ── Refunds ──
  SELECT
    'ledger-' || ml.id::TEXT,
    'refund'::TEXT,
    ml.created_at,
    CASE ml.direction WHEN 'credit' THEN 'Refund received' ELSE 'Refund issued' END,
    ml.amount_usd,
    ml.direction::TEXT,
    'completed'::TEXT,
    NULL,
    ml.metadata
  FROM market_ledger ml
  WHERE ml.user_id = v_uid
    AND ml.event_type = 'refund_issued'
    AND ml.created_at >= v_start AND ml.created_at < v_end

  UNION ALL

  -- ── Redemptions (gift cards, charities, cashouts) ──
  SELECT
    'redeem-' || r.id::TEXT,
    CASE rm.type
      WHEN 'gift_card' THEN 'gift_card'
      WHEN 'donation' THEN 'charity'
      ELSE 'cashout'
    END::TEXT,
    r.created_at,
    CASE rm.type
      WHEN 'gift_card' THEN 'Gift card: ' || rm.name
      WHEN 'donation' THEN 'Donation: ' || rm.name
      ELSE 'Cashout'
    END,
    (r.point_cost::NUMERIC / 100)::NUMERIC(10,2),  -- points to USD
    'debit'::TEXT,
    r.status::TEXT,
    rm.name,
    r.metadata || jsonb_build_object(
      'point_cost', r.point_cost,
      'item_name', rm.name,
      'item_type', rm.type
    )
  FROM redemptions r
  JOIN redemption_merchandize rm ON rm.id = r.item_id
  WHERE r.user_id = v_uid
    AND r.created_at >= v_start AND r.created_at < v_end

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
    AND pt.created_at >= v_start AND pt.created_at < v_end

  ORDER BY tx_date DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;


-- ============================================================
-- 2. get_transaction_summary — aggregated stats for date range
-- ============================================================
CREATE OR REPLACE FUNCTION get_transaction_summary(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_start TIMESTAMPTZ := COALESCE(p_start_date::TIMESTAMPTZ, '2000-01-01'::TIMESTAMPTZ);
  v_end TIMESTAMPTZ := COALESCE((p_end_date + 1)::TIMESTAMPTZ, '2099-12-31'::TIMESTAMPTZ);
  v_sales NUMERIC(10,2) := 0;
  v_sales_count INTEGER := 0;
  v_purchases NUMERIC(10,2) := 0;
  v_purchase_count INTEGER := 0;
  v_fees NUMERIC(10,2) := 0;
  v_redeemed NUMERIC(10,2) := 0;
  v_cc_charged NUMERIC(10,2) := 0;
  v_refunds_received NUMERIC(10,2) := 0;
  v_refunds_issued NUMERIC(10,2) := 0;
  v_balance RECORD;
BEGIN
  -- Sales
  SELECT COALESCE(SUM(subtotal_usd), 0), COUNT(*)
  INTO v_sales, v_sales_count
  FROM market_orders
  WHERE seller_id = v_uid
    AND status IN ('completed', 'delivered')
    AND created_at >= v_start AND created_at < v_end;

  -- Purchases
  SELECT COALESCE(SUM(total_usd), 0), COUNT(*)
  INTO v_purchases, v_purchase_count
  FROM market_orders
  WHERE buyer_id = v_uid
    AND status IN ('completed', 'delivered')
    AND created_at >= v_start AND created_at < v_end;

  -- Platform fees
  SELECT COALESCE(SUM(amount_usd), 0) INTO v_fees
  FROM market_ledger
  WHERE user_id = v_uid AND event_type = 'fee_charged'
    AND created_at >= v_start AND created_at < v_end;

  -- Redemptions
  SELECT COALESCE(SUM(point_cost::NUMERIC / 100), 0) INTO v_redeemed
  FROM redemptions
  WHERE user_id = v_uid AND status = 'completed'
    AND created_at >= v_start AND created_at < v_end;

  -- CC charges from netting
  SELECT COALESCE(SUM(capture_amount_usd), 0) INTO v_cc_charged
  FROM settlement_captures
  WHERE buyer_id = v_uid AND capture_status = 'captured'
    AND created_at >= v_start AND created_at < v_end;

  -- Refunds
  SELECT
    COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_usd ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount_usd ELSE 0 END), 0)
  INTO v_refunds_received, v_refunds_issued
  FROM market_ledger
  WHERE user_id = v_uid AND event_type = 'refund_issued'
    AND created_at >= v_start AND created_at < v_end;

  -- Current balances (always current, not date-filtered)
  SELECT * INTO v_balance
  FROM user_balances WHERE user_id = v_uid;

  RETURN jsonb_build_object(
    'total_sales', v_sales,
    'sales_count', v_sales_count,
    'total_purchases', v_purchases,
    'purchase_count', v_purchase_count,
    'total_fees', v_fees,
    'total_redeemed', v_redeemed,
    'total_cc_charged', v_cc_charged,
    'refunds_received', v_refunds_received,
    'refunds_issued', v_refunds_issued,
    'net_earnings', v_sales - v_fees - v_refunds_issued + v_refunds_received,
    -- Current balances (always live)
    'available_usd', COALESCE(v_balance.available_usd, 0),
    'pending_usd', COALESCE(v_balance.pending_usd, 0),
    'total_earned_usd', COALESCE(v_balance.total_earned_usd, 0),
    'total_spent_usd', COALESCE(v_balance.total_spent_usd, 0),
    'total_withdrawn_usd', COALESCE(v_balance.total_withdrawn_usd, 0)
  );
END;
$$;


-- ============================================================
-- 3. get_pending_transactions — unsettled orders
-- ============================================================
CREATE OR REPLACE FUNCTION get_pending_transactions()
RETURNS TABLE (
  tx_id TEXT,
  tx_type TEXT,
  tx_date TIMESTAMPTZ,
  description TEXT,
  amount NUMERIC(10,2),
  direction TEXT,
  status TEXT,
  counterparty TEXT,
  metadata JSONB
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  RETURN QUERY

  -- Unsettled purchases
  SELECT
    'order-' || o.id::TEXT,
    'purchase'::TEXT,
    o.created_at,
    o.product_name || ' × ' || o.quantity,
    o.total_usd,
    'debit'::TEXT,
    o.status::TEXT || ' (pending settlement)',
    COALESCE(sp.full_name, 'Seller'),
    jsonb_build_object(
      'order_id', o.id,
      'product_name', o.product_name,
      'quantity', o.quantity,
      'subtotal', o.subtotal_usd,
      'total', o.total_usd,
      'booth_id', o.booth_id
    )
  FROM market_orders o
  LEFT JOIN profiles sp ON sp.id = o.seller_id
  WHERE o.buyer_id = v_uid
    AND o.settlement_id IS NULL
    AND o.status IN ('completed', 'delivered', 'confirmed', 'pending')

  UNION ALL

  -- Unsettled sales
  SELECT
    'sale-' || o.id::TEXT,
    'sale'::TEXT,
    o.created_at,
    o.product_name || ' × ' || o.quantity,
    o.subtotal_usd,
    'credit'::TEXT,
    o.status::TEXT || ' (pending settlement)',
    COALESCE(bp.full_name, 'Buyer'),
    jsonb_build_object(
      'order_id', o.id,
      'product_name', o.product_name,
      'quantity', o.quantity,
      'subtotal', o.subtotal_usd,
      'total', o.total_usd,
      'buyer_name', bp.full_name
    )
  FROM market_orders o
  LEFT JOIN profiles bp ON bp.id = o.buyer_id
  WHERE o.seller_id = v_uid
    AND o.settlement_id IS NULL
    AND o.status IN ('completed', 'delivered', 'confirmed', 'pending')

  ORDER BY tx_date DESC;
END;
$$;
