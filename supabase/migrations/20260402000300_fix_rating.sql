-- Fix: rate_market_order should allow updating ratings and use market_notifications
CREATE OR REPLACE FUNCTION rate_market_order(p_order_id UUID, p_rating SMALLINT, p_review TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_order RECORD;
  v_caller UUID := auth.uid();
  v_role TEXT;
  v_is_update BOOLEAN := false;
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
    v_is_update := v_order.seller_rating IS NOT NULL;
    -- Buyer rates the seller (allow update)
    UPDATE market_orders SET
      seller_rating = p_rating,
      seller_review = COALESCE(p_review, seller_review),
      updated_at = now()
    WHERE id = p_order_id;

    -- Notify seller about rating (only on first rating, not updates)
    IF NOT v_is_update THEN
      PERFORM notify_market_event(
        v_order.seller_id,
        '⭐ ' || p_rating || '-star rating on your ' || v_order.product_name || ' sale!',
        '/earnings'
      );
    END IF;

  ELSIF v_caller = v_order.seller_id THEN
    v_role := 'seller';
    v_is_update := v_order.buyer_rating IS NOT NULL;
    -- Seller rates the buyer (allow update)
    UPDATE market_orders SET
      buyer_rating = p_rating,
      buyer_review = COALESCE(p_review, buyer_review),
      updated_at = now()
    WHERE id = p_order_id;

  ELSE
    RETURN jsonb_build_object('error', 'You are not part of this order');
  END IF;

  RETURN jsonb_build_object('success', true, 'role', v_role, 'rating', p_rating, 'updated', v_is_update);
END;
$$;
