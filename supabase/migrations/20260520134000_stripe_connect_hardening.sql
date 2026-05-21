-- Migration: Stripe Connect Hardening — Schema & Function Fixes
-- Created: 2026-05-20
-- Fixes: HIGH-4, HIGH-5, HIGH-6, CRIT-2, CRIT-3

-- ── HIGH-6: Add transfer lifecycle timestamps to user_settlements ────────────
ALTER TABLE "public"."user_settlements"
  ADD COLUMN IF NOT EXISTS "stripe_transfer_initiated_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "stripe_transfer_completed_at" timestamptz;

-- ── HIGH-4: Partial index on user_settlements.status for fast transfer queries ─
-- Avoids full table scan in execute-settlement-captures as rows accumulate
CREATE INDEX IF NOT EXISTS user_settlements_status_pending_idx
  ON "public"."user_settlements"(status)
  WHERE status IN ('stripe_transfer_pending', 'pending', 'stripe_transfer_failed');

-- ── HIGH-5: Separate Stripe vs wallet payout totals on market_settlements ────
-- Allows bank reconciliation to distinguish payout channels
ALTER TABLE "public"."market_settlements"
  ADD COLUMN IF NOT EXISTS "total_stripe_payouts_usd" numeric(10,2) DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "total_wallet_payouts_usd" numeric(10,2) DEFAULT 0 NOT NULL;

-- ── MED-4: Audit log table for stripe_connect_active state changes ────────────
CREATE TABLE IF NOT EXISTS "public"."stripe_connect_audit_log" (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  changed_by    text NOT NULL CHECK (changed_by IN ('user', 'webhook', 'admin')),
  old_active    boolean,
  new_active    boolean,
  old_onboarding_completed boolean,
  new_onboarding_completed boolean,
  reason        text,
  created_at    timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS stripe_connect_audit_log_user_id_idx
  ON "public"."stripe_connect_audit_log"(user_id);

-- ── Update set_stripe_connect_active to write audit trail ────────────────────
CREATE OR REPLACE FUNCTION "public"."set_stripe_connect_active"(p_active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_old_active boolean;
  v_old_onboarding boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Read current state atomically (FOR UPDATE to prevent race on toggle)
  SELECT stripe_connect_active, stripe_onboarding_completed
  INTO v_old_active, v_old_onboarding
  FROM profiles
  WHERE id = v_user_id
  FOR UPDATE;

  -- Guard: only allow activation if onboarding is complete
  IF p_active AND (v_old_onboarding IS NOT TRUE) THEN
    RAISE EXCEPTION 'Onboarding not completed';
  END IF;

  UPDATE profiles
  SET stripe_connect_active = p_active
  WHERE id = v_user_id;

  -- Write audit entry
  INSERT INTO stripe_connect_audit_log
    (user_id, changed_by, old_active, new_active, old_onboarding_completed, new_onboarding_completed)
  VALUES
    (v_user_id, 'user', v_old_active, p_active, v_old_onboarding, v_old_onboarding);
END;
$$;

GRANT EXECUTE ON FUNCTION "public"."set_stripe_connect_active"(boolean) TO "authenticated";

-- ── MED-5: Admin RPC to override stripe_connect_active for any user ──────────
CREATE OR REPLACE FUNCTION "public"."admin_set_stripe_connect_active"(
  p_target_user_id uuid,
  p_active boolean,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_is_admin boolean;
  v_old_active boolean;
  v_old_onboarding boolean;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verify caller is admin staff
  SELECT EXISTS (
    SELECT 1 FROM staff_members
    WHERE user_id = v_caller_id
      AND roles @> ARRAY['admin']::text[]
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Unauthorized: admin role required';
  END IF;

  SELECT stripe_connect_active, stripe_onboarding_completed
  INTO v_old_active, v_old_onboarding
  FROM profiles
  WHERE id = p_target_user_id;

  UPDATE profiles
  SET stripe_connect_active = p_active
  WHERE id = p_target_user_id;

  INSERT INTO stripe_connect_audit_log
    (user_id, changed_by, old_active, new_active, old_onboarding_completed, new_onboarding_completed, reason)
  VALUES
    (p_target_user_id, 'admin', v_old_active, p_active, v_old_onboarding, v_old_onboarding, p_reason);
END;
$$;

-- Admin-only: service_role or authenticated admins (RLS checked inside function)
GRANT EXECUTE ON FUNCTION "public"."admin_set_stripe_connect_active"(uuid, boolean, text) TO "authenticated";

-- ── CRIT-2 + HIGH-5: Replace run_market_settlement with fixed version ─────────
-- Fixes:
--   CRIT-2: v_check2_pass was a tautology (always true)
--   CRIT-3: stripe_connect_id NULL not guarded before stripe_transfer_pending
--   HIGH-5: total_payouts_usd now split into stripe vs wallet channels

DROP FUNCTION IF EXISTS run_market_settlement(date);

CREATE OR REPLACE FUNCTION run_market_settlement(p_market_date DATE DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_settlement_id UUID;
  v_user RECORD;
  v_total_orders INTEGER := 0;
  v_total_captured NUMERIC(10,2) := 0;
  v_total_payouts NUMERIC(10,2) := 0;
  v_total_stripe_payouts NUMERIC(10,2) := 0;   -- HIGH-5: track separately
  v_total_wallet_payouts NUMERIC(10,2) := 0;   -- HIGH-5: track separately
  v_total_fees NUMERIC(10,2) := 0;
  v_total_refunds NUMERIC(10,2) := 0;
  v_total_balance_applied NUMERIC(10,2) := 0;  -- CRIT-2: needed for correct check2 formula
  v_user_count INTEGER := 0;
  v_check1_pass BOOLEAN;
  v_check2_pass BOOLEAN;
  v_reconciliation JSONB;
  v_clearing_date DATE;
  v_expired_count INTEGER := 0;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('market_settlement')) THEN
    RETURN jsonb_build_object('error', 'Settlement already in progress');
  END IF;

  v_clearing_date := COALESCE(p_market_date, CURRENT_DATE);

  -- Expire stale holds before processing (Stripe auto-releases after 7 days)
  UPDATE market_holds
  SET status = 'expired', updated_at = now()
  WHERE status = 'active'
    AND created_at < now() - interval '7 days';
  GET DIAGNOSTICS v_expired_count = ROW_COUNT;

  IF v_expired_count > 0 THEN
    RAISE NOTICE 'Auto-expired % stale holds older than 7 days', v_expired_count;
  END IF;

  SELECT COUNT(*) INTO v_total_orders
  FROM market_orders WHERE settlement_id IS NULL AND status IN ('completed', 'delivered');

  IF v_total_orders = 0 THEN
    RETURN jsonb_build_object('error', 'No unsettled orders to process',
      'stale_holds_expired', v_expired_count);
  END IF;

  INSERT INTO market_settlements (market_date, status)
  VALUES (v_clearing_date, 'captures_sent') RETURNING id INTO v_settlement_id;

  UPDATE market_orders SET settlement_id = v_settlement_id
  WHERE settlement_id IS NULL AND status IN ('completed', 'delivered');

  FOR v_user IN
    SELECT u.user_id,
      COALESCE(SUM(u.gross_sales), 0) AS gross_sales,
      COALESCE(SUM(u.total_purchases), 0) AS total_purchases,
      COALESCE(SUM(u.platform_fees), 0) AS platform_fees,
      COALESCE(SUM(u.refunds_issued), 0) AS refunds_issued,
      COALESCE(SUM(u.refunds_received), 0) AS refunds_received,
      COALESCE(SUM(u.balance_applied), 0) AS balance_applied,
      COALESCE(SUM(u.credit_applied), 0) AS credit_applied
    FROM (
      SELECT seller_id AS user_id, SUM(total_usd) AS gross_sales, 0::NUMERIC AS total_purchases,
        SUM(platform_fee_usd) AS platform_fees, 0::NUMERIC AS refunds_issued,
        0::NUMERIC AS refunds_received, 0::NUMERIC AS balance_applied, 0::NUMERIC AS credit_applied
      FROM market_orders WHERE settlement_id = v_settlement_id GROUP BY seller_id
      UNION ALL
      SELECT buyer_id, 0::NUMERIC, SUM(total_usd), 0::NUMERIC, 0::NUMERIC, 0::NUMERIC,
        SUM(balance_applied_usd), SUM(credit_applied_usd)
      FROM market_orders WHERE settlement_id = v_settlement_id GROUP BY buyer_id
      UNION ALL
      SELECT d.initiated_by, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC,
        COALESCE(SUM(d.refund_amount_usd), 0), 0::NUMERIC, 0::NUMERIC
      FROM order_disputes d JOIN market_orders o ON o.id = d.order_id
      WHERE d.status IN ('buyer_accepted', 'staff_resolved') AND d.refund_amount_usd IS NOT NULL
        AND o.settlement_id = v_settlement_id GROUP BY d.initiated_by
      UNION ALL
      SELECT o.seller_id, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC,
        COALESCE(SUM(d.refund_amount_usd), 0), 0::NUMERIC, 0::NUMERIC, 0::NUMERIC
      FROM order_disputes d JOIN market_orders o ON o.id = d.order_id
      WHERE d.status IN ('buyer_accepted', 'staff_resolved') AND d.refund_amount_usd IS NOT NULL
        AND o.settlement_id = v_settlement_id GROUP BY o.seller_id
    ) u GROUP BY u.user_id
  LOOP
    DECLARE
      v_net NUMERIC(10,2);
      v_hold_captured NUMERIC(10,2) := 0;
      v_hold_released NUMERIC(10,2) := 0;
      v_hold RECORD;
      v_card_purchases NUMERIC(10,2);
      v_notif_content TEXT;
      v_stripe_active BOOLEAN := false;
      v_stripe_id TEXT;
      v_virtual_net_credit NUMERIC(10,2);
      v_is_stripe_payout BOOLEAN;
    BEGIN
      v_net := v_user.gross_sales - v_user.total_purchases
             - v_user.platform_fees - v_user.refunds_issued
             + v_user.refunds_received;

      v_card_purchases := v_user.total_purchases - v_user.balance_applied - v_user.credit_applied;

      -- Fetch Stripe Connect details for this user
      SELECT stripe_connect_active, stripe_connect_id
      INTO v_stripe_active, v_stripe_id
      FROM profiles
      WHERE id = v_user.user_id;

      v_stripe_active := COALESCE(v_stripe_active, false);
      -- CRIT-3 FIX: stripe_connect_id must be non-NULL for Stripe routing to be valid
      -- If the ID is somehow missing, fall back to wallet payout gracefully
      IF v_stripe_id IS NULL THEN
        v_stripe_active := false;
        RAISE WARNING 'User % has stripe_connect_active=true but stripe_connect_id is NULL — falling back to wallet payout', v_user.user_id;
      END IF;

      -- Determine whether this will be a Stripe direct payout
      v_is_stripe_payout := v_stripe_active AND v_net > 0;

      IF v_user.balance_applied > 0 THEN
        UPDATE user_balances
        SET held_balance_usd = GREATEST(held_balance_usd - v_user.balance_applied, 0),
            total_spent_usd = total_spent_usd + v_user.balance_applied, updated_at = now()
        WHERE user_id = v_user.user_id;
        PERFORM append_ledger_entry('balance_consumed', v_user.user_id, v_user.balance_applied, 'debit', NULL, v_settlement_id,
          jsonb_build_object('type', 'purchase_settlement', 'balance_applied', v_user.balance_applied));
      END IF;

      SELECT * INTO v_hold FROM market_holds
      WHERE buyer_id = v_user.user_id AND status = 'active' FOR UPDATE;

      IF v_hold IS NOT NULL THEN
        v_hold_captured := LEAST(v_hold.hold_amount_cents::NUMERIC / 100, v_card_purchases);
        v_hold_released := (v_hold.hold_amount_cents::NUMERIC / 100) - v_hold_captured;
        UPDATE market_holds SET status = 'captured', spent_amount_cents = (v_hold_captured * 100)::INTEGER, updated_at = now() WHERE id = v_hold.id;

        IF v_hold_captured > 0 OR v_hold_released > 0 THEN
          INSERT INTO settlement_captures (settlement_id, hold_id, buyer_id, stripe_payment_intent_id, hold_amount_usd, capture_amount_usd, release_amount_usd, capture_status)
          VALUES (v_settlement_id, v_hold.id, v_user.user_id, v_hold.stripe_payment_intent_id, v_hold.hold_amount_cents::NUMERIC / 100, v_hold_captured, v_hold_released, 'captured');
        END IF;

        IF v_hold_captured > 0 THEN
          PERFORM append_ledger_entry('hold_captured', v_user.user_id, v_hold_captured, 'debit', NULL, v_settlement_id,
            jsonb_build_object('hold_id', v_hold.id, 'stripe_pi', v_hold.stripe_payment_intent_id));
        END IF;
        IF v_hold_released > 0 THEN
          PERFORM append_ledger_entry('hold_released', v_user.user_id, v_hold_released, 'credit', NULL, v_settlement_id,
            jsonb_build_object('hold_id', v_hold.id));
        END IF;
      END IF;

      IF v_user.gross_sales > 0 THEN
        PERFORM append_ledger_entry('settlement_credit', v_user.user_id, v_user.gross_sales, 'credit', NULL, v_settlement_id, jsonb_build_object('type', 'gross_sales'));
      END IF;
      IF v_user.platform_fees > 0 THEN
        PERFORM append_ledger_entry('fee_charged', v_user.user_id, v_user.platform_fees, 'debit', NULL, v_settlement_id);
      END IF;
      IF v_user.refunds_issued > 0 THEN
        PERFORM append_ledger_entry('refund_issued', v_user.user_id, v_user.refunds_issued, 'debit', NULL, v_settlement_id);
      END IF;
      IF v_user.refunds_received > 0 THEN
        PERFORM append_ledger_entry('refund_issued', v_user.user_id, v_user.refunds_received, 'credit', NULL, v_settlement_id,
          jsonb_build_object('type', 'refund_to_buyer'));
      END IF;

      -- ★ Stripe Connect Netting Offsetting Entry
      -- Log offsetting payout_sent debit to net virtual wallet impact to exactly $0.00
      IF v_is_stripe_payout THEN
        PERFORM append_ledger_entry(
          'payout_sent',
          v_user.user_id,
          v_net,
          'debit',
          NULL,
          v_settlement_id,
          jsonb_build_object(
            'payout_method', 'stripe_connect',
            'stripe_connect_id', v_stripe_id,
            'status', 'pending'
          )
        );
      END IF;

      INSERT INTO user_settlements (
        settlement_id, user_id, gross_sales_usd, total_purchases_usd,
        refunds_issued_usd, refunds_received_usd, platform_fees_usd,
        hold_captured_usd, hold_released_usd, net_payout_usd, status,
        stripe_transfer_initiated_at   -- HIGH-6: stamp when transfer was queued
      )
      VALUES (
        v_settlement_id,
        v_user.user_id,
        v_user.gross_sales,
        v_user.total_purchases,
        v_user.refunds_issued,
        v_user.refunds_received,
        v_user.platform_fees,
        v_hold_captured,
        v_hold_released,
        v_net,
        CASE WHEN v_is_stripe_payout THEN 'stripe_transfer_pending' ELSE 'pending' END,
        CASE WHEN v_is_stripe_payout THEN now() ELSE NULL END
      );

      -- Calculate virtual net credit to adjust pending_usd balance
      v_virtual_net_credit := CASE WHEN v_is_stripe_payout THEN 0 ELSE GREATEST(v_net, 0) END;

      INSERT INTO user_balances (user_id, pending_usd, total_earned_usd, total_spent_usd)
      VALUES (v_user.user_id, v_virtual_net_credit, GREATEST(v_user.gross_sales, 0), v_user.total_purchases)
      ON CONFLICT (user_id) DO UPDATE SET
        pending_usd = user_balances.pending_usd + v_virtual_net_credit,
        total_earned_usd = user_balances.total_earned_usd + GREATEST(v_user.gross_sales, 0),
        total_spent_usd = user_balances.total_spent_usd + v_user.total_purchases, updated_at = now();

      -- Customized settlement notification text
      v_notif_content := CASE
        WHEN v_is_stripe_payout THEN '📋 Settlement processed: $' || ROUND(v_net, 2) || ' in earnings will be deposited directly to your bank account via Stripe.'
        WHEN v_net > 0 THEN '📋 Settlement processed: $' || ROUND(v_net, 2) || ' in earnings pending funds confirmation.'
        WHEN v_net < 0 THEN '🧾 Settlement processed: $' || ROUND(ABS(v_net), 2) || ' in purchases settled.'
        ELSE '📋 Daily settlement complete. No balance change.'
      END
      || CASE WHEN v_hold_released > 0 THEN ' Your hold of $' || ROUND(v_hold_released, 2) || ' has been released.' ELSE '' END;

      BEGIN
        PERFORM notify_market_event(v_user.user_id, v_notif_content, '/earnings');
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'notify_market_event failed in settlement for user %: %', v_user.user_id, SQLERRM;
      END;

      v_total_captured := v_total_captured + v_hold_captured;
      v_total_payouts := v_total_payouts + GREATEST(v_net, 0);

      -- HIGH-5 FIX: Track Stripe vs wallet payouts separately
      IF v_is_stripe_payout THEN
        v_total_stripe_payouts := v_total_stripe_payouts + v_net;
      ELSE
        v_total_wallet_payouts := v_total_wallet_payouts + GREATEST(v_net, 0);
      END IF;

      -- CRIT-2: Accumulate balance_applied amounts (real inflows, not Stripe captures)
      v_total_balance_applied := v_total_balance_applied + v_user.balance_applied;

      v_total_fees := v_total_fees + v_user.platform_fees;
      v_total_refunds := v_total_refunds + v_user.refunds_issued;
      v_user_count := v_user_count + 1;
    END;
  END LOOP;

  SELECT NOT EXISTS (
    SELECT 1 FROM user_settlements us WHERE us.settlement_id = v_settlement_id
      AND (SELECT balance_after FROM market_ledger WHERE user_id = us.user_id ORDER BY id DESC LIMIT 1)
        != (SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_usd ELSE -amount_usd END), 0)
            FROM market_ledger WHERE user_id = us.user_id)
  ) INTO v_check1_pass;

  -- CRIT-2 FIX: Correct reconciliation check.
  -- Wallet payouts + fees must not exceed total real inflows (card captures + balance payments).
  -- Previously was: (payouts + fees) <= (captured + payouts + fees) which simplifies to 0<=captured (always true).
  -- Stripe payouts are excluded because they draw from platform balance, not settlement inflows.
  v_check2_pass := (v_total_wallet_payouts + v_total_fees) <= (v_total_captured + v_total_balance_applied);

  v_reconciliation := jsonb_build_object(
    'check1_ledger_consistency', v_check1_pass, 'check2_settlement_balance', v_check2_pass,
    'total_orders', v_total_orders, 'total_users', v_user_count,
    'total_captured_usd', v_total_captured, 'total_payouts_usd', v_total_payouts,
    'total_stripe_payouts_usd', v_total_stripe_payouts,    -- HIGH-5
    'total_wallet_payouts_usd', v_total_wallet_payouts,   -- HIGH-5
    'total_fees_usd', v_total_fees, 'total_refunds_usd', v_total_refunds,
    'stale_holds_expired', v_expired_count);

  DECLARE v_total_released NUMERIC(10,2) := 0;
  BEGIN
    SELECT COALESCE(SUM(release_amount_usd), 0) INTO v_total_released
    FROM settlement_captures WHERE settlement_id = v_settlement_id;

    v_reconciliation := v_reconciliation || jsonb_build_object(
      'total_released_usd', v_total_released,
      'capture_count', (SELECT COUNT(*) FROM settlement_captures WHERE settlement_id = v_settlement_id));

    UPDATE market_settlements SET
      total_orders = v_total_orders, total_captured_usd = v_total_captured,
      total_released_usd = v_total_released, total_payouts_usd = v_total_payouts,
      total_stripe_payouts_usd = v_total_stripe_payouts,  -- HIGH-5
      total_wallet_payouts_usd = v_total_wallet_payouts,  -- HIGH-5
      total_fees_usd = v_total_fees, total_refunds_usd = v_total_refunds,
      reconciliation_check = v_reconciliation,
      status = CASE WHEN v_check1_pass AND v_check2_pass THEN 'funds_pending'::clearing_status
                    ELSE 'reconciliation_failed'::clearing_status END,
      updated_at = now()
    WHERE id = v_settlement_id;
  END;

  RETURN jsonb_build_object('success', true, 'settlement_id', v_settlement_id,
    'users_settled', v_user_count, 'orders_settled', v_total_orders,
    'stale_holds_expired', v_expired_count,
    'reconciliation', v_reconciliation);
END;
$$;
