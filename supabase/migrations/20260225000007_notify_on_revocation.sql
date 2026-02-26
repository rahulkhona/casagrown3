-- Migration: Trigger to fire push notifications when delegation is revoked
-- and there are active posts/orders that are still going to use the snapshot split.

CREATE OR REPLACE FUNCTION public.handle_delegation_revocation()
RETURNS trigger AS $$
DECLARE
  v_active_posts_count integer;
  v_delegator_name text;
  v_delegate_name text;
BEGIN
  -- Only act if status changed to 'revoked'
  IF NEW.status = 'revoked' AND OLD.status != 'revoked' THEN
    
    -- Check if delegate has any active posts on behalf of this delegator
    SELECT count(*)
    INTO v_active_posts_count
    FROM posts
    WHERE author_id = NEW.delegatee_id
      AND on_behalf_of = NEW.delegator_id
      AND status = 'active';

    IF v_active_posts_count > 0 THEN
      -- Get names for notifications
      SELECT full_name INTO v_delegator_name FROM profiles WHERE id = NEW.delegator_id;
      SELECT full_name INTO v_delegate_name FROM profiles WHERE id = NEW.delegatee_id;

      -- 1. Notify Delegator
      INSERT INTO notifications (user_id, content, link_url)
      VALUES (
        NEW.delegator_id,
        'You revoked your delegation to ' || COALESCE(v_delegate_name, 'someone') || '. Note: Any active posts they made for your produce will still use the ' || NEW.delegate_pct || '% split when sold.',
        '/profile'
      );

      -- 2. Notify Delegate
      INSERT INTO notifications (user_id, content, link_url)
      VALUES (
        NEW.delegatee_id,
        COALESCE(v_delegator_name, 'Someone') || ' revoked your seller delegation. Your active posts for their produce will remain, but you cannot make new ones. The original ' || NEW.delegate_pct || '% split will be honored for existing sales.',
        '/profile'
      );
    END IF;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_on_delegation_revoked ON public.delegations;

CREATE TRIGGER trg_notify_on_delegation_revoked
  AFTER UPDATE ON public.delegations
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_delegation_revocation();

