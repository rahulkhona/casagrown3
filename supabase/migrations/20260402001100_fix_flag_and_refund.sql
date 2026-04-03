-- ===========================================================================
-- Fix check_product_flag_threshold: use is_flagged instead of status column
-- Fix process_post_settlement_refund: use settlement_id from order directly
-- ===========================================================================

-- Fix: check_product_flag_threshold
-- 1. Uses is_flagged boolean instead of nonexistent status column
-- 2. Uses FOUND instead of "v_product IS NOT NULL" (RECORD IS NOT NULL fails
--    when ANY column is NULL, e.g. nullable description/image_url columns)
-- 3. Avoids notify_market_event inside trigger (net.http_post savepoints
--    conflict with the AFTER trigger context)
CREATE OR REPLACE FUNCTION check_product_flag_threshold()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_flag_count INTEGER;
  v_product RECORD;
BEGIN
  SELECT COUNT(*) INTO v_flag_count FROM product_flags WHERE product_id = NEW.product_id;

  IF v_flag_count >= 3 THEN
    SELECT * INTO v_product FROM market_products WHERE id = NEW.product_id;

    IF FOUND AND NOT v_product.is_flagged THEN
      UPDATE market_products SET is_flagged = true, is_active = false, updated_at = now() WHERE id = NEW.product_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Fix: process_post_settlement_refund — use settlement_id from market_orders directly
-- (Original referenced nonexistent market_settlement_lines/adjustments tables)
CREATE OR REPLACE FUNCTION process_post_settlement_refund(p_order_id UUID, p_amount_usd NUMERIC, p_reason TEXT DEFAULT 'Dispute resolved')
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_order RECORD;
BEGIN
  SELECT * INTO v_order FROM market_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Order not found'); END IF;
  IF v_order.settlement_id IS NULL THEN RETURN jsonb_build_object('error', 'Order has not been settled yet'); END IF;

  -- Update seller & buyer balances
  UPDATE user_balances SET available_usd = available_usd - p_amount_usd WHERE user_id = v_order.seller_id;
  UPDATE user_balances SET available_usd = available_usd + p_amount_usd WHERE user_id = v_order.buyer_id;

  -- Update settlement refund total
  UPDATE market_settlements
  SET total_refunds_usd = COALESCE(total_refunds_usd, 0) + p_amount_usd, updated_at = now()
  WHERE id = v_order.settlement_id;

  -- In-app notifications
  INSERT INTO market_notifications (user_id, content, link_url) VALUES
    (v_order.seller_id, '🔄 Refund of $' || ROUND(p_amount_usd, 2) || ' issued for order #' || LEFT(p_order_id::text, 8), '/earnings'),
    (v_order.buyer_id, '💰 Refund of $' || ROUND(p_amount_usd, 2) || ' credited to your balance', '/earnings');

  RETURN jsonb_build_object('success', true);
END;
$$;
