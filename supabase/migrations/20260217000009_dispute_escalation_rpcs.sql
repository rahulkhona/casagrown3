-- ============================================================================
-- Dispute & Escalation RPCs — atomic state changes + chat messages
-- ============================================================================

-- 1. dispute_order_with_message — buyer disputes delivery
create or replace function public.dispute_order_with_message(
  p_order_id  uuid,
  p_buyer_id  uuid,
  p_reason    text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_esc_id uuid;
begin
  select * into v_order
  from orders
  where id = p_order_id
  for update;

  if v_order is null then
    return jsonb_build_object('error', 'Order not found');
  end if;

  if v_order.buyer_id != p_buyer_id then
    return jsonb_build_object('error', 'Only the buyer can dispute');
  end if;

  if v_order.status != 'delivered' then
    return jsonb_build_object(
      'error', 'Can only dispute a delivered order',
      'currentStatus', v_order.status
    );
  end if;

  -- Update order status
  update orders
  set status = 'disputed', updated_at = now()
  where id = p_order_id;

  -- Create escalation record
  insert into escalations (order_id, initiator_id, reason)
  values (p_order_id, p_buyer_id, p_reason)
  returning id into v_esc_id;

  -- Chat message from buyer
  insert into chat_messages (conversation_id, sender_id, content, type)
  values (
    v_order.conversation_id,
    p_buyer_id,
    'Delivery disputed: ' || p_reason || '. Seller can make a refund offer or either party can escalate to support.',
    'text'
  );

  return jsonb_build_object('success', true, 'escalation_id', v_esc_id);
end;
$$;

-- 2. escalate_order_with_message — either party escalates to support
create or replace function public.escalate_order_with_message(
  p_order_id uuid,
  p_user_id  uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
begin
  select * into v_order
  from orders
  where id = p_order_id
  for update;

  if v_order is null then
    return jsonb_build_object('error', 'Order not found');
  end if;

  if v_order.buyer_id != p_user_id and v_order.seller_id != p_user_id then
    return jsonb_build_object('error', 'Only buyer or seller can escalate');
  end if;

  if v_order.status not in ('disputed', 'escalated') then
    return jsonb_build_object(
      'error', 'Can only escalate a disputed order',
      'currentStatus', v_order.status
    );
  end if;

  -- Update order status
  update orders
  set status = 'escalated', updated_at = now()
  where id = p_order_id;

  -- Chat message (system-like, attributed to the escalating user)
  insert into chat_messages (conversation_id, sender_id, content, type)
  values (
    v_order.conversation_id,
    p_user_id,
    'This dispute has been escalated to CasaGrown support for review. Both parties will be contacted.',
    'text'
  );

  return jsonb_build_object('success', true);
end;
$$;

-- 3. make_refund_offer_with_message — seller makes a refund offer
create or replace function public.make_refund_offer_with_message(
  p_order_id   uuid,
  p_seller_id  uuid,
  p_amount     integer,
  p_message    text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_esc_id uuid;
  v_offer_id uuid;
  v_total integer;
  v_msg text;
begin
  select * into v_order
  from orders
  where id = p_order_id
  for update;

  if v_order is null then
    return jsonb_build_object('error', 'Order not found');
  end if;

  if v_order.seller_id != p_seller_id then
    return jsonb_build_object('error', 'Only the seller can make a refund offer');
  end if;

  if v_order.status not in ('disputed', 'escalated') then
    return jsonb_build_object(
      'error', 'Order must be in disputed or escalated status',
      'currentStatus', v_order.status
    );
  end if;

  v_total := v_order.quantity * v_order.points_per_unit;

  -- Find the escalation
  select id into v_esc_id
  from escalations
  where order_id = p_order_id
  order by created_at desc
  limit 1;

  if v_esc_id is null then
    return jsonb_build_object('error', 'No escalation found for this order');
  end if;

  -- Reject any previous pending offers
  update refund_offers
  set status = 'rejected'
  where escalation_id = v_esc_id and status = 'pending';

  -- Create the refund offer
  insert into refund_offers (escalation_id, amount, message)
  values (v_esc_id, p_amount, p_message)
  returning id into v_offer_id;

  -- Build chat message
  v_msg := 'Refund offer: ' || p_amount || ' of ' || v_total || ' points (' || round((p_amount::numeric / v_total) * 100) || '% discount).';
  if p_message is not null and p_message != '' then
    v_msg := v_msg || ' "' || p_message || '"';
  end if;

  insert into chat_messages (conversation_id, sender_id, content, type)
  values (
    v_order.conversation_id,
    p_seller_id,
    v_msg,
    'text'
  );

  return jsonb_build_object('success', true, 'offer_id', v_offer_id);
end;
$$;

-- 4. accept_refund_offer_with_message — buyer accepts offer, refund processed
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

  -- Process refund: credit buyer, debit seller
  insert into point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
  values (
    v_order.buyer_id,
    'refund',
    v_offer.amount,
    0,
    v_order.id,
    jsonb_build_object('order_id', v_order.id, 'reason', 'Refund offer accepted', 'offer_id', p_offer_id)
  );

  insert into point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
  values (
    v_order.seller_id,
    'refund',
    -v_offer.amount,
    0,
    v_order.id,
    jsonb_build_object('order_id', v_order.id, 'reason', 'Refund offer accepted', 'offer_id', p_offer_id)
  );

  -- Complete the order
  update orders
  set status = 'completed', updated_at = now()
  where id = p_order_id;

  -- Chat message from buyer
  insert into chat_messages (conversation_id, sender_id, content, type)
  values (
    v_order.conversation_id,
    p_buyer_id,
    'Refund offer of ' || v_offer.amount || ' points accepted. Dispute resolved. ✅',
    'text'
  );

  return jsonb_build_object('success', true);
end;
$$;

-- 5. resolve_dispute_with_message — resolve without additional refund
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

  -- Complete the order
  update orders
  set status = 'completed', updated_at = now()
  where id = p_order_id;

  -- Chat message
  insert into chat_messages (conversation_id, sender_id, content, type)
  values (
    v_order.conversation_id,
    p_user_id,
    v_role || ' resolved the dispute without additional refund. Order completed. ✅',
    'text'
  );

  return jsonb_build_object('success', true);
end;
$$;
