-- Market Order Ratings + Notification Triggers
-- Adds buyer_rating/seller_rating to market_orders and creates
-- notification insert functions for key market workflow events.

-- ═══════════════════════════════════════════════════════
-- 1. Rating columns on market_orders
-- ═══════════════════════════════════════════════════════
ALTER TABLE market_orders
  ADD COLUMN IF NOT EXISTS buyer_rating  SMALLINT CHECK (buyer_rating BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS seller_rating SMALLINT CHECK (seller_rating BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS buyer_review  TEXT,
  ADD COLUMN IF NOT EXISTS seller_review TEXT;

-- Index for finding unrated completed orders
CREATE INDEX IF NOT EXISTS idx_market_orders_unrated_buyer
  ON market_orders (buyer_id) WHERE status = 'completed' AND buyer_rating IS NULL;
CREATE INDEX IF NOT EXISTS idx_market_orders_unrated_seller
  ON market_orders (seller_id) WHERE status = 'completed' AND seller_rating IS NULL;

-- ═══════════════════════════════════════════════════════
-- 2. Trigger: recompute seller_avg_rating on market_orders
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION recompute_market_seller_rating()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_old_avg NUMERIC;
  v_old_count INTEGER;
  v_new_rating NUMERIC;
BEGIN
  SELECT COALESCE(seller_avg_rating, 0), seller_rating_count
  INTO v_old_avg, v_old_count
  FROM profiles WHERE id = NEW.seller_id;

  v_new_rating := NEW.seller_rating;

  IF TG_OP = 'UPDATE' AND OLD.seller_rating IS NOT NULL THEN
    DECLARE v_old_rating NUMERIC;
    BEGIN
      v_old_rating := OLD.seller_rating;
      UPDATE profiles SET
        seller_avg_rating = ROUND((v_old_avg * v_old_count - v_old_rating + v_new_rating) / v_old_count, 1)
      WHERE id = NEW.seller_id;
    END;
  ELSE
    UPDATE profiles SET
      seller_avg_rating = ROUND((v_old_avg * v_old_count + v_new_rating) / (v_old_count + 1), 1),
      seller_rating_count = v_old_count + 1
    WHERE id = NEW.seller_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_recompute_market_seller_rating
  AFTER INSERT OR UPDATE OF seller_rating ON market_orders
  FOR EACH ROW
  WHEN (NEW.seller_rating IS NOT NULL)
  EXECUTE FUNCTION recompute_market_seller_rating();

-- ═══════════════════════════════════════════════════════
-- 3. RPC: rate_market_order
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION rate_market_order(
  p_order_id UUID,
  p_rating SMALLINT,
  p_review TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_caller UUID := auth.uid();
  v_role TEXT;
BEGIN
  SELECT * INTO v_order FROM market_orders WHERE id = p_order_id;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('error', 'Order not found');
  END IF;

  IF v_order.status NOT IN ('completed', 'delivered') THEN
    RETURN jsonb_build_object('error', 'Order must be completed to rate');
  END IF;

  -- Determine if caller is buyer or seller
  IF v_caller = v_order.buyer_id THEN
    v_role := 'buyer';
    -- Buyer rates the seller
    IF v_order.seller_rating IS NOT NULL THEN
      RETURN jsonb_build_object('error', 'You have already rated this order');
    END IF;
    UPDATE market_orders SET
      seller_rating = p_rating,
      seller_review = p_review,
      updated_at = now()
    WHERE id = p_order_id;

    -- Notify seller about rating
    INSERT INTO notifications (user_id, content, link_url)
    VALUES (v_order.seller_id,
      '⭐ ' || p_rating || '-star rating on your ' || v_order.product_name || ' sale!',
      '/earnings');

  ELSIF v_caller = v_order.seller_id THEN
    v_role := 'seller';
    -- Seller rates the buyer
    IF v_order.buyer_rating IS NOT NULL THEN
      RETURN jsonb_build_object('error', 'You have already rated this order');
    END IF;
    UPDATE market_orders SET
      buyer_rating = p_rating,
      buyer_review = p_review,
      updated_at = now()
    WHERE id = p_order_id;

  ELSE
    RETURN jsonb_build_object('error', 'You are not part of this order');
  END IF;

  RETURN jsonb_build_object('success', true, 'role', v_role, 'rating', p_rating);
END;
$$;

-- ═══════════════════════════════════════════════════════
-- 4. Market notification helpers
-- ═══════════════════════════════════════════════════════
-- These are called from other RPCs / triggers to insert notifications

CREATE OR REPLACE FUNCTION notify_market_event(
  p_user_id UUID,
  p_content TEXT,
  p_link_url TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO notifications (user_id, content, link_url)
  VALUES (p_user_id, p_content, p_link_url);
END;
$$;

-- ═══════════════════════════════════════════════════════
-- 5. Trigger: notify on market_order status changes
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION trg_market_order_status_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Only fire on status changes
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  CASE NEW.status
    WHEN 'confirmed' THEN
      -- Notify seller: new order received
      PERFORM notify_market_event(
        NEW.seller_id,
        '🛒 New order: ' || NEW.quantity || '× ' || NEW.product_name || ' ($' || NEW.total_usd || ')',
        '/orders'
      );
    WHEN 'declined' THEN
      -- Notify buyer: order declined
      PERFORM notify_market_event(
        NEW.buyer_id,
        '❌ Your order for ' || NEW.product_name || ' was declined' ||
          CASE WHEN NEW.decline_reason IS NOT NULL THEN ': ' || NEW.decline_reason ELSE '' END,
        '/orders'
      );
    WHEN 'ready' THEN
      -- Notify buyer: order ready for pickup/delivery
      PERFORM notify_market_event(
        NEW.buyer_id,
        '📦 Your ' || NEW.product_name || ' is ready for ' || NEW.fulfillment_type || '!',
        '/orders'
      );
    WHEN 'delivered' THEN
      -- Notify buyer: order delivered, confirm receipt
      PERFORM notify_market_event(
        NEW.buyer_id,
        '🚚 Your ' || NEW.product_name || ' has been delivered! Please confirm receipt.',
        '/orders'
      );
    WHEN 'completed' THEN
      -- Notify both: order completed + prompt rating
      PERFORM notify_market_event(
        NEW.buyer_id,
        '✅ Order completed for ' || NEW.product_name || '. Rate your experience!',
        '/earnings'
      );
      PERFORM notify_market_event(
        NEW.seller_id,
        '💰 Sale completed: ' || NEW.product_name || ' — $' || NEW.subtotal_usd || ' earned. Rate the buyer!',
        '/earnings'
      );
    WHEN 'refunded' THEN
      PERFORM notify_market_event(
        NEW.buyer_id,
        '🔄 Your order for ' || NEW.product_name || ' has been refunded ($' || NEW.total_usd || ')',
        '/orders'
      );
    WHEN 'disputed' THEN
      PERFORM notify_market_event(
        NEW.seller_id,
        '⚠️ A dispute has been opened for ' || NEW.product_name || ' order',
        '/orders'
      );
    ELSE
      -- Other status changes: no notification
      NULL;
  END CASE;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_market_order_status_notifications
  AFTER UPDATE OF status ON market_orders
  FOR EACH ROW
  EXECUTE FUNCTION trg_market_order_status_notify();

-- ═══════════════════════════════════════════════════════
-- 6. Trigger: notify on settlement status changes
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION trg_settlement_status_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user RECORD;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  CASE NEW.status
    WHEN 'funds_received' THEN
      -- Notify all users in this settlement
      FOR v_user IN
        SELECT DISTINCT user_id FROM user_settlements WHERE settlement_id = NEW.id
      LOOP
        PERFORM notify_market_event(
          v_user.user_id,
          '🏦 Settlement funds received for market day ' || NEW.market_date || '. Earnings are being processed.',
          '/earnings'
        );
      END LOOP;
    WHEN 'cleared' THEN
      FOR v_user IN
        SELECT user_id, net_payout_usd FROM user_settlements WHERE settlement_id = NEW.id
      LOOP
        PERFORM notify_market_event(
          v_user.user_id,
          '✅ $' || v_user.net_payout_usd || ' earnings cleared and available for withdrawal!',
          '/earnings'
        );
      END LOOP;
    ELSE NULL;
  END CASE;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_settlement_status_notifications
  AFTER UPDATE OF status ON market_settlements
  FOR EACH ROW
  EXECUTE FUNCTION trg_settlement_status_notify();

-- ═══════════════════════════════════════════════════════
-- 7. Trigger: notify on redemption completion
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION trg_redemption_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_item_name TEXT;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  SELECT name INTO v_item_name FROM redemption_merchandize WHERE id = NEW.item_id;

  IF NEW.status = 'completed' THEN
    PERFORM notify_market_event(
      NEW.user_id,
      '🎁 Withdrawal complete: ' || coalesce(v_item_name, 'Your withdrawal') || ' is ready!',
      '/earnings'
    );
  ELSIF NEW.status = 'failed' THEN
    PERFORM notify_market_event(
      NEW.user_id,
      '❌ Withdrawal failed for ' || coalesce(v_item_name, 'your request') || '. Please try again.',
      '/earnings/redeem'
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_redemption_notifications
  AFTER UPDATE OF status ON redemptions
  FOR EACH ROW
  EXECUTE FUNCTION trg_redemption_notify();
