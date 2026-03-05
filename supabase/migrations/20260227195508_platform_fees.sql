-- Migration: platform_fees table for dynamic location-based fees

-- 1. Create the platform_fees table
CREATE TABLE IF NOT EXISTS public.platform_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creation_date timestamptz NOT NULL DEFAULT now(),
  country_code varchar(3) NOT NULL,
  fees float NOT NULL
);

-- Enable RLS
ALTER TABLE public.platform_fees ENABLE ROW LEVEL SECURITY;

-- Everyone can read platform fees
CREATE POLICY "Enable read access for all users" 
ON public.platform_fees FOR SELECT 
TO public 
USING (true);

-- Only admins can insert/update platform fees
CREATE POLICY "Enable insert for authenticated users only" 
ON public.platform_fees FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- 2. Create a helper function to safely get the current platform fee for a user
CREATE OR REPLACE FUNCTION public.get_platform_fee_for_user(p_user_id uuid)
RETURNS numeric AS $$
DECLARE
  v_country_code varchar(3);
  v_fee_rate numeric;
BEGIN
  -- Get user's country code (default to 'USA' if null to gracefully fallback)
  SELECT COALESCE(country_code, 'USA') INTO v_country_code
  FROM profiles
  WHERE id = p_user_id;
  
  -- Attempt to lookup the latest fee for this country
  SELECT fees INTO v_fee_rate
  FROM platform_fees
  WHERE country_code = v_country_code
  ORDER BY creation_date DESC
  LIMIT 1;
  
  -- Fallback to global 10% defaults if strictly no country match
  IF v_fee_rate IS NULL THEN
    v_fee_rate := 0.10;
  END IF;
  
  RETURN v_fee_rate;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Seed data
INSERT INTO public.platform_fees (country_code, fees) VALUES ('USA', 0.10);

-- ============================================================================
-- 4. Update core order transaction functions to use dynamic fee
--    Logic continues to use FLOOR(total * v_fee_rate)
-- ============================================================================

-- A. update confirm_order_delivery (with delegation splits)
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
  v_total          INTEGER;
  v_fee            INTEGER;
  v_after_fee      INTEGER;
  v_delegator_share INTEGER;
  v_delegate_share  INTEGER;
  v_delegate_pct   INTEGER;
  v_fee_rate       NUMERIC; -- fetched dynamically
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

  -- Format fee dynamically based on seller's country
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

  -- Look up if this is a delegated sale via on_behalf_of and fetch snapshotted pct
  SELECT p.on_behalf_of, p.author_id, wsd.delegate_pct
  INTO v_post
  FROM conversations c
  JOIN posts p ON p.id = c.post_id
  LEFT JOIN want_to_sell_details wsd ON wsd.post_id = p.id
  WHERE c.id = v_order.conversation_id;

  IF v_post.on_behalf_of IS NOT NULL AND v_post.on_behalf_of != v_post.author_id THEN
    -- ─── DELEGATED SALE: split between delegator + delegate ──────────
    v_delegate_pct := COALESCE(v_post.delegate_pct, 50);

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

    -- System message to buyer
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

    RETURN jsonb_build_object(
      'success', true,
      'delegated', false,
      'sellerPayout', v_after_fee,
      'platformFee', v_fee
    );
  END IF;
END;
$$;


-- B. update accept_refund_offer_with_message (which also deducts platform fee on the un-refunded rest)
create or replace function public.accept_refund_offer_with_message(
  p_order_id  uuid,
  p_buyer_id  uuid,
  p_offer_id  uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_offer record;
  v_esc_id uuid;
  v_total integer;
  v_refund_amount integer;
  v_seller_amount integer;
  v_fee integer;
  v_seller_payout integer;
  v_fee_rate numeric;
begin
  select * into v_order
  from orders
  where id = p_order_id
  for update;

  if v_order is null then
    return jsonb_build_object('error', 'Order not found');
  end if;

  if v_order.buyer_id != p_buyer_id then
    return jsonb_build_object('error', 'Only the buyer can accept a refund offer');
  end if;

  if v_order.status not in ('disputed', 'escalated') then
    return jsonb_build_object(
      'error', 'Order must be in disputed or escalated status',
      'currentStatus', v_order.status
    );
  end if;

  -- Get the offer
  select * into v_offer
  from refund_offers
  where id = p_offer_id
  for update;

  if v_offer is null then
    return jsonb_build_object('error', 'Refund offer not found');
  end if;

  if v_offer.status != 'pending' then
    return jsonb_build_object('error', 'Offer is no longer pending');
  end if;

  -- Dynamic fee fetch based on seller
  v_fee_rate := public.get_platform_fee_for_user(v_order.seller_id);

  -- Calculate amounts
  v_total := v_order.quantity * v_order.points_per_unit;
  v_refund_amount := v_offer.amount::integer;
  v_seller_amount := v_total - v_refund_amount;
  v_fee := floor(v_seller_amount * v_fee_rate);
  v_seller_payout := v_seller_amount - v_fee;

  -- Accept the offer
  update refund_offers
  set status = 'accepted'
  where id = p_offer_id;

  -- Resolve the escalation
  v_esc_id := v_offer.escalation_id;

  update escalations
  set status = 'resolved',
      resolution_type = 'refund_accepted',
      accepted_refund_offer_id = p_offer_id,
      resolved_at = now(),
      updated_at = now()
  where id = v_esc_id;

  -- Refund buyer
  insert into point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
  values (
    v_order.buyer_id,
    'refund',
    v_refund_amount,
    0,
    v_order.id,
    jsonb_build_object('order_id', v_order.id, 'reason', 'Refund offer accepted', 'offer_id', p_offer_id)
  );

  -- Credit seller (remaining after refund, minus fee)
  if v_seller_payout > 0 then
    insert into point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
    values (
      v_order.seller_id,
      'payment',
      v_seller_payout,
      0,
      v_order.id,
      jsonb_build_object(
        'order_id', v_order.id,
        'total', v_total,
        'refund', v_refund_amount,
        'platform_fee', v_fee,
        'seller_payout', v_seller_payout
      )
    );
  end if;

  -- Platform fee ledger entry
  if v_fee > 0 then
    insert into point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
    values (
      v_order.seller_id,
      'platform_fee',
      -v_fee,
      0,
      v_order.id,
      jsonb_build_object('order_id', v_order.id, 'fee_rate', v_fee_rate)
    );
  end if;

  -- Complete the order
  update orders
  set status = 'completed', updated_at = now()
  where id = p_order_id;

  -- System message to buyer (visible only to buyer)
  insert into chat_messages (conversation_id, sender_id, content, type, metadata)
  values (
    v_order.conversation_id,
    null,
    '✅ Dispute resolved! ' || v_refund_amount || ' points refunded to your account. Remaining ' || v_seller_amount || ' points released to seller.',
    'system',
    jsonb_build_object('visible_to', v_order.buyer_id)
  );

  -- System message to seller (visible only to seller)
  insert into chat_messages (conversation_id, sender_id, content, type, metadata)
  values (
    v_order.conversation_id,
    null,
    '💰 Dispute resolved: ' || v_seller_payout || ' points credited to your account (' || v_total || ' total - ' || v_refund_amount || ' refund - ' || v_fee || ' platform fee).',
    'system',
    jsonb_build_object('visible_to', v_order.seller_id)
  );

  return jsonb_build_object('success', true);
end;
$$;


-- C. update resolve_dispute_with_message (which resolves WITHOUT a refund, full payout minus fee)
create or replace function public.resolve_dispute_with_message(
  p_order_id uuid,
  p_user_id  uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_esc_id uuid;
  v_role text;
  v_total integer;
  v_fee integer;
  v_seller_payout integer;
  v_fee_rate numeric;
begin
  select * into v_order
  from orders
  where id = p_order_id
  for update;

  if v_order is null then
    return jsonb_build_object('error', 'Order not found');
  end if;

  if v_order.buyer_id != p_user_id and v_order.seller_id != p_user_id then
    return jsonb_build_object('error', 'Only buyer or seller can resolve');
  end if;

  if v_order.status not in ('disputed', 'escalated') then
    return jsonb_build_object(
      'error', 'Order must be in disputed or escalated status',
      'currentStatus', v_order.status
    );
  end if;

  -- Determine role for message
  if v_order.buyer_id = p_user_id then
    v_role := 'Buyer';
  else
    v_role := 'Seller';
  end if;

  -- Dynamic fee fetch based on seller
  v_fee_rate := public.get_platform_fee_for_user(v_order.seller_id);

  -- Calculate amounts
  v_total := v_order.quantity * v_order.points_per_unit;
  v_fee := floor(v_total * v_fee_rate);
  v_seller_payout := v_total - v_fee;

  -- Resolve the escalation
  select id into v_esc_id
  from escalations
  where order_id = p_order_id
  order by created_at desc
  limit 1;

  if v_esc_id is not null then
    update escalations
    set status = 'resolved',
        resolution_type = 'resolved_without_refund',
        resolved_at = now(),
        updated_at = now()
    where id = v_esc_id;
  end if;

  -- Credit seller (full escrow minus fee)
  insert into point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
  values (
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

  -- Platform fee
  insert into point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
  values (
    v_order.seller_id,
    'platform_fee',
    -v_fee,
    0,
    v_order.id,
    jsonb_build_object('order_id', v_order.id, 'fee_rate', v_fee_rate)
  );

  -- Complete the order
  update orders
  set status = 'completed', updated_at = now()
  where id = p_order_id;

  -- System message to buyer (visible only to buyer)
  insert into chat_messages (conversation_id, sender_id, content, type, metadata)
  values (
    v_order.conversation_id,
    null,
    '✅ ' || v_role || ' resolved the dispute. ' || v_total || ' held points have been released to the seller. Order complete.',
    'system',
    jsonb_build_object('visible_to', v_order.buyer_id)
  );

  -- System message to seller (visible only to seller)
  insert into chat_messages (conversation_id, sender_id, content, type, metadata)
  values (
    v_order.conversation_id,
    null,
    '💰 Payment received: ' || v_seller_payout || ' points credited to your account (' || v_total || ' total - ' || v_fee || ' platform fee).',
    'system',
    jsonb_build_object('visible_to', v_order.seller_id)
  );

  return jsonb_build_object('success', true);
end;
$$;
