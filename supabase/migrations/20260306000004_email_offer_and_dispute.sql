
-- =============================================================================
-- (b) create_offer_atomic — add email notification for offer made
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_offer_atomic(
  p_seller_id      uuid,
  p_buyer_id       uuid,
  p_post_id        uuid,
  p_quantity       integer,
  p_points_per_unit integer,
  p_category       text,
  p_product        text,
  p_unit           text     default null,
  p_delivery_date  date     default null,
  p_delivery_dates text[]   default '{}'::text[],
  p_message        text     default null,
  p_seller_post_id uuid     default null,
  p_media          jsonb    default '[]'::jsonb,
  p_community_h3_index text default null,
  p_additional_community_h3_indices text[] default '{}'::text[]
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
  v_buyer_email     text;
  v_buyer_name      text;
  v_seller_name     text;
begin
  if p_seller_id = p_buyer_id then
    return jsonb_build_object('error', 'Cannot make an offer on your own post');
  end if;

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

  insert into chat_messages (conversation_id, sender_id, content, type)
  values (
    v_conversation_id,
    p_seller_id,
    'Offer submitted: ' || p_quantity || ' ' || coalesce(p_unit, '') || ' ' || p_product ||
    ' at ' || p_points_per_unit || ' pts/' || coalesce(p_unit, 'unit') ||
    '. Delivery by ' || coalesce(p_delivery_date::text, 'TBD') || '.',
    'text'
  );

  -- === Email Notification: notify buyer about new offer ===
  v_buyer_email := public.get_user_email(p_buyer_id);
  SELECT full_name INTO v_buyer_name FROM profiles WHERE id = p_buyer_id;
  SELECT full_name INTO v_seller_name FROM profiles WHERE id = p_seller_id;

  IF v_buyer_email IS NOT NULL THEN
    PERFORM public._send_notification_email(
      'offer_made',
      jsonb_build_array(
        jsonb_build_object('email', v_buyer_email, 'name', coalesce(v_buyer_name, 'there'))
      ),
      jsonb_build_object(
        'product', p_product,
        'quantity', p_quantity,
        'unit', coalesce(p_unit, 'unit'),
        'pointsPerUnit', p_points_per_unit,
        'sellerName', coalesce(v_seller_name, 'A seller'),
        'deliveryDate', coalesce(p_delivery_date::text, null),
        'offerMessage', p_message
      )
    );
  END IF;

  return jsonb_build_object(
    'offerId', v_offer_id,
    'conversationId', v_conversation_id
  );
end;
$$;
