-- ============================================================================
-- Role-specific system messages: add visible_to metadata
--
-- Previously, confirm_order_delivery, accept_refund_offer_with_message, and
-- resolve_dispute_with_message each inserted TWO system messages into the
-- same conversation — one for the buyer and one for the seller — but both
-- users could see both messages.
--
-- This migration adds a `visible_to` key inside the `metadata` JSONB column
-- so the client can filter: only show a message if visible_to matches the
-- current user (or is absent, meaning visible to everyone).
-- ============================================================================


-- 1. confirm_order_delivery — role-specific messages
create or replace function public.confirm_order_delivery(
  p_order_id  uuid,
  p_buyer_id  uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_total integer;
  v_fee integer;
  v_seller_payout integer;
  v_fee_rate numeric := 0.10; -- 10% platform fee
begin
  select * into v_order
  from orders
  where id = p_order_id
  for update;

  if v_order is null then
    return jsonb_build_object('error', 'Order not found');
  end if;

  if v_order.buyer_id != p_buyer_id then
    return jsonb_build_object('error', 'Only the buyer can confirm delivery');
  end if;

  if v_order.status != 'delivered' then
    return jsonb_build_object(
      'error', 'Order must be in delivered status to confirm',
      'currentStatus', v_order.status
    );
  end if;

  -- Calculate amounts
  v_total := v_order.quantity * v_order.points_per_unit;
  v_fee := floor(v_total * v_fee_rate);
  v_seller_payout := v_total - v_fee;

  -- Update order status
  update orders
  set status = 'completed', updated_at = now()
  where id = p_order_id;

  -- Credit seller (escrow release minus fee)
  insert into point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
  values (
    v_order.seller_id,
    'payment',
    v_seller_payout,
    0,
    v_order.id,
    jsonb_build_object(
      'order_id', v_order.id,
      'product', v_order.product,
      'total', v_total,
      'platform_fee', v_fee,
      'seller_payout', v_seller_payout
    )
  );

  -- Platform fee ledger entry
  insert into point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
  values (
    v_order.seller_id,
    'platform_fee',
    -v_fee,
    0,
    v_order.id,
    jsonb_build_object('order_id', v_order.id, 'fee_rate', v_fee_rate)
  );

  -- System message to buyer (visible only to buyer)
  insert into chat_messages (conversation_id, sender_id, content, type, metadata)
  values (
    v_order.conversation_id,
    null,
    '✅ Order complete! ' || v_total || ' escrowed points have been released to the seller. Thank you for your purchase!',
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


-- 2. accept_refund_offer_with_message — role-specific messages
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
  v_fee_rate numeric := 0.10;
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


-- 3. resolve_dispute_with_message — role-specific messages
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
  v_fee_rate numeric := 0.10;
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
    '✅ ' || v_role || ' resolved the dispute. ' || v_total || ' escrowed points have been released to the seller. Order complete.',
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
