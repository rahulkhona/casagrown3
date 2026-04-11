-- 1. Patch `make_refund_offer_with_message` to trigger SMS
CREATE OR REPLACE FUNCTION public.make_refund_offer_with_message(p_order_id uuid, p_seller_id uuid, p_amount numeric, p_message text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_order record;
  v_esc_id uuid;
  v_offer_id uuid;
  v_total numeric;
  v_msg text;
begin
  select * into v_order
  from orders
  where id = p_order_id
  for update;

  if v_order is null then
    return jsonb_build_object('error', 'Order not found');
  end if;

  if v_order.seller_id != p_seller_id then
    return jsonb_build_object('error', 'Only the seller can make a refund offer');
  end if;

  if v_order.status not in ('disputed', 'escalated') then
    return jsonb_build_object(
      'error', 'Order must be in disputed or escalated status',
      'currentStatus', v_order.status
    );
  end if;

  v_total := v_order.quantity * v_order.points_per_unit;

  -- Find the escalation
  select id into v_esc_id
  from escalations
  where order_id = p_order_id
  order by created_at desc
  limit 1;

  if v_esc_id is null then
    return jsonb_build_object('error', 'No escalation found for this order');
  end if;

  -- Reject any previous pending offers
  update refund_offers
  set status = 'rejected'
  where escalation_id = v_esc_id and status = 'pending';

  -- Create the refund offer
  insert into refund_offers (escalation_id, amount, message)
  values (v_esc_id, p_amount, p_message)
  returning id into v_offer_id;

  -- Build chat message
  v_msg := 'Refund offer: ' || p_amount || ' of ' || v_total || ' points (' || round((p_amount::numeric / v_total) * 100) || '% discount).';
  if p_message is not null and p_message != '' then
    v_msg := v_msg || ' "' || p_message || '"';
  end if;

  insert into chat_messages (conversation_id, sender_id, content, type)
  values (
    v_order.conversation_id,
    p_seller_id,
    v_msg,
    'text'
  );

  -- Trigger SMS for refund offer
  PERFORM public.notify_market_event(
    v_order.buyer_id,
    '💰 You received a refund offer for your order.',
    '/orders/' || p_order_id,
    true, true
  );

  return jsonb_build_object('success', true, 'offer_id', v_offer_id);
end;
$function$;

-- 2. Create trigger for payment_transactions failure
CREATE OR REPLACE FUNCTION trg_payment_failed_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.status = 'failed' AND OLD.status != 'failed' THEN
    PERFORM public.notify_market_event(
      NEW.user_id,
      '❌ Your credit card charge failed. Please update your payment method.',
      '/profile',
      true, true
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_failed_notify_exec ON payment_transactions;
CREATE TRIGGER trg_payment_failed_notify_exec
  AFTER UPDATE OF status ON payment_transactions
  FOR EACH ROW EXECUTE FUNCTION trg_payment_failed_notify();
