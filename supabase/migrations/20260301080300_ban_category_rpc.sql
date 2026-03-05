-- ban_category: hard-delete a category with full cascade
-- Archives posts, cancels orders, refunds escrow, sends notifications + system messages
CREATE OR REPLACE FUNCTION ban_category(p_category_name TEXT)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_post RECORD; v_order RECORD;
  v_archived_posts INTEGER := 0; v_cancelled_orders INTEGER := 0;
  v_refunded_points INTEGER := 0; v_escrow_amount INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sales_categories WHERE name = p_category_name) THEN
    RETURN jsonb_build_object('error', 'Category not found: ' || p_category_name);
  END IF;

  -- Archive sell posts
  FOR v_post IN
    SELECT p.id, p.author_id, wsd.produce_name FROM posts p
    JOIN want_to_sell_details wsd ON wsd.post_id = p.id
    WHERE wsd.category = p_category_name AND p.is_archived = false
  LOOP
    UPDATE posts SET is_archived = true, updated_at = now() WHERE id = v_post.id;
    v_archived_posts := v_archived_posts + 1;
    INSERT INTO notifications (user_id, content, created_at) VALUES (v_post.author_id,
      'Your listing "' || v_post.produce_name || '" has been archived because the "' || p_category_name || '" category has been restricted.', now());
  END LOOP;

  -- Archive buy posts
  FOR v_post IN
    SELECT p.id, p.author_id FROM posts p
    JOIN want_to_buy_details wbd ON wbd.post_id = p.id
    WHERE wbd.category = p_category_name AND p.is_archived = false
  LOOP
    UPDATE posts SET is_archived = true, updated_at = now() WHERE id = v_post.id;
    v_archived_posts := v_archived_posts + 1;
    INSERT INTO notifications (user_id, content, created_at) VALUES (v_post.author_id,
      'Your wanted post has been archived because the "' || p_category_name || '" category has been restricted.', now());
  END LOOP;

  -- Cancel orders and refund escrow
  FOR v_order IN
    SELECT o.id, o.buyer_id, o.seller_id, o.product, o.conversation_id FROM orders o
    WHERE o.category = p_category_name AND o.status IN ('pending', 'accepted') FOR UPDATE
  LOOP
    UPDATE orders SET status = 'cancelled', updated_at = now() WHERE id = v_order.id;
    v_cancelled_orders := v_cancelled_orders + 1;
    SELECT coalesce(sum(amount), 0) INTO v_escrow_amount FROM point_ledger WHERE reference_id = v_order.id AND type = 'escrow';
    IF v_escrow_amount < 0 THEN
      INSERT INTO point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
      VALUES (v_order.buyer_id, 'escrow_refund', -v_escrow_amount, 0, v_order.id,
        jsonb_build_object('reason', 'Category "' || p_category_name || '" restricted', 'order_id', v_order.id, 'product', v_order.product));
      v_refunded_points := v_refunded_points + (-v_escrow_amount);
    END IF;
    INSERT INTO chat_messages (conversation_id, sender_id, content, type)
    VALUES (v_order.conversation_id, NULL,
      '⚠️ This order has been cancelled because the "' || p_category_name || '" category has been restricted. Held points have been refunded to the buyer.', 'system');
    INSERT INTO notifications (user_id, content, created_at) VALUES
      (v_order.buyer_id, 'Your order for "' || v_order.product || '" has been cancelled and points refunded. The "' || p_category_name || '" category has been restricted.', now()),
      (v_order.seller_id, 'An order for "' || v_order.product || '" has been cancelled. The "' || p_category_name || '" category has been restricted.', now());
  END LOOP;

  DELETE FROM sales_categories WHERE name = p_category_name;
  RETURN jsonb_build_object('success', true, 'archivedPosts', v_archived_posts, 'cancelledOrders', v_cancelled_orders, 'refundedPoints', v_refunded_points);
END;
$$;
