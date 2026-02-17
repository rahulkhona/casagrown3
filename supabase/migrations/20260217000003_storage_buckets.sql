-- accept_order_versioned — attribute message to seller + reduce available qty
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
  v_post_id uuid;
begin
  select * into v_order
  from orders
  where id = p_order_id
  for update;

  if v_order is null then
    return jsonb_build_object('error', 'Order not found');
  end if;

  if v_order.status != 'pending' then
    return jsonb_build_object(
      'error', 'Order is no longer pending',
      'currentStatus', v_order.status
    );
  end if;

  if v_order.version != p_expected_version then
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

  -- Update order status
  update orders
  set status = 'accepted', updated_at = now()
  where id = p_order_id;

  -- Credit seller
  insert into point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
  values (
    v_order.seller_id,
    'payment',
    v_order.quantity * v_order.points_per_unit,
    0,
    v_order.id,
    jsonb_build_object(
      'order_id', v_order.id,
      'product', v_order.product,
      'quantity', v_order.quantity
    )
  );

  -- Reduce available quantity on the post's sell details
  select c.post_id into v_post_id
  from conversations c
  where c.id = v_order.conversation_id;

  if v_post_id is not null then
    update want_to_sell_details
    set total_quantity_available = greatest(total_quantity_available - v_order.quantity, 0),
        updated_at = now()
    where post_id = v_post_id;
  end if;

  -- Message attributed to seller
  insert into chat_messages (conversation_id, sender_id, content, type)
  values (
    v_order.conversation_id,
    v_order.seller_id,
    'Order accepted! ' || v_order.quantity || ' ' || v_order.product || ' for ' || (v_order.quantity * v_order.points_per_unit) || ' points.',
    'text'
  );

  return jsonb_build_object('success', true);
end;
$$;
