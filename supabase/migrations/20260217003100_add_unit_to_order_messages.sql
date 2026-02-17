-- accept_order_versioned — now includes unit in system message
-- Updated to show e.g. "2 dozen Tomatoes" instead of "2 Tomatoes"

create or replace function public.accept_order_versioned(
  p_order_id         uuid,
  p_expected_version integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_rows  integer;
  v_unit  text;
begin
  -- Lock and fetch order
  select * into v_order
  from orders
  where id = p_order_id
  for update;

  if v_order is null then
    return jsonb_build_object('error', 'Order not found');
  end if;

  -- Check status
  if v_order.status != 'pending' then
    return jsonb_build_object(
      'error', 'Order is no longer pending',
      'currentStatus', v_order.status
    );
  end if;

  -- Check version
  if v_order.version != p_expected_version then
    -- Insert system message informing seller of modification
    insert into chat_messages (conversation_id, sender_id, content, type)
    values (
      v_order.conversation_id,
      null,
      'Order was modified by the buyer. Please review the updated terms and accept again.',
      'system'
    );

    return jsonb_build_object(
      'error', 'Order was modified by buyer',
      'code', 'VERSION_MISMATCH',
      'currentVersion', v_order.version
    );
  end if;

  -- Look up the unit from want_to_sell_details
  select wsd.unit into v_unit
  from conversations c
  join want_to_sell_details wsd on wsd.post_id = c.post_id
  where c.id = v_order.conversation_id
  limit 1;

  -- Accept the order
  update orders
  set status = 'accepted', updated_at = now()
  where id = p_order_id;

  -- Reduce available quantity on the post
  update want_to_sell_details
  set total_quantity_available = greatest(0, total_quantity_available - v_order.quantity),
      updated_at = now()
  where post_id = (
    select c.post_id from conversations c where c.id = v_order.conversation_id
  );

  -- System message with unit
  insert into chat_messages (conversation_id, sender_id, content, type)
  values (
    v_order.conversation_id,
    null,
    'Order accepted by seller. ' || v_order.quantity
      || case when v_unit is not null and v_unit != 'piece' then ' ' || v_unit else '' end
      || ' ' || v_order.product
      || ' for ' || (v_order.quantity * v_order.points_per_unit) || ' points. Points held in escrow until delivery is confirmed.',
    'system'
  );

  return jsonb_build_object('success', true);
end;
$$;
