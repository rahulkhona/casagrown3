-- Atomic create-order RPC
-- Wraps conversation + offer + order + escrow + system message
-- in a single transaction to prevent partial state corruption.
-- The balance_after trigger (compute_balance_after) still fires
-- inside this transaction, so advisory locks are properly held.

create or replace function public.create_order_atomic(
  p_buyer_id  uuid,
  p_seller_id uuid,
  p_post_id   uuid,
  p_quantity   integer,
  p_points_per_unit integer,
  p_total_price integer,
  p_category   text,
  p_product    text,
  p_delivery_date  date default null,
  p_delivery_instructions text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation_id uuid;
  v_offer_id uuid;
  v_order_id uuid;
  v_current_balance integer;
begin
  -- 1. Check buyer's balance (sum of all amounts)
  select coalesce(sum(amount), 0) into v_current_balance
  from point_ledger
  where user_id = p_buyer_id;

  if v_current_balance < p_total_price then
    return jsonb_build_object(
      'error', 'Insufficient points',
      'currentBalance', v_current_balance,
      'required', p_total_price
    );
  end if;

  -- 2. Create or reuse conversation
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

  -- 3. Create pending offer
  insert into offers (conversation_id, created_by, quantity, points_per_unit, status)
  values (v_conversation_id, p_buyer_id, p_quantity, p_points_per_unit, 'pending')
  returning id into v_offer_id;

  -- 4. Create pending order
  insert into orders (
    offer_id, buyer_id, seller_id, category, product,
    quantity, points_per_unit, delivery_date, delivery_instructions,
    conversation_id, status
  )
  values (
    v_offer_id, p_buyer_id, p_seller_id, p_category::sales_category, p_product,
    p_quantity, p_points_per_unit, p_delivery_date, p_delivery_instructions,
    v_conversation_id, 'pending'
  )
  returning id into v_order_id;

  -- 5. Escrow buyer's points (balance_after computed by trigger)
  insert into point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
  values (
    p_buyer_id,
    'escrow',
    -p_total_price,
    0, -- overridden by compute_balance_after trigger
    v_order_id,
    jsonb_build_object(
      'order_id', v_order_id,
      'post_id', p_post_id,
      'seller_id', p_seller_id,
      'product', p_product,
      'quantity', p_quantity,
      'points_per_unit', p_points_per_unit
    )
  );

  -- 6. System message in conversation
  insert into chat_messages (conversation_id, sender_id, content, type)
  values (
    v_conversation_id,
    null,
    'Order placed: ' || p_quantity || ' ' || p_product || ' for ' || p_total_price || ' points. Delivery by ' || coalesce(p_delivery_date::text, 'TBD') || '.',
    'system'
  );

  -- Return result
  return jsonb_build_object(
    'orderId', v_order_id,
    'conversationId', v_conversation_id,
    'newBalance', v_current_balance - p_total_price
  );
end;
$$;
