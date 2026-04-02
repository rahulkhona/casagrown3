-- ============================================================================
-- Q&A Comment Notifications
-- When a question/reply is posted on a product, notify the seller
-- (in-app + push via notify_market_event; email fires automatically
--  via the send_notification_email trigger on the notifications table).
-- Also notify the question author when a reply is posted.
-- ============================================================================

CREATE OR REPLACE FUNCTION trg_product_comment_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_product RECORD;
  v_author_name TEXT;
  v_parent_author_id UUID;
BEGIN
  -- Get product info
  SELECT id, name, seller_id
  INTO v_product
  FROM market_products
  WHERE id = NEW.product_id;

  IF v_product IS NULL THEN RETURN NEW; END IF;

  -- Get commenter's first name
  SELECT COALESCE(split_part(full_name, ' ', 1), 'Someone')
  INTO v_author_name
  FROM profiles WHERE id = NEW.author_id;

  v_author_name := COALESCE(v_author_name, 'Someone');

  -- Case 1: Top-level question (no parent) → notify seller
  IF NEW.parent_id IS NULL THEN
    -- Don't notify if the seller is asking their own product
    IF NEW.author_id != v_product.seller_id THEN
      PERFORM notify_market_event(
        v_product.seller_id,
        '❓ ' || v_author_name || ' asked a question on "' || v_product.name || '": ' ||
          left(NEW.body, 100) || CASE WHEN length(NEW.body) > 100 THEN '…' ELSE '' END,
        '/market/booth/' || (
          SELECT id FROM market_booths WHERE owner_id = v_product.seller_id LIMIT 1
        ) || '/product/' || v_product.id
      );
    END IF;

  -- Case 2: Reply → notify original question author (if different person)
  ELSE
    SELECT author_id INTO v_parent_author_id
    FROM product_comments WHERE id = NEW.parent_id;

    -- Notify question author when someone replies (not their own reply)
    IF v_parent_author_id IS NOT NULL AND v_parent_author_id != NEW.author_id THEN
      PERFORM notify_market_event(
        v_parent_author_id,
        '💬 ' || v_author_name || ' replied to your question on "' || v_product.name || '": ' ||
          left(NEW.body, 100) || CASE WHEN length(NEW.body) > 100 THEN '…' ELSE '' END,
        '/market/booth/' || (
          SELECT id FROM market_booths WHERE owner_id = v_product.seller_id LIMIT 1
        ) || '/product/' || v_product.id
      );
    END IF;

    -- Also notify seller if the reply isn't from the seller
    IF NEW.author_id != v_product.seller_id AND v_parent_author_id != v_product.seller_id THEN
      PERFORM notify_market_event(
        v_product.seller_id,
        '💬 New reply on "' || v_product.name || '" Q&A from ' || v_author_name,
        '/market/booth/' || (
          SELECT id FROM market_booths WHERE owner_id = v_product.seller_id LIMIT 1
        ) || '/product/' || v_product.id
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_product_comment_notification
  AFTER INSERT ON product_comments
  FOR EACH ROW
  EXECUTE FUNCTION trg_product_comment_notify();
