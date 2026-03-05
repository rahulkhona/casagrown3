-- ============================================================================
-- 10. Update RPCs: replace "escrowed" language in chat messages
-- ============================================================================

-- A. confirm_order_delivery — update both chat messages
-- Drop old 2-param version to prevent PostgREST overload ambiguity (PGRST203)
DROP FUNCTION IF EXISTS public.confirm_order_delivery(uuid, uuid);
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
          'delegator_id', v_post.on_behalf_of
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
          'delegate_id', v_post.author_id
        )
      );
    END IF;

    INSERT INTO notifications (user_id, content, link_url)
    VALUES (
      v_post.on_behalf_of,
      '💰 Your delegate sold ' || v_order.quantity || ' ' || v_order.product ||
      ' — you earned ' || v_delegator_share || ' points (' || (100 - v_delegate_pct) || '% of ' || v_after_fee || ' after fees).',
      NULL
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

    RETURN jsonb_build_object(
      'success', true,
      'delegated', false,
      'sellerPayout', v_after_fee,
      'platformFee', v_fee
    );
  END IF;
END;
$$;


-- B. resolve_dispute_with_message — update chat messages
CREATE OR REPLACE FUNCTION public.resolve_dispute_with_message(
  p_order_id uuid,
  p_user_id  uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
  v_esc_id uuid;
  v_role text;
  v_total integer;
  v_fee integer;
  v_seller_payout integer;
  v_fee_rate numeric;
BEGIN
  SELECT * INTO v_order
  FROM orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('error', 'Order not found');
  END IF;

  IF v_order.buyer_id != p_user_id AND v_order.seller_id != p_user_id THEN
    RETURN jsonb_build_object('error', 'Only buyer or seller can resolve');
  END IF;

  IF v_order.status NOT IN ('disputed', 'escalated') THEN
    RETURN jsonb_build_object(
      'error', 'Order must be in disputed or escalated status',
      'currentStatus', v_order.status
    );
  END IF;

  IF v_order.buyer_id = p_user_id THEN
    v_role := 'Buyer';
  ELSE
    v_role := 'Seller';
  END IF;

  v_fee_rate := public.get_platform_fee_for_user(v_order.seller_id);

  v_total := v_order.quantity * v_order.points_per_unit;
  v_fee := floor(v_total * v_fee_rate);
  v_seller_payout := v_total - v_fee;

  SELECT id INTO v_esc_id
  FROM escalations
  WHERE order_id = p_order_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_esc_id IS NOT NULL THEN
    UPDATE escalations
    SET status = 'resolved',
        resolution_type = 'resolved_without_refund',
        resolved_at = now(),
        updated_at = now()
    WHERE id = v_esc_id;
  END IF;

  INSERT INTO point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
  VALUES (
    v_order.seller_id,
    'payment',
    v_seller_payout,
    0,
    v_order.id,
    jsonb_build_object(
      'order_id', v_order.id,
      'total', v_total,
      'platform_fee', v_fee,
      'seller_payout', v_seller_payout
    )
  );

  INSERT INTO point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
  VALUES (
    v_order.seller_id,
    'platform_fee',
    -v_fee,
    0,
    v_order.id,
    jsonb_build_object('order_id', v_order.id, 'fee_rate', v_fee_rate)
  );

  UPDATE orders
  SET status = 'completed', updated_at = now()
  WHERE id = p_order_id;

  -- System message to buyer (no escrow language)
  INSERT INTO chat_messages (conversation_id, sender_id, content, type, metadata)
  VALUES (
    v_order.conversation_id,
    NULL,
    '✅ ' || v_role || ' resolved the dispute. ' || v_total || ' held points have been released to the seller. Order complete.',
    'system',
    jsonb_build_object('visible_to', v_order.buyer_id)
  );

  INSERT INTO chat_messages (conversation_id, sender_id, content, type, metadata)
  VALUES (
    v_order.conversation_id,
    NULL,
    '💰 Payment received: ' || v_seller_payout || ' points credited to your account (' || v_total || ' total - ' || v_fee || ' platform fee).',
    'system',
    jsonb_build_object('visible_to', v_order.seller_id)
  );

  RETURN jsonb_build_object('success', true);
END;
$$;


-- ============================================================================
-- 11. Update RPCs that use 'escrow' → 'hold' / 'escrow_refund' → 'hold_refund'
-- ============================================================================

-- C. create_order_atomic — use 'hold' instead of 'escrow'
CREATE OR REPLACE FUNCTION create_order_atomic(
  p_buyer_id uuid, p_seller_id uuid, p_post_id uuid,
  p_quantity integer, p_points_per_unit integer, p_total_price integer,
  p_category text, p_product text,
  p_delivery_date date DEFAULT NULL, p_delivery_instructions text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare
  v_conversation_id uuid; v_offer_id uuid; v_order_id uuid;
  v_current_balance integer; v_unit text;
begin
  select coalesce(sum(amount), 0) into v_current_balance from point_ledger where user_id = p_buyer_id;
  if v_current_balance < p_total_price then
    return jsonb_build_object('error', 'Insufficient points', 'currentBalance', v_current_balance, 'required', p_total_price);
  end if;
  select coalesce(wsd.unit::text, 'piece') into v_unit from want_to_sell_details wsd where wsd.post_id = p_post_id limit 1;
  v_unit := coalesce(v_unit, 'piece');
  select id into v_conversation_id from conversations where post_id = p_post_id and buyer_id = p_buyer_id and seller_id = p_seller_id;
  if v_conversation_id is null then
    insert into conversations (post_id, buyer_id, seller_id) values (p_post_id, p_buyer_id, p_seller_id) returning id into v_conversation_id;
  end if;
  insert into offers (conversation_id, created_by, quantity, points_per_unit, status) values (v_conversation_id, p_buyer_id, p_quantity, p_points_per_unit, 'pending') returning id into v_offer_id;
  insert into orders (offer_id, buyer_id, seller_id, category, product, quantity, points_per_unit, delivery_date, delivery_instructions, conversation_id, status)
  values (v_offer_id, p_buyer_id, p_seller_id, p_category, p_product, p_quantity, p_points_per_unit, p_delivery_date, p_delivery_instructions, v_conversation_id, 'pending')
  returning id into v_order_id;
  insert into point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
  values (p_buyer_id, 'hold', -p_total_price, 0, v_order_id,
    jsonb_build_object('order_id', v_order_id, 'post_id', p_post_id, 'seller_id', p_seller_id, 'product', p_product, 'quantity', p_quantity, 'points_per_unit', p_points_per_unit));
  insert into chat_messages (conversation_id, sender_id, content, type)
  values (v_conversation_id, p_buyer_id,
    'Order placed: ' || p_quantity || ' ' ||
    CASE WHEN v_unit = 'piece' THEN '' WHEN v_unit = 'box' AND p_quantity > 1 THEN 'boxes ' WHEN v_unit = 'bag' AND p_quantity > 1 THEN 'bags ' ELSE v_unit || ' ' END ||
    p_product || ' for ' || p_total_price || ' points. Delivery by ' || coalesce(p_delivery_date::text, 'TBD') || '.'
    || case when p_delivery_instructions is not null then E'\nDelivery info: ' || p_delivery_instructions else '' end, 'text');
  return jsonb_build_object('orderId', v_order_id, 'conversationId', v_conversation_id, 'newBalance', v_current_balance - p_total_price);
end;
$$;


-- D. accept_offer_atomic — use 'hold' instead of 'escrow', remove "escrow" from chat
CREATE OR REPLACE FUNCTION accept_offer_atomic(
  p_offer_id uuid, p_buyer_id uuid, p_delivery_address text,
  p_delivery_instructions text default null, p_quantity numeric default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_offer record; v_order_id uuid; v_total_price integer;
  v_current_balance integer; v_conv record; v_final_instructions text; v_quantity numeric;
begin
  select * into v_offer from offers where id = p_offer_id for update;
  if v_offer is null then return jsonb_build_object('error', 'Offer not found'); end if;
  if v_offer.status != 'pending' then return jsonb_build_object('error', 'Offer is not pending'); end if;
  select * into v_conv from conversations where id = v_offer.conversation_id;
  if v_conv.buyer_id != p_buyer_id then return jsonb_build_object('error', 'Only the buyer can accept an offer'); end if;
  if p_delivery_address is null or trim(p_delivery_address) = '' then return jsonb_build_object('error', 'Delivery address is required'); end if;
  v_quantity := coalesce(p_quantity, v_offer.quantity);
  if v_quantity > v_offer.quantity then return jsonb_build_object('error', 'Requested quantity exceeds offer'); end if;
  if v_quantity <= 0 then return jsonb_build_object('error', 'Quantity must be positive'); end if;
  v_total_price := v_quantity * v_offer.points_per_unit;
  select coalesce(sum(amount), 0) into v_current_balance from point_ledger where user_id = p_buyer_id;
  if v_current_balance < v_total_price then
    return jsonb_build_object('error', 'Insufficient points', 'currentBalance', v_current_balance, 'required', v_total_price);
  end if;
  update offers set status = 'accepted', updated_at = now() where id = p_offer_id;
  if p_delivery_instructions is not null and trim(p_delivery_instructions) != '' then
    v_final_instructions := p_delivery_address || E'\n' || p_delivery_instructions;
  else v_final_instructions := p_delivery_address; end if;
  insert into orders (offer_id, buyer_id, seller_id, category, product, quantity, points_per_unit, delivery_date, delivery_instructions, conversation_id, status)
  values (v_offer.id, v_conv.buyer_id, v_conv.seller_id, v_offer.category, v_offer.product, v_quantity, v_offer.points_per_unit, v_offer.delivery_date, v_final_instructions, v_offer.conversation_id, 'pending')
  returning id into v_order_id;
  insert into point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
  values (p_buyer_id, 'hold', -v_total_price, 0, v_order_id,
    jsonb_build_object('order_id', v_order_id, 'offer_id', v_offer.id, 'post_id', v_conv.post_id, 'seller_id', v_conv.seller_id, 'product', v_offer.product, 'quantity', v_quantity, 'points_per_unit', v_offer.points_per_unit));
  insert into chat_messages (conversation_id, sender_id, content, type)
  values (v_offer.conversation_id, p_buyer_id,
    '✅ Offer accepted! Order placed: ' || v_quantity || ' ' || coalesce(v_offer.unit, '') || ' ' || v_offer.product || ' for ' || v_total_price || ' points. Points held for this order.', 'text');
  return jsonb_build_object('orderId', v_order_id, 'conversationId', v_offer.conversation_id, 'newBalance', v_current_balance - v_total_price);
end;
$$;


-- E. ban_category — use 'hold'/'hold_refund' instead of 'escrow'/'escrow_refund'
CREATE OR REPLACE FUNCTION ban_category(p_category_name TEXT)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_post RECORD; v_order RECORD;
  v_archived_posts INTEGER := 0; v_cancelled_orders INTEGER := 0;
  v_refunded_points INTEGER := 0; v_hold_amount INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sales_categories WHERE name = p_category_name) THEN
    RETURN jsonb_build_object('error', 'Category not found: ' || p_category_name);
  END IF;
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
  FOR v_order IN
    SELECT o.id, o.buyer_id, o.seller_id, o.product, o.conversation_id FROM orders o
    WHERE o.category = p_category_name AND o.status IN ('pending', 'accepted') FOR UPDATE
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


-- F. add_category_restriction — use 'hold'/'hold_refund'
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


-- G. ban_product — use 'hold'/'hold_refund'
CREATE OR REPLACE FUNCTION ban_product(
  p_product_name TEXT, p_community_h3 TEXT DEFAULT NULL, p_reason TEXT DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_post RECORD; v_order RECORD;
  v_archived_posts INTEGER := 0; v_cancelled_orders INTEGER := 0;
  v_refunded_points INTEGER := 0; v_hold_amount INTEGER;
BEGIN
  IF p_community_h3 IS NULL THEN
    DELETE FROM blocked_products WHERE LOWER(product_name) = LOWER(p_product_name) AND community_h3_index IS NOT NULL;
  END IF;
  INSERT INTO blocked_products (product_name, community_h3_index, reason)
  VALUES (p_product_name, p_community_h3, p_reason) ON CONFLICT (product_name, community_h3_index) DO NOTHING;
  FOR v_post IN
    SELECT p.id, p.author_id, wsd.produce_name FROM posts p
    JOIN want_to_sell_details wsd ON wsd.post_id = p.id
    WHERE LOWER(wsd.produce_name) = LOWER(p_product_name) AND p.is_archived = false
      AND (p_community_h3 IS NULL OR p.community_h3_index = p_community_h3)
  LOOP
    UPDATE posts SET is_archived = true, updated_at = now() WHERE id = v_post.id;
    v_archived_posts := v_archived_posts + 1;
    INSERT INTO notifications (user_id, content, created_at) VALUES (v_post.author_id,
      'Your listing "' || v_post.produce_name || '" has been archived. This product is now restricted.', now());
  END LOOP;
  FOR v_post IN
    SELECT p.id, p.author_id FROM posts p
    JOIN want_to_buy_details wbd ON wbd.post_id = p.id
    WHERE EXISTS (SELECT 1 FROM unnest(wbd.produce_names) AS pn WHERE LOWER(pn) = LOWER(p_product_name))
      AND p.is_archived = false AND (p_community_h3 IS NULL OR p.community_h3_index = p_community_h3)
  LOOP
    UPDATE posts SET is_archived = true, updated_at = now() WHERE id = v_post.id;
    v_archived_posts := v_archived_posts + 1;
    INSERT INTO notifications (user_id, content, created_at) VALUES (v_post.author_id,
      'Your wanted post has been archived. The product "' || p_product_name || '" is now restricted.', now());
  END LOOP;
  FOR v_order IN
    SELECT o.id, o.buyer_id, o.seller_id, o.product, o.conversation_id FROM orders o
    JOIN conversations c ON c.id = o.conversation_id JOIN posts p ON p.id = c.post_id
    WHERE LOWER(o.product) = LOWER(p_product_name) AND o.status IN ('pending', 'accepted')
      AND (p_community_h3 IS NULL OR p.community_h3_index = p_community_h3) FOR UPDATE OF o
  LOOP
    UPDATE orders SET status = 'cancelled', updated_at = now() WHERE id = v_order.id;
    v_cancelled_orders := v_cancelled_orders + 1;
    SELECT coalesce(sum(amount), 0) INTO v_hold_amount FROM point_ledger WHERE reference_id = v_order.id AND type = 'hold';
    IF v_hold_amount < 0 THEN
      INSERT INTO point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
      VALUES (v_order.buyer_id, 'hold_refund', -v_hold_amount, 0, v_order.id,
        jsonb_build_object('reason', 'Product "' || p_product_name || '" restricted', 'order_id', v_order.id));
      v_refunded_points := v_refunded_points + (-v_hold_amount);
    END IF;
    INSERT INTO chat_messages (conversation_id, sender_id, content, type)
    VALUES (v_order.conversation_id, NULL,
      '⚠️ This order has been cancelled because "' || p_product_name || '" is now restricted. Held points have been refunded.', 'system');
    INSERT INTO notifications (user_id, content, created_at) VALUES
      (v_order.buyer_id, 'Your order for "' || v_order.product || '" was cancelled (product restricted). Points refunded.', now()),
      (v_order.seller_id, 'An order for "' || v_order.product || '" was cancelled (product restricted).', now());
  END LOOP;
  RETURN jsonb_build_object('success', true, 'archivedPosts', v_archived_posts, 'cancelledOrders', v_cancelled_orders, 'refundedPoints', v_refunded_points);
END;
$$;

