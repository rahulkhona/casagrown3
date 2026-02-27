-- Postgres trigger that fires on completed orders where the post was made on behalf of someone
-- Calls the send-push-notification edge function via pg_net to notify the delegator
-- NOTE: For production, replace the hardcoded URL and key with vault references.

CREATE OR REPLACE FUNCTION notify_delegator_on_order()
RETURNS trigger AS $$
DECLARE
    v_on_behalf_of UUID;
BEGIN
    -- Check if the order's post was made on behalf of someone
    SELECT p.on_behalf_of INTO v_on_behalf_of
    FROM conversations c
    JOIN posts p ON p.id = c.post_id
    WHERE c.id = NEW.conversation_id;

    IF v_on_behalf_of IS NOT NULL THEN
        -- Fire-and-forget HTTP call to the send-push-notification edge function
        PERFORM net.http_post(
            url := 'http://host.docker.internal:54321/functions/v1/send-push-notification',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
            ),
            body := jsonb_build_object(
                'userIds', jsonb_build_array(v_on_behalf_of),
                'title', 'Delegated Sale Complete',
                'body', 'An order for your delegated post ' || COALESCE(NEW.product, 'an item') || ' has just been completed.',
                'url', '/transaction-history',
                'tag', 'delegated-order-' || NEW.id
            )
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_delegator_on_order ON orders;
CREATE TRIGGER trg_notify_delegator_on_order
    AFTER UPDATE ON orders
    FOR EACH ROW
    WHEN (NEW.status = 'completed' AND OLD.status != 'completed')
    EXECUTE FUNCTION notify_delegator_on_order();
