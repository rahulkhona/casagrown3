-- Postgres trigger that fires on new chat_messages inserts and calls the
-- notify-on-message edge function via pg_net to send push notifications.
--
-- All message types (including system messages for order/offer events)
-- trigger notifications — collapsing is handled by the tag per conversation.
--
-- NOTE: For production, replace the hardcoded URL and key with vault references:
--   url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url')
--          || '/functions/v1/notify-on-message'
--   'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets
--          WHERE name = 'service_role_key')

CREATE OR REPLACE FUNCTION notify_new_message()
RETURNS trigger AS $$
BEGIN
    -- Fire-and-forget HTTP call to the notify-on-message edge function
    PERFORM net.http_post(
        url := 'http://api.localhost:54321/functions/v1/notify-on-message',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
        ),
        body := jsonb_build_object(
            'messageId', NEW.id,
            'conversationId', NEW.conversation_id,
            'senderId', NEW.sender_id,
            'messageType', NEW.type::text
        )
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to chat_messages table (fires AFTER INSERT for each row)
DROP TRIGGER IF EXISTS trg_notify_new_message ON chat_messages;
CREATE TRIGGER trg_notify_new_message
    AFTER INSERT ON chat_messages
    FOR EACH ROW
    EXECUTE FUNCTION notify_new_message();
