-- =============================================================================
-- Email Notification Triggers
-- Adds net.http_post calls to existing RPC functions to fire email notifications
-- via the unified send-notification-email edge function.
-- =============================================================================

-- Helper: reusable function to send notification emails
CREATE OR REPLACE FUNCTION public._send_notification_email(
  p_type       text,
  p_recipients jsonb,
  p_payload    jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_edge_fn_url   text;
  v_service_role_key text;
  v_body jsonb;
BEGIN
  -- Same fallback chain as confirm_delivery_with_emails
  v_service_role_key := COALESCE(
    current_setting('app.settings.service_role_key', true),
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1),
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
  );

  v_edge_fn_url := COALESCE(
    current_setting('app.settings.edge_functions_base_url', true),
    'http://host.docker.internal:54321/functions/v1'
  ) || '/send-notification-email';

  v_body := p_payload || jsonb_build_object(
    'type', p_type,
    'recipients', p_recipients
  );

  PERFORM net.http_post(
    url := v_edge_fn_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_role_key
    ),
    body := v_body
  );

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[_send_notification_email] Failed to send % email: %', p_type, SQLERRM;
END;
$$;


-- =============================================================================
-- (a) create_order_atomic — add email notification for order placed
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
begin
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
