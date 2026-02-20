-- ============================================================================
-- RPC: create_offer_atomic (v2 — delivery_dates + community support)
-- Creates conversation (if needed) + offer + system message in one transaction.
-- Called by seller making an offer on a want_to_buy post.
-- ============================================================================
create or replace function public.create_offer_atomic(
  p_seller_id   uuid,
  p_buyer_id    uuid,    -- the buy-post author
  p_post_id     uuid,    -- the want_to_buy post
  p_quantity    integer,
  p_points_per_unit integer,
  p_category    text,
  p_product     text,
  p_unit        text     default null,
  p_delivery_date date   default null,
  p_message     text     default null,
  p_seller_post_id uuid  default null,
  p_media       jsonb    default '[]'::jsonb,
  p_delivery_dates date[] default '{}',
  p_community_h3_index text default null,
  p_additional_community_h3_indices text[] default '{}'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation_id uuid;
  v_offer_id uuid;
  v_existing_offer record;
  v_existing_order record;
  v_effective_delivery_date date;
  v_effective_delivery_dates date[];
begin
  -- Can't offer to yourself
  if p_seller_id = p_buyer_id then
    return jsonb_build_object('error', 'Cannot make an offer on your own post');
  end if;

  -- Resolve delivery dates: prefer array, fall back to single date
  if p_delivery_dates is not null and array_length(p_delivery_dates, 1) > 0 then
    v_effective_delivery_dates := p_delivery_dates;
    v_effective_delivery_date := p_delivery_dates[1];
  elsif p_delivery_date is not null then
    v_effective_delivery_dates := ARRAY[p_delivery_date];
    v_effective_delivery_date := p_delivery_date;
  else
    v_effective_delivery_dates := '{}';
    v_effective_delivery_date := null;
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
    category, product, unit, delivery_date, delivery_dates,
    message, seller_post_id, status, version, media,
    community_h3_index, additional_community_h3_indices
  )
  values (
    v_conversation_id, p_seller_id, p_post_id, p_quantity, p_points_per_unit,
    p_category, p_product, p_unit, v_effective_delivery_date, v_effective_delivery_dates,
    p_message, p_seller_post_id, 'pending', 1, p_media,
    p_community_h3_index, p_additional_community_h3_indices
  )
  returning id into v_offer_id;

  -- Seller message in conversation (shown as from the seller, not system)
  insert into chat_messages (conversation_id, sender_id, content, type)
  values (
    v_conversation_id,
    p_seller_id,
    '📦 Offer submitted: ' || p_quantity || ' ' || coalesce(p_unit, '') || ' ' || p_product ||
    ' at ' || p_points_per_unit || ' pts/' || coalesce(p_unit, 'unit') ||
    '. Delivery by ' || coalesce(v_effective_delivery_date::text, 'TBD') || '.',
    'text'
  );

  return jsonb_build_object(
    'offerId', v_offer_id,
    'conversationId', v_conversation_id
  );
end;
$$;
