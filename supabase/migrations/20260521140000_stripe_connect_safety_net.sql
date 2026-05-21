-- Migration: Stripe Connect Safety Net — Schema & Function Fixes
-- Created: 2026-05-21
-- Fixes: C2 (wallet fallback), C3 (deauthorization), C4 (transfer reversal)

-- ── C2+C4: Add new statuses for transfer failure recovery ───────────────────
-- Drop and recreate the CHECK constraint with new statuses
ALTER TABLE "public"."user_settlements" DROP CONSTRAINT IF EXISTS "user_settlements_status_check";
ALTER TABLE "public"."user_settlements"
  ADD CONSTRAINT "user_settlements_status_check"
  CHECK (status IN (
    'pending',
    'available',
    'paid_out',
    'stripe_transfer_pending',
    'stripe_transfer_failed',
    'wallet_fallback',            -- C2: transfer failed, funds restored to wallet
    'stripe_transfer_reversed'    -- C4: transfer succeeded but was later reversed by Stripe
  ));

-- ── C2: Add new event types for ledger entries ──────────────────────────────
-- The market_ledger event_type column has a CHECK constraint. We need to widen it
-- to include reversal event types for wallet fallback and transfer reversal.
ALTER TABLE "public"."market_ledger" DROP CONSTRAINT IF EXISTS "market_ledger_event_type_check";
ALTER TABLE "public"."market_ledger"
  ADD CONSTRAINT "market_ledger_event_type_check"
  CHECK (event_type IN (
    'hold_placed', 'hold_captured', 'hold_released',
    'order_completed', 'fee_charged', 'refund_issued',
    'settlement_credit', 'funds_cleared', 'payout_sent',
    'balance_held', 'balance_released', 'balance_consumed',
    'stripe_transfer_reversed',    -- C2/C4: reverses a payout_sent debit when transfer fails
    'balance_restored'             -- C2/C4: credits wallet when transfer fails (pending_usd restored)
  ));

-- ── C2: RPC to restore wallet balance after failed Stripe transfer ──────────
-- Called by execute-settlement-captures (C2) and stripe-webhook (C4)
-- Reverses the payout_sent debit and credits pending_usd so seller can withdraw manually
CREATE OR REPLACE FUNCTION "public"."restore_wallet_after_failed_transfer"(
  p_user_settlement_id UUID,
  p_reason TEXT DEFAULT 'stripe_transfer_failed',
  p_error_details TEXT DEFAULT NULL,
  p_new_status TEXT DEFAULT 'wallet_fallback'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settlement RECORD;
  v_net_payout NUMERIC(10,2);
  v_user_id UUID;
  v_settlement_id UUID;
BEGIN
  -- Lock the user_settlement row to prevent double-processing
  SELECT us.*, us.net_payout_usd, us.user_id, us.settlement_id
  INTO v_settlement
  FROM user_settlements us
  WHERE us.id = p_user_settlement_id
  FOR UPDATE;

  IF v_settlement IS NULL THEN
    RETURN jsonb_build_object('error', 'User settlement not found');
  END IF;

  -- Guard: only process if in a failed/pending state (not already restored)
  IF v_settlement.status NOT IN ('stripe_transfer_failed', 'stripe_transfer_pending', 'paid_out') THEN
    RETURN jsonb_build_object('error', 'Settlement not in a restorable state',
      'current_status', v_settlement.status);
  END IF;

  v_net_payout := v_settlement.net_payout_usd;
  v_user_id := v_settlement.user_id;
  v_settlement_id := v_settlement.settlement_id;

  -- Only restore if there was a positive payout to reverse
  IF v_net_payout <= 0 THEN
    RETURN jsonb_build_object('error', 'No positive payout to restore', 'net_payout_usd', v_net_payout);
  END IF;

  -- 1. Reverse the payout_sent debit with a credit entry
  PERFORM append_ledger_entry(
    'stripe_transfer_reversed',
    v_user_id,
    v_net_payout,
    'credit',
    NULL,
    v_settlement_id,
    jsonb_build_object(
      'reason', p_reason,
      'error', COALESCE(p_error_details, ''),
      'original_status', v_settlement.status,
      'user_settlement_id', p_user_settlement_id
    )
  );

  -- 2. Credit pending_usd back to the seller's wallet
  UPDATE user_balances
  SET pending_usd = pending_usd + v_net_payout
  WHERE user_id = v_user_id;

  -- Handle case where user_balances row doesn't exist
  IF NOT FOUND THEN
    INSERT INTO user_balances (user_id, pending_usd)
    VALUES (v_user_id, v_net_payout);
  END IF;

  -- 3. Update user_settlement status
  UPDATE user_settlements
  SET status = p_new_status
  WHERE id = p_user_settlement_id;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'amount_restored', v_net_payout,
    'new_status', p_new_status
  );
END;
$$;

-- Grant execute to service_role only (called by edge functions, not users)
GRANT EXECUTE ON FUNCTION "public"."restore_wallet_after_failed_transfer"(UUID, TEXT, TEXT, TEXT) TO "service_role";

-- ── BONUS: Fix platform_bank_ledger event_type CHECK constraint ─────────────
-- The execute-settlement-captures function uses 'stripe_connect_transfer' and
-- the stripe-webhook uses 'chargeback_reversal', but neither was in the
-- original CHECK constraint. This would cause runtime failures.
ALTER TABLE "public"."platform_bank_ledger" DROP CONSTRAINT IF EXISTS "platform_bank_ledger_event_type_check";
ALTER TABLE "public"."platform_bank_ledger"
  ADD CONSTRAINT "platform_bank_ledger_event_type_check"
  CHECK (event_type IN (
    'stripe_payout_received',  -- Stripe sends us money (inflow)
    'balance_applied',         -- Buyer paid with balance (virtual inflow)
    'cashout_sent',            -- Venmo/PayPal cashout (outflow)
    'gift_card_purchased',     -- Tremendous/Reloadly gift card (outflow)
    'donation_sent',           -- GlobalGiving donation (outflow)
    'stripe_refund',           -- Stripe refund to buyer card (outflow)
    'chargeback_debit',        -- Dispute/chargeback (outflow)
    'stripe_fees',             -- Stripe processing fees (outflow)
    'manual_adjustment',       -- Admin manual correction
    'stripe_connect_transfer', -- Stripe Connect transfer to seller (outflow)
    'chargeback_reversal'      -- Dispute won, funds reinstated (inflow)
  ));
