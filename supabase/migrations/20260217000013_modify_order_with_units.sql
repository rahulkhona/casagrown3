-- Update modify_order to include the unit of measure in chat messages.
-- e.g. "Order modified: 2 dozen Tomatoes ..." instead of "Order modified: 2 Tomatoes ..."

CREATE OR REPLACE FUNCTION modify_order(
  p_order_id uuid,
  p_buyer_id uuid,
  p_quantity integer DEFAULT NULL,
  p_points_per_unit integer DEFAULT NULL,
  p_delivery_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
begin
  -- Fetch order
  select * into v_order
  from orders
  where id = p_order_id
  for update;

  if v_order is null then
    return jsonb_build_object('error', 'Order not found');
  end if;

  if v_order.buyer_id != p_buyer_id then
    return jsonb_build_object('error', 'Only the buyer can modify this order');
  end if;

  if v_order.status != 'pending' then
    return jsonb_build_object(
      'error', 'Order was already ' || v_order.status || '. Modification not possible.',
      'currentStatus', v_order.status
    );
  end if;

  -- Look up unit from the post via conversation
  select coalesce(wsd.unit::text, 'piece') into v_unit
  from conversations c
  join want_to_sell_details wsd on wsd.post_id = c.post_id
  where c.id = v_order.conversation_id
  limit 1;
  v_unit := coalesce(v_unit, 'piece');

  v_new_quantity := coalesce(p_quantity, v_order.quantity);
  v_new_ppu := coalesce(p_points_per_unit, v_order.points_per_unit);
  v_new_date := coalesce(p_delivery_date, v_order.delivery_date);

  v_old_total := v_order.quantity * v_order.points_per_unit;
  v_new_total := v_new_quantity * v_new_ppu;
  v_diff := v_new_total - v_old_total;

  -- If new total is more, check balance and escrow the difference
  if v_diff > 0 then
    select coalesce(sum(amount), 0) into v_current_balance
    from point_ledger where user_id = p_buyer_id;

    if v_current_balance < v_diff then
      return jsonb_build_object(
        'error', 'Insufficient points for modification',
        'currentBalance', v_current_balance,
        'required', v_diff
      );
    end if;

    insert into point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
    values (
      p_buyer_id, 'escrow', -v_diff, 0,
      v_order.id,
      jsonb_build_object('order_id', v_order.id, 'reason', 'Order modification — additional escrow')
    );
  elsif v_diff < 0 then
    insert into point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
    values (
      p_buyer_id, 'refund', -v_diff, 0,
      v_order.id,
      jsonb_build_object('order_id', v_order.id, 'reason', 'Order modification — partial refund')
    );
  end if;

  -- Update order
  update orders
  set quantity = v_new_quantity,
      points_per_unit = v_new_ppu,
      delivery_date = v_new_date,
      version = v_order.version + 1,
      updated_at = now()
  where id = p_order_id;

  -- System message showing modification with unit
  insert into chat_messages (conversation_id, sender_id, content, type)
  values (
    v_order.conversation_id,
    p_buyer_id,
    'Order modified: ' || v_new_quantity || ' ' ||
    CASE WHEN v_unit = 'piece' THEN ''
         WHEN v_unit = 'box' AND v_new_quantity > 1 THEN 'boxes '
         WHEN v_unit = 'bag' AND v_new_quantity > 1 THEN 'bags '
         ELSE v_unit || ' '
    END ||
    v_order.product || ' for ' || v_new_total || ' points. Delivery by ' || coalesce(v_new_date::text, 'TBD') || '.',
    'text'
  );

  return jsonb_build_object(
    'success', true,
    'newVersion', v_order.version + 1,
    'newTotal', v_new_total
  );
end;
$$;
