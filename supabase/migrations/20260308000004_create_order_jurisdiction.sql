-- =============================================================================
-- Migration: Add Jurisdiction Blocking to create_order_atomic
-- =============================================================================

CREATE OR REPLACE FUNCTION create_order_atomic(
  p_buyer_id uuid, p_seller_id uuid, p_post_id uuid,
  p_quantity integer, p_points_per_unit integer, p_total_price integer,
  p_category text, p_product text,
  p_delivery_date date DEFAULT NULL, p_delivery_instructions text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare
  v_conversation_id uuid; v_offer_id uuid; v_order_id uuid;
  v_current_balance integer; v_unit text;
  v_buyer_email text; v_seller_email text;
  v_buyer_name text; v_seller_name text;
  v_jur record;
  v_is_blocked boolean := false;
  v_block_reason text;
begin
  -- 1. Check Jurisdiction Restrictions
  SELECT * INTO v_jur FROM get_user_jurisdiction(p_buyer_id) LIMIT 1;
  
  -- Check blocked products
  SELECT true, reason INTO v_is_blocked, v_block_reason
  FROM blocked_products
  WHERE product_name ILIKE p_product
    AND (
      (country_iso_3 IS NULL AND state_id IS NULL AND county_id IS NULL AND city_id IS NULL)
      OR (v_jur IS NOT NULL AND country_iso_3 = v_jur.country_iso_3 AND state_id IS NULL AND county_id IS NULL AND city_id IS NULL)
      OR (v_jur IS NOT NULL AND state_id = v_jur.state_id AND county_id IS NULL AND city_id IS NULL)
      OR (v_jur IS NOT NULL AND county_id = v_jur.county_id AND city_id IS NULL)
      OR (v_jur IS NOT NULL AND city_id = v_jur.city_id)
    )
  LIMIT 1;

  IF v_is_blocked THEN
    RAISE EXCEPTION 'PRODUCT_RESTRICTED:%', coalesce(v_block_reason, 'This product is restricted in your area');
  END IF;

  -- Check category restrictions
  SELECT true INTO v_is_blocked
  FROM category_restrictions
  WHERE category_name ILIKE p_category
    AND (
      (country_iso_3 IS NULL AND state_id IS NULL AND county_id IS NULL AND city_id IS NULL)
      OR (v_jur IS NOT NULL AND country_iso_3 = v_jur.country_iso_3 AND state_id IS NULL AND county_id IS NULL AND city_id IS NULL)
      OR (v_jur IS NOT NULL AND state_id = v_jur.state_id AND county_id IS NULL AND city_id IS NULL)
      OR (v_jur IS NOT NULL AND county_id = v_jur.county_id AND city_id IS NULL)
      OR (v_jur IS NOT NULL AND city_id = v_jur.city_id)
    )
  LIMIT 1;

  IF v_is_blocked THEN
    RAISE EXCEPTION 'CATEGORY_RESTRICTED:This category is restricted in your area';
  END IF;

  select coalesce(sum(amount), 0) into v_current_balance from point_ledger where user_id = p_buyer_id;
  if v_current_balance < p_total_price then
    return jsonb_build_object('error', 'Insufficient points', 'currentBalance', v_current_balance, 'required', p_total_price);
  end if;
  select coalesce(wsd.unit::text, 'piece') into v_unit from want_to_sell_details wsd where wsd.post_id = p_post_id limit 1;
  v_unit := coalesce(v_unit, 'piece');
  select id into v_conversation_id from conversations where post_id = p_post_id and buyer_id = p_buyer_id and seller_id = p_seller_id;
  if v_conversation_id is null then
    insert into conversations (post_id, buyer_id, seller_id) values (p_post_id, p_buyer_id, p_seller_id) returning id into v_conversation_id;
  end if;
  insert into offers (conversation_id, created_by, quantity, points_per_unit, status) values (v_conversation_id, p_buyer_id, p_quantity, p_points_per_unit, 'pending') returning id into v_offer_id;
  insert into orders (offer_id, buyer_id, seller_id, category, product, quantity, points_per_unit, delivery_date, delivery_instructions, conversation_id, status)
  values (v_offer_id, p_buyer_id, p_seller_id, p_category, p_product, p_quantity, p_points_per_unit, p_delivery_date, p_delivery_instructions, v_conversation_id, 'pending')
  returning id into v_order_id;
  insert into point_ledger (user_id, type, amount, balance_after, reference_id, metadata)
  values (p_buyer_id, 'hold', -p_total_price, 0, v_order_id,
    jsonb_build_object('order_id', v_order_id, 'post_id', p_post_id, 'seller_id', p_seller_id, 'product', p_product, 'quantity', p_quantity, 'points_per_unit', p_points_per_unit));
  insert into chat_messages (conversation_id, sender_id, content, type)
  values (v_conversation_id, p_buyer_id,
    'Order placed: ' || p_quantity || ' ' ||
    CASE WHEN v_unit = 'piece' THEN '' WHEN v_unit = 'box' AND p_quantity > 1 THEN 'boxes ' WHEN v_unit = 'bag' AND p_quantity > 1 THEN 'bags ' ELSE v_unit || ' ' END ||
    p_product || ' for ' || p_total_price || ' points. Delivery by ' || coalesce(p_delivery_date::text, 'TBD') || '.'
    || case when p_delivery_instructions is not null then E'\nDelivery info: ' || p_delivery_instructions else '' end, 'text');

  -- === Email Notification ===
  v_buyer_email := public.get_user_email(p_buyer_id);
  v_seller_email := public.get_user_email(p_seller_id);
  SELECT full_name INTO v_buyer_name FROM profiles WHERE id = p_buyer_id;
  SELECT full_name INTO v_seller_name FROM profiles WHERE id = p_seller_id;

  IF v_buyer_email IS NOT NULL OR v_seller_email IS NOT NULL THEN
    DECLARE
      v_recipients jsonb := '[]'::jsonb;
    BEGIN
      IF v_buyer_email IS NOT NULL THEN
        v_recipients := v_recipients || jsonb_build_array(
          jsonb_build_object('email', v_buyer_email, 'name', coalesce(v_buyer_name, 'there'))
        );
      END IF;
      IF v_seller_email IS NOT NULL THEN
        v_recipients := v_recipients || jsonb_build_array(
          jsonb_build_object('email', v_seller_email, 'name', coalesce(v_seller_name, 'there'))
        );
      END IF;

      PERFORM public._send_notification_email(
        'order_placed',
        v_recipients,
        jsonb_build_object(
          'product', p_product,
          'quantity', p_quantity,
          'unit', v_unit,
          'pointsPerUnit', p_points_per_unit,
          'total', p_total_price,
          'orderId', v_order_id,
          'buyerName', coalesce(v_buyer_name, 'Buyer'),
          'buyerEmail', v_buyer_email,
          'sellerName', coalesce(v_seller_name, 'Seller'),
          'sellerEmail', v_seller_email
        )
      );
    END;
  END IF;

  return jsonb_build_object('orderId', v_order_id, 'conversationId', v_conversation_id, 'newBalance', v_current_balance - p_total_price);
end;
$$;
