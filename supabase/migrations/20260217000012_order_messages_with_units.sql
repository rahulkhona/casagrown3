-- Update create_order_atomic to include the unit of measure in chat messages.
-- e.g. "Order placed: 2 dozen Tomatoes ..." instead of "Order placed: 2 Tomatoes ..."

CREATE OR REPLACE FUNCTION create_order_atomic(
  p_buyer_id uuid,
  p_seller_id uuid,
  p_post_id uuid,
  p_quantity integer,
  p_points_per_unit integer,
  p_total_price integer,
  p_category text,
  p_product text,
  p_delivery_date date DEFAULT NULL,
  p_delivery_instructions text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
declare
  v_conversation_id uuid;
  v_offer_id uuid;
  v_order_id uuid;
  v_current_balance integer;
  v_unit text;
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

  -- Look up unit from the post's sell details
  select coalesce(wsd.unit::text, 'piece') into v_unit
  from want_to_sell_details wsd
  where wsd.post_id = p_post_id
  limit 1;
  v_unit := coalesce(v_unit, 'piece');

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

  -- 6. Message attributed to buyer with unit
  insert into chat_messages (conversation_id, sender_id, content, type)
  values (
    v_conversation_id,
    p_buyer_id,
    'Order placed: ' || p_quantity || ' ' ||
    CASE WHEN v_unit = 'piece' THEN ''
         WHEN v_unit = 'box' AND p_quantity > 1 THEN 'boxes '
         WHEN v_unit = 'bag' AND p_quantity > 1 THEN 'bags '
         ELSE v_unit || ' '
    END ||
    p_product || ' for ' || p_total_price || ' points. Delivery by ' || coalesce(p_delivery_date::text, 'TBD') || '.'
    || case when p_delivery_instructions is not null then E'\nDelivery info: ' || p_delivery_instructions else '' end,
    'text'
  );

  -- Return result
  return jsonb_build_object(
    'orderId', v_order_id,
    'conversationId', v_conversation_id,
    'newBalance', v_current_balance - p_total_price
  );
end;
$$;
