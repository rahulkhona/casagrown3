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
    service_role_key := current_setting('app.settings.service_role_key', true);
    
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
                SELECT jsonb_agg(user_id) 
                FROM (
                    SELECT NEW.delegator_id AS user_id
                    UNION 
                    SELECT NEW.delegatee_id AS user_id WHERE NEW.delegatee_id IS NOT NULL
                ) AS users
            ),
            'title', push_title,
            'body', push_body,
            'url', '/delegate'
        );

        -- Don't send if payload has no userIds (this shouldn't happen)
        IF jsonb_array_length(push_payload->'userIds') > 0 THEN
            SELECT pg_net.http_post(
                url := current_setting('app.settings.edge_functions_base_url', true) || '/send-push-notification',
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
