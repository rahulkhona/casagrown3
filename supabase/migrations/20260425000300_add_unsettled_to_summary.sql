-- Add unsettled_usd to get_transaction_summary
-- This shows the user how much money is waiting for the nightly settlement to run,
-- separate from pending_usd which is awaiting Stripe payout confirmation.

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
  v_processing_payouts NUMERIC(10,2) := 0;
  v_cc_charged NUMERIC(10,2) := 0;
  v_refunds_received NUMERIC(10,2) := 0;
  v_refunds_issued NUMERIC(10,2) := 0;
  v_unsettled_sales NUMERIC(10,2) := 0;
  v_unsettled_purchases NUMERIC(10,2) := 0;
  v_unsettled_count INTEGER := 0;
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

  -- Redemptions (Completed)
  SELECT COALESCE(SUM(point_cost::NUMERIC / 100), 0) INTO v_redeemed
  FROM redemptions
  WHERE user_id = v_uid AND status = 'completed'
    AND created_at >= v_start AND created_at < v_end;

  -- Redemptions (Processing/Queued) NOT filtered by date because they represent live pending lock
  SELECT COALESCE(SUM(point_cost::NUMERIC / 100), 0) INTO v_processing_payouts
  FROM redemptions
  WHERE user_id = v_uid AND status = 'pending';

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

  -- ★ NEW: Unsettled orders — completed/delivered but settlement hasn't run yet
  SELECT
    COALESCE(SUM(CASE WHEN seller_id = v_uid THEN subtotal_usd ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN buyer_id = v_uid THEN total_usd ELSE 0 END), 0),
    COUNT(*)
  INTO v_unsettled_sales, v_unsettled_purchases, v_unsettled_count
  FROM market_orders
  WHERE settlement_id IS NULL
    AND status IN ('completed', 'delivered')
    AND (seller_id = v_uid OR buyer_id = v_uid);

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
    'processing_payouts_usd', v_processing_payouts,
    'total_cc_charged', v_cc_charged,
    'refunds_received', v_refunds_received,
    'refunds_issued', v_refunds_issued,
    'net_earnings', v_sales - v_fees - v_refunds_issued + v_refunds_received,
    -- Current balances (always live)
    'available_usd', COALESCE(v_balance.available_usd, 0),
    'pending_usd', COALESCE(v_balance.pending_usd, 0),
    'held_balance_usd', COALESCE(v_balance.held_balance_usd, 0),
    'total_earned_usd', COALESCE(v_balance.total_earned_usd, 0),
    'total_spent_usd', COALESCE(v_balance.total_spent_usd, 0),
    'total_withdrawn_usd', COALESCE(v_balance.total_withdrawn_usd, 0),
    -- ★ NEW: Unsettled order values
    'unsettled_sales_usd', v_unsettled_sales,
    'unsettled_purchases_usd', v_unsettled_purchases,
    'unsettled_order_count', v_unsettled_count
  );
END;
$$;
