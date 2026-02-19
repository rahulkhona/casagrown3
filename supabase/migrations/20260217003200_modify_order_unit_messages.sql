-- modify_order — includes unit in system message, merges delivery_address into
-- delivery_instructions (orders table has no delivery_address column).

create or replace function public.modify_order(
  p_order_id       uuid,
  p_buyer_id       uuid,
  p_quantity       integer       default null,
  p_delivery_date  date          default null,
  p_points_per_unit integer      default null,
  p_delivery_address text        default null,
  p_delivery_instructions text   default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_new_quantity integer;
  v_new_ppu integer;
  v_new_date date;
  v_old_total integer;
  v_new_total integer;
  v_diff integer;
  v_current_balance integer;
  v_unit text;
  v_new_delivery_instructions text;
begin
  -- Lock and fetch
  select * into v_order
  from orders
  where id = p_order_id
  for update;

  if v_order is null then
    return jsonb_build_object('error', 'Order not found');
  end if;

  -- Only buyer can modify
  if v_order.buyer_id != p_buyer_id then
    return jsonb_build_object('error', 'Only the buyer can modify an order');
  end if;

  -- Must be pending
  if v_order.status != 'pending' then
    return jsonb_build_object(
      'error', 'Order was already ' || v_order.status || '. Modification not possible.',
      'code', 'NOT_PENDING',
      'currentStatus', v_order.status
    );
  end if;

  -- Look up the unit from want_to_sell_details
  select wsd.unit into v_unit
  from conversations c
  join want_to_sell_details wsd on wsd.post_id = c.post_id
  where c.id = v_order.conversation_id
  limit 1;

  -- Compute new values (use existing if not provided)
  v_new_quantity := coalesce(p_quantity, v_order.quantity);
  v_new_ppu := coalesce(p_points_per_unit, v_order.points_per_unit);
  v_new_date := coalesce(p_delivery_date, v_order.delivery_date);

  v_old_total := v_order.quantity * v_order.points_per_unit;
  v_new_total := v_new_quantity * v_new_ppu;
  v_diff := v_new_total - v_old_total;

  -- If cost increased, check buyer has enough additional balance
  if v_diff > 0 then
    select coalesce(sum(amount), 0) into v_current_balance
    from point_ledger
    where user_id = p_buyer_id;

    if v_current_balance < v_diff then
      return jsonb_build_object(
        'error', 'Insufficient points for modification',
        'currentBalance', v_current_balance,
        'additionalRequired', v_diff
      );
    end if;

    -- Escrow the additional amount
    insert into point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
    values (
      p_buyer_id,
      'escrow',
      -v_diff,
      0,
      v_order.id,
      jsonb_build_object('order_id', v_order.id, 'reason', 'Order modification — additional escrow')
    );
  elsif v_diff < 0 then
    -- Refund the difference
    insert into point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
    values (
      p_buyer_id,
      'refund',
      -v_diff, -- positive amount back to buyer
      0,
      v_order.id,
      jsonb_build_object('order_id', v_order.id, 'reason', 'Order modification — partial refund')
    );
  end if;

  -- Merge delivery_address (line 1) + delivery_instructions (rest) into the
  -- single delivery_instructions column (the DB has no delivery_address column).
  if p_delivery_address is not null and p_delivery_instructions is not null then
    v_new_delivery_instructions := p_delivery_address || E'\n' || p_delivery_instructions;
  elsif p_delivery_address is not null then
    v_new_delivery_instructions := p_delivery_address;
  elsif p_delivery_instructions is not null then
    -- Keep existing address (first line), replace instructions
    v_new_delivery_instructions := split_part(coalesce(v_order.delivery_instructions, ''), E'\n', 1)
      || E'\n' || p_delivery_instructions;
  else
    v_new_delivery_instructions := v_order.delivery_instructions;
  end if;

  -- Update order with new values and bump version
  update orders
  set quantity = v_new_quantity,
      points_per_unit = v_new_ppu,
      delivery_date = v_new_date,
      delivery_instructions = v_new_delivery_instructions,
      version = version + 1,
      updated_at = now()
  where id = p_order_id;

  -- Chat message showing modification with unit (attributed to buyer)
  insert into chat_messages (conversation_id, sender_id, content, type)
  values (
    v_order.conversation_id,
    p_buyer_id,
    'Order modified: ' || v_new_quantity
      || case when v_unit is not null and v_unit != 'piece' then ' ' || v_unit else '' end
      || ' ' || v_order.product
      || ' for ' || v_new_total || ' points. Delivery by ' || coalesce(v_new_date::text, 'TBD') || '.'
      || case when v_new_delivery_instructions is not null then E'\nDelivery info: ' || v_new_delivery_instructions else '' end,
    'text'
  );

  return jsonb_build_object(
    'success', true,
    'newVersion', v_order.version + 1,
    'newTotal', v_new_total
  );
end;
$$;
