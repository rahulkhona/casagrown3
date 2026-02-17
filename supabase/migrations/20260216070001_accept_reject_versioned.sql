-- Versioned accept/reject and buyer-modify RPCs for order race-condition handling
-- accept_order_versioned: seller accepts only if version matches (prevents accepting stale terms)
-- reject_order_versioned: seller rejects only if version matches
-- modify_order: buyer modifies only if order is still pending

-- ============================================================================
-- accept_order_versioned
-- ============================================================================
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

  -- Accept the order
  update orders
  set status = 'accepted', updated_at = now()
  where id = p_order_id;

  -- Transfer escrowed points to seller
  insert into point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
  values (
    v_order.seller_id,
    'payment',
    v_order.quantity * v_order.points_per_unit,
    0, -- overridden by compute_balance_after trigger
    v_order.id,
    jsonb_build_object(
      'order_id', v_order.id,
      'product', v_order.product,
      'quantity', v_order.quantity
    )
  );

  -- System message
  insert into chat_messages (conversation_id, sender_id, content, type)
  values (
    v_order.conversation_id,
    null,
    'Order accepted by seller. ' || v_order.quantity || ' ' || v_order.product || ' for ' || (v_order.quantity * v_order.points_per_unit) || ' points.',
    'system'
  );

  return jsonb_build_object('success', true);
end;
$$;


-- ============================================================================
-- reject_order_versioned
-- ============================================================================
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
  -- Lock and fetch order
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

  -- Reject (cancel) the order
  update orders
  set status = 'cancelled', updated_at = now()
  where id = p_order_id;

  -- Refund escrow to buyer
  insert into point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
  values (
    v_order.buyer_id,
    'refund',
    v_order.quantity * v_order.points_per_unit,
    0, -- overridden by compute_balance_after trigger
    v_order.id,
    jsonb_build_object(
      'order_id', v_order.id,
      'reason', 'Order rejected by seller'
    )
  );

  -- System message
  insert into chat_messages (conversation_id, sender_id, content, type)
  values (
    v_order.conversation_id,
    null,
    'Order rejected by seller. Escrow of ' || (v_order.quantity * v_order.points_per_unit) || ' points has been refunded.',
    'system'
  );

  return jsonb_build_object('success', true);
end;
$$;


-- ============================================================================
-- modify_order (buyer only)
-- ============================================================================
create or replace function public.modify_order(
  p_order_id       uuid,
  p_buyer_id       uuid,
  p_quantity       integer       default null,
  p_delivery_date  date          default null,
  p_points_per_unit integer      default null
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

  -- Update order with new values and bump version
  update orders
  set quantity = v_new_quantity,
      points_per_unit = v_new_ppu,
      delivery_date = v_new_date,
      version = version + 1,
      updated_at = now()
  where id = p_order_id;

  -- System message showing modification
  insert into chat_messages (conversation_id, sender_id, content, type)
  values (
    v_order.conversation_id,
    null,
    'Order modified: ' || v_new_quantity || ' ' || v_order.product || ' for ' || v_new_total || ' points. Delivery by ' || coalesce(v_new_date::text, 'TBD') || '.',
    'system'
  );

  return jsonb_build_object(
    'success', true,
    'newVersion', v_order.version + 1,
    'newTotal', v_new_total
  );
end;
$$;
