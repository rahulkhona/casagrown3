-- mark_order_delivered — sets status to delivered, stores proof, sends chat message with proof
create or replace function public.mark_order_delivered(
  p_order_id       uuid,
  p_seller_id      uuid,
  p_proof_media_id uuid
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

  if v_order.seller_id != p_seller_id then
    return jsonb_build_object('error', 'Only the seller can mark as delivered');
  end if;

  if v_order.status != 'accepted' then
    return jsonb_build_object(
      'error', 'Order must be in accepted status to mark as delivered',
      'currentStatus', v_order.status
    );
  end if;

  -- Update order
  update orders
  set status = 'delivered',
      delivery_proof_media_id = p_proof_media_id,
      updated_at = now()
  where id = p_order_id;

  -- Chat message from seller with delivery proof
  insert into chat_messages (conversation_id, sender_id, content, type, media_id)
  values (
    v_order.conversation_id,
    p_seller_id,
    'Delivery proof submitted for ' || v_order.quantity || ' ' || v_order.product || '. Please confirm receipt or dispute within 48 hours. After that, delivery will be automatically confirmed.',
    'media',
    p_proof_media_id
  );

  return jsonb_build_object('success', true);
end;
$$;
