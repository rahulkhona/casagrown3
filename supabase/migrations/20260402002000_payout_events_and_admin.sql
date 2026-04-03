-- ============================================================================
-- Payout Events Tracking & Admin Visibility
-- 1. stripe_payout_events — audit trail for all Stripe payout events
-- 2. Fix confirm_settlement_funds_received → notify_market_event
-- 3. Admin RPCs for payout events
-- ============================================================================


-- ============================================================
-- 1. stripe_payout_events — records every payout.paid and payout.failed
-- ============================================================
CREATE TABLE IF NOT EXISTS stripe_payout_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_payout_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('paid', 'failed')),
  amount_usd NUMERIC(10,2) NOT NULL,
  failure_code TEXT,
  failure_message TEXT,
  matched_settlement_ids UUID[] DEFAULT '{}',
  affected_user_ids UUID[] DEFAULT '{}',
  raw_event JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payout_events_type ON stripe_payout_events(event_type);
CREATE INDEX IF NOT EXISTS idx_payout_events_created ON stripe_payout_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payout_events_stripe_id ON stripe_payout_events(stripe_payout_id);

ALTER TABLE stripe_payout_events ENABLE ROW LEVEL SECURITY;

-- Staff-only read
CREATE POLICY "Staff can read payout events"
  ON stripe_payout_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()));

-- Service role can insert (webhook inserts with service_role)
CREATE POLICY "Service role can insert payout events"
  ON stripe_payout_events FOR INSERT TO authenticated
  WITH CHECK (true);


-- ============================================================
-- 2. Fix confirm_settlement_funds_received
--    Replace legacy INSERT INTO notifications with notify_market_event
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
  v_notif_content TEXT;
BEGIN
  SELECT * INTO v_settlement FROM market_settlements WHERE id = p_settlement_id FOR UPDATE;
  IF v_settlement IS NULL THEN RETURN jsonb_build_object('error', 'Settlement not found'); END IF;
  IF v_settlement.status != 'funds_pending' THEN
    RETURN jsonb_build_object('error', 'Settlement not in funds_pending state', 'current_status', v_settlement.status);
  END IF;

  -- Check 3: Stripe amount reconciliation
  IF p_stripe_payout_amount_usd IS NOT NULL THEN
    SELECT COUNT(*) INTO v_capture_count
    FROM settlement_captures WHERE settlement_id = p_settlement_id AND capture_amount_usd > 0;

    v_estimated_stripe_fees := (v_settlement.total_captured_usd * 0.029) + (v_capture_count * 0.30);
    v_expected_after_fees := v_settlement.total_captured_usd - v_estimated_stripe_fees;
    v_tolerance := GREATEST(v_estimated_stripe_fees * 0.10, 0.50);
    v_stripe_mismatch := ABS(p_stripe_payout_amount_usd - v_expected_after_fees);
    v_check3_pass := v_stripe_mismatch <= v_tolerance;

    IF NOT v_check3_pass THEN
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

    -- ★ FIXED: Use notify_market_event instead of INSERT INTO notifications
    v_notif_content := CASE
      WHEN v_user.net_payout_usd > 0 THEN '✅ $' || ROUND(v_user.net_payout_usd, 2) || ' is now available for withdrawal!'
      ELSE '✅ Market settlement cleared.'
    END;

    BEGIN
      PERFORM notify_market_event(
        v_user.user_id,
        v_notif_content,
        '/earnings'
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'notify_market_event failed in confirm_settlement for user %: %', v_user.user_id, SQLERRM;
    END;
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


-- ============================================================
-- 3. Admin RPCs
-- ============================================================

-- Get payout events (staff-only)
CREATE OR REPLACE FUNCTION get_payout_events_admin(
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  stripe_payout_id TEXT,
  event_type TEXT,
  amount_usd NUMERIC,
  failure_code TEXT,
  failure_message TEXT,
  matched_settlement_ids UUID[],
  affected_user_ids UUID[],
  created_at TIMESTAMPTZ,
  settlement_count INTEGER,
  affected_user_count INTEGER
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized: staff only';
  END IF;

  RETURN QUERY
  SELECT
    pe.id,
    pe.stripe_payout_id,
    pe.event_type,
    pe.amount_usd,
    pe.failure_code,
    pe.failure_message,
    pe.matched_settlement_ids,
    pe.affected_user_ids,
    pe.created_at,
    COALESCE(array_length(pe.matched_settlement_ids, 1), 0)::INTEGER AS settlement_count,
    COALESCE(array_length(pe.affected_user_ids, 1), 0)::INTEGER AS affected_user_count
  FROM stripe_payout_events pe
  ORDER BY pe.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- Get affected users/settlements for a specific payout event (staff-only)
CREATE OR REPLACE FUNCTION get_payout_event_details(p_event_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_event RECORD;
  v_settlements JSONB;
  v_users JSONB;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized: staff only';
  END IF;

  SELECT * INTO v_event FROM stripe_payout_events WHERE id = p_event_id;
  IF v_event IS NULL THEN
    RETURN jsonb_build_object('error', 'Event not found');
  END IF;

  -- Get settlement details
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', ms.id,
    'market_date', ms.market_date,
    'status', ms.status,
    'total_captured_usd', ms.total_captured_usd,
    'total_payouts_usd', ms.total_payouts_usd,
    'total_orders', ms.total_orders
  )), '[]'::jsonb)
  INTO v_settlements
  FROM market_settlements ms
  WHERE ms.id = ANY(v_event.matched_settlement_ids);

  -- Get affected user details
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'user_id', p.id,
    'full_name', p.full_name,
    'email', p.email,
    'pending_usd', COALESCE(ub.pending_usd, 0),
    'available_usd', COALESCE(ub.available_usd, 0)
  )), '[]'::jsonb)
  INTO v_users
  FROM profiles p
  LEFT JOIN user_balances ub ON ub.user_id = p.id
  WHERE p.id = ANY(v_event.affected_user_ids);

  RETURN jsonb_build_object(
    'event', jsonb_build_object(
      'id', v_event.id,
      'stripe_payout_id', v_event.stripe_payout_id,
      'event_type', v_event.event_type,
      'amount_usd', v_event.amount_usd,
      'failure_code', v_event.failure_code,
      'failure_message', v_event.failure_message,
      'created_at', v_event.created_at
    ),
    'settlements', v_settlements,
    'affected_users', v_users
  );
END;
$$;
