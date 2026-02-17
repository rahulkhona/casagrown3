-- Fix reject_order_versioned — attribute message to seller
create or replace function public.reject_order_versioned(
  p_order_id         uuid,
  p_expected_version integer
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
      'Order was modified by the buyer. Please review the updated terms before rejecting.',
      'system'
    );

    return jsonb_build_object(
      'error', 'Order was modified by buyer',
      'code', 'VERSION_MISMATCH',
      'currentVersion', v_order.version
    );
  end if;

  update orders
  set status = 'cancelled', updated_at = now()
  where id = p_order_id;

  insert into point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
  values (
    v_order.buyer_id,
    'refund',
    v_order.quantity * v_order.points_per_unit,
    0,
    v_order.id,
    jsonb_build_object(
      'order_id', v_order.id,
      'reason', 'Order rejected by seller'
    )
  );

  -- Message attributed to seller
  insert into chat_messages (conversation_id, sender_id, content, type)
  values (
    v_order.conversation_id,
    v_order.seller_id,
    'Order rejected. Escrow of ' || (v_order.quantity * v_order.points_per_unit) || ' points has been refunded.',
    'text'
  );

  return jsonb_build_object('success', true);
end;
$$;
