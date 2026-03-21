-- ============================================================================
-- Cash Flow & Settlement System
-- Platform bank ledger, buyer debts, reconciliation, and post-settlement refunds
-- ============================================================================

-- ============================================================
-- 1. platform_bank_ledger — tracks every real dollar in/out
-- ============================================================
CREATE TABLE platform_bank_ledger (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'stripe_payout_received',  -- Stripe sends us money (inflow)
    'balance_applied',         -- Buyer paid with balance (virtual inflow)
    'cashout_sent',            -- Venmo/PayPal cashout (outflow)
    'gift_card_purchased',     -- Tremendous/Reloadly gift card (outflow)
    'donation_sent',           -- GlobalGiving donation (outflow)
    'stripe_refund',           -- Stripe refund to buyer card (outflow)
    'chargeback_debit',        -- Dispute/chargeback (outflow)
    'stripe_fees',             -- Stripe processing fees (outflow)
    'manual_adjustment'        -- Admin manual correction
  )),
  direction TEXT NOT NULL CHECK (direction IN ('inflow', 'outflow')),
  amount_usd NUMERIC(10,2) NOT NULL CHECK (amount_usd > 0),
  balance_after NUMERIC(10,2) NOT NULL,  -- running balance
  provider TEXT NOT NULL CHECK (provider IN (
    'stripe', 'paypal', 'venmo', 'tremendous', 'reloadly',
    'globalgiving', 'platform', 'manual'
  )),
  reference_type TEXT,  -- 'settlement', 'redemption', 'payout', 'refund', etc.
  reference_id TEXT,    -- ID of the related record
  settlement_id UUID REFERENCES market_settlements(id),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Index for statement queries
CREATE INDEX idx_bank_ledger_created ON platform_bank_ledger(created_at DESC);
CREATE INDEX idx_bank_ledger_provider ON platform_bank_ledger(provider, created_at DESC);
CREATE INDEX idx_bank_ledger_settlement ON platform_bank_ledger(settlement_id) WHERE settlement_id IS NOT NULL;

-- Staff-only (no RLS for regular users, service role access only)
ALTER TABLE platform_bank_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read bank ledger"
  ON platform_bank_ledger FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

-- ============================================================
-- 2. append_bank_ledger_entry() — called by every provider
-- ============================================================
CREATE OR REPLACE FUNCTION append_bank_ledger_entry(
  p_event_type TEXT,
  p_direction TEXT,
  p_amount_usd NUMERIC,
  p_provider TEXT,
  p_reference_type TEXT DEFAULT NULL,
  p_reference_id TEXT DEFAULT NULL,
  p_settlement_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_current_balance NUMERIC(10,2);
  v_new_balance NUMERIC(10,2);
  v_entry_id BIGINT;
BEGIN
  -- Get current platform bank balance
  SELECT COALESCE(
    (SELECT balance_after FROM platform_bank_ledger ORDER BY id DESC LIMIT 1),
    0
  ) INTO v_current_balance;

  -- Calculate new balance
  IF p_direction = 'inflow' THEN
    v_new_balance := v_current_balance + p_amount_usd;
  ELSE
    v_new_balance := v_current_balance - p_amount_usd;
  END IF;

  INSERT INTO platform_bank_ledger (
    event_type, direction, amount_usd, balance_after, provider,
    reference_type, reference_id, settlement_id, metadata
  ) VALUES (
    p_event_type, p_direction, p_amount_usd, v_new_balance, p_provider,
    p_reference_type, p_reference_id, p_settlement_id, p_metadata
  ) RETURNING id INTO v_entry_id;

  RETURN v_entry_id;
END;
$$;

-- ============================================================
-- 3. get_platform_bank_balance() — staff-only
-- ============================================================
CREATE OR REPLACE FUNCTION get_platform_bank_balance()
RETURNS NUMERIC
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_balance NUMERIC(10,2);
BEGIN
  -- Staff check
  IF NOT is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Staff access required';
  END IF;

  SELECT COALESCE(
    (SELECT balance_after FROM platform_bank_ledger ORDER BY id DESC LIMIT 1),
    0
  ) INTO v_balance;

  RETURN v_balance;
END;
$$;

-- ============================================================
-- 4. get_platform_bank_statement() — staff-only
-- ============================================================
CREATE OR REPLACE FUNCTION get_platform_bank_statement(
  p_start DATE DEFAULT NULL,
  p_end DATE DEFAULT NULL,
  p_provider TEXT DEFAULT NULL,
  p_direction TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  id BIGINT,
  created_at TIMESTAMPTZ,
  event_type TEXT,
  direction TEXT,
  amount_usd NUMERIC,
  balance_after NUMERIC,
  provider TEXT,
  reference_type TEXT,
  reference_id TEXT,
  settlement_id UUID,
  metadata JSONB
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Staff access required';
  END IF;

  RETURN QUERY
  SELECT pbl.id, pbl.created_at, pbl.event_type, pbl.direction,
         pbl.amount_usd, pbl.balance_after, pbl.provider,
         pbl.reference_type, pbl.reference_id, pbl.settlement_id, pbl.metadata
  FROM platform_bank_ledger pbl
  WHERE (p_start IS NULL OR pbl.created_at >= p_start::timestamptz)
    AND (p_end IS NULL OR pbl.created_at < (p_end + 1)::timestamptz)
    AND (p_provider IS NULL OR pbl.provider = p_provider)
    AND (p_direction IS NULL OR pbl.direction = p_direction)
  ORDER BY pbl.id DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- ============================================================
-- 5. buyer_debts — failed capture → debt tracking
-- ============================================================
CREATE TABLE buyer_debts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID NOT NULL REFERENCES profiles(id),
  settlement_id UUID NOT NULL REFERENCES market_settlements(id),
  capture_id UUID REFERENCES settlement_captures(id),
  amount_usd NUMERIC(10,2) NOT NULL CHECK (amount_usd > 0),
  reason TEXT NOT NULL CHECK (reason IN (
    'capture_failed',       -- Stripe capture failed after retry
    'chargeback',           -- Dispute/chargeback
    'post_settlement_refund' -- Refund after settlement cleared
  )),
  status TEXT NOT NULL DEFAULT 'outstanding' CHECK (status IN (
    'outstanding',   -- Not yet recovered
    'recovered',     -- Auto-recovered from balance or new payment
    'written_off',   -- Admin decided to write off
    'disputed'       -- Buyer is disputing
  )),
  stripe_payment_intent_id TEXT,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  recovered_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE buyer_debts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own debts"
  ON buyer_debts FOR SELECT TO authenticated
  USING (buyer_id = auth.uid());

CREATE POLICY "Staff can read all debts"
  ON buyer_debts FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE INDEX idx_buyer_debts_buyer ON buyer_debts(buyer_id, status);
CREATE INDEX idx_buyer_debts_outstanding ON buyer_debts(status) WHERE status = 'outstanding';

-- ============================================================
-- 6. is_buyer_blocked() — check if buyer has outstanding debt
-- ============================================================
CREATE OR REPLACE FUNCTION is_buyer_blocked(p_buyer_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_buyer UUID;
  v_total_debt NUMERIC(10,2);
  v_debt_count INTEGER;
BEGIN
  v_buyer := COALESCE(p_buyer_id, auth.uid());

  SELECT COUNT(*), COALESCE(SUM(amount_usd), 0)
  INTO v_debt_count, v_total_debt
  FROM buyer_debts
  WHERE buyer_id = v_buyer AND status = 'outstanding';

  RETURN jsonb_build_object(
    'blocked', v_debt_count > 0,
    'outstanding_debts', v_debt_count,
    'total_debt_usd', v_total_debt
  );
END;
$$;

-- ============================================================
-- 7. auto_recover_buyer_debt() — called when buyer adds balance
-- ============================================================
CREATE OR REPLACE FUNCTION auto_recover_buyer_debt(p_buyer_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_debt RECORD;
  v_available NUMERIC(10,2);
  v_recovered_count INTEGER := 0;
  v_recovered_total NUMERIC(10,2) := 0;
BEGIN
  -- Get buyer's available balance
  SELECT COALESCE(available_usd, 0) INTO v_available
  FROM user_balances WHERE user_id = p_buyer_id;

  -- Try to recover debts oldest-first
  FOR v_debt IN
    SELECT * FROM buyer_debts
    WHERE buyer_id = p_buyer_id AND status = 'outstanding'
    ORDER BY created_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_available < v_debt.amount_usd;

    -- Debit buyer balance
    UPDATE user_balances
    SET available_usd = available_usd - v_debt.amount_usd,
        updated_at = now()
    WHERE user_id = p_buyer_id;

    v_available := v_available - v_debt.amount_usd;

    -- Mark debt as recovered
    UPDATE buyer_debts
    SET status = 'recovered', recovered_at = now(), updated_at = now()
    WHERE id = v_debt.id;

    -- Ledger entry
    PERFORM append_ledger_entry('hold_captured', p_buyer_id, v_debt.amount_usd, 'debit', NULL, v_debt.settlement_id,
      jsonb_build_object('type', 'debt_recovery', 'debt_id', v_debt.id));

    -- Bank ledger: this is money the platform now has
    PERFORM append_bank_ledger_entry('balance_applied', 'inflow', v_debt.amount_usd, 'platform',
      'debt_recovery', v_debt.id::text, v_debt.settlement_id);

    v_recovered_count := v_recovered_count + 1;
    v_recovered_total := v_recovered_total + v_debt.amount_usd;
  END LOOP;

  RETURN jsonb_build_object(
    'recovered_count', v_recovered_count,
    'recovered_total_usd', v_recovered_total,
    'remaining_available_usd', v_available
  );
END;
$$;

-- ============================================================
-- 8. platform_cash_position() — staff-only health check
-- ============================================================
CREATE OR REPLACE FUNCTION platform_cash_position()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bank_balance NUMERIC(10,2);
  v_total_inflows NUMERIC(10,2);
  v_total_outflows NUMERIC(10,2);
  v_total_user_available NUMERIC(10,2);
  v_total_user_pending NUMERIC(10,2);
  v_total_outstanding_debts NUMERIC(10,2);
  v_outstanding_debt_count INTEGER;
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Staff access required';
  END IF;

  -- Current bank balance (from ledger)
  SELECT COALESCE(
    (SELECT balance_after FROM platform_bank_ledger ORDER BY id DESC LIMIT 1), 0
  ) INTO v_bank_balance;

  -- Total inflows and outflows
  SELECT
    COALESCE(SUM(CASE WHEN direction = 'inflow' THEN amount_usd ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction = 'outflow' THEN amount_usd ELSE 0 END), 0)
  INTO v_total_inflows, v_total_outflows
  FROM platform_bank_ledger;

  -- Total user balances
  SELECT
    COALESCE(SUM(available_usd), 0),
    COALESCE(SUM(pending_usd), 0)
  INTO v_total_user_available, v_total_user_pending
  FROM user_balances;

  -- Outstanding debts
  SELECT COUNT(*), COALESCE(SUM(amount_usd), 0)
  INTO v_outstanding_debt_count, v_total_outstanding_debts
  FROM buyer_debts WHERE status = 'outstanding';

  RETURN jsonb_build_object(
    'bank_balance_usd', v_bank_balance,
    'total_inflows_usd', v_total_inflows,
    'total_outflows_usd', v_total_outflows,
    'total_user_available_usd', v_total_user_available,
    'total_user_pending_usd', v_total_user_pending,
    'outstanding_debts_count', v_outstanding_debt_count,
    'outstanding_debts_usd', v_total_outstanding_debts,
    -- Health: bank balance should cover all user available balances
    'is_healthy', v_bank_balance + v_total_outstanding_debts >= v_total_user_available,
    'coverage_ratio', CASE
      WHEN v_total_user_available > 0
      THEN ROUND((v_bank_balance + v_total_outstanding_debts) / v_total_user_available, 4)
      ELSE 1.0
    END
  );
END;
$$;

-- ============================================================
-- 9. reconcile_platform_balances() — cross-check everything
-- ============================================================
CREATE OR REPLACE FUNCTION reconcile_platform_balances()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_discrepancies JSONB := '[]'::jsonb;
  v_bank_balance NUMERIC(10,2);
  v_computed_balance NUMERIC(10,2);
  v_total_user_available NUMERIC(10,2);
  v_total_user_pending NUMERIC(10,2);
  v_total_outstanding_debts NUMERIC(10,2);
  v_total_captured NUMERIC(10,2);
  v_total_balance_applied NUMERIC(10,2);
  v_total_seller_credits NUMERIC(10,2);
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Staff access required';
  END IF;

  -- Check 1: Bank ledger running balance matches computed sum
  SELECT COALESCE(
    (SELECT balance_after FROM platform_bank_ledger ORDER BY id DESC LIMIT 1), 0
  ) INTO v_bank_balance;

  SELECT COALESCE(SUM(CASE WHEN direction = 'inflow' THEN amount_usd ELSE -amount_usd END), 0)
  INTO v_computed_balance
  FROM platform_bank_ledger;

  IF v_bank_balance != v_computed_balance THEN
    v_discrepancies := v_discrepancies || jsonb_build_object(
      'check', 'bank_ledger_integrity',
      'expected', v_computed_balance,
      'actual', v_bank_balance,
      'diff', v_bank_balance - v_computed_balance
    );
  END IF;

  -- Check 2: User available balances ≤ bank balance + outstanding debts
  SELECT COALESCE(SUM(available_usd), 0), COALESCE(SUM(pending_usd), 0)
  INTO v_total_user_available, v_total_user_pending
  FROM user_balances;

  SELECT COALESCE(SUM(amount_usd), 0) INTO v_total_outstanding_debts
  FROM buyer_debts WHERE status = 'outstanding';

  IF v_total_user_available > v_bank_balance + v_total_outstanding_debts + 0.01 THEN
    v_discrepancies := v_discrepancies || jsonb_build_object(
      'check', 'solvency',
      'user_available', v_total_user_available,
      'bank_plus_debts', v_bank_balance + v_total_outstanding_debts,
      'shortfall', v_total_user_available - (v_bank_balance + v_total_outstanding_debts)
    );
  END IF;

  -- Check 3: Per-user ledger balance_after matches computed sum
  -- (sample check on users with recent activity)
  IF EXISTS (
    SELECT 1 FROM (
      SELECT user_id,
        (SELECT balance_after FROM market_ledger ml2 WHERE ml2.user_id = ml.user_id ORDER BY id DESC LIMIT 1) AS last_balance,
        (SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_usd ELSE -amount_usd END), 0)
         FROM market_ledger ml3 WHERE ml3.user_id = ml.user_id) AS computed_balance
      FROM (SELECT DISTINCT user_id FROM market_ledger ORDER BY user_id LIMIT 100) ml
    ) checks
    WHERE last_balance != computed_balance
  ) THEN
    v_discrepancies := v_discrepancies || jsonb_build_object(
      'check', 'user_ledger_integrity',
      'detail', 'One or more users have ledger running balance mismatch'
    );
  END IF;

  RETURN jsonb_build_object(
    'healthy', jsonb_array_length(v_discrepancies) = 0,
    'checked_at', now(),
    'discrepancies', v_discrepancies,
    'summary', jsonb_build_object(
      'bank_balance', v_bank_balance,
      'user_available', v_total_user_available,
      'user_pending', v_total_user_pending,
      'outstanding_debts', v_total_outstanding_debts
    )
  );
END;
$$;

-- ============================================================
-- 10. process_post_settlement_refund() — refund after clearing
-- ============================================================
CREATE OR REPLACE FUNCTION process_post_settlement_refund(
  p_order_id UUID,
  p_amount_usd NUMERIC,
  p_reason TEXT DEFAULT 'admin_refund'
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order RECORD;
  v_settlement_id UUID;
BEGIN
  -- Staff check
  IF NOT is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Staff access required';
  END IF;

  -- Get order
  SELECT * INTO v_order FROM market_orders WHERE id = p_order_id;
  IF v_order IS NULL THEN RETURN jsonb_build_object('error', 'Order not found'); END IF;
  IF v_order.settlement_id IS NULL THEN RETURN jsonb_build_object('error', 'Order has not been settled'); END IF;

  v_settlement_id := v_order.settlement_id;

  -- Validate amount
  IF p_amount_usd <= 0 OR p_amount_usd > v_order.total_usd THEN
    RETURN jsonb_build_object('error', 'Invalid refund amount');
  END IF;

  -- Debit seller
  UPDATE user_balances
  SET available_usd = available_usd - p_amount_usd, updated_at = now()
  WHERE user_id = v_order.seller_id;

  PERFORM append_ledger_entry('refund_issued', v_order.seller_id, p_amount_usd, 'debit',
    p_order_id, v_settlement_id, jsonb_build_object('reason', p_reason, 'type', 'post_settlement'));

  -- Credit buyer
  UPDATE user_balances
  SET available_usd = available_usd + p_amount_usd, updated_at = now()
  WHERE user_id = v_order.buyer_id;

  PERFORM append_ledger_entry('refund_issued', v_order.buyer_id, p_amount_usd, 'credit',
    p_order_id, v_settlement_id, jsonb_build_object('reason', p_reason, 'type', 'refund_to_buyer'));

  -- Notify both
  INSERT INTO notifications (user_id, content, link_url) VALUES
    (v_order.seller_id, '🔄 Refund of $' || ROUND(p_amount_usd, 2) || ' issued for order #' || LEFT(p_order_id::text, 8), '/earnings'),
    (v_order.buyer_id, '💰 Refund of $' || ROUND(p_amount_usd, 2) || ' credited to your balance', '/earnings');

  RETURN jsonb_build_object('success', true, 'refunded_usd', p_amount_usd, 'order_id', p_order_id);
END;
$$;

-- ============================================================
-- 11. Admin dashboard RPCs
-- ============================================================

-- get_settlements_admin: settlements + capture stats for dashboard
CREATE OR REPLACE FUNCTION get_settlements_admin(
  p_start DATE DEFAULT NULL,
  p_end DATE DEFAULT NULL,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE(
  settlement_id UUID,
  market_date DATE,
  status clearing_status,
  total_orders INTEGER,
  total_captured_usd NUMERIC,
  total_released_usd NUMERIC,
  total_payouts_usd NUMERIC,
  total_fees_usd NUMERIC,
  total_refunds_usd NUMERIC,
  stripe_payout_id TEXT,
  stripe_payout_amount_usd NUMERIC,
  created_at TIMESTAMPTZ,
  captures_succeeded BIGINT,
  captures_failed BIGINT,
  captures_pending BIGINT,
  outstanding_debts_usd NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Staff access required';
  END IF;

  RETURN QUERY
  SELECT
    ms.id AS settlement_id,
    ms.market_date,
    ms.status,
    ms.total_orders,
    ms.total_captured_usd,
    ms.total_released_usd,
    ms.total_payouts_usd,
    ms.total_fees_usd,
    ms.total_refunds_usd,
    ms.stripe_payout_id,
    ms.stripe_payout_amount_usd,
    ms.created_at,
    COALESCE((SELECT COUNT(*) FROM settlement_captures sc WHERE sc.settlement_id = ms.id AND sc.capture_status = 'captured'), 0) AS captures_succeeded,
    COALESCE((SELECT COUNT(*) FROM settlement_captures sc WHERE sc.settlement_id = ms.id AND sc.capture_status = 'failed'), 0) AS captures_failed,
    COALESCE((SELECT COUNT(*) FROM settlement_captures sc WHERE sc.settlement_id = ms.id AND sc.capture_status = 'pending'), 0) AS captures_pending,
    COALESCE((SELECT SUM(bd.amount_usd) FROM buyer_debts bd WHERE bd.settlement_id = ms.id AND bd.status = 'outstanding'), 0) AS outstanding_debts_usd
  FROM market_settlements ms
  WHERE (p_start IS NULL OR ms.market_date >= p_start)
    AND (p_end IS NULL OR ms.market_date <= p_end)
  ORDER BY ms.market_date DESC
  LIMIT p_limit;
END;
$$;

-- get_failed_captures_admin: detail on failed captures for a settlement
CREATE OR REPLACE FUNCTION get_failed_captures_admin(p_settlement_id UUID)
RETURNS TABLE(
  capture_id UUID,
  buyer_id UUID,
  buyer_email TEXT,
  buyer_name TEXT,
  stripe_payment_intent_id TEXT,
  hold_amount_usd NUMERIC,
  capture_amount_usd NUMERIC,
  capture_status TEXT,
  error_message TEXT,
  debt_status TEXT,
  debt_amount_usd NUMERIC,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Staff access required';
  END IF;

  RETURN QUERY
  SELECT
    sc.id AS capture_id,
    sc.buyer_id,
    p.email AS buyer_email,
    p.full_name AS buyer_name,
    sc.stripe_payment_intent_id,
    sc.hold_amount_usd,
    sc.capture_amount_usd,
    sc.capture_status,
    sc.error_message,
    bd.status AS debt_status,
    bd.amount_usd AS debt_amount_usd,
    sc.created_at
  FROM settlement_captures sc
  LEFT JOIN profiles p ON p.id = sc.buyer_id
  LEFT JOIN buyer_debts bd ON bd.capture_id = sc.id
  WHERE sc.settlement_id = p_settlement_id
    AND sc.capture_status IN ('failed', 'pending')
  ORDER BY sc.created_at;
END;
$$;

-- get_reconciliation_status: calls reconcile and returns result
CREATE OR REPLACE FUNCTION get_reconciliation_status()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Staff access required';
  END IF;

  RETURN reconcile_platform_balances();
END;
$$;
