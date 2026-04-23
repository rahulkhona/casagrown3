-- ============================================================================
-- Fix: Release holds on order rejection/cancellation
--
-- When a seller declines or buyer cancels an order, we must:
--   1. Refund buyer's balance (if balance was applied)
--   2. Update hold spent amount
--   3. Cancel Stripe PI (done via edge function trigger)
-- ============================================================================

-- Updated seller_decline_order: now releases balance and updates hold
CREATE OR REPLACE FUNCTION seller_decline_order(p_order_id UUID, p_reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_order RECORD;
  v_balance_cents INTEGER;
BEGIN
  SELECT * INTO v_order FROM market_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order IS NULL THEN RETURN jsonb_build_object('error', 'Order not found'); END IF;
  IF v_order.seller_id != auth.uid() THEN RETURN jsonb_build_object('error', 'Not authorized'); END IF;
  IF v_order.status != 'pending' THEN RETURN jsonb_build_object('error', 'Can only decline pending orders'); END IF;

  -- Set status to 'cancelled' (not 'declined') so the trigger can fire
  UPDATE market_orders
  SET status = 'cancelled',
      decline_reason = p_reason,
      updated_at = now()
  WHERE id = p_order_id;

  -- Restore inventory
  UPDATE market_products
  SET inventory = inventory + v_order.quantity,
      updated_at = now()
  WHERE id = v_order.product_id;

  -- Refund buyer's balance portion (if any was applied)
  IF v_order.balance_applied_usd > 0 THEN
    v_balance_cents := (v_order.balance_applied_usd * 100)::INTEGER;
    PERFORM refund_buyer_balance(v_order.buyer_id, v_balance_cents, 'order_declined');
  END IF;

  -- Update hold spent amount (reduce by order total)
  IF v_order.hold_id IS NOT NULL THEN
    UPDATE market_holds
    SET spent_amount_cents = GREATEST(spent_amount_cents - (v_order.total_usd * 100)::INTEGER, 0),
        updated_at = now()
    WHERE id = v_order.hold_id;
  END IF;

  -- NOTE: notification is handled by trg_market_order_status_notify trigger
  -- NOTE: Stripe PI cancel is handled by the release-hold edge function (if needed)

  RETURN jsonb_build_object('success', true);
END;
$$;


-- Buyer cancel order: also releases balance and updates hold
CREATE OR REPLACE FUNCTION buyer_cancel_order(p_order_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_order RECORD;
  v_balance_cents INTEGER;
BEGIN
  SELECT * INTO v_order FROM market_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order IS NULL THEN RETURN jsonb_build_object('error', 'Order not found'); END IF;
  IF v_order.buyer_id != auth.uid() THEN RETURN jsonb_build_object('error', 'Not authorized'); END IF;
  IF v_order.status != 'pending' THEN RETURN jsonb_build_object('error', 'Can only cancel pending orders'); END IF;

  -- Set status to 'cancelled'
  UPDATE market_orders
  SET status = 'cancelled',
      decline_reason = 'Cancelled by buyer',
      updated_at = now()
  WHERE id = p_order_id;

  -- Restore inventory
  UPDATE market_products
  SET inventory = inventory + v_order.quantity,
      updated_at = now()
  WHERE id = v_order.product_id;

  -- Refund buyer's balance portion (if any was applied)
  IF v_order.balance_applied_usd > 0 THEN
    v_balance_cents := (v_order.balance_applied_usd * 100)::INTEGER;
    PERFORM refund_buyer_balance(v_order.buyer_id, v_balance_cents, 'order_cancelled');
  END IF;

  -- Update hold spent amount (reduce by order total)
  IF v_order.hold_id IS NOT NULL THEN
    UPDATE market_holds
    SET spent_amount_cents = GREATEST(spent_amount_cents - (v_order.total_usd * 100)::INTEGER, 0),
        updated_at = now()
    WHERE id = v_order.hold_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;
