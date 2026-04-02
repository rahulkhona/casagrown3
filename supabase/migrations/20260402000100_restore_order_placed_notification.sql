-- ============================================================================
-- Fix: Add INSERT trigger for market_orders to notify seller of new orders
-- The old trigger (trg_market_order_placed_notification) was dropped in
-- 20260316900000_dedup_order_placed_notification.sql because the community
-- create-order edge function already handled notifications. But market orders
-- (Buy Now / Cart checkout) use an RPC, not that edge function, so no
-- notification was being generated.
-- This restores the INSERT trigger using the unified notify_market_event()
-- function which handles in-app + push + email in one call.
-- ============================================================================

CREATE OR REPLACE FUNCTION trg_market_order_placed_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_buyer_name TEXT;
BEGIN
  -- Look up buyer display name
  SELECT COALESCE(full_name, 'A buyer') INTO v_buyer_name
  FROM profiles WHERE id = NEW.buyer_id;

  -- Notify seller: new order received
  PERFORM notify_market_event(
    NEW.seller_id,
    '🛒 New order! ' || v_buyer_name || ' ordered ' || NEW.quantity || ' × ' || NEW.product_name || ' ($' || NEW.total_usd || ')',
    '/orders/' || NEW.id
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_market_order_placed_notification
  AFTER INSERT ON market_orders
  FOR EACH ROW
  EXECUTE FUNCTION trg_market_order_placed_notify();
