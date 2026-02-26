-- Notify Delegator/Delegatee on Delegation Revocation/Rejection
--
-- Triggers when a delegations row is updated to 'revoked'.
-- Sends a push notification indicating a change in delegation status.

CREATE OR REPLACE FUNCTION notify_on_delegation_revoked()
RETURNS TRIGGER AS $$
DECLARE
    service_role_key text;
    push_title text;
    push_body text;
    push_payload jsonb;
    request_id bigint;
BEGIN
    service_role_key := COALESCE(
        current_setting('app.settings.service_role_key', true),
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
    );
    
    -- Only trigger when the status transitions to 'revoked'
    IF NEW.status = 'revoked' AND OLD.status != 'revoked' THEN
        
        IF OLD.status = 'pending_pairing' THEN
            push_title := 'Delegation Rejected';
            push_body := 'The delegation request was rejected or cancelled.';
        ELSE
            push_title := 'Delegation Revoked';
            push_body := 'An active delegation relationship has been revoked.';
        END IF;

        -- We want to notify both the delegator and the delegatee (if the delegatee was already assigned)
        -- In a robust system we'd exclude the user who actually did the revoking (if known via auth.uid() or updated_by),
        -- For now, if someone's delegate or delegator cancels, we notify them.

        push_payload := jsonb_build_object(
            'userIds', (
                SELECT jsonb_agg(id) 
                FROM (
                    SELECT NEW.delegator_id AS id
                    UNION 
                    SELECT NEW.delegatee_id AS id WHERE NEW.delegatee_id IS NOT NULL
                ) AS users
            ),
            'title', push_title,
            'body', push_body,
            'url', '/delegate'
        );

        -- Don't send if payload has no userIds (this shouldn't happen)
        IF jsonb_array_length(push_payload->'userIds') > 0 THEN
            SELECT net.http_post(
                url := COALESCE(current_setting('app.settings.edge_functions_base_url', true), 'http://host.docker.internal:54321/functions/v1') || '/send-push-notification',
                headers := jsonb_build_object(
                    'Content-Type', 'application/json',
                    'Authorization', 'Bearer ' || service_role_key
                ),
                body := push_payload
            ) INTO request_id;
            
            RAISE LOG 'notify_on_delegation_revoked: Dispatched push notification (request_id: %)', request_id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists (to allow re-running this migration)
DROP TRIGGER IF EXISTS trigger_notify_on_delegation_revoked ON delegations;

CREATE TRIGGER trigger_notify_on_delegation_revoked
    AFTER UPDATE ON delegations
    FOR EACH ROW
    EXECUTE FUNCTION notify_on_delegation_revoked();
