-- ============================================================================
-- Migration: Balance-First Hold Logic
--
-- When a buyer places an order, use their available balance first before
-- placing a Stripe hold on their credit card. This prevents race conditions
-- and matches user expectations.
--
-- Changes:
--   1. Add balance_applied_cents to market_holds
--   2. Add balance_applied_usd to market_orders
--   3. Add held_balance_usd to user_balances (money locked for purchases)
--   4. Create debit_buyer_balance RPC with row-level locking
--   5. Create refund_buyer_balance RPC for clearance-time refunds
--   6. Update get_transaction_log to show balance holds
--   7. Update get_transaction_summary to include held amounts
-- ============================================================================

-- 1. Add tracking columns
ALTER TABLE market_holds
  ADD COLUMN IF NOT EXISTS balance_applied_cents INTEGER NOT NULL DEFAULT 0;

ALTER TABLE market_orders
  ADD COLUMN IF NOT EXISTS balance_applied_usd NUMERIC(10,2) NOT NULL DEFAULT 0;

-- Add held_balance_usd to user_balances to track money locked for purchases
ALTER TABLE user_balances
  ADD COLUMN IF NOT EXISTS held_balance_usd NUMERIC(10,2) NOT NULL DEFAULT 0;

-- Update market_ledger check constraint to allow new balance event types
ALTER TABLE market_ledger DROP CONSTRAINT IF EXISTS market_ledger_event_type_check;
ALTER TABLE market_ledger ADD CONSTRAINT market_ledger_event_type_check CHECK (
  event_type = ANY (ARRAY[
    'hold_placed', 'hold_captured', 'hold_released',
    'order_completed', 'fee_charged', 'refund_issued',
    'settlement_credit', 'funds_cleared', 'payout_sent',
    'balance_held', 'balance_released', 'balance_consumed'
  ])
);

-- ============================================================================
-- 2. debit_buyer_balance — atomically debit available balance for a purchase
-- ============================================================================
CREATE OR REPLACE FUNCTION debit_buyer_balance(
  p_buyer_id UUID,
  p_max_amount_cents INTEGER
)
RETURNS INTEGER  -- actual cents debited
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_max_usd NUMERIC(10,2);
  v_available NUMERIC(10,2);
  v_actual_debit NUMERIC(10,2);
  v_actual_cents INTEGER;
BEGIN
  v_max_usd := p_max_amount_cents::NUMERIC / 100;

  -- Lock the row to prevent race conditions with simultaneous
  -- redemptions or other purchases
  SELECT available_usd INTO v_available
  FROM user_balances
  WHERE user_id = p_buyer_id
  FOR UPDATE;

  IF v_available IS NULL OR v_available <= 0 THEN
    RETURN 0;
  END IF;

  -- Debit the lesser of available balance or requested amount
  v_actual_debit := LEAST(v_available, v_max_usd);
  v_actual_cents := (v_actual_debit * 100)::INTEGER;

  -- Move from available to held
  UPDATE user_balances
  SET available_usd = available_usd - v_actual_debit,
      held_balance_usd = held_balance_usd + v_actual_debit,
      updated_at = now()
  WHERE user_id = p_buyer_id;

  -- Ledger entry
  PERFORM append_ledger_entry(
    'balance_held', p_buyer_id, v_actual_debit, 'debit', NULL, NULL,
    jsonb_build_object('reason', 'purchase_hold', 'amount_cents', v_actual_cents)
  );

  RETURN v_actual_cents;
END;
$$;

-- ============================================================================
-- 3. refund_buyer_balance — return held balance (during clearance/cancellation)
-- ============================================================================
CREATE OR REPLACE FUNCTION refund_buyer_balance(
  p_buyer_id UUID,
  p_amount_cents INTEGER,
  p_reason TEXT DEFAULT 'order_cancelled'
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_amount_usd NUMERIC(10,2);
BEGIN
  v_amount_usd := p_amount_cents::NUMERIC / 100;

  -- Move from held back to available
  UPDATE user_balances
  SET available_usd = available_usd + v_amount_usd,
      held_balance_usd = GREATEST(held_balance_usd - v_amount_usd, 0),
      updated_at = now()
  WHERE user_id = p_buyer_id;

  -- Ledger entry
  PERFORM append_ledger_entry(
    'balance_released', p_buyer_id, v_amount_usd, 'credit', NULL, NULL,
    jsonb_build_object('reason', p_reason, 'amount_cents', p_amount_cents)
  );

  RETURN true;
END;
$$;

-- ============================================================================
-- 4. Update get_transaction_log — add balance_held entries
-- ============================================================================
CREATE OR REPLACE FUNCTION get_transaction_log(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
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
    AND o.created_at >= v_start AND o.created_at < v_end

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
    AND ml.created_at >= v_start AND ml.created_at < v_end

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
    (r.point_cost::NUMERIC / 100)::NUMERIC(10,2),
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


-- ============================================================================
-- 5. Update get_transaction_summary — include held balance
-- ============================================================================
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
    'held_balance_usd', COALESCE(v_balance.held_balance_usd, 0),
    'total_earned_usd', COALESCE(v_balance.total_earned_usd, 0),
    'total_spent_usd', COALESCE(v_balance.total_spent_usd, 0),
    'total_withdrawn_usd', COALESCE(v_balance.total_withdrawn_usd, 0)
  );
END;
$$;


-- ============================================================================
-- 6. Update get_pending_transactions — show balance applied on purchases
-- ============================================================================
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
      'balance_applied', o.balance_applied_usd,
      'card_amount', o.total_usd - o.balance_applied_usd,
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


-- ============================================================================
-- 7. Update settlement: handle balance portion during netting
--    At settlement, held balance is consumed (moved to total_spent),
--    and only the remainder is captured from Stripe.
-- ============================================================================
CREATE OR REPLACE FUNCTION run_market_settlement(p_market_date DATE DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_settlement_id UUID;
  v_user RECORD;
  v_total_orders INTEGER := 0;
  v_total_captured NUMERIC(10,2) := 0;
  v_total_payouts NUMERIC(10,2) := 0;
  v_total_fees NUMERIC(10,2) := 0;
  v_total_refunds NUMERIC(10,2) := 0;
  v_user_count INTEGER := 0;
  v_check1_pass BOOLEAN;
  v_check2_pass BOOLEAN;
  v_reconciliation JSONB;
  v_clearing_date DATE;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('market_settlement')) THEN
    RETURN jsonb_build_object('error', 'Settlement already in progress');
  END IF;

  v_clearing_date := COALESCE(p_market_date, CURRENT_DATE);

  SELECT COUNT(*) INTO v_total_orders
  FROM market_orders
  WHERE settlement_id IS NULL
    AND status IN ('completed', 'delivered');

  IF v_total_orders = 0 THEN
    RETURN jsonb_build_object('error', 'No unsettled orders to process');
  END IF;

  INSERT INTO market_settlements (market_date, status)
  VALUES (v_clearing_date, 'captures_sent')
  RETURNING id INTO v_settlement_id;

  UPDATE market_orders
  SET settlement_id = v_settlement_id
  WHERE settlement_id IS NULL
    AND status IN ('completed', 'delivered');

  FOR v_user IN
    SELECT
      u.user_id,
      COALESCE(SUM(u.gross_sales), 0) AS gross_sales,
      COALESCE(SUM(u.total_purchases), 0) AS total_purchases,
      COALESCE(SUM(u.platform_fees), 0) AS platform_fees,
      COALESCE(SUM(u.refunds_issued), 0) AS refunds_issued,
      COALESCE(SUM(u.refunds_received), 0) AS refunds_received,
      COALESCE(SUM(u.balance_applied), 0) AS balance_applied
    FROM (
      -- Seller side
      SELECT seller_id AS user_id,
        SUM(total_usd) AS gross_sales,
        0::NUMERIC AS total_purchases,
        SUM(platform_fee_usd) AS platform_fees,
        0::NUMERIC AS refunds_issued,
        0::NUMERIC AS refunds_received,
        0::NUMERIC AS balance_applied
      FROM market_orders
      WHERE settlement_id = v_settlement_id
      GROUP BY seller_id

      UNION ALL

      -- Buyer side (now includes balance_applied_usd)
      SELECT buyer_id AS user_id,
        0::NUMERIC AS gross_sales,
        SUM(total_usd) AS total_purchases,
        0::NUMERIC AS platform_fees,
        0::NUMERIC AS refunds_issued,
        0::NUMERIC AS refunds_received,
        SUM(balance_applied_usd) AS balance_applied
      FROM market_orders
      WHERE settlement_id = v_settlement_id
      GROUP BY buyer_id

      UNION ALL

      -- Refunds received by buyer
      SELECT d.initiated_by AS user_id,
        0::NUMERIC, 0::NUMERIC, 0::NUMERIC,
        0::NUMERIC AS refunds_issued,
        COALESCE(SUM(d.refund_amount_usd), 0) AS refunds_received,
        0::NUMERIC
      FROM order_disputes d
      JOIN market_orders o ON o.id = d.order_id
      WHERE d.status IN ('buyer_accepted', 'staff_resolved')
        AND d.refund_amount_usd IS NOT NULL
        AND o.settlement_id = v_settlement_id
      GROUP BY d.initiated_by

      UNION ALL

      -- Refunds charged to seller
      SELECT o.seller_id AS user_id,
        0::NUMERIC, 0::NUMERIC, 0::NUMERIC,
        COALESCE(SUM(d.refund_amount_usd), 0) AS refunds_issued,
        0::NUMERIC,
        0::NUMERIC
      FROM order_disputes d
      JOIN market_orders o ON o.id = d.order_id
      WHERE d.status IN ('buyer_accepted', 'staff_resolved')
        AND d.refund_amount_usd IS NOT NULL
        AND o.settlement_id = v_settlement_id
      GROUP BY o.seller_id
    ) u
    GROUP BY u.user_id
  LOOP
    DECLARE
      v_net NUMERIC(10,2);
      v_hold_captured NUMERIC(10,2) := 0;
      v_hold_released NUMERIC(10,2) := 0;
      v_hold RECORD;
      v_card_purchases NUMERIC(10,2);
    BEGIN
      -- Net payout = sales - purchases - fees - refunds_issued + refunds_received
      v_net := v_user.gross_sales - v_user.total_purchases
             - v_user.platform_fees - v_user.refunds_issued
             + v_user.refunds_received;

      -- Card-portion of purchases (total minus what was paid from balance)
      v_card_purchases := v_user.total_purchases - v_user.balance_applied;

      -- Consume the held balance: move from held to spent
      IF v_user.balance_applied > 0 THEN
        UPDATE user_balances
        SET held_balance_usd = GREATEST(held_balance_usd - v_user.balance_applied, 0),
            total_spent_usd = total_spent_usd + v_user.balance_applied,
            updated_at = now()
        WHERE user_id = v_user.user_id;

        PERFORM append_ledger_entry('balance_consumed', v_user.user_id, v_user.balance_applied, 'debit', NULL, v_settlement_id,
          jsonb_build_object('type', 'purchase_settlement', 'balance_applied', v_user.balance_applied));
      END IF;

      -- Handle Stripe hold for this buyer (capture/release)
      -- Now only capture the card portion, not the full purchase amount
      SELECT * INTO v_hold
      FROM market_holds
      WHERE buyer_id = v_user.user_id AND status = 'active'
      FOR UPDATE;

      IF v_hold IS NOT NULL THEN
        v_hold_captured := LEAST(v_hold.hold_amount_cents::NUMERIC / 100, v_card_purchases);
        v_hold_released := (v_hold.hold_amount_cents::NUMERIC / 100) - v_hold_captured;

        UPDATE market_holds
        SET status = 'captured',
            spent_amount_cents = (v_hold_captured * 100)::INTEGER,
            updated_at = now()
        WHERE id = v_hold.id;

        INSERT INTO settlement_captures (
          settlement_id, hold_id, buyer_id, stripe_payment_intent_id,
          hold_amount_usd, capture_amount_usd, release_amount_usd, capture_status
        ) VALUES (
          v_settlement_id, v_hold.id, v_user.user_id, v_hold.stripe_payment_intent_id,
          v_hold.hold_amount_cents::NUMERIC / 100, v_hold_captured, v_hold_released, 'captured'
        );

        IF v_hold_captured > 0 THEN
          PERFORM append_ledger_entry('hold_captured', v_user.user_id, v_hold_captured, 'debit', NULL, v_settlement_id,
            jsonb_build_object('hold_id', v_hold.id, 'stripe_pi', v_hold.stripe_payment_intent_id));
        END IF;

        IF v_hold_released > 0 THEN
          PERFORM append_ledger_entry('hold_released', v_user.user_id, v_hold_released, 'credit', NULL, v_settlement_id,
            jsonb_build_object('hold_id', v_hold.id));
        END IF;
      END IF;

      -- Ledger: sales
      IF v_user.gross_sales > 0 THEN
        PERFORM append_ledger_entry('settlement_credit', v_user.user_id, v_user.gross_sales, 'credit', NULL, v_settlement_id,
          jsonb_build_object('type', 'gross_sales'));
      END IF;

      -- Ledger: fees
      IF v_user.platform_fees > 0 THEN
        PERFORM append_ledger_entry('fee_charged', v_user.user_id, v_user.platform_fees, 'debit', NULL, v_settlement_id);
      END IF;

      -- Ledger: refunds issued
      IF v_user.refunds_issued > 0 THEN
        PERFORM append_ledger_entry('refund_issued', v_user.user_id, v_user.refunds_issued, 'debit', NULL, v_settlement_id);
      END IF;

      -- Ledger: refunds received
      IF v_user.refunds_received > 0 THEN
        PERFORM append_ledger_entry('refund_issued', v_user.user_id, v_user.refunds_received, 'credit', NULL, v_settlement_id,
          jsonb_build_object('type', 'refund_to_buyer'));
      END IF;

      -- Insert user settlement
      INSERT INTO user_settlements (
        settlement_id, user_id, gross_sales_usd, total_purchases_usd,
        refunds_issued_usd, refunds_received_usd, platform_fees_usd,
        hold_captured_usd, hold_released_usd, net_payout_usd, status
      ) VALUES (
        v_settlement_id, v_user.user_id, v_user.gross_sales, v_user.total_purchases,
        v_user.refunds_issued, v_user.refunds_received, v_user.platform_fees,
        v_hold_captured, v_hold_released, v_net, 'pending'
      );

      -- Update user balance
      INSERT INTO user_balances (user_id, pending_usd, total_earned_usd, total_spent_usd)
      VALUES (v_user.user_id,
        GREATEST(v_net, 0),
        GREATEST(v_user.gross_sales, 0),
        v_user.total_purchases
      )
      ON CONFLICT (user_id) DO UPDATE SET
        pending_usd = user_balances.pending_usd + GREATEST(v_net, 0),
        total_earned_usd = user_balances.total_earned_usd + GREATEST(v_user.gross_sales, 0),
        total_spent_usd = user_balances.total_spent_usd + v_user.total_purchases,
        updated_at = now();

      -- Notify user
      INSERT INTO notifications (user_id, content, link_url)
      VALUES (v_user.user_id,
        CASE
          WHEN v_net > 0 THEN '💰 Market settlement: You earned $' || ROUND(v_net, 2) || ' (pending Stripe clearance).'
          WHEN v_net < 0 THEN '🧾 Market settlement: Your net purchases were $' || ROUND(ABS(v_net), 2) || '.'
          ELSE '📋 Market settlement complete. No net balance change.'
        END
        || CASE WHEN v_hold_released > 0 THEN ' Your hold of $' || ROUND(v_hold_released, 2) || ' has been released.' ELSE '' END,
        '/earnings'
      );

      v_total_captured := v_total_captured + v_hold_captured;
      v_total_payouts := v_total_payouts + GREATEST(v_net, 0);
      v_total_fees := v_total_fees + v_user.platform_fees;
      v_total_refunds := v_total_refunds + v_user.refunds_issued;
      v_user_count := v_user_count + 1;
    END;
  END LOOP;

  -- Reconciliation checks
  SELECT NOT EXISTS (
    SELECT 1 FROM user_settlements us
    WHERE us.settlement_id = v_settlement_id
      AND (SELECT balance_after FROM market_ledger WHERE user_id = us.user_id ORDER BY id DESC LIMIT 1)
        != (SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_usd ELSE -amount_usd END), 0)
            FROM market_ledger WHERE user_id = us.user_id)
  ) INTO v_check1_pass;

  v_check2_pass := (v_total_payouts + v_total_fees) <= (v_total_captured + v_total_payouts + v_total_fees);

  v_reconciliation := jsonb_build_object(
    'check1_ledger_consistency', v_check1_pass,
    'check2_settlement_balance', v_check2_pass,
    'total_orders', v_total_orders,
    'total_users', v_user_count,
    'total_captured_usd', v_total_captured,
    'total_payouts_usd', v_total_payouts,
    'total_fees_usd', v_total_fees,
    'total_refunds_usd', v_total_refunds
  );

  DECLARE
    v_total_released NUMERIC(10,2) := 0;
  BEGIN
    SELECT COALESCE(SUM(release_amount_usd), 0) INTO v_total_released
    FROM settlement_captures WHERE settlement_id = v_settlement_id;

    v_reconciliation := v_reconciliation || jsonb_build_object(
      'total_released_usd', v_total_released,
      'capture_count', (SELECT COUNT(*) FROM settlement_captures WHERE settlement_id = v_settlement_id)
    );

    UPDATE market_settlements
    SET total_orders = v_total_orders,
        total_captured_usd = v_total_captured,
        total_released_usd = v_total_released,
        total_payouts_usd = v_total_payouts,
        total_fees_usd = v_total_fees,
        total_refunds_usd = v_total_refunds,
        reconciliation_check = v_reconciliation,
        status = CASE
          WHEN v_check1_pass AND v_check2_pass THEN 'funds_pending'::clearing_status
          ELSE 'reconciliation_failed'::clearing_status
        END,
        updated_at = now()
    WHERE id = v_settlement_id;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'settlement_id', v_settlement_id,
    'users_settled', v_user_count,
    'orders_settled', v_total_orders,
    'reconciliation', v_reconciliation
  );
END;
$$;
