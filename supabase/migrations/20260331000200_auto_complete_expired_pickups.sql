-- Auto-complete pending pickup orders when product expires
-- If a pickup order is still 'pending' and the product's expires_at has passed,
-- auto-complete it (charge the buyer). The seller set aside produce; buyer had
-- their chance to pick up or ask the seller to cancel.

CREATE OR REPLACE FUNCTION auto_complete_delivered_orders()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count INTEGER := 0;
  v_rec RECORD;
BEGIN
  -- 1. Original: auto-complete 'delivered' orders past their auto_complete_at
  FOR v_rec IN
    SELECT id, buyer_id, seller_id, product_name
    FROM market_orders
    WHERE status = 'delivered'
      AND auto_complete_at IS NOT NULL
      AND auto_complete_at <= now()
    FOR UPDATE
  LOOP
    UPDATE market_orders
    SET status = 'completed', completed_at = now(), updated_at = now()
    WHERE id = v_rec.id;

    INSERT INTO notifications (user_id, content, link_url)
    VALUES (v_rec.seller_id, 'Order for "' || v_rec.product_name || '" auto-completed (buyer did not respond within 4 hours). ✓', '/orders/' || v_rec.id);

    -- Generate receipt + send receipt emails
    PERFORM _complete_market_order_with_receipt(v_rec.id);

    v_count := v_count + 1;
  END LOOP;

  -- 2. NEW: auto-complete pending pickup orders whose product has expired
  FOR v_rec IN
    SELECT mo.id, mo.buyer_id, mo.seller_id, mo.product_name, mo.product_id
    FROM market_orders mo
    JOIN market_products mp ON mp.id = mo.product_id
    WHERE mo.status = 'pending'
      AND mo.fulfillment_type = 'pickup'
      AND mp.expires_at IS NOT NULL
      AND mp.expires_at <= now()
    FOR UPDATE OF mo
  LOOP
    UPDATE market_orders
    SET status = 'completed', completed_at = now(), updated_at = now()
    WHERE id = v_rec.id;

    -- Notify both parties
    INSERT INTO notifications (user_id, content, link_url)
    VALUES
      (v_rec.seller_id,
       'Pickup order for "' || v_rec.product_name || '" auto-completed (pickup window expired). ✓',
       '/orders/' || v_rec.id),
      (v_rec.buyer_id,
       'Your pickup order for "' || v_rec.product_name || '" has been completed — pickup window has passed. 📍',
       '/orders/' || v_rec.id);

    -- Generate receipt + send receipt emails
    PERFORM _complete_market_order_with_receipt(v_rec.id);

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;
