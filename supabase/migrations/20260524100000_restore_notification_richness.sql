-- ============================================================
-- Restore notification trigger richness lost in multi_stand_schema
--
-- The 20260522 multi-stand migration rewrote both notification
-- triggers to add booth/stand names but accidentally stripped:
--   • Deep links (/orders/{id}) on placed/confirmed/delivered
--   • Pickup vs delivery distinction ("picked up" vs "delivered")
--   • 4-hour confirmation window text
--   • Buyer/seller name context
--   • Email/SMS delivery flags
--
-- This migration restores all of the above while keeping the
-- booth-name enhancements from multi-stand.
-- ============================================================

-- 1. Order PLACED — restore deep link + buyer name + fulfillment details
CREATE OR REPLACE FUNCTION trg_market_order_placed_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_buyer_name TEXT;
  v_booth_name TEXT;
  v_msg TEXT;
BEGIN
  SELECT full_name INTO v_buyer_name FROM profiles WHERE id = NEW.buyer_id;
  SELECT name INTO v_booth_name FROM market_booths WHERE id = NEW.booth_id;

  v_msg := '🛒 New order: ' || NEW.quantity || '× ' || NEW.product_name ||
           ' ($' || NEW.total_usd || ') at ' || COALESCE(v_booth_name, 'your stand') || CHR(10) ||
           'Buyer: ' || COALESCE(v_buyer_name, 'Unknown') || CHR(10) ||
           'Fulfillment: ' || INITCAP(NEW.fulfillment_type);

  IF NEW.fulfillment_type = 'delivery' AND NEW.delivery_address IS NOT NULL THEN
    v_msg := v_msg || CHR(10) || 'Address: ' || NEW.delivery_address;
  END IF;

  PERFORM notify_market_event(
    NEW.seller_id,
    v_msg,
    '/orders/' || NEW.id,
    true,  -- send email
    true   -- send SMS
  );
  RETURN NEW;
END;
$$;


-- 2. Order STATUS changes — restore deep links + details + pickup distinction + 4hr window
CREATE OR REPLACE FUNCTION trg_market_order_status_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_booth_name TEXT;
  v_pickup_addr TEXT;
  v_buyer_name TEXT;
  v_seller_name TEXT;
  v_base_msg TEXT;
  v_details TEXT;
  v_credit_str TEXT := '';
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  SELECT b.name, COALESCE(b.pickup_display_address, b.pickup_address)
  INTO v_booth_name, v_pickup_addr
  FROM market_booths b WHERE b.id = NEW.booth_id;

  SELECT full_name INTO v_buyer_name FROM profiles WHERE id = NEW.buyer_id;

  v_details := CHR(10) || 'Order: #' || substr(NEW.id::text, 1, 8) || CHR(10) ||
               'Stand: ' || COALESCE(v_booth_name, 'Unknown') || CHR(10) ||
               'Fulfillment: ' || INITCAP(NEW.fulfillment_type) || CHR(10) ||
               'Total: $' || NEW.total_usd;

  -- Build credit string if applicable
  IF NEW.credit_applied_usd IS NOT NULL AND NEW.credit_applied_usd > 0 THEN
    v_credit_str := ' $' || NEW.credit_applied_usd || ' credit applied!';
  END IF;

  CASE NEW.status
    WHEN 'confirmed' THEN
      v_base_msg := '✅ Your order for ' || NEW.product_name ||
        ' at ' || COALESCE(v_booth_name, 'the stand') || ' has been accepted!';
      PERFORM notify_market_event(NEW.buyer_id, v_base_msg || v_details, '/orders/' || NEW.id, true, true);

    WHEN 'delivered' THEN
      IF NEW.fulfillment_type = 'pickup' THEN
        v_base_msg := '🛍️ Your ' || NEW.product_name ||
          ' from ' || COALESCE(v_booth_name, 'the stand') ||
          ' is ready for pickup! You have 4 hours to confirm receipt before auto-completion.';
      ELSE
        v_base_msg := '🚚 Your ' || NEW.product_name ||
          ' from ' || COALESCE(v_booth_name, 'the stand') ||
          ' has been delivered! You have 4 hours to confirm receipt before auto-completion.';
      END IF;
      PERFORM notify_market_event(NEW.buyer_id, v_base_msg || v_details, '/orders/' || NEW.id, true, true);

    WHEN 'completed' THEN
      v_base_msg := '✅ Order completed: ' || NEW.product_name ||
        ' from ' || COALESCE(v_booth_name, 'the stand') ||
        ' — $' || NEW.total_usd || ' settled.' || v_credit_str || ' Rate your experience!';
      PERFORM notify_market_event(NEW.buyer_id, v_base_msg || v_details, '/orders/' || NEW.id, true, true);

      v_base_msg := '💰 Sale completed at ' || COALESCE(v_booth_name, 'your stand') ||
        ': ' || NEW.product_name || ' — $' || NEW.subtotal_usd || ' earned. Rate the buyer!';
      PERFORM notify_market_event(
        NEW.seller_id,
        v_base_msg || CHR(10) || 'Order: #' || substr(NEW.id::text, 1, 8) || CHR(10) || 'Buyer: ' || COALESCE(v_buyer_name, 'Unknown'),
        '/orders/' || NEW.id, true, true
      );

    WHEN 'declined' THEN
      v_base_msg := '❌ Your order for ' || NEW.product_name ||
        ' at ' || COALESCE(v_booth_name, 'the stand') || ' was declined' ||
        CASE WHEN NEW.decline_reason IS NOT NULL THEN ': ' || NEW.decline_reason ELSE '' END;
      PERFORM notify_market_event(NEW.buyer_id, v_base_msg || v_details, '/orders/' || NEW.id, true, true);

    WHEN 'disputed' THEN
      DECLARE
        v_dispute_label TEXT;
      BEGIN
        SELECT CASE d.dispute_type
          WHEN 'not_delivered' THEN 'Order Not Delivered'
          WHEN 'wrong_item' THEN 'Wrong Item Received'
          WHEN 'poor_quality' THEN 'Quality Issue Reported'
          WHEN 'quantity_mismatch' THEN 'Quantity Mismatch'
          ELSE 'Dispute Opened'
        END INTO v_dispute_label
        FROM order_disputes d WHERE d.order_id = NEW.id
        ORDER BY d.created_at DESC LIMIT 1;

        v_dispute_label := coalesce(v_dispute_label, 'Dispute Opened');

        PERFORM notify_market_event(
          NEW.buyer_id,
          '⚠️ ' || v_dispute_label || ' for your ' || NEW.product_name || ' order at ' || COALESCE(v_booth_name, 'the stand') || '.' || v_details,
          '/orders/' || NEW.id, true, true
        );
        PERFORM notify_market_event(
          NEW.seller_id,
          '⚠️ ' || v_dispute_label || ' for ' || NEW.product_name || ' sale at ' || COALESCE(v_booth_name, 'your stand') || '.' ||
            CHR(10) || 'Order: #' || substr(NEW.id::text, 1, 8) || CHR(10) || 'Buyer: ' || COALESCE(v_buyer_name, 'Unknown'),
          '/orders/' || NEW.id, true, true
        );
      END;

    WHEN 'escalated' THEN
      PERFORM notify_market_event(
        NEW.buyer_id,
        '📋 Your dispute for ' || NEW.product_name || ' at ' || COALESCE(v_booth_name, 'the stand') || ' has been escalated to admin review.' || v_details,
        '/orders/' || NEW.id, true, true
      );
      PERFORM notify_market_event(
        NEW.seller_id,
        '📋 Dispute escalated for ' || NEW.product_name || ' sale at ' || COALESCE(v_booth_name, 'your stand') || '.' ||
          CHR(10) || 'Order: #' || substr(NEW.id::text, 1, 8) || CHR(10) || 'Buyer: ' || COALESCE(v_buyer_name, 'Unknown'),
        '/orders/' || NEW.id, true, true
      );

    WHEN 'resolved' THEN
      PERFORM notify_market_event(
        NEW.buyer_id,
        '✅ Your dispute for ' || NEW.product_name || ' at ' || COALESCE(v_booth_name, 'the stand') || ' has been resolved.' || v_details,
        '/orders/' || NEW.id, true, true
      );
      PERFORM notify_market_event(
        NEW.seller_id,
        '✅ Dispute resolved for ' || NEW.product_name || ' at ' || COALESCE(v_booth_name, 'your stand') || '.' ||
          CHR(10) || 'Order: #' || substr(NEW.id::text, 1, 8) || CHR(10) || 'Buyer: ' || COALESCE(v_buyer_name, 'Unknown'),
        '/orders/' || NEW.id, true, true
      );

    WHEN 'cancelled' THEN
      PERFORM notify_market_event(
        NEW.buyer_id,
        '🚫 Your order for ' || NEW.product_name || ' at ' || COALESCE(v_booth_name, 'the stand') || ' has been cancelled.' || v_details,
        '/orders/' || NEW.id, true, true
      );

    ELSE NULL;
  END CASE;
  RETURN NEW;
END;
$$;
