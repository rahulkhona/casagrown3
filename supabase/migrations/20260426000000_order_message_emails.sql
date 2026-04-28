CREATE OR REPLACE FUNCTION public._notify_order_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order record;
  v_other_id uuid;
  v_other_email text;
  v_other_name text;
  v_sender_name text;
  v_last_sent timestamptz;
BEGIN
  -- Skip system messages if any
  IF NEW.sender_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get order details
  SELECT * INTO v_order FROM market_orders WHERE id = NEW.order_id;
  IF v_order IS NULL THEN
    RETURN NEW;
  END IF;

  -- Determine the other party
  -- Determine the other party
  IF NEW.sender_id = v_order.buyer_id THEN
    v_other_id := v_order.seller_id;
  ELSE
    v_other_id := v_order.buyer_id;
  END IF;
  IF NEW.content NOT LIKE 'I''m on my way!%' 
     AND NEW.content NOT LIKE 'Your order is ready for pickup!%'
     AND NEW.content NOT LIKE '⚠️ Dispute filed:%'
     AND NEW.content NOT LIKE '💰 Refund offered:%'
     AND NEW.content NOT LIKE '✅ Refund accepted%'
     AND NEW.content NOT LIKE '✅ Issue resolved%'
     AND NEW.content NOT LIKE '🚨 Dispute escalated%'
     AND NEW.content NOT LIKE '🔺 Dispute escalated%'
  THEN
    SELECT created_at INTO v_last_sent
    FROM order_chat_messages
    WHERE order_id = NEW.order_id
      AND sender_id = NEW.sender_id
      AND id != NEW.id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_last_sent IS NOT NULL AND v_last_sent > now() - interval '30 minutes' THEN
      RETURN NEW; -- Skip email if sent recently
    END IF;
  END IF;

  v_other_email := public.get_user_email(v_other_id);
  IF v_other_email IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT full_name INTO v_other_name FROM profiles WHERE id = v_other_id;
  SELECT full_name INTO v_sender_name FROM profiles WHERE id = NEW.sender_id;

  PERFORM public._send_notification_email(
    'chat_initiated',
    jsonb_build_array(
      jsonb_build_object('email', v_other_email, 'name', coalesce(v_other_name, 'there'))
    ),
    jsonb_build_object(
      'senderName', coalesce(v_sender_name, 'Someone'),
      'product', v_order.product_name,
      'messagePreview', left(NEW.content, 150)
    )
  );

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_order_message_email ON order_chat_messages;
CREATE TRIGGER trigger_order_message_email
  AFTER INSERT ON order_chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public._notify_order_message();
