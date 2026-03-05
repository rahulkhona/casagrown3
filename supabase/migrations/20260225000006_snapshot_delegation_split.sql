-- Add a snapshot column for delegation split percentage onto the post details
-- This ensures that if a delegation is revoked while a post is active, any
-- resulting transactions still honor the split agreed upon at publication time.

ALTER TABLE public.want_to_sell_details ADD COLUMN IF NOT EXISTS delegate_pct integer;

CREATE OR REPLACE FUNCTION public.confirm_order_delivery(
  p_order_id  uuid,
  p_buyer_id  uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order          RECORD;
  v_post           RECORD;
  v_seller_profile RECORD;
  v_buyer_profile  RECORD;
  v_total          INTEGER;
  v_fee            INTEGER;
  v_after_fee      INTEGER;
  v_delegator_share INTEGER;
  v_delegate_share  INTEGER;
  v_delegate_pct   INTEGER;
  v_fee_rate       NUMERIC := 0.10; -- 10% platform fee
  v_buyer_receipt_text  TEXT;
  v_seller_receipt_text TEXT;
  v_buyer_receipt_meta  JSONB;
  v_seller_receipt_meta JSONB;
  v_unit           TEXT;
  v_seller_zip_int INTEGER;
  v_cottage_food_text TEXT := '';
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

  -- Calculate amounts
  v_total := v_order.quantity * v_order.points_per_unit;
  v_fee := floor(v_total * v_fee_rate);
  v_after_fee := v_total - v_fee;

  -- Fetch seller profile for receipt
  SELECT full_name, zip_code INTO v_seller_profile
  FROM profiles WHERE id = v_order.seller_id;

  -- Fetch buyer profile for receipt
  SELECT full_name, zip_code INTO v_buyer_profile
  FROM profiles WHERE id = v_order.buyer_id;

  -- Look up post details (delegation + unit)
  SELECT p.on_behalf_of, p.author_id, wsd.delegate_pct, wsd.unit, wsd.is_produce
  INTO v_post
  FROM conversations c
  JOIN posts p ON p.id = c.post_id
  LEFT JOIN want_to_sell_details wsd ON wsd.post_id = p.id
  WHERE c.id = v_order.conversation_id;

  v_unit := coalesce(v_post.unit::text, 'unit');

  -- Update order status
  UPDATE orders
  SET status = 'completed', updated_at = now()
  WHERE id = p_order_id;

  -- Enrich buyer's hold ledger entry with receipt metadata for transaction log
  UPDATE point_ledger
  SET metadata = metadata || jsonb_build_object(
    'receipt', true,
    'buyer_name', coalesce(v_buyer_profile.full_name, 'N/A'),
    'seller_name', coalesce(v_seller_profile.full_name, 'N/A'),
    'buyer_zip', coalesce(v_buyer_profile.zip_code, ''),
    'seller_zip', coalesce(v_seller_profile.zip_code, ''),
    'quantity', v_order.quantity,
    'unit', v_unit,
    'total', v_order.quantity * v_order.points_per_unit,
    'harvest_date', v_order.harvest_date,
    'completed_at', now()
  )
  WHERE user_id = v_order.buyer_id
    AND type = 'hold'
    AND reference_id = v_order.id;

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

  -- Determine if seller is in Florida (zip 32000-34999) for cottage food disclaimer
  BEGIN
    v_seller_zip_int := NULLIF(left(coalesce(v_seller_profile.zip_code, ''), 5), '')::integer;
  EXCEPTION WHEN OTHERS THEN
    v_seller_zip_int := NULL;
  END;
  IF v_seller_zip_int IS NOT NULL AND v_seller_zip_int BETWEEN 32000 AND 34999
     AND coalesce(v_post.is_produce, false) = true THEN
    v_cottage_food_text := chr(10) || '━━━━━━━━━━━━━━━━━━' || chr(10) ||
      'MADE BY A COTTAGE FOOD OPERATION THAT IS' || chr(10) ||
      'NOT SUBJECT TO FLORIDA''S FOOD SAFETY REGULATIONS.';
  END IF;

  -- ═══════════════════════════════════════════════
  -- BUYER Receipt (no platform fee info)
  -- ═══════════════════════════════════════════════
  v_buyer_receipt_text := '🧾 Digital Receipt' || chr(10) ||
    '━━━━━━━━━━━━━━━━━━' || chr(10) ||
    'Transaction Info' || chr(10) ||
    '  ID: ' || left(p_order_id::text, 8) || '...' || right(p_order_id::text, 3) || chr(10) ||
    '  Date: ' || to_char(now(), 'Mon DD, YYYY') || chr(10) ||
    '  Type: Affiliated Network Fulfillment' || chr(10) ||
    '━━━━━━━━━━━━━━━━━━' || chr(10) ||
    'Seller Info' || chr(10) ||
    '  Seller: ' || coalesce(v_seller_profile.full_name, 'N/A') || chr(10) ||
    '  Zip: ' || coalesce(v_seller_profile.zip_code, 'N/A') || chr(10) ||
    CASE WHEN v_order.harvest_date IS NOT NULL
      THEN '  Harvest Date: ' || to_char(v_order.harvest_date, 'Mon DD, YYYY') || chr(10)
      ELSE '' END ||
    '━━━━━━━━━━━━━━━━━━' || chr(10) ||
    'Buyer Info' || chr(10) ||
    '  Buyer: ' || coalesce(v_buyer_profile.full_name, 'N/A') || chr(10) ||
    '  Zip: ' || coalesce(v_buyer_profile.zip_code, 'N/A') || chr(10) ||
    '━━━━━━━━━━━━━━━━━━' || chr(10) ||
    'Order Details' || chr(10) ||
    '  ' || v_order.product || ' | ' || v_order.quantity || ' ' || v_unit ||
    '  ' || v_total || ' pts' || chr(10) ||
    '  Subtotal: ' || v_total || ' pts' || chr(10) ||
    '  Sales Tax: ' || coalesce(v_order.tax_amount, 0) || ' pts' || chr(10) ||
    '  Total: ' || (v_total + coalesce(v_order.tax_amount, 0)) || ' pts' ||
    v_cottage_food_text;

  v_buyer_receipt_meta := jsonb_build_object(
    'visible_to', v_order.buyer_id,
    'receipt', true,
    'order_id', v_order.id,
    'product', v_order.product,
    'quantity', v_order.quantity,
    'unit', v_unit,
    'points_per_unit', v_order.points_per_unit,
    'subtotal', v_total,
    'tax', coalesce(v_order.tax_amount, 0),
    'seller_name', coalesce(v_seller_profile.full_name, 'N/A'),
    'seller_zip', coalesce(v_seller_profile.zip_code, ''),
    'buyer_name', coalesce(v_buyer_profile.full_name, 'N/A'),
    'buyer_zip', coalesce(v_buyer_profile.zip_code, ''),
    'harvest_date', v_order.harvest_date,
    'completed_at', now()
  );

  -- ═══════════════════════════════════════════════
  -- SELLER Receipt (with platform fee breakdown)
  -- ═══════════════════════════════════════════════
  v_seller_receipt_text := '🧾 Digital Receipt' || chr(10) ||
    '━━━━━━━━━━━━━━━━━━' || chr(10) ||
    'Transaction Info' || chr(10) ||
    '  ID: ' || left(p_order_id::text, 8) || '...' || right(p_order_id::text, 3) || chr(10) ||
    '  Date: ' || to_char(now(), 'Mon DD, YYYY') || chr(10) ||
    '  Type: Affiliated Network Fulfillment' || chr(10) ||
    '━━━━━━━━━━━━━━━━━━' || chr(10) ||
    'Seller Info' || chr(10) ||
    '  Seller: ' || coalesce(v_seller_profile.full_name, 'N/A') || chr(10) ||
    '  Zip: ' || coalesce(v_seller_profile.zip_code, 'N/A') || chr(10) ||
    CASE WHEN v_order.harvest_date IS NOT NULL
      THEN '  Harvest Date: ' || to_char(v_order.harvest_date, 'Mon DD, YYYY') || chr(10)
      ELSE '' END ||
    '━━━━━━━━━━━━━━━━━━' || chr(10) ||
    'Buyer Info' || chr(10) ||
    '  Buyer: ' || coalesce(v_buyer_profile.full_name, 'N/A') || chr(10) ||
    '  Zip: ' || coalesce(v_buyer_profile.zip_code, 'N/A') || chr(10) ||
    '━━━━━━━━━━━━━━━━━━' || chr(10) ||
    'Order Details' || chr(10) ||
    '  ' || v_order.product || ' | ' || v_order.quantity || ' ' || v_unit ||
    '  ' || v_total || ' pts' || chr(10) ||
    '  Subtotal: ' || v_total || ' pts' || chr(10) ||
    '  Sales Tax: ' || coalesce(v_order.tax_amount, 0) || ' pts' || chr(10) ||
    '  Total: ' || (v_total + coalesce(v_order.tax_amount, 0)) || ' pts' || chr(10) ||
    '━━━━━━━━━━━━━━━━━━' || chr(10) ||
    'Platform Fee (10%): -' || v_fee || ' pts' || chr(10) ||
    'You Received: ' || v_after_fee || ' pts' ||
    v_cottage_food_text;

  v_seller_receipt_meta := jsonb_build_object(
    'visible_to', v_order.seller_id,
    'receipt', true,
    'order_id', v_order.id,
    'product', v_order.product,
    'quantity', v_order.quantity,
    'unit', v_unit,
    'points_per_unit', v_order.points_per_unit,
    'subtotal', v_total,
    'tax', coalesce(v_order.tax_amount, 0),
    'platform_fee', v_fee,
    'seller_payout', v_after_fee,
    'seller_name', coalesce(v_seller_profile.full_name, 'N/A'),
    'seller_zip', coalesce(v_seller_profile.zip_code, ''),
    'buyer_name', coalesce(v_buyer_profile.full_name, 'N/A'),
    'buyer_zip', coalesce(v_buyer_profile.zip_code, ''),
    'harvest_date', v_order.harvest_date,
    'completed_at', now()
  );

  IF v_post.on_behalf_of IS NOT NULL AND v_post.on_behalf_of != v_post.author_id THEN
    -- ─── DELEGATED SALE: split between delegator + delegate ──────────
    v_delegate_pct := COALESCE(v_post.delegate_pct, 50);
    v_delegate_share := ROUND(v_after_fee * v_delegate_pct / 100.0);
    v_delegator_share := v_after_fee - v_delegate_share;

    IF v_delegate_share > 0 THEN
      INSERT INTO point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
      VALUES (v_post.author_id, 'delegation_split', v_delegate_share, 0, v_order.id,
        jsonb_build_object('order_id', v_order.id, 'role', 'delegate', 'delegate_pct', v_delegate_pct,
          'total_before_fee', v_total, 'platform_fee', v_fee, 'total_after_fee', v_after_fee,
          'product', v_order.product, 'delegator_id', v_post.on_behalf_of));
    END IF;

    IF v_delegator_share > 0 THEN
      INSERT INTO point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
      VALUES (v_post.on_behalf_of, 'delegation_split', v_delegator_share, 0, v_order.id,
        jsonb_build_object('order_id', v_order.id, 'role', 'delegator', 'delegate_pct', v_delegate_pct,
          'total_before_fee', v_total, 'platform_fee', v_fee, 'total_after_fee', v_after_fee,
          'product', v_order.product, 'delegate_id', v_post.author_id));
    END IF;

    INSERT INTO notifications (user_id, content, link_url)
    VALUES (v_post.on_behalf_of,
      '💰 Your delegate sold ' || v_order.quantity || ' ' || v_order.product ||
      ' — you earned ' || v_delegator_share || ' points (' || (100 - v_delegate_pct) || '% of ' || v_after_fee || ' after fees).', NULL);

    -- System message to buyer
    INSERT INTO chat_messages (conversation_id, sender_id, content, type, metadata)
    VALUES (v_order.conversation_id, NULL,
      '✅ Order complete! ' || v_total || ' held points have been released. Thank you for your purchase!',
      'system', jsonb_build_object('visible_to', v_order.buyer_id));

    -- Digital receipt for buyer (no platform fee)
    INSERT INTO chat_messages (conversation_id, sender_id, content, type, metadata)
    VALUES (v_order.conversation_id, NULL, v_buyer_receipt_text, 'system', v_buyer_receipt_meta);

    -- System message to seller
    INSERT INTO chat_messages (conversation_id, sender_id, content, type, metadata)
    VALUES (v_order.conversation_id, NULL,
      '💰 Payment received: ' || v_delegate_share || ' points credited (' || v_delegate_pct || '% of ' || v_after_fee || ' after ' || v_fee || ' platform fee).',
      'system', jsonb_build_object('visible_to', v_order.seller_id));

    -- Digital receipt for seller (with platform fee)
    INSERT INTO chat_messages (conversation_id, sender_id, content, type, metadata)
    VALUES (v_order.conversation_id, NULL, v_seller_receipt_text, 'system', v_seller_receipt_meta);

    RETURN jsonb_build_object('success', true, 'delegated', true,
      'delegatePct', v_delegate_pct, 'delegatorShare', v_delegator_share,
      'delegateShare', v_delegate_share, 'platformFee', v_fee);

  ELSE
    -- ─── NORMAL SALE ─────────────────
    INSERT INTO point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
    VALUES (v_order.seller_id, 'payment', v_after_fee, 0, v_order.id,
      jsonb_build_object('order_id', v_order.id, 'product', v_order.product,
        'total', v_total, 'platform_fee', v_fee, 'seller_payout', v_after_fee,
        'receipt', true,
        'buyer_name', coalesce(v_buyer_profile.full_name, 'N/A'),
        'seller_name', coalesce(v_seller_profile.full_name, 'N/A'),
        'quantity', v_order.quantity, 'unit', v_unit,
        'harvest_date', v_order.harvest_date, 'completed_at', now()));

    -- System message to buyer
    INSERT INTO chat_messages (conversation_id, sender_id, content, type, metadata)
    VALUES (v_order.conversation_id, NULL,
      '✅ Order complete! ' || v_total || ' held points have been released. Thank you for your purchase!',
      'system', jsonb_build_object('visible_to', v_order.buyer_id));

    -- Digital receipt for buyer (no platform fee)
    INSERT INTO chat_messages (conversation_id, sender_id, content, type, metadata)
    VALUES (v_order.conversation_id, NULL, v_buyer_receipt_text, 'system', v_buyer_receipt_meta);

    -- System message to seller
    INSERT INTO chat_messages (conversation_id, sender_id, content, type, metadata)
    VALUES (v_order.conversation_id, NULL,
      '💰 Payment received: ' || v_after_fee || ' points credited (after ' || v_fee || ' platform fee).',
      'system', jsonb_build_object('visible_to', v_order.seller_id));

    -- Digital receipt for seller (with platform fee)
    INSERT INTO chat_messages (conversation_id, sender_id, content, type, metadata)
    VALUES (v_order.conversation_id, NULL, v_seller_receipt_text, 'system', v_seller_receipt_meta);

    RETURN jsonb_build_object('success', true, 'delegated', false,
      'sellerPayout', v_after_fee, 'platformFee', v_fee);
  END IF;
END;
$$;
