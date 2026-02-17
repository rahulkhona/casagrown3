-- cancel_order_with_message — cancels order, refunds escrow, restores qty, sends chat message
create or replace function public.cancel_order_with_message(
  p_order_id uuid,
  p_user_id  uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_post_id uuid;
  v_was_accepted boolean;
  v_escrow_amount integer;
begin
  select * into v_order
  from orders
  where id = p_order_id
  for update;

  if v_order is null then
    return jsonb_build_object('error', 'Order not found');
  end if;

  -- Only buyer or seller can cancel
  if v_order.buyer_id != p_user_id and v_order.seller_id != p_user_id then
    return jsonb_build_object('error', 'Only buyer or seller can cancel');
  end if;

  -- Can only cancel from pending or accepted
  if v_order.status not in ('pending', 'accepted') then
    return jsonb_build_object(
      'error', 'Cannot cancel order in ' || v_order.status || ' status'
    );
  end if;

  v_was_accepted := (v_order.status = 'accepted');
  v_escrow_amount := v_order.quantity * v_order.points_per_unit;

  -- Update order status
  update orders
  set status = 'cancelled', updated_at = now()
  where id = p_order_id;

  -- Refund buyer's escrow
  insert into point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
  values (
    v_order.buyer_id,
    'refund',
    v_escrow_amount,
    0,
    v_order.id,
    jsonb_build_object('order_id', v_order.id, 'reason', 'Order cancelled')
  );

  -- If was accepted, also reverse seller's earned points and restore qty
  if v_was_accepted then
    insert into point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
    values (
      v_order.seller_id,
      'refund',
      -v_escrow_amount,
      0,
      v_order.id,
      jsonb_build_object('order_id', v_order.id, 'reason', 'Order cancelled after acceptance')
    );

    -- Restore available quantity on the post
    select c.post_id into v_post_id
    from conversations c
    where c.id = v_order.conversation_id;

    if v_post_id is not null then
      update want_to_sell_details
      set total_quantity_available = total_quantity_available + v_order.quantity,
          updated_at = now()
      where post_id = v_post_id;
    end if;
  end if;

  -- Chat message attributed to the user who cancelled
  insert into chat_messages (conversation_id, sender_id, content, type)
  values (
    v_order.conversation_id,
    p_user_id,
    'Order cancelled. ' || v_escrow_amount || ' points have been refunded to the buyer.',
    'text'
  );

  return jsonb_build_object('success', true);
end;
$$;
