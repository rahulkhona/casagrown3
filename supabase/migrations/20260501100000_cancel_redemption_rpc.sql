-- ============================================================================
-- Migration: Cancel Redemption RPC
-- Provides a secure way for admins to cancel queued payout requests and refund
-- the deducted balance back to the user's available_usd and point_ledger.
-- ============================================================================

ALTER TYPE redemption_status ADD VALUE IF NOT EXISTS 'queued';
ALTER TYPE redemption_status ADD VALUE IF NOT EXISTS 'cancelled';

CREATE OR REPLACE FUNCTION public.cancel_redemption_with_refund(
  p_redemption_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_redemption RECORD;
  v_user_id UUID;
  v_amount_cents INT;
  v_amount_usd NUMERIC(10,2);
  v_new_balance NUMERIC(10,2);
  v_entry_id INT;
BEGIN
  -- 1. Fetch and Lock the redemption
  SELECT * INTO v_redemption
  FROM redemptions
  WHERE id = p_redemption_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Redemption not found');
  END IF;

  -- 2. Verify state is cancellable
  IF v_redemption.status NOT IN ('queued', 'pending', 'failed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot cancel a redemption in ' || v_redemption.status || ' status');
  END IF;

  v_user_id := v_redemption.user_id;
  v_amount_cents := v_redemption.point_cost;
  v_amount_usd := (v_amount_cents / 100.0)::NUMERIC(10,2);

  -- 3. Mark as cancelled with reason
  UPDATE redemptions
  SET status = 'cancelled',
      failed_reason = p_reason
  WHERE id = p_redemption_id;

  -- 4. Refund user_balances
  UPDATE user_balances
  SET available_usd = available_usd + v_amount_usd,
      total_withdrawn_usd = total_withdrawn_usd - v_amount_usd,
      updated_at = now()
  WHERE user_id = v_user_id
  RETURNING available_usd INTO v_new_balance;

  -- 5. Append ledger entry for refund (inflow)
  v_entry_id := append_ledger_entry(
    'refund_issued', v_user_id, v_amount_usd, 'credit',
    NULL, NULL, jsonb_build_object('type', 'payout_refund', 'redemption_id', p_redemption_id, 'reason', p_reason)
  );

  -- We rely on trg_redemption_notify to catch the 'cancelled' status and send push/email/sms.

  RETURN jsonb_build_object(
    'success', true,
    'refunded_usd', v_amount_usd,
    'new_balance_usd', v_new_balance,
    'ledger_entry_id', v_entry_id
  );
END;
$$;

-- ============================================================================
-- Update trg_redemption_notify to handle 'cancelled' status
-- ============================================================================
CREATE OR REPLACE FUNCTION trg_redemption_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_item_name TEXT;
  v_item_type TEXT;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  SELECT name, type::text INTO v_item_name, v_item_type
  FROM redemption_merchandize WHERE id = NEW.item_id;

  IF NEW.status = 'completed' THEN
    IF NEW.is_auto = true THEN
      PERFORM notify_market_event(NEW.user_id, '⚡ Auto-withdrawal complete: ' || coalesce(v_item_name, 'Your withdrawal') || ' is ready!', '/earnings', true, true);
    ELSE
      PERFORM notify_market_event(NEW.user_id, '🎁 Withdrawal complete: ' || coalesce(v_item_name, 'Your withdrawal') || ' is ready!', '/earnings', true, true);
    END IF;
  ELSIF NEW.status = 'failed' THEN
    PERFORM notify_market_event(NEW.user_id, '❌ Withdrawal failed for ' || coalesce(v_item_name, 'your request') || '. Please try again.', '/earnings/redeem', true, false);
  ELSIF NEW.status = 'cancelled' THEN
    PERFORM notify_market_event(
      NEW.user_id,
      '❌ Your payout request for $' || (NEW.point_cost / 100.0) || ' was cancelled by administration.' || CHR(10) || 'Reason: ' || COALESCE(NEW.failed_reason, 'No reason provided.'),
      '/earnings',
      true, -- send email
      true  -- send sms
    );
  END IF;

  RETURN NEW;
END;
$$;
