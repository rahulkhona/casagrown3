-- ===========================================================================
-- Fix remaining functions: buyer_accept_refund, check_*_flag_threshold,
-- settlement functions → notify_market_event
-- ===========================================================================

-- 1. buyer_accept_refund — sets status='resolved' → trigger fires
CREATE OR REPLACE FUNCTION buyer_accept_refund(p_dispute_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_dispute RECORD;
  v_order RECORD;
  v_amt_str TEXT;
BEGIN
  SELECT * INTO v_dispute FROM order_disputes WHERE id = p_dispute_id FOR UPDATE;
  IF v_dispute IS NULL THEN RETURN jsonb_build_object('error', 'Dispute not found'); END IF;

  SELECT * INTO v_order FROM market_orders WHERE id = v_dispute.order_id;
  IF v_order.buyer_id != auth.uid() THEN RETURN jsonb_build_object('error', 'Not authorized'); END IF;
  IF v_dispute.status != 'seller_responded' THEN RETURN jsonb_build_object('error', 'Seller has not responded yet'); END IF;

  UPDATE order_disputes SET status = 'buyer_accepted', resolved_at = now(), updated_at = now() WHERE id = p_dispute_id;
  UPDATE market_orders SET status = 'resolved', updated_at = now() WHERE id = v_dispute.order_id;
  -- NOTE: notification handled by trg_market_order_status_notify on status → resolved

  -- Natively inject into chat
  v_amt_str := TO_CHAR(COALESCE(v_dispute.refund_amount_usd, 0), 'FM999999999.00');
  INSERT INTO order_chat_messages (order_id, sender_id, content)
  VALUES (v_order.id, auth.uid(), '✅ Refund accepted — $' || v_amt_str || ' refund approved.');

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 2. check_comment_flag_threshold — user should get notified via bell+push
CREATE OR REPLACE FUNCTION check_comment_flag_threshold()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_flag_count INTEGER;
  v_comment RECORD;
BEGIN
  SELECT COUNT(*) INTO v_flag_count FROM comment_flags WHERE comment_id = NEW.comment_id;

  IF v_flag_count >= 3 THEN
    SELECT c.*, p.name AS product_name
    INTO v_comment
    FROM product_comments c
    LEFT JOIN market_products p ON p.id = c.product_id
    WHERE c.id = NEW.comment_id;

    IF v_comment IS NOT NULL AND NOT v_comment.is_hidden THEN
      UPDATE product_comments SET is_hidden = true WHERE id = NEW.comment_id;

      PERFORM notify_market_event(
        v_comment.author_id,
        '⚠️ Your comment on "' || COALESCE(v_comment.product_name, 'a product') || '" has been hidden due to community reports.',
        '/market'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 3. check_post_flag_threshold — user should get notified via bell+push
CREATE OR REPLACE FUNCTION check_post_flag_threshold()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_flag_count INTEGER;
  v_post_row RECORD;
BEGIN
  SELECT COUNT(*) INTO v_flag_count FROM post_flags WHERE post_id = NEW.post_id;

  IF v_flag_count >= 3 THEN
    SELECT * INTO v_post_row FROM community_posts WHERE id = NEW.post_id;

    IF v_post_row IS NOT NULL AND NOT v_post_row.is_hidden THEN
      UPDATE community_posts SET is_hidden = true WHERE id = NEW.post_id;

      PERFORM notify_market_event(
        v_post_row.author_id,
        '⚠️ Your post has been flagged by community members and is under review. It will be hidden until an admin reviews it.',
        '/community'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 4. check_product_flag_threshold — seller should get notified via bell+push
CREATE OR REPLACE FUNCTION check_product_flag_threshold()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_flag_count INTEGER;
  v_product RECORD;
BEGIN
  SELECT COUNT(*) INTO v_flag_count FROM product_flags WHERE product_id = NEW.product_id;

  IF v_flag_count >= 3 THEN
    SELECT * INTO v_product FROM market_products WHERE id = NEW.product_id;

    IF v_product IS NOT NULL AND v_product.status != 'flagged' THEN
      UPDATE market_products SET status = 'flagged', updated_at = now() WHERE id = NEW.product_id;

      -- Notify via bell + push + email
      PERFORM notify_market_event(
        v_product.seller_id,
        '⚠️ Your product "' || v_product.name || '" has been flagged by community members and has been hidden. Edit the product to resolve and republish.',
        '/my-booth/products'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 5. process_post_settlement_refund — direct notify since no status change trigger
CREATE OR REPLACE FUNCTION process_post_settlement_refund(p_order_id UUID, p_amount_usd NUMERIC, p_reason TEXT DEFAULT 'Dispute resolved')
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_order RECORD;
  v_settlement RECORD;
BEGIN
  SELECT * INTO v_order FROM market_orders WHERE id = p_order_id;
  IF v_order IS NULL THEN RETURN jsonb_build_object('error', 'Order not found'); END IF;

  -- Find the settlement this order belongs to
  SELECT s.* INTO v_settlement
  FROM market_settlement_lines sl
  JOIN market_settlements s ON s.id = sl.settlement_id
  WHERE sl.order_id = p_order_id
  ORDER BY s.created_at DESC LIMIT 1;

  IF v_settlement IS NULL THEN RETURN jsonb_build_object('error', 'No settlement found for order'); END IF;

  -- Record the refund
  INSERT INTO market_settlement_adjustments (settlement_id, order_id, amount_usd, reason, created_by)
  VALUES (v_settlement.id, p_order_id, p_amount_usd, p_reason, auth.uid());

  -- Update seller & buyer ledger
  UPDATE market_ledger SET balance_usd = balance_usd - p_amount_usd WHERE user_id = v_order.seller_id;
  UPDATE market_ledger SET balance_usd = balance_usd + p_amount_usd WHERE user_id = v_order.buyer_id;

  -- Notify both parties via bell + push + email
  PERFORM notify_market_event(
    v_order.seller_id,
    '🔄 Refund of $' || ROUND(p_amount_usd, 2) || ' issued for order #' || LEFT(p_order_id::text, 8),
    '/earnings'
  );
  PERFORM notify_market_event(
    v_order.buyer_id,
    '💰 Refund of $' || ROUND(p_amount_usd, 2) || ' credited to your balance',
    '/earnings'
  );

  RETURN jsonb_build_object('success', true);
END;
$$;
