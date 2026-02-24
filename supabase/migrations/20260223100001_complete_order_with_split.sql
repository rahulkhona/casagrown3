-- Migration: Replace confirm_order_delivery with delegation-split-aware version
-- For delegated sales (on_behalf_of), splits proceeds between delegator and delegate.
-- Platform fee (10%) applied first, then remainder split per delegate_pct.
-- Creates delegation_split ledger entries + notification to delegator.
-- No chat messages about the split — those go in ledger/notifications only.

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
  v_delegation     RECORD;
  v_total          INTEGER;
  v_fee            INTEGER;
  v_after_fee      INTEGER;
  v_delegator_share INTEGER;
  v_delegate_share  INTEGER;
  v_delegate_pct   INTEGER;
  v_fee_rate       NUMERIC := 0.10; -- 10% platform fee
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

  -- Look up if this is a delegated sale via on_behalf_of
  SELECT p.on_behalf_of, p.author_id
  INTO v_post
  FROM conversations c
  JOIN posts p ON p.id = c.post_id
  WHERE c.id = v_order.conversation_id;

  IF v_post.on_behalf_of IS NOT NULL AND v_post.on_behalf_of != v_post.author_id THEN
    -- ─── DELEGATED SALE: split between delegator + delegate ──────────
    -- delegator = on_behalf_of (produce owner)
    -- delegate  = post author (seller who listed)

    -- Find active delegation with split
    SELECT * INTO v_delegation
    FROM delegations
    WHERE delegator_id = v_post.on_behalf_of
      AND delegatee_id = v_post.author_id
      AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 1;

    v_delegate_pct := COALESCE(v_delegation.delegate_pct, 50);

    -- Split the after-fee amount
    v_delegate_share := ROUND(v_after_fee * v_delegate_pct / 100.0);
    v_delegator_share := v_after_fee - v_delegate_share;

    -- Credit delegate (the one who sold)
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

    -- Credit delegator (produce owner)
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

    -- Notification to delegator about the completed sale
    INSERT INTO notifications (user_id, content, link_url)
    VALUES (
      v_post.on_behalf_of,
      '💰 Your delegate sold ' || v_order.quantity || ' ' || v_order.product ||
      ' — you earned ' || v_delegator_share || ' points (' || (100 - v_delegate_pct) || '% of ' || v_after_fee || ' after fees).',
      NULL
    );

    -- System message to buyer (same as non-delegated)
    INSERT INTO chat_messages (conversation_id, sender_id, content, type, metadata)
    VALUES (
      v_order.conversation_id,
      NULL,
      '✅ Order complete! ' || v_total || ' escrowed points have been released. Thank you for your purchase!',
      'system',
      jsonb_build_object('visible_to', v_order.buyer_id)
    );

    -- System message to delegate/seller about their share
    INSERT INTO chat_messages (conversation_id, sender_id, content, type, metadata)
    VALUES (
      v_order.conversation_id,
      NULL,
      '💰 Payment received: ' || v_delegate_share || ' points credited (' || v_delegate_pct || '% of ' || v_after_fee || ' after ' || v_fee || ' platform fee).',
      'system',
      jsonb_build_object('visible_to', v_order.seller_id)
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
    -- ─── NORMAL SALE: full after-fee amount to seller ─────────────────

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

    -- System message to buyer
    INSERT INTO chat_messages (conversation_id, sender_id, content, type, metadata)
    VALUES (
      v_order.conversation_id,
      NULL,
      '✅ Order complete! ' || v_total || ' escrowed points have been released to the seller. Thank you for your purchase!',
      'system',
      jsonb_build_object('visible_to', v_order.buyer_id)
    );

    -- System message to seller
    INSERT INTO chat_messages (conversation_id, sender_id, content, type, metadata)
    VALUES (
      v_order.conversation_id,
      NULL,
      '💰 Payment received: ' || v_after_fee || ' points credited to your account (' || v_total || ' total - ' || v_fee || ' platform fee).',
      'system',
      jsonb_build_object('visible_to', v_order.seller_id)
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
