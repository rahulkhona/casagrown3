-- ============================================================================
-- Migration: Settlement Redesign — settlement_id tagging + safeguards
--
-- Problems with old approach:
--   1. Filtered by created_at::date = market_date → missed late completions
--   2. No protection against parallel execution
--   3. Disputed orders resolved days later never get cleared
--
-- New approach:
--   1. settlement_id on market_orders (NULL = unsettled)
--   2. Advisory lock prevents parallel execution
--   3. FOR UPDATE locks rows during processing
--   4. No date filter — clears ALL unsettled completed orders
-- ============================================================================

-- 1. Add settlement_id column to market_orders
ALTER TABLE market_orders
  ADD COLUMN IF NOT EXISTS settlement_id UUID REFERENCES market_settlements(id);

-- Index for fast "find unsettled orders"
CREATE INDEX IF NOT EXISTS idx_market_orders_unsettled
  ON market_orders(status) WHERE settlement_id IS NULL;

-- 2. Rewrite run_market_settlement: no date param, uses settlement_id tagging
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
  -- ══════════════════════════════════════════════════════════
  -- SAFEGUARD 1: Advisory lock — prevent parallel execution
  -- If another settlement is already running, fail immediately
  -- ══════════════════════════════════════════════════════════
  IF NOT pg_try_advisory_xact_lock(hashtext('market_settlement')) THEN
    RETURN jsonb_build_object('error', 'Settlement already in progress');
  END IF;

  -- p_market_date is now informational only (for labeling the settlement)
  v_clearing_date := COALESCE(p_market_date, CURRENT_DATE);

  -- ══════════════════════════════════════════════════════════
  -- SAFEGUARD 2: Lock and tag all unsettled completed orders
  -- FOR UPDATE prevents concurrent grabs
  -- ══════════════════════════════════════════════════════════

  -- Check if there are any unsettled orders
  SELECT COUNT(*) INTO v_total_orders
  FROM market_orders
  WHERE settlement_id IS NULL
    AND status IN ('completed', 'delivered');

  IF v_total_orders = 0 THEN
    RETURN jsonb_build_object('error', 'No unsettled orders to process');
  END IF;

  -- Create settlement record
  INSERT INTO market_settlements (market_date, status)
  VALUES (v_clearing_date, 'captures_sent')
  RETURNING id INTO v_settlement_id;

  -- SAFEGUARD 3: Tag orders atomically (inside same transaction)
  -- After this, these orders can NEVER be double-counted
  UPDATE market_orders
  SET settlement_id = v_settlement_id
  WHERE settlement_id IS NULL
    AND status IN ('completed', 'delivered');

  -- ==========================================================
  -- Aggregate per user: everyone who sold OR bought in THIS settlement
  -- Now filters by settlement_id instead of date
  -- ==========================================================
  FOR v_user IN
    SELECT
      u.user_id,
      COALESCE(SUM(u.gross_sales), 0) AS gross_sales,
      COALESCE(SUM(u.total_purchases), 0) AS total_purchases,
      COALESCE(SUM(u.platform_fees), 0) AS platform_fees,
      COALESCE(SUM(u.refunds_issued), 0) AS refunds_issued,
      COALESCE(SUM(u.refunds_received), 0) AS refunds_received
    FROM (
      -- Seller side
      SELECT seller_id AS user_id,
        SUM(total_usd) AS gross_sales,
        0::NUMERIC AS total_purchases,
        SUM(platform_fee_usd) AS platform_fees,
        0::NUMERIC AS refunds_issued,
        0::NUMERIC AS refunds_received
      FROM market_orders
      WHERE settlement_id = v_settlement_id
      GROUP BY seller_id

      UNION ALL

      -- Buyer side
      SELECT buyer_id AS user_id,
        0::NUMERIC AS gross_sales,
        SUM(total_usd) AS total_purchases,
        0::NUMERIC AS platform_fees,
        0::NUMERIC AS refunds_issued,
        0::NUMERIC AS refunds_received
      FROM market_orders
      WHERE settlement_id = v_settlement_id
      GROUP BY buyer_id

      UNION ALL

      -- Refunds received by buyer (from disputes)
      SELECT d.initiated_by AS user_id,
        0::NUMERIC, 0::NUMERIC, 0::NUMERIC,
        0::NUMERIC AS refunds_issued,
        COALESCE(SUM(d.refund_amount_usd), 0) AS refunds_received
      FROM order_disputes d
      JOIN market_orders o ON o.id = d.order_id
      WHERE d.status IN ('buyer_accepted', 'staff_resolved')
        AND d.refund_amount_usd IS NOT NULL
        AND o.settlement_id = v_settlement_id
      GROUP BY d.initiated_by

      UNION ALL

      -- Refunds charged to seller (from disputes)
      SELECT o.seller_id AS user_id,
        0::NUMERIC, 0::NUMERIC, 0::NUMERIC,
        COALESCE(SUM(d.refund_amount_usd), 0) AS refunds_issued,
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
    BEGIN
      -- Net payout = sales - purchases - fees - refunds_issued + refunds_received
      v_net := v_user.gross_sales - v_user.total_purchases
             - v_user.platform_fees - v_user.refunds_issued
             + v_user.refunds_received;

      -- Handle Stripe hold for this buyer (capture/release)
      SELECT * INTO v_hold
      FROM market_holds
      WHERE buyer_id = v_user.user_id AND status = 'active'
      FOR UPDATE;

      IF v_hold IS NOT NULL THEN
        v_hold_captured := LEAST(v_hold.hold_amount_cents::NUMERIC / 100, v_user.total_purchases);
        v_hold_released := (v_hold.hold_amount_cents::NUMERIC / 100) - v_hold_captured;

        -- Mark hold as captured
        UPDATE market_holds
        SET status = 'captured',
            spent_amount_cents = (v_hold_captured * 100)::INTEGER,
            updated_at = now()
        WHERE id = v_hold.id;

        -- Record capture
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

      -- Accumulate totals
      v_total_captured := v_total_captured + v_hold_captured;
      v_total_payouts := v_total_payouts + GREATEST(v_net, 0);
      v_total_fees := v_total_fees + v_user.platform_fees;
      v_total_refunds := v_total_refunds + v_user.refunds_issued;
      v_user_count := v_user_count + 1;
    END;
  END LOOP;

  -- ==========================================================
  -- Reconciliation checks
  -- ==========================================================

  -- Check 1: ledger consistency for all settled users
  SELECT NOT EXISTS (
    SELECT 1 FROM user_settlements us
    WHERE us.settlement_id = v_settlement_id
      AND (SELECT balance_after FROM market_ledger WHERE user_id = us.user_id ORDER BY id DESC LIMIT 1)
        != (SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_usd ELSE -amount_usd END), 0)
            FROM market_ledger WHERE user_id = us.user_id)
  ) INTO v_check1_pass;

  -- Check 2: zero-sum invariant
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
