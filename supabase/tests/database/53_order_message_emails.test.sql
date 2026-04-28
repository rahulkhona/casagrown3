BEGIN;
SELECT plan(4);

-- 1. Setup
INSERT INTO auth.users (id, email, instance_id, aud, role, created_at, updated_at)
VALUES
  ('ff000000-0000-0000-0000-000000000b01', 'chatbuyer@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now()),
  ('ff000000-0000-0000-0000-000000000b02', 'chatseller@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, email, full_name)
VALUES
  ('ff000000-0000-0000-0000-000000000b01', 'chatbuyer@test.local', 'Chat Buyer'),
  ('ff000000-0000-0000-0000-000000000b02', 'chatseller@test.local', 'Chat Seller')
ON CONFLICT (id) DO NOTHING;

INSERT INTO market_booths (owner_id, name, description)
VALUES ('ff000000-0000-0000-0000-000000000b02', 'Test Chat Booth', 'Test')
ON CONFLICT (owner_id) DO NOTHING;

INSERT INTO market_products (id, seller_id, name, price_usd, inventory, market_date)
VALUES ('ff000000-0000-0000-0000-000000000c01', 'ff000000-0000-0000-0000-000000000b02', 'Test Roses', 10.00, 10, CURRENT_DATE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO market_orders (id, buyer_id, seller_id, booth_id, product_id, product_name, status, quantity, total_usd, unit_price_usd, subtotal_usd, fulfillment_type)
VALUES (
  'ff000000-0000-0000-0000-000000000d01',
  'ff000000-0000-0000-0000-000000000b01', 'ff000000-0000-0000-0000-000000000b02',
  (SELECT id FROM market_booths WHERE owner_id = 'ff000000-0000-0000-0000-000000000b02'),
  'ff000000-0000-0000-0000-000000000c01', 'Test Roses', 'pending', 1, 10.00, 10.00, 10.00, 'pickup'
) ON CONFLICT (id) DO NOTHING;

-- 2. Mock _send_notification_email to capture calls
CREATE TEMP TABLE email_mock_log (
  type text,
  recipient jsonb,
  data jsonb,
  created_at timestamptz DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_notify_market_chat ON order_chat_messages;
DROP FUNCTION IF EXISTS public._send_notification_email(text, jsonb, jsonb);

CREATE OR REPLACE FUNCTION public._send_notification_email(
  p_type text,
  p_recipients jsonb,
  p_payload jsonb
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO email_mock_log (type, recipient, data) VALUES (p_type, p_recipients, p_payload);
END;
$$;

CREATE OR REPLACE FUNCTION public._notify_order_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order RECORD;
  v_other_id uuid;
  v_other_email text;
  v_other_name text;
  v_sender_name text;
  v_last_sent timestamptz;
BEGIN
  SELECT * INTO v_order FROM market_orders WHERE id = NEW.order_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

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

-- Create an order for testing
-- Test 1: Normal message triggers email
INSERT INTO order_chat_messages (order_id, sender_id, content, created_at)
VALUES ('ff000000-0000-0000-0000-000000000d01', 'ff000000-0000-0000-0000-000000000b01', 'Hello, is this available?', now() - interval '5 minutes');

-- Test 2: Second normal message within 30 min does NOT trigger email (cooldown)
INSERT INTO order_chat_messages (order_id, sender_id, content, created_at)
VALUES ('ff000000-0000-0000-0000-000000000d01', 'ff000000-0000-0000-0000-000000000b01', 'Another normal message immediately after', now() - interval '4 minutes');

SELECT diag('ROWS FOUND FOR BUYER: ' || (SELECT count(*) FROM order_chat_messages WHERE order_id = 'ff000000-0000-0000-0000-000000000d01' AND sender_id = 'ff000000-0000-0000-0000-000000000b01')::text);
SELECT diag('LATEST TIME FOR BUYER: ' || coalesce((SELECT created_at FROM order_chat_messages WHERE order_id = 'ff000000-0000-0000-0000-000000000d01' AND sender_id = 'ff000000-0000-0000-0000-000000000b01' ORDER BY created_at DESC LIMIT 1 OFFSET 1)::text, 'null'));

-- Test 3: Dispute bypasses cooldown
INSERT INTO order_chat_messages (order_id, sender_id, content, created_at)
VALUES ('ff000000-0000-0000-0000-000000000d01', 'ff000000-0000-0000-0000-000000000b01', '⚠️ Dispute filed: Missing item', now() - interval '3 minutes');

-- Test 4: ETA bypasses cooldown
INSERT INTO order_chat_messages (order_id, sender_id, content, created_at)
VALUES ('ff000000-0000-0000-0000-000000000d01', 'ff000000-0000-0000-0000-000000000b02', 'I''m on my way! ETA: 10 mins', now() - interval '2 minutes');

SELECT diag( 'EMAIL LOG DUMP: ' || coalesce((SELECT json_agg(data) FROM email_mock_log)::text, 'empty') );

-- Asserts
SELECT results_eq(
  $$ SELECT count(*) FROM email_mock_log WHERE data->>'messagePreview' = 'Hello, is this available?' $$,
  $$ VALUES (1::bigint) $$,
  'First normal message should trigger an email'
);

SELECT results_eq(
  $$ SELECT count(*) FROM email_mock_log WHERE data->>'messagePreview' = 'Another normal message immediately after' $$,
  $$ VALUES (0::bigint) $$,
  'Second normal message within cooldown should NOT trigger an email'
);

SELECT results_eq(
  $$ SELECT count(*) FROM email_mock_log WHERE data->>'messagePreview' = '⚠️ Dispute filed: Missing item' $$,
  $$ VALUES (1::bigint) $$,
  'Dispute message should bypass cooldown and trigger an email'
);

SELECT results_eq(
  $$ SELECT count(*) FROM email_mock_log WHERE data->>'messagePreview' = 'I''m on my way! ETA: 10 mins' $$,
  $$ VALUES (1::bigint) $$,
  'ETA message should bypass cooldown and trigger an email'
);

SELECT * FROM finish();
ROLLBACK;
