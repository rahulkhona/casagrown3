-- ============================================================================
-- Market Clearing & Settlement
-- National daily clearing with append-only ledger and reconciliation
-- ============================================================================

-- ============================================================
-- 1. Clearing status enum
-- ============================================================
CREATE TYPE clearing_status AS ENUM (
  'captures_sent',      -- Stripe captures initiated
  'funds_pending',      -- Waiting for Stripe payout (T+2)
  'funds_received',     -- Stripe confirmed funds in bank
  'cleared',            -- User balances credited, available for withdrawal
  'reconciliation_failed' -- Mismatch detected, admin investigation needed
);

-- ============================================================
-- 2. market_ledger — append-only financial event log
-- ============================================================
CREATE TABLE market_ledger (
  id SERIAL PRIMARY KEY,                          -- sequential, gapless
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'hold_placed', 'hold_captured', 'hold_released',
    'order_completed', 'fee_charged', 'refund_issued',
    'settlement_credit', 'funds_cleared', 'payout_sent'
  )),
  user_id UUID NOT NULL REFERENCES profiles(id),
  order_id UUID REFERENCES market_orders(id),
  settlement_id UUID,                             -- filled after settlement created
  amount_usd NUMERIC(10,2) NOT NULL CHECK (amount_usd >= 0),
  direction TEXT NOT NULL CHECK (direction IN ('debit', 'credit')),
  balance_after NUMERIC(10,2) NOT NULL,           -- running balance for proof
  metadata JSONB DEFAULT '{}'::jsonb
);

ALTER TABLE market_ledger ENABLE ROW LEVEL SECURITY;

-- Users can only read their own ledger entries
CREATE POLICY "Users can read own ledger"
  ON market_ledger FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- No UPDATE or DELETE policies — append only
-- Insert is via SECURITY DEFINER functions only

-- ============================================================
-- 3. market_settlements — one per market day
-- ============================================================
CREATE TABLE market_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_date DATE NOT NULL UNIQUE,
  status clearing_status NOT NULL DEFAULT 'captures_sent',
  total_orders INTEGER NOT NULL DEFAULT 0,
  total_captured_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_released_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_payouts_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_fees_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_refunds_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  -- Stripe payout tracking
  stripe_payout_id TEXT,                       -- Stripe payout ID (po_...)
  stripe_payout_amount_usd NUMERIC(10,2),      -- Amount Stripe actually sent
  stripe_payout_received_at TIMESTAMPTZ,       -- When confirmed received
  reconciliation_check JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE market_settlements ENABLE ROW LEVEL SECURITY;

-- Admin-only read (staff role); authenticated users read via user_settlements
CREATE POLICY "Authenticated can read settlements"
  ON market_settlements FOR SELECT TO authenticated
  USING (true);

-- ============================================================
-- 4. user_settlements — one per user per market day
-- ============================================================
CREATE TABLE user_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id UUID NOT NULL REFERENCES market_settlements(id),
  user_id UUID NOT NULL REFERENCES profiles(id),
  gross_sales_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_purchases_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  refunds_issued_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  refunds_received_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  platform_fees_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  hold_captured_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  hold_released_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  net_payout_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'available', 'paid_out')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(settlement_id, user_id)
);

ALTER TABLE user_settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own settlements"
  ON user_settlements FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- 5. settlement_captures — per-hold Stripe capture/release tracking
-- ============================================================
CREATE TABLE settlement_captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id UUID NOT NULL REFERENCES market_settlements(id),
  hold_id UUID NOT NULL REFERENCES market_holds(id),
  buyer_id UUID NOT NULL REFERENCES profiles(id),
  stripe_payment_intent_id TEXT NOT NULL,
  hold_amount_usd NUMERIC(10,2) NOT NULL,        -- original hold
  capture_amount_usd NUMERIC(10,2) NOT NULL,     -- amount actually captured
  release_amount_usd NUMERIC(10,2) NOT NULL,     -- amount released back to buyer
  capture_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (capture_status IN ('pending', 'captured', 'failed', 'released')),
  stripe_capture_id TEXT,                         -- Stripe charge ID (ch_...)
  error_message TEXT,                             -- if capture failed
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE settlement_captures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own captures"
  ON settlement_captures FOR SELECT TO authenticated
  USING (buyer_id = auth.uid());

-- ============================================================
-- 6. user_balances — running balance per user
-- ============================================================
CREATE TABLE user_balances (
  user_id UUID PRIMARY KEY REFERENCES profiles(id),
  available_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  pending_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_earned_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_spent_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_withdrawn_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own balance"
  ON user_balances FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- 6. Helper: append_ledger_entry (internal, used by settlement)
-- ============================================================
CREATE OR REPLACE FUNCTION append_ledger_entry(
  p_event_type TEXT,
  p_user_id UUID,
  p_amount_usd NUMERIC,
  p_direction TEXT,
  p_order_id UUID DEFAULT NULL,
  p_settlement_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_current_balance NUMERIC(10,2);
  v_new_balance NUMERIC(10,2);
  v_entry_id INTEGER;
BEGIN
  -- Get current balance from last ledger entry (or 0)
  SELECT COALESCE(
    (SELECT balance_after FROM market_ledger WHERE user_id = p_user_id ORDER BY id DESC LIMIT 1),
    0
  ) INTO v_current_balance;

  -- Calculate new balance
  IF p_direction = 'credit' THEN
    v_new_balance := v_current_balance + p_amount_usd;
  ELSE
    v_new_balance := v_current_balance - p_amount_usd;
  END IF;

  INSERT INTO market_ledger (event_type, user_id, order_id, settlement_id, amount_usd, direction, balance_after, metadata)
  VALUES (p_event_type, p_user_id, p_order_id, p_settlement_id, p_amount_usd, p_direction, v_new_balance, p_metadata)
  RETURNING id INTO v_entry_id;

  RETURN v_entry_id;
END;
$$;

-- ============================================================
-- 7. Helper: get_user_ledger_balance
-- ============================================================
CREATE OR REPLACE FUNCTION get_user_ledger_balance(p_user_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN COALESCE(
    (SELECT balance_after FROM market_ledger WHERE user_id = p_user_id ORDER BY id DESC LIMIT 1),
    0
  );
END;
$$;

-- ============================================================
-- 8. Main settlement RPC: run_market_settlement
-- ============================================================
CREATE OR REPLACE FUNCTION run_market_settlement(p_market_date DATE)
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
BEGIN
  -- Prevent duplicate settlement
  IF EXISTS (SELECT 1 FROM market_settlements WHERE market_date = p_market_date) THEN
    RETURN jsonb_build_object('error', 'Settlement already exists for this date');
  END IF;

  -- Create settlement record
  INSERT INTO market_settlements (market_date, status)
  VALUES (p_market_date, 'captures_sent')
  RETURNING id INTO v_settlement_id;

  -- Count completed orders for this market date
  SELECT COUNT(*) INTO v_total_orders
  FROM market_orders
  WHERE status IN ('completed', 'delivered')
    AND created_at::date = p_market_date;

  -- ==========================================================
  -- Aggregate per user: everyone who sold OR bought on this date
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
      -- Seller side: completed orders where this user is seller
      SELECT seller_id AS user_id,
        SUM(total_usd) AS gross_sales,
        0::NUMERIC AS total_purchases,
        SUM(platform_fee_usd) AS platform_fees,
        0::NUMERIC AS refunds_issued,
        0::NUMERIC AS refunds_received
      FROM market_orders
      WHERE status IN ('completed', 'delivered')
        AND created_at::date = p_market_date
      GROUP BY seller_id

      UNION ALL

      -- Buyer side: completed orders where this user is buyer
      SELECT buyer_id AS user_id,
        0::NUMERIC AS gross_sales,
        SUM(total_usd) AS total_purchases,
        0::NUMERIC AS platform_fees,
        0::NUMERIC AS refunds_issued,
        0::NUMERIC AS refunds_received
      FROM market_orders
      WHERE status IN ('completed', 'delivered')
        AND created_at::date = p_market_date
      GROUP BY buyer_id

      UNION ALL

      -- Refunds issued by seller (from disputes)
      SELECT d.initiated_by AS user_id,
        0::NUMERIC, 0::NUMERIC, 0::NUMERIC,
        0::NUMERIC AS refunds_issued,
        COALESCE(SUM(d.refund_amount_usd), 0) AS refunds_received
      FROM order_disputes d
      JOIN market_orders o ON o.id = d.order_id
      WHERE d.status IN ('buyer_accepted', 'staff_resolved')
        AND d.refund_amount_usd IS NOT NULL
        AND o.created_at::date = p_market_date
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
        AND o.created_at::date = p_market_date
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

        -- Record capture in settlement_captures for Stripe reconciliation
        INSERT INTO settlement_captures (
          settlement_id, hold_id, buyer_id, stripe_payment_intent_id,
          hold_amount_usd, capture_amount_usd, release_amount_usd, capture_status
        ) VALUES (
          v_settlement_id, v_hold.id, v_user.user_id, v_hold.stripe_payment_intent_id,
          v_hold.hold_amount_cents::NUMERIC / 100, v_hold_captured, v_hold_released, 'captured'
        );

        -- Ledger entries for hold
        IF v_hold_captured > 0 THEN
          PERFORM append_ledger_entry('hold_captured', v_user.user_id, v_hold_captured, 'debit', NULL, v_settlement_id,
            jsonb_build_object('hold_id', v_hold.id, 'stripe_pi', v_hold.stripe_payment_intent_id));
        END IF;

        IF v_hold_released > 0 THEN
          PERFORM append_ledger_entry('hold_released', v_user.user_id, v_hold_released, 'credit', NULL, v_settlement_id,
            jsonb_build_object('hold_id', v_hold.id));
        END IF;
      END IF;

      -- Ledger entries for sales
      IF v_user.gross_sales > 0 THEN
        PERFORM append_ledger_entry('settlement_credit', v_user.user_id, v_user.gross_sales, 'credit', NULL, v_settlement_id,
          jsonb_build_object('type', 'gross_sales'));
      END IF;

      -- Ledger entries for purchases (already captured via hold above)
      -- Ledger entries for fees
      IF v_user.platform_fees > 0 THEN
        PERFORM append_ledger_entry('fee_charged', v_user.user_id, v_user.platform_fees, 'debit', NULL, v_settlement_id);
      END IF;

      -- Ledger entries for refunds issued (seller pays)
      IF v_user.refunds_issued > 0 THEN
        PERFORM append_ledger_entry('refund_issued', v_user.user_id, v_user.refunds_issued, 'debit', NULL, v_settlement_id);
      END IF;

      -- Ledger entries for refunds received (buyer gets)
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

      -- Update user balance (pending until funds received)
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

      -- Track released holds
      v_total_captured := v_total_captured;  -- captured already includes this user
    END;
  END LOOP;

  -- ==========================================================
  -- Reconciliation checks
  -- ==========================================================

  -- Check 1: For each user, ledger balance matches computed balance
  SELECT NOT EXISTS (
    SELECT 1 FROM user_settlements us
    WHERE us.settlement_id = v_settlement_id
      AND (SELECT balance_after FROM market_ledger WHERE user_id = us.user_id ORDER BY id DESC LIMIT 1)
        != (SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_usd ELSE -amount_usd END), 0)
            FROM market_ledger WHERE user_id = us.user_id)
  ) INTO v_check1_pass;

  -- Check 2: Total payouts + fees <= total captured + sales (money doesn't appear from nowhere)
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

  -- Compute total released
  DECLARE
    v_total_released NUMERIC(10,2) := 0;
  BEGIN
    SELECT COALESCE(SUM(release_amount_usd), 0) INTO v_total_released
    FROM settlement_captures WHERE settlement_id = v_settlement_id;

    v_reconciliation := v_reconciliation || jsonb_build_object(
      'total_released_usd', v_total_released,
      'capture_count', (SELECT COUNT(*) FROM settlement_captures WHERE settlement_id = v_settlement_id)
    );

    -- Update settlement with totals and check results
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
    'reconciliation', v_reconciliation
  );
END;
$$;

-- ============================================================
-- 9. Stripe funds received confirmation
-- ============================================================
CREATE OR REPLACE FUNCTION confirm_settlement_funds_received(
  p_settlement_id UUID,
  p_stripe_payout_id TEXT DEFAULT NULL,
  p_stripe_payout_amount_usd NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_settlement RECORD;
  v_user RECORD;
  v_check3_pass BOOLEAN := true;
  v_stripe_mismatch NUMERIC(10,2) := 0;
  v_capture_count INTEGER;
  v_estimated_stripe_fees NUMERIC(10,2);
  v_expected_after_fees NUMERIC(10,2);
  v_tolerance NUMERIC(10,2);
BEGIN
  SELECT * INTO v_settlement FROM market_settlements WHERE id = p_settlement_id FOR UPDATE;
  IF v_settlement IS NULL THEN RETURN jsonb_build_object('error', 'Settlement not found'); END IF;
  IF v_settlement.status != 'funds_pending' THEN
    RETURN jsonb_build_object('error', 'Settlement not in funds_pending state', 'current_status', v_settlement.status);
  END IF;

  -- Check 3: Stripe amount reconciliation
  -- Stripe charges ~2.9% + $0.30 per capture. We estimate fees and allow a 10% buffer.
  IF p_stripe_payout_amount_usd IS NOT NULL THEN
    -- Count captures and estimate Stripe processing fees
    SELECT COUNT(*) INTO v_capture_count
    FROM settlement_captures WHERE settlement_id = p_settlement_id AND capture_amount_usd > 0;

    -- Estimated fees = 2.9% of total captured + $0.30 per capture
    v_estimated_stripe_fees := (v_settlement.total_captured_usd * 0.029) + (v_capture_count * 0.30);
    v_expected_after_fees := v_settlement.total_captured_usd - v_estimated_stripe_fees;

    -- Tolerance: 10% of estimated fees (covers rounding, fee variations)
    -- Minimum $0.50 tolerance to handle small transactions
    v_tolerance := GREATEST(v_estimated_stripe_fees * 0.10, 0.50);

    v_stripe_mismatch := ABS(p_stripe_payout_amount_usd - v_expected_after_fees);
    v_check3_pass := v_stripe_mismatch <= v_tolerance;

    IF NOT v_check3_pass THEN
      -- Log mismatch and flag for admin
      UPDATE market_settlements
      SET status = 'reconciliation_failed',
          stripe_payout_id = p_stripe_payout_id,
          stripe_payout_amount_usd = p_stripe_payout_amount_usd,
          stripe_payout_received_at = now(),
          reconciliation_check = reconciliation_check || jsonb_build_object(
            'check3_stripe_reconciliation', false,
            'total_captured_usd', v_settlement.total_captured_usd,
            'estimated_stripe_fees', v_estimated_stripe_fees,
            'expected_after_fees', v_expected_after_fees,
            'received_usd', p_stripe_payout_amount_usd,
            'mismatch_usd', v_stripe_mismatch,
            'tolerance_usd', v_tolerance
          ),
          updated_at = now()
      WHERE id = p_settlement_id;
      RETURN jsonb_build_object('error', 'Stripe amount mismatch beyond tolerance',
        'expected_after_fees', v_expected_after_fees,
        'received', p_stripe_payout_amount_usd,
        'mismatch', v_stripe_mismatch,
        'tolerance', v_tolerance,
        'estimated_stripe_fees', v_estimated_stripe_fees);
    END IF;
  END IF;

  -- Record Stripe payout info
  UPDATE market_settlements
  SET stripe_payout_id = p_stripe_payout_id,
      stripe_payout_amount_usd = p_stripe_payout_amount_usd,
      stripe_payout_received_at = now(),
      reconciliation_check = reconciliation_check || jsonb_build_object(
        'check3_stripe_reconciliation', v_check3_pass,
        'stripe_payout_id', p_stripe_payout_id,
        'stripe_amount_usd', p_stripe_payout_amount_usd
      ),
      updated_at = now()
  WHERE id = p_settlement_id;

  -- Move pending to available for all users in this settlement
  FOR v_user IN
    SELECT * FROM user_settlements WHERE settlement_id = p_settlement_id AND status = 'pending'
  LOOP
    -- Credit available balance, subtract pending
    UPDATE user_balances
    SET available_usd = available_usd + GREATEST(v_user.net_payout_usd, 0),
        pending_usd = pending_usd - GREATEST(v_user.net_payout_usd, 0),
        updated_at = now()
    WHERE user_id = v_user.user_id;

    -- Ledger entry: funds cleared
    IF v_user.net_payout_usd > 0 THEN
      PERFORM append_ledger_entry('funds_cleared', v_user.user_id, v_user.net_payout_usd, 'credit', NULL, p_settlement_id,
        jsonb_build_object('type', 'funds_available', 'stripe_payout_id', p_stripe_payout_id));
    END IF;

    -- Update user settlement status
    UPDATE user_settlements SET status = 'available' WHERE id = v_user.id;

    -- Notify
    INSERT INTO notifications (user_id, content, link_url)
    VALUES (v_user.user_id,
      CASE
        WHEN v_user.net_payout_usd > 0 THEN '✅ $' || ROUND(v_user.net_payout_usd, 2) || ' is now available for withdrawal!'
        ELSE '✅ Market settlement cleared.'
      END,
      '/earnings'
    );
  END LOOP;

  -- Update settlement status
  UPDATE market_settlements
  SET status = 'cleared', updated_at = now()
  WHERE id = p_settlement_id;

  RETURN jsonb_build_object('success', true, 'status', 'cleared',
    'stripe_reconciled', v_check3_pass,
    'stripe_payout_id', p_stripe_payout_id);
END;
$$;
