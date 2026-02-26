-- Postgres trigger that fires on completed redemptions
-- Calls the send-push-notification edge function via pg_net to notify the user
-- NOTE: For production, replace the hardcoded URL and key with vault references.

CREATE OR REPLACE FUNCTION notify_user_on_redemption()
RETURNS trigger AS $$
BEGIN
    -- Fire-and-forget HTTP call to the send-push-notification edge function
    PERFORM net.http_post(
        url := 'http://host.docker.internal:54321/functions/v1/send-push-notification',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
        ),
        body := jsonb_build_object(
            'userIds', jsonb_build_array(NEW.user_id),
            'title', 'Redemption Complete!',
            'body', 'Your redemption for ' || COALESCE(NEW.metadata->>'brand_name', NEW.metadata->>'organization', 'a gift card') || ' has been successfully processed.',
            'url', '/transaction-history',
            'tag', 'redemption-' || NEW.id
        )
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_user_on_redemption ON redemptions;
CREATE TRIGGER trg_notify_user_on_redemption
    AFTER UPDATE ON redemptions
    FOR EACH ROW
    WHEN (NEW.status = 'completed' AND OLD.status != 'completed')
    EXECUTE FUNCTION notify_user_on_redemption();
