-- ============================================================================
-- Fix: accept_offer_atomic now uses buyer's requested quantity
-- Previously it used v_offer.quantity (the full offer qty) for price calculation,
-- which caused "Insufficient points" when buyer requested a partial quantity.
-- ============================================================================
create or replace function public.accept_offer_atomic(
  p_offer_id  uuid,
  p_buyer_id  uuid,
  p_delivery_address text,
  p_delivery_instructions text default null,
  p_quantity numeric default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer record;
  v_order_id uuid;
  v_total_price integer;
  v_current_balance integer;
  v_conv record;
  v_final_instructions text;
  v_quantity numeric;
begin
  -- Lock and fetch offer
  select * into v_offer
  from offers
  where id = p_offer_id
  for update;

  if v_offer is null then
    return jsonb_build_object('error', 'Offer not found');
  end if;

  if v_offer.status != 'pending' then
    return jsonb_build_object('error', 'Offer is not pending');
  end if;

  -- Verify the buyer is the post author (conversation buyer)
  select * into v_conv
  from conversations
  where id = v_offer.conversation_id;

  if v_conv.buyer_id != p_buyer_id then
    return jsonb_build_object('error', 'Only the buyer can accept an offer');
  end if;

  -- Validate delivery address
  if p_delivery_address is null or trim(p_delivery_address) = '' then
    return jsonb_build_object('error', 'Delivery address is required');
  end if;

  -- Use buyer's requested quantity, default to full offer quantity
  v_quantity := coalesce(p_quantity, v_offer.quantity);

  -- Validate quantity doesn't exceed offer
  if v_quantity > v_offer.quantity then
    return jsonb_build_object('error', 'Requested quantity exceeds offer');
  end if;

  if v_quantity <= 0 then
    return jsonb_build_object('error', 'Quantity must be positive');
  end if;

  -- Calculate total price using buyer's quantity
  v_total_price := v_quantity * v_offer.points_per_unit;

  -- Check buyer's balance
  select coalesce(sum(amount), 0) into v_current_balance
  from point_ledger
  where user_id = p_buyer_id;

  if v_current_balance < v_total_price then
    return jsonb_build_object(
      'error', 'Insufficient points',
      'currentBalance', v_current_balance,
      'required', v_total_price
    );
  end if;

  -- Accept the offer
  update offers
  set status = 'accepted', updated_at = now()
  where id = p_offer_id;

  -- Combine address and instructions
  if p_delivery_instructions is not null and trim(p_delivery_instructions) != '' then
    v_final_instructions := p_delivery_address || E'\n' || p_delivery_instructions;
  else
    v_final_instructions := p_delivery_address;
  end if;

  -- Create a pending order from the offer (using buyer's quantity)
  insert into orders (
    offer_id, buyer_id, seller_id, category, product,
    quantity, points_per_unit, delivery_date, delivery_instructions,
    conversation_id, status
  )
  values (
    v_offer.id,
    v_conv.buyer_id,
    v_conv.seller_id,
    v_offer.category::sales_category,
    v_offer.product,
    v_quantity,
    v_offer.points_per_unit,
    v_offer.delivery_date,
    v_final_instructions,
    v_offer.conversation_id,
    'pending'
  )
  returning id into v_order_id;

  -- Escrow buyer's points
  insert into point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
  values (
    p_buyer_id,
    'escrow',
    -v_total_price,
    0,  -- overridden by compute_balance_after trigger
    v_order_id,
    jsonb_build_object(
      'order_id', v_order_id,
      'offer_id', v_offer.id,
      'post_id', v_conv.post_id,
      'seller_id', v_conv.seller_id,
      'product', v_offer.product,
      'quantity', v_quantity,
      'points_per_unit', v_offer.points_per_unit
    )
  );

  -- Buyer message (shown as from the buyer, not system)
  insert into chat_messages (conversation_id, sender_id, content, type)
  values (
    v_offer.conversation_id,
    p_buyer_id,
    '✅ Offer accepted! Order placed: ' || v_quantity || ' ' ||
    coalesce(v_offer.unit, '') || ' ' || v_offer.product ||
    ' for ' || v_total_price || ' points. Points held in escrow.',
    'text'
  );

  return jsonb_build_object(
    'orderId', v_order_id,
    'conversationId', v_offer.conversation_id,
    'newBalance', v_current_balance - v_total_price
  );
end;
$$;
