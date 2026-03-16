-- ============================================================================
-- Migration: Booth Helper Notifications
-- Triggers for helper status changes (accepted, revoked) to send
-- in-app, email, and push notifications using the existing
-- notify_market_event() infrastructure.
-- ============================================================================

-- Trigger: when a helper joins (INSERT with status='accepted'),
-- notify the booth owner that someone joined.
-- When status changes to 'revoked', notify the helper.
CREATE OR REPLACE FUNCTION trg_booth_helper_status_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_booth_name TEXT;
  v_owner_id   UUID;
  v_helper_name TEXT;
  v_owner_name  TEXT;
  v_passcode    TEXT;
BEGIN
  -- Get booth info
  SELECT name, owner_id, helper_passcode
  INTO v_booth_name, v_owner_id, v_passcode
  FROM market_booths WHERE id = NEW.booth_id;

  IF v_booth_name IS NULL THEN RETURN NEW; END IF;

  -- Get names
  SELECT full_name INTO v_helper_name FROM profiles WHERE id = NEW.helper_id;
  SELECT full_name INTO v_owner_name FROM profiles WHERE id = v_owner_id;

  -- Handle INSERT (new helper accepted)
  IF TG_OP = 'INSERT' AND NEW.status = 'accepted' THEN
    -- Notify booth owner: someone joined as helper
    PERFORM notify_market_event(
      v_owner_id,
      '🤝 ' || coalesce(v_helper_name, 'Someone') || ' joined your booth "' || v_booth_name || '" as a helper!',
      '/my-booth'
    );
    RETURN NEW;
  END IF;

  -- Handle UPDATE
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    CASE NEW.status
      WHEN 'accepted' THEN
        -- Helper re-accepted (after revocation)
        PERFORM notify_market_event(
          v_owner_id,
          '🤝 ' || coalesce(v_helper_name, 'Someone') || ' re-joined your booth "' || v_booth_name || '" as a helper!',
          '/my-booth'
        );

      WHEN 'revoked' THEN
        -- Notify helper they were revoked
        PERFORM notify_market_event(
          NEW.helper_id,
          '⚠️ Your helper access to "' || v_booth_name || '" has been revoked by ' || coalesce(v_owner_name, 'the booth owner') || '.',
          '/market'
        );
        -- Also notify owner for confirmation
        PERFORM notify_market_event(
          v_owner_id,
          '✅ Helper access revoked for ' || coalesce(v_helper_name, 'a helper') || ' from "' || v_booth_name || '".',
          '/my-booth'
        );

      ELSE NULL;
    END CASE;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger on both INSERT and UPDATE
DROP TRIGGER IF EXISTS trg_booth_helper_status ON booth_helpers;
CREATE TRIGGER trg_booth_helper_status
  AFTER INSERT OR UPDATE OF status ON booth_helpers
  FOR EACH ROW
  EXECUTE FUNCTION trg_booth_helper_status_notify();
