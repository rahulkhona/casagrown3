-- Change offer-submitted message to come from the seller (not system).
-- This makes offer messages consistent with order placement messages where
-- the initiator is the sender.
-- IMPORTANT: Keep the exact same signature as the original (p_buyer_id, p_quantity integer)
-- so the front-end RPC call doesn't break.

create or replace function public.create_offer_atomic(
  p_seller_id      uuid,
  p_buyer_id       uuid,    -- the buy-post author
  p_post_id        uuid,    -- the want_to_buy post
  p_quantity       integer,
  p_points_per_unit integer,
  p_category       text,
  p_product        text,
  p_unit           text     default null,
  p_delivery_date  date     default null,
  p_message        text     default null,
  p_seller_post_id uuid     default null,
  p_media          jsonb    default '[]'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation_id uuid;
  v_offer_id        uuid;
  v_existing_offer  record;
  v_existing_order  record;
begin
  -- Can't offer to yourself
  if p_seller_id = p_buyer_id then
    return jsonb_build_object('error', 'Cannot make an offer on your own post');
  end if;

  -- Create or reuse conversation
  select id into v_conversation_id
  from conversations
  where post_id = p_post_id
    and buyer_id = p_buyer_id
    and seller_id = p_seller_id;

  if v_conversation_id is null then
    insert into conversations (post_id, buyer_id, seller_id)
    values (p_post_id, p_buyer_id, p_seller_id)
    returning id into v_conversation_id;
  end if;

  -- Check for active offer (pending) in this conversation
  select * into v_existing_offer
  from offers
  where conversation_id = v_conversation_id
    and status = 'pending'
  for update;

  if v_existing_offer is not null then
    return jsonb_build_object(
      'error', 'An active offer already exists in this conversation',
      'existingOfferId', v_existing_offer.id,
      'conversationId', v_conversation_id
    );
  end if;

  -- Check for active order in this conversation
  select * into v_existing_order
  from orders
  where conversation_id = v_conversation_id
    and status not in ('cancelled', 'completed')
  limit 1;

  if v_existing_order is not null then
    return jsonb_build_object(
      'error', 'An active order exists in this conversation',
      'existingOrderId', v_existing_order.id,
      'conversationId', v_conversation_id
    );
  end if;

  -- Create the offer
  insert into offers (
    conversation_id, created_by, post_id, quantity, points_per_unit,
    category, product, unit, delivery_date,
    message, seller_post_id, status, version, media
  )
  values (
    v_conversation_id, p_seller_id, p_post_id, p_quantity, p_points_per_unit,
    p_category, p_product, p_unit, p_delivery_date,
    p_message, p_seller_post_id, 'pending', 1, p_media
  )
  returning id into v_offer_id;

  -- Message from the seller (not a system message)
  insert into chat_messages (conversation_id, sender_id, content, type)
  values (
    v_conversation_id,
    p_seller_id,
    'Offer submitted: ' || p_quantity || ' ' || coalesce(p_unit, '') || ' ' || p_product ||
    ' at ' || p_points_per_unit || ' pts/' || coalesce(p_unit, 'unit') ||
    '. Delivery by ' || coalesce(p_delivery_date::text, 'TBD') || '.',
    'text'
  );

  return jsonb_build_object(
    'offerId', v_offer_id,
    'conversationId', v_conversation_id
  );
end;
$$;
