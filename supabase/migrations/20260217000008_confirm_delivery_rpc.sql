-- confirm_order_delivery — buyer confirms receipt, order completed, sends chat message
create or replace function public.confirm_order_delivery(
  p_order_id uuid,
  p_buyer_id uuid
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

  if v_order.buyer_id != p_buyer_id then
    return jsonb_build_object('error', 'Only the buyer can confirm delivery');
  end if;

  if v_order.status != 'delivered' then
    return jsonb_build_object(
      'error', 'Order must be in delivered status to confirm',
      'currentStatus', v_order.status
    );
  end if;

  -- Update order
  update orders
  set status = 'completed', updated_at = now()
  where id = p_order_id;

  -- Chat message from buyer
  insert into chat_messages (conversation_id, sender_id, content, type)
  values (
    v_order.conversation_id,
    p_buyer_id,
    'Delivery confirmed! Order for ' || v_order.quantity || ' ' || v_order.product || ' is complete. Thank you!',
    'text'
  );

  return jsonb_build_object('success', true);
end;
$$;
