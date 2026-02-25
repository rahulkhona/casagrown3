-- Postgres trigger that fires on new posts that are made on behalf of someone
-- Calls the send-push-notification edge function via pg_net to notify the delegator
-- NOTE: For production, replace the hardcoded URL and key with vault references.

CREATE OR REPLACE FUNCTION notify_delegator_on_post()
RETURNS trigger AS $$
BEGIN
    IF NEW.on_behalf_of IS NOT NULL THEN
        -- Fire-and-forget HTTP call to the send-push-notification edge function
        PERFORM net.http_post(
            url := 'http://api.localhost:54321/functions/v1/send-push-notification',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
            ),
            body := jsonb_build_object(
                'userIds', jsonb_build_array(NEW.on_behalf_of),
                'title', 'New Delegated Post',
                'body', 'Your delegate just published a new post for ' || COALESCE(NEW.title, 'an item') || ' on your behalf.',
                'url', '/post/' || NEW.id,
                'tag', 'new-delegated-post-' || NEW.id
            )
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_delegator_on_post ON posts;
CREATE TRIGGER trg_notify_delegator_on_post
    AFTER INSERT ON posts
    FOR EACH ROW
    WHEN (NEW.on_behalf_of IS NOT NULL)
    EXECUTE FUNCTION notify_delegator_on_post();
