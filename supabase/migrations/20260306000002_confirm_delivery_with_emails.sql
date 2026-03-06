-- Updated confirm_order_delivery with email notifications enabled
-- Sends transaction receipt emails via send-transaction-email edge function
-- Adds in-app notifications for buyer, seller/delegate, and delegator
DROP FUNCTION IF EXISTS public.confirm_order_delivery(uuid, uuid);
DROP FUNCTION IF EXISTS public.confirm_order_delivery(uuid, uuid, date);
CREATE OR REPLACE FUNCTION public.confirm_order_delivery(
  p_order_id  uuid,
  p_buyer_id  uuid,
  p_harvest_date date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order          RECORD;
  v_post           RECORD;
  v_total          INTEGER;
  v_fee            INTEGER;
  v_after_fee      INTEGER;
  v_delegator_share INTEGER;
  v_delegate_share  INTEGER;
  v_delegate_pct   INTEGER;
  v_fee_rate       NUMERIC;
  v_buyer_profile  RECORD;
  v_seller_profile RECORD;
  v_receipt_footer TEXT;
  v_buyer_zip      TEXT;
  v_seller_zip     TEXT;
  v_buyer_email    TEXT;
  v_seller_email   TEXT;
  v_delegator_email TEXT;
  v_delegator_profile RECORD;
  v_email_body     JSONB;
  v_service_role_key TEXT;
  v_edge_fn_url    TEXT;
BEGIN
  SELECT * INTO v_order
  FROM orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('error', 'Order not found');
  END IF;

  IF v_order.buyer_id != p_buyer_id THEN
    RETURN jsonb_build_object('error', 'Only the buyer can confirm delivery');
  END IF;

  IF v_order.status != 'delivered' THEN
    RETURN jsonb_build_object(
      'error', 'Order must be in delivered status to confirm',
      'currentStatus', v_order.status
    );
  END IF;

  -- Store harvest date if provided
  IF p_harvest_date IS NOT NULL THEN
    UPDATE orders SET harvest_date = p_harvest_date WHERE id = p_order_id;
  END IF;

  -- Fetch fee dynamically based on seller's country
  v_fee_rate := public.get_platform_fee_for_user(v_order.seller_id);

  -- Calculate amounts
  v_total := v_order.quantity * v_order.points_per_unit;
  v_fee := floor(v_total * v_fee_rate);
  v_after_fee := v_total - v_fee;

  -- Update order status
  UPDATE orders
  SET status = 'completed', updated_at = now()
  WHERE id = p_order_id;

  -- Platform fee ledger entry
  INSERT INTO point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
  VALUES (
    v_order.seller_id,
    'platform_fee',
    -v_fee,
    0,
    v_order.id,
    jsonb_build_object('order_id', v_order.id, 'fee_rate', v_fee_rate)
  );

  -- ── Fetch profiles for receipt ──
  SELECT full_name, zip_code INTO v_buyer_profile FROM profiles WHERE id = v_order.buyer_id;
  SELECT full_name, zip_code INTO v_seller_profile FROM profiles WHERE id = v_order.seller_id;

  -- Get zip codes directly from profiles
  v_buyer_zip := v_buyer_profile.zip_code;
  v_seller_zip := v_seller_profile.zip_code;

  -- Get receipt footer if applicable (based on seller's community state)
  SELECT rf.footer_text INTO v_receipt_footer
  FROM receipt_footers rf
  JOIN communities c ON c.h3_index = (SELECT home_community_h3_index FROM profiles WHERE id = v_order.seller_id)
  WHERE rf.state_code = c.state
  LIMIT 1;

  -- Get user emails for email notifications
  v_buyer_email := get_user_email(v_order.buyer_id);
  v_seller_email := get_user_email(v_order.seller_id);

  -- Service role key for edge function auth
  v_service_role_key := COALESCE(
    current_setting('app.settings.service_role_key', true),
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1),
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
  );
  v_edge_fn_url := COALESCE(
    current_setting('app.settings.edge_functions_base_url', true),
    'http://host.docker.internal:54321/functions/v1'
  ) || '/send-transaction-email';

  -- Look up if this is a delegated sale
  SELECT p.on_behalf_of, p.author_id, wsd.delegate_pct
  INTO v_post
  FROM conversations c
  JOIN posts p ON p.id = c.post_id
  LEFT JOIN want_to_sell_details wsd ON wsd.post_id = p.id
  WHERE c.id = v_order.conversation_id;

  IF v_post.on_behalf_of IS NOT NULL AND v_post.on_behalf_of != v_post.author_id THEN
    -- ─── DELEGATED SALE ──────────────────────────────────────────────
    v_delegate_pct := COALESCE(v_post.delegate_pct, 50);
    v_delegate_share := ROUND(v_after_fee * v_delegate_pct / 100.0);
    v_delegator_share := v_after_fee - v_delegate_share;

    -- Fetch delegator profile for name
    SELECT full_name, zip_code INTO v_delegator_profile FROM profiles WHERE id = v_post.on_behalf_of;
    v_delegator_email := get_user_email(v_post.on_behalf_of);

    IF v_delegate_share > 0 THEN
      INSERT INTO point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
      VALUES (
        v_post.author_id,
        'delegation_split',
        v_delegate_share,
        0,
        v_order.id,
        jsonb_build_object(
          'order_id', v_order.id,
          'role', 'delegate',
          'delegate_pct', v_delegate_pct,
          'total_before_fee', v_total,
          'platform_fee', v_fee,
          'total_after_fee', v_after_fee,
          'product', v_order.product,
          'delegate_share', v_delegate_share,
          'delegator_share', v_delegator_share,
          'delegator_id', v_post.on_behalf_of,
          'delegator_name', v_delegator_profile.full_name,
          'delegate_name', v_seller_profile.full_name
        )
      );
    END IF;

    IF v_delegator_share > 0 THEN
      INSERT INTO point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
      VALUES (
        v_post.on_behalf_of,
        'delegation_split',
        v_delegator_share,
        0,
        v_order.id,
        jsonb_build_object(
          'order_id', v_order.id,
          'role', 'delegator',
          'delegate_pct', v_delegate_pct,
          'total_before_fee', v_total,
          'platform_fee', v_fee,
          'total_after_fee', v_after_fee,
          'product', v_order.product,
          'delegate_share', v_delegate_share,
          'delegator_share', v_delegator_share,
          'delegate_id', v_post.author_id,
          'delegator_name', v_delegator_profile.full_name,
          'delegate_name', v_seller_profile.full_name
        )
      );
    END IF;

    -- In-app notification for delegator (with link_url)
    INSERT INTO notifications (user_id, content, link_url)
    VALUES (
      v_post.on_behalf_of,
      '💰 Your delegate sold ' || v_order.quantity || ' ' || v_order.product ||
      ' — you earned ' || v_delegator_share || ' points (' || (100 - v_delegate_pct) || '% of ' || v_after_fee || ' after fees).',
      '/transaction-history'
    );

    -- In-app notification for delegate (seller)
    INSERT INTO notifications (user_id, content, link_url)
    VALUES (
      v_post.author_id,
      '💰 Delegated sale complete! ' || v_order.quantity || ' ' || v_order.product ||
      ' — you earned ' || v_delegate_share || ' points (' || v_delegate_pct || '% of ' || v_after_fee || ' after fees).',
      '/transaction-history'
    );

    -- In-app notification for buyer
    INSERT INTO notifications (user_id, content, link_url)
    VALUES (
      v_order.buyer_id,
      '✅ Order complete! ' || v_order.quantity || ' ' || v_order.product || ' — ' || v_total || ' points released. Thank you!',
      '/transaction-history'
    );

    -- System message to buyer (no escrow language)
    INSERT INTO chat_messages (conversation_id, sender_id, content, type, metadata)
    VALUES (
      v_order.conversation_id,
      NULL,
      '✅ Order complete! ' || v_total || ' held points have been released. Thank you for your purchase!',
      'system',
      jsonb_build_object('visible_to', v_order.buyer_id)
    );

    -- System message to delegate/seller
    INSERT INTO chat_messages (conversation_id, sender_id, content, type, metadata)
    VALUES (
      v_order.conversation_id,
      NULL,
      '💰 Payment received: ' || v_delegate_share || ' points credited (' || v_delegate_pct || '% of ' || v_after_fee || ' after ' || v_fee || ' platform fee).',
      'system',
      jsonb_build_object('visible_to', v_order.seller_id)
    );

    -- Generate digital receipt
    INSERT INTO digital_receipts (order_id, buyer_receipt, seller_receipt)
    VALUES (
      p_order_id,
      jsonb_build_object(
        'transaction_id', v_order.id,
        'date', now(),
        'type', 'Affiliated Network Fulfillment',
        'buyer_name', v_buyer_profile.full_name,
        'buyer_zip', v_buyer_zip,
        'seller_name', v_seller_profile.full_name,
        'seller_zip', v_seller_zip,
        'harvest_date', COALESCE(p_harvest_date, v_order.harvest_date),
        'product', v_order.product,
        'quantity', v_order.quantity,
        'points_per_unit', v_order.points_per_unit,
        'subtotal', v_total,
        'tax_amount', COALESCE(v_order.tax_amount, 0),
        'total', v_total + COALESCE(v_order.tax_amount, 0),
        'footer', v_receipt_footer
      ),
      jsonb_build_object(
        'transaction_id', v_order.id,
        'date', now(),
        'type', 'Affiliated Network Fulfillment',
        'buyer_name', v_buyer_profile.full_name,
        'buyer_zip', v_buyer_zip,
        'seller_name', v_seller_profile.full_name,
        'seller_zip', v_seller_zip,
        'harvest_date', COALESCE(p_harvest_date, v_order.harvest_date),
        'product', v_order.product,
        'quantity', v_order.quantity,
        'points_per_unit', v_order.points_per_unit,
        'subtotal', v_total,
        'tax_amount', COALESCE(v_order.tax_amount, 0),
        'total', v_total + COALESCE(v_order.tax_amount, 0),
        'platform_fee', v_fee,
        'fee_rate', v_fee_rate,
        'delegated', true,
        'delegate_pct', v_delegate_pct,
        'delegate_share', v_delegate_share,
        'delegator_share', v_delegator_share,
        'footer', v_receipt_footer
      )
    );

    -- ─── EMAIL NOTIFICATIONS ───────────────────────────────────────
    -- Build email data with all receipt info
    v_email_body := jsonb_build_object(
      'transactionId', v_order.id,
      'date', now(),
      'product', v_order.product,
      'quantity', v_order.quantity,
      'unit', 'piece',
      'pointsPerUnit', v_order.points_per_unit,
      'subtotal', v_total,
      'tax', COALESCE(v_order.tax_amount, 0),
      'total', v_total + COALESCE(v_order.tax_amount, 0),
      'sellerName', v_seller_profile.full_name,
      'sellerZip', v_seller_zip,
      'buyerName', v_buyer_profile.full_name,
      'buyerZip', v_buyer_zip,
      'harvestDate', COALESCE(p_harvest_date, v_order.harvest_date),
      'platformFee', v_fee,
      'feeRate', v_fee_rate,
      'delegated', true,
      'delegatePct', v_delegate_pct,
      'delegateShare', v_delegate_share,
      'delegatorShare', v_delegator_share,
      'delegatorName', v_delegator_profile.full_name,
      'delegateName', v_seller_profile.full_name,
      'receiptFooter', v_receipt_footer
    );

    -- Send buyer email
    IF v_buyer_email IS NOT NULL THEN
      PERFORM net.http_post(
        url := v_edge_fn_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_role_key
        ),
        body := jsonb_build_object(
          'recipients', jsonb_build_array(
            jsonb_build_object('email', v_buyer_email, 'role', 'buyer')
          ),
          'orderData', v_email_body
        )
      );
    END IF;

    -- Send delegate (seller) email
    IF v_seller_email IS NOT NULL THEN
      PERFORM net.http_post(
        url := v_edge_fn_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_role_key
        ),
        body := jsonb_build_object(
          'recipients', jsonb_build_array(
            jsonb_build_object('email', v_seller_email, 'role', 'seller')
          ),
          'orderData', v_email_body
        )
      );
    END IF;

    -- Send delegator email
    IF v_delegator_email IS NOT NULL THEN
      PERFORM net.http_post(
        url := v_edge_fn_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_role_key
        ),
        body := jsonb_build_object(
          'recipients', jsonb_build_array(
            jsonb_build_object('email', v_delegator_email, 'role', 'delegator')
          ),
          'orderData', v_email_body
        )
      );
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'delegated', true,
      'delegatePct', v_delegate_pct,
      'delegatorShare', v_delegator_share,
      'delegateShare', v_delegate_share,
      'platformFee', v_fee
    );

  ELSE
    -- ─── NORMAL SALE ─────────────────────────────────────────────────

    INSERT INTO point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
    VALUES (
      v_order.seller_id,
      'payment',
      v_after_fee,
      0,
      v_order.id,
      jsonb_build_object(
        'order_id', v_order.id,
        'product', v_order.product,
        'total', v_total,
        'platform_fee', v_fee,
        'seller_payout', v_after_fee
      )
    );

    -- In-app notification for buyer
    INSERT INTO notifications (user_id, content, link_url)
    VALUES (
      v_order.buyer_id,
      '✅ Order complete! ' || v_order.quantity || ' ' || v_order.product || ' — ' || v_total || ' points released. Thank you!',
      '/transaction-history'
    );

    -- In-app notification for seller
    INSERT INTO notifications (user_id, content, link_url)
    VALUES (
      v_order.seller_id,
      '💰 Sale complete! ' || v_order.quantity || ' ' || v_order.product || ' — ' || v_after_fee || ' points received (after ' || v_fee || ' platform fee).',
      '/transaction-history'
    );

    -- System message to buyer (no escrow language)
    INSERT INTO chat_messages (conversation_id, sender_id, content, type, metadata)
    VALUES (
      v_order.conversation_id,
      NULL,
      '✅ Order complete! ' || v_total || ' held points have been released. Thank you for your purchase!',
      'system',
      jsonb_build_object('visible_to', v_order.buyer_id)
    );

    -- System message to seller
    INSERT INTO chat_messages (conversation_id, sender_id, content, type, metadata)
    VALUES (
      v_order.conversation_id,
      NULL,
      '💰 Payment received: ' || v_after_fee || ' points credited (after ' || v_fee || ' platform fee).',
      'system',
      jsonb_build_object('visible_to', v_order.seller_id)
    );

    -- Generate digital receipt
    INSERT INTO digital_receipts (order_id, buyer_receipt, seller_receipt)
    VALUES (
      p_order_id,
      jsonb_build_object(
        'transaction_id', v_order.id,
        'date', now(),
        'type', 'Affiliated Network Fulfillment',
        'buyer_name', v_buyer_profile.full_name,
        'buyer_zip', v_buyer_zip,
        'seller_name', v_seller_profile.full_name,
        'seller_zip', v_seller_zip,
        'harvest_date', COALESCE(p_harvest_date, v_order.harvest_date),
        'product', v_order.product,
        'quantity', v_order.quantity,
        'points_per_unit', v_order.points_per_unit,
        'subtotal', v_total,
        'tax_amount', COALESCE(v_order.tax_amount, 0),
        'total', v_total + COALESCE(v_order.tax_amount, 0),
        'footer', v_receipt_footer
      ),
      jsonb_build_object(
        'transaction_id', v_order.id,
        'date', now(),
        'type', 'Affiliated Network Fulfillment',
        'buyer_name', v_buyer_profile.full_name,
        'buyer_zip', v_buyer_zip,
        'seller_name', v_seller_profile.full_name,
        'seller_zip', v_seller_zip,
        'harvest_date', COALESCE(p_harvest_date, v_order.harvest_date),
        'product', v_order.product,
        'quantity', v_order.quantity,
        'points_per_unit', v_order.points_per_unit,
        'subtotal', v_total,
        'tax_amount', COALESCE(v_order.tax_amount, 0),
        'total', v_total + COALESCE(v_order.tax_amount, 0),
        'platform_fee', v_fee,
        'fee_rate', v_fee_rate,
        'seller_payout', v_after_fee,
        'footer', v_receipt_footer
      )
    );

    -- ─── EMAIL NOTIFICATIONS ───────────────────────────────────────
    v_email_body := jsonb_build_object(
      'transactionId', v_order.id,
      'date', now(),
      'product', v_order.product,
      'quantity', v_order.quantity,
      'unit', 'piece',
      'pointsPerUnit', v_order.points_per_unit,
      'subtotal', v_total,
      'tax', COALESCE(v_order.tax_amount, 0),
      'total', v_total + COALESCE(v_order.tax_amount, 0),
      'sellerName', v_seller_profile.full_name,
      'sellerZip', v_seller_zip,
      'buyerName', v_buyer_profile.full_name,
      'buyerZip', v_buyer_zip,
      'harvestDate', COALESCE(p_harvest_date, v_order.harvest_date),
      'platformFee', v_fee,
      'feeRate', v_fee_rate,
      'sellerPayout', v_after_fee,
      'delegated', false,
      'receiptFooter', v_receipt_footer
    );

    -- Send buyer email
    IF v_buyer_email IS NOT NULL THEN
      PERFORM net.http_post(
        url := v_edge_fn_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_role_key
        ),
        body := jsonb_build_object(
          'recipients', jsonb_build_array(
            jsonb_build_object('email', v_buyer_email, 'role', 'buyer')
          ),
          'orderData', v_email_body
        )
      );
    END IF;

    -- Send seller email
    IF v_seller_email IS NOT NULL THEN
      PERFORM net.http_post(
        url := v_edge_fn_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_role_key
        ),
        body := jsonb_build_object(
          'recipients', jsonb_build_array(
            jsonb_build_object('email', v_seller_email, 'role', 'seller')
          ),
          'orderData', v_email_body
        )
      );
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'delegated', false,
      'sellerPayout', v_after_fee,
      'platformFee', v_fee
    );
  END IF;
END;
$$;
