-- ============================================================================
-- Fix Notification Gaps
-- GAP-3:  Order cancelled → notify seller
-- GAP-4:  Auto-complete/cancel → add SMS
-- GAP-5:  Settlement → SMS for sellers with earnings
-- GAP-2:  Card captured → notify buyer with typed email
-- ============================================================================

-- ============================================================================
-- GAP-3: Seller notification on order cancellation
-- Also sending typed email to seller via _send_notification_email
-- ============================================================================
CREATE OR REPLACE FUNCTION trg_market_order_status_notify()
RETURNS TRIGGER AS $$
DECLARE
  v_buyer_email text;
  v_seller_email text;
  v_buyer_name text;
  v_seller_name text;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  -- Pre-fetch names/emails for cancel notification email
  IF NEW.status = 'cancelled' THEN
    v_buyer_email := public.get_user_email(NEW.buyer_id);
    v_seller_email := public.get_user_email(NEW.seller_id);
    SELECT full_name INTO v_buyer_name FROM profiles WHERE id = NEW.buyer_id;
    SELECT full_name INTO v_seller_name FROM profiles WHERE id = NEW.seller_id;
  END IF;

  CASE NEW.status
    WHEN 'confirmed' THEN
      PERFORM notify_market_event(
        NEW.buyer_id,
        '✅ Your order for ' || NEW.product_name || ' has been accepted by the seller!',
        '/orders/' || NEW.id,
        true, true
      );

    WHEN 'delivered' THEN
      IF NEW.fulfillment_type = 'pickup' THEN
        PERFORM notify_market_event(
          NEW.buyer_id,
          '📍 Your ' || NEW.product_name || ' is ready for pickup!',
          '/orders/' || NEW.id,
          true, true
        );
      ELSE
        PERFORM notify_market_event(
          NEW.buyer_id,
          '🚚 Your ' || NEW.product_name || ' has been delivered! You have 4 hours to confirm receipt before auto-completion.',
          '/orders/' || NEW.id,
          true, true
        );
      END IF;

    WHEN 'completed' THEN
      -- Buyer notification (with $ amount)
      IF NEW.credit_applied_usd > 0 THEN
        PERFORM notify_market_event(
          NEW.buyer_id,
          '✅ Order completed: ' || NEW.product_name || ' — $' || NEW.total_usd || ' settled. $' || NEW.credit_applied_usd || ' credit applied! Rate your experience!',
          '/orders/' || NEW.id,
          true, true
        );
      ELSE
        PERFORM notify_market_event(
          NEW.buyer_id,
          '✅ Order completed: ' || NEW.product_name || ' — $' || NEW.total_usd || ' settled. Rate your experience!',
          '/orders/' || NEW.id,
          true, true
        );
      END IF;

      -- Seller notification: "total" instead of "earned"
      PERFORM notify_market_event(
        NEW.seller_id,
        '💰 Sale completed: ' || NEW.product_name || ' — $' || NEW.subtotal_usd || ' total. Rate the buyer!',
        '/orders/' || NEW.id,
        true, true
      );

    WHEN 'declined' THEN
      PERFORM notify_market_event(
        NEW.buyer_id,
        '❌ Your order for ' || NEW.product_name || ' was declined' ||
          CASE WHEN NEW.decline_reason IS NOT NULL THEN ': ' || NEW.decline_reason ELSE '' END,
        '/orders/' || NEW.id,
        true, true
      );

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

        PERFORM notify_market_event(NEW.buyer_id, '⚠️ ' || v_dispute_label || ' for your ' || NEW.product_name || ' order.', '/orders/' || NEW.id, true, true);
        PERFORM notify_market_event(NEW.seller_id, '⚠️ ' || v_dispute_label || ' for your ' || NEW.product_name || ' sale.', '/orders/' || NEW.id, true, true);
      END;

    WHEN 'escalated' THEN
      PERFORM notify_market_event(NEW.buyer_id, '📋 Your dispute for ' || NEW.product_name || ' has been escalated to admin review.', '/orders/' || NEW.id, true, true);
      PERFORM notify_market_event(NEW.seller_id, '📋 The dispute for ' || NEW.product_name || ' has been escalated to admin review.', '/orders/' || NEW.id, true, true);

    WHEN 'resolved' THEN
      PERFORM notify_market_event(NEW.buyer_id, '✅ Your dispute for ' || NEW.product_name || ' has been resolved.', '/orders/' || NEW.id, true, true);
      PERFORM notify_market_event(NEW.seller_id, '✅ The dispute for ' || NEW.product_name || ' has been resolved.', '/orders/' || NEW.id, true, true);

    WHEN 'cancelled' THEN
      -- Notify buyer (existing)
      PERFORM notify_market_event(NEW.buyer_id, '🔄 Your order for ' || NEW.product_name || ' has been cancelled.', '/orders/' || NEW.id, true, true);

      -- GAP-3 FIX: Notify seller too
      PERFORM notify_market_event(NEW.seller_id, '🔄 Order for ' || NEW.product_name || ' has been cancelled by the buyer.', '/orders/' || NEW.id, true, true);

      -- Typed email to seller
      IF v_seller_email IS NOT NULL THEN
        BEGIN
          PERFORM public._send_notification_email(
            'order_cancelled_seller',
            jsonb_build_array(jsonb_build_object('email', v_seller_email, 'name', coalesce(v_seller_name, 'there'))),
            jsonb_build_object(
              'product', NEW.product_name,
              'quantity', NEW.quantity,
              'buyerName', coalesce(v_buyer_name, 'A buyer'),
              'orderId', NEW.id::text
            )
          );
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING '[trg_market_order_status_notify] Failed to send cancel email: %', SQLERRM;
        END;
      END IF;

    ELSE NULL;
  END CASE;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- GAP-4: Auto-complete/cancel → add SMS (p_send_sms = true)
-- ============================================================================
CREATE OR REPLACE FUNCTION auto_complete_delivered_orders()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  v_rec RECORD;
  v_window_end TIMESTAMPTZ;
BEGIN

  -- ────────────────────────────────────────────
  -- PATH 1: On-time delivered orders past auto_complete_at
  --         → AUTO-COMPLETE
  -- ────────────────────────────────────────────
  FOR v_rec IN
    SELECT id, buyer_id, seller_id, product_name, fulfillment_type
    FROM market_orders
    WHERE status = 'delivered'
      AND auto_complete_at IS NOT NULL
      AND auto_complete_at <= now()
    FOR UPDATE
  LOOP
    UPDATE market_orders
    SET status = 'completed', completed_at = now(), updated_at = now()
    WHERE id = v_rec.id;

    -- Notify seller (GAP-4: added p_send_sms = true)
    PERFORM notify_market_event(
      v_rec.seller_id,
      CASE v_rec.fulfillment_type
        WHEN 'pickup' THEN
          '✅ Pickup order for "' || v_rec.product_name || '" auto-completed — you prepared the order but it was not picked up within the 24-hour grace period. You will be paid.'
        ELSE
          '✅ Order for "' || v_rec.product_name || '" auto-completed — buyer did not respond within 4 hours.'
      END,
      '/orders/' || v_rec.id,
      true,  -- p_send_email
      true   -- p_send_sms (GAP-4 fix)
    );

    -- Notify buyer (GAP-4: added p_send_sms = true)
    PERFORM notify_market_event(
      v_rec.buyer_id,
      CASE v_rec.fulfillment_type
        WHEN 'pickup' THEN
          '📍 Your pickup order for "' || v_rec.product_name || '" was auto-completed. The seller prepared your order but it was not picked up within 24 hours of the pickup window.'
        ELSE
          '📦 Your order for "' || v_rec.product_name || '" was auto-completed. Delivery was not confirmed within 4 hours.'
      END,
      '/orders/' || v_rec.id,
      true,  -- p_send_email
      true   -- p_send_sms (GAP-4 fix)
    );

    -- Generate receipt
    PERFORM _complete_market_order_with_receipt(v_rec.id);

    v_count := v_count + 1;
  END LOOP;

  -- ────────────────────────────────────────────
  -- PATH 2: Late-delivered DELIVERY orders → AUTO-CANCEL
  -- ────────────────────────────────────────────
  FOR v_rec IN
    SELECT mo.id, mo.buyer_id, mo.seller_id, mo.product_name, mo.product_id, mo.quantity
    FROM market_orders mo
    WHERE mo.status = 'delivered'
      AND mo.fulfillment_type = 'delivery'
      AND mo.auto_complete_at IS NULL
    FOR UPDATE
  LOOP
    v_window_end := _get_latest_window_end(v_rec.product_id, 'delivery');
    IF v_window_end IS NULL THEN CONTINUE; END IF;

    IF v_window_end IS NOT NULL AND v_window_end + interval '24 hours' <= now() THEN
      UPDATE market_orders
      SET status = 'cancelled',
          decline_reason = 'Auto-cancelled: late delivery was not confirmed by buyer within the 24-hour grace period.',
          updated_at = now()
      WHERE id = v_rec.id;

      UPDATE market_products
      SET inventory = inventory + v_rec.quantity, updated_at = now()
      WHERE id = v_rec.product_id;

      -- GAP-4: added p_send_sms = true
      PERFORM notify_market_event(
        v_rec.seller_id,
        '🔄 Late delivery of "' || v_rec.product_name || '" was auto-cancelled — buyer did not confirm receipt within the 24-hour grace period.',
        '/orders/' || v_rec.id,
        true, true
      );
      PERFORM notify_market_event(
        v_rec.buyer_id,
        '🔄 Your order for "' || v_rec.product_name || '" was auto-cancelled — late delivery was not confirmed within the grace period. You will not be charged.',
        '/orders/' || v_rec.id,
        true, true
      );

      v_count := v_count + 1;
    END IF;
  END LOOP;

  -- ────────────────────────────────────────────
  -- PATH 3: Pending DELIVERY orders — seller never delivered → AUTO-CANCEL
  -- ────────────────────────────────────────────
  FOR v_rec IN
    SELECT mo.id, mo.buyer_id, mo.seller_id, mo.product_name, mo.product_id, mo.quantity
    FROM market_orders mo
    WHERE mo.status = 'pending'
      AND mo.fulfillment_type = 'delivery'
    FOR UPDATE
  LOOP
    v_window_end := _get_latest_window_end(v_rec.product_id, 'delivery');
    IF v_window_end IS NULL THEN CONTINUE; END IF;

    IF v_window_end IS NOT NULL AND v_window_end + interval '24 hours' <= now() THEN
      UPDATE market_orders
      SET status = 'cancelled',
          decline_reason = 'Auto-cancelled: seller did not deliver within the 24-hour grace period after the delivery window.',
          updated_at = now()
      WHERE id = v_rec.id;

      UPDATE market_products
      SET inventory = inventory + v_rec.quantity, updated_at = now()
      WHERE id = v_rec.product_id;

      -- GAP-4: added p_send_sms = true
      PERFORM notify_market_event(
        v_rec.seller_id,
        '🔄 Order for "' || v_rec.product_name || '" auto-cancelled — not delivered within the 24-hour grace period.',
        '/orders/' || v_rec.id,
        true, true
      );
      PERFORM notify_market_event(
        v_rec.buyer_id,
        '🔄 Your order for "' || v_rec.product_name || '" was auto-cancelled — the seller did not deliver within the 24-hour grace period. You will not be charged.',
        '/orders/' || v_rec.id,
        true, true
      );

      v_count := v_count + 1;
    END IF;
  END LOOP;

  -- ────────────────────────────────────────────
  -- PATH 4: Pending PICKUP orders — seller never marked ready → AUTO-CANCEL
  -- ────────────────────────────────────────────
  FOR v_rec IN
    SELECT mo.id, mo.buyer_id, mo.seller_id, mo.product_name, mo.product_id, mo.quantity
    FROM market_orders mo
    WHERE mo.status = 'pending'
      AND mo.fulfillment_type = 'pickup'
    FOR UPDATE
  LOOP
    v_window_end := _get_latest_window_end(v_rec.product_id, 'pickup');
    IF v_window_end IS NULL THEN CONTINUE; END IF;

    IF v_window_end IS NOT NULL AND v_window_end + interval '24 hours' <= now() THEN
      UPDATE market_orders
      SET status = 'cancelled',
          decline_reason = 'Auto-cancelled: seller did not prepare order for pickup within the 24-hour grace period.',
          updated_at = now()
      WHERE id = v_rec.id;

      UPDATE market_products
      SET inventory = inventory + v_rec.quantity, updated_at = now()
      WHERE id = v_rec.product_id;

      -- GAP-4: added p_send_sms = true
      PERFORM notify_market_event(
        v_rec.seller_id,
        '🔄 Pickup order for "' || v_rec.product_name || '" auto-cancelled — not prepared within the 24-hour grace period.',
        '/orders/' || v_rec.id,
        true, true
      );
      PERFORM notify_market_event(
        v_rec.buyer_id,
        '🔄 Your pickup order for "' || v_rec.product_name || '" was auto-cancelled — the seller did not prepare it within the 24-hour grace period. You will not be charged.',
        '/orders/' || v_rec.id,
        true, true
      );

      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- GAP-5: Settlement → SMS for sellers with earnings
-- GAP-2: Card captured → notify buyer with typed email
--
-- The run_market_settlement function is very large. Instead of replacing
-- it entirely, we use a DO block to replace the source text in pg_proc
-- with surgical text substitution.
-- ============================================================================
DO $$
DECLARE
  v_src text;
BEGIN
  -- Get the current function source
  SELECT prosrc INTO v_src
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'run_market_settlement';

  -- GAP-5: Replace the notify_market_event call to include SMS for sellers
  -- Change from: notify_market_event(v_user.user_id, v_notif_content, '/earnings')
  -- To include p_send_email := true, p_send_sms for sellers with earnings
  v_src := replace(
    v_src,
    'PERFORM notify_market_event(v_user.user_id, v_notif_content, ''/earnings'');',
    'PERFORM notify_market_event(v_user.user_id, v_notif_content, ''/earnings'', true, CASE WHEN v_net > 0 THEN true ELSE false END);'
  );

  -- GAP-2: Add card-charged notification after the notify_market_event call
  -- We insert new code right after the exception handler for notify_market_event
  v_src := replace(
    v_src,
    'RAISE WARNING ''notify_market_event failed in settlement for user %: %'', v_user.user_id, SQLERRM;
      END;',
    'RAISE WARNING ''notify_market_event failed in settlement for user %: %'', v_user.user_id, SQLERRM;
      END;

      -- GAP-2: Notify buyer when card is captured
      IF v_hold_captured > 0 AND v_hold IS NOT NULL THEN
        BEGIN
          PERFORM notify_market_event(
            v_user.user_id,
            ''💳 Your card was charged $'' || ROUND(v_hold_captured, 2) || '' for completed market orders.'',
            ''/earnings'',
            true,  -- p_send_email
            false  -- p_send_sms (routine charge, no SMS)
          );
          -- Typed email for card charge
          DECLARE
            v_charge_email text;
            v_charge_name text;
          BEGIN
            v_charge_email := public.get_user_email(v_user.user_id);
            IF v_charge_email IS NOT NULL THEN
              SELECT full_name INTO v_charge_name FROM profiles WHERE id = v_user.user_id;
              PERFORM public._send_notification_email(
                ''card_charged'',
                jsonb_build_array(jsonb_build_object(''email'', v_charge_email, ''name'', coalesce(v_charge_name, ''there''))),
                jsonb_build_object(''chargeAmountUsd'', v_hold_captured)
              );
            END IF;
          EXCEPTION WHEN OTHERS THEN
            RAISE WARNING ''Card charged email failed for user %: %'', v_user.user_id, SQLERRM;
          END;
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING ''Card capture notification failed for user %: %'', v_user.user_id, SQLERRM;
        END;
      END IF;'
  );

  -- Apply the modified source
  EXECUTE 'CREATE OR REPLACE FUNCTION run_market_settlement(p_market_date DATE DEFAULT CURRENT_DATE)
    RETURNS jsonb AS $fn$' || v_src || '$fn$ LANGUAGE plpgsql SECURITY DEFINER';
END $$;
