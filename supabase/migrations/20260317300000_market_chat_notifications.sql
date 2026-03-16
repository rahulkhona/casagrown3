-- ============================================================================
-- Migration: Market Chat Push Notifications
--
-- Adds a DB trigger on order_chat_messages to call the new
-- notify-on-market-message edge function for push notifications.
-- ============================================================================

-- Trigger function: fires on INSERT into order_chat_messages
CREATE OR REPLACE FUNCTION trg_notify_market_chat_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Fire the edge function via pg_net
  PERFORM net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/notify-on-market-message',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := jsonb_build_object(
      'messageId', NEW.id,
      'orderId', NEW.order_id,
      'senderId', NEW.sender_id
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Market chat notify failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_market_chat ON order_chat_messages;
CREATE TRIGGER trg_notify_market_chat
  AFTER INSERT ON order_chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION trg_notify_market_chat_message();
