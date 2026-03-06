-- add_category_restriction — use 'hold'/'hold_refund'
CREATE OR REPLACE FUNCTION add_category_restriction(
  p_category_name TEXT, p_community_h3 TEXT DEFAULT NULL, p_reason TEXT DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_post RECORD; v_order RECORD;
  v_archived_posts INTEGER := 0; v_cancelled_orders INTEGER := 0;
  v_refunded_points INTEGER := 0; v_hold_amount INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sales_categories WHERE name = p_category_name) THEN
    RETURN jsonb_build_object('error', 'Category not found: ' || p_category_name);
  END IF;
  IF p_community_h3 IS NULL THEN
    DELETE FROM category_restrictions WHERE category_name = p_category_name AND community_h3_index IS NOT NULL;
  END IF;
  INSERT INTO category_restrictions (category_name, community_h3_index, reason)
  VALUES (p_category_name, p_community_h3, p_reason) ON CONFLICT (category_name, community_h3_index) DO NOTHING;
  FOR v_post IN
    SELECT p.id, p.author_id, wsd.produce_name FROM posts p
    JOIN want_to_sell_details wsd ON wsd.post_id = p.id
    WHERE wsd.category = p_category_name AND p.is_archived = false
      AND (p_community_h3 IS NULL OR p.community_h3_index = p_community_h3)
  LOOP
    UPDATE posts SET is_archived = true, updated_at = now() WHERE id = v_post.id;
    v_archived_posts := v_archived_posts + 1;
    INSERT INTO notifications (user_id, content, created_at) VALUES (v_post.author_id,
      'Your listing "' || v_post.produce_name || '" has been archived because "' || p_category_name || '" is now restricted in your area.', now());
  END LOOP;
  FOR v_post IN
    SELECT p.id, p.author_id FROM posts p
    JOIN want_to_buy_details wbd ON wbd.post_id = p.id
    WHERE wbd.category = p_category_name AND p.is_archived = false
      AND (p_community_h3 IS NULL OR p.community_h3_index = p_community_h3)
  LOOP
    UPDATE posts SET is_archived = true, updated_at = now() WHERE id = v_post.id;
    v_archived_posts := v_archived_posts + 1;
    INSERT INTO notifications (user_id, content, created_at) VALUES (v_post.author_id,
      'Your wanted post has been archived because "' || p_category_name || '" is now restricted in your area.', now());
  END LOOP;
  FOR v_order IN
    SELECT o.id, o.buyer_id, o.seller_id, o.product, o.conversation_id FROM orders o
    JOIN conversations c ON c.id = o.conversation_id JOIN posts p ON p.id = c.post_id
    WHERE o.category = p_category_name AND o.status IN ('pending', 'accepted')
      AND (p_community_h3 IS NULL OR p.community_h3_index = p_community_h3) FOR UPDATE OF o
  LOOP
    UPDATE orders SET status = 'cancelled', updated_at = now() WHERE id = v_order.id;
    v_cancelled_orders := v_cancelled_orders + 1;
    SELECT coalesce(sum(amount), 0) INTO v_hold_amount FROM point_ledger WHERE reference_id = v_order.id AND type = 'hold';
    IF v_hold_amount < 0 THEN
      INSERT INTO point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
      VALUES (v_order.buyer_id, 'hold_refund', -v_hold_amount, 0, v_order.id,
        jsonb_build_object('reason', 'Category "' || p_category_name || '" restricted', 'order_id', v_order.id, 'product', v_order.product));
      v_refunded_points := v_refunded_points + (-v_hold_amount);
    END IF;
    INSERT INTO chat_messages (conversation_id, sender_id, content, type)
    VALUES (v_order.conversation_id, NULL, '⚠️ This order has been cancelled because "' || p_category_name || '" is now restricted. Held points have been refunded.', 'system');
    INSERT INTO notifications (user_id, content, created_at) VALUES
      (v_order.buyer_id, 'Your order for "' || v_order.product || '" was cancelled (category restricted). Points refunded.', now()),
      (v_order.seller_id, 'An order for "' || v_order.product || '" was cancelled (category restricted).', now());
  END LOOP;
  RETURN jsonb_build_object('success', true, 'archivedPosts', v_archived_posts, 'cancelledOrders', v_cancelled_orders, 'refundedPoints', v_refunded_points);
END;
$$;
