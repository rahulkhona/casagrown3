-- Fix helper notification messages to distinguish between:
-- 1. Owner revoking helper → notify helper "your access was revoked"
-- 2. Helper leaving voluntarily → notify owner "helper has left"

-- Allow 'left' status in booth_helpers
ALTER TABLE booth_helpers DROP CONSTRAINT IF EXISTS booth_helpers_status_check;
ALTER TABLE booth_helpers ADD CONSTRAINT booth_helpers_status_check
  CHECK (status = ANY (ARRAY['pending', 'accepted', 'revoked', 'left']));

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
        -- Owner revoked the helper — notify the helper
        PERFORM notify_market_event(
          NEW.helper_id,
          '⚠️ Your helper access to "' || v_booth_name || '" has been revoked by ' || coalesce(v_owner_name, 'the booth owner') || '.',
          '/helping'
        );
        -- Confirm to owner
        PERFORM notify_market_event(
          v_owner_id,
          '✅ Helper access revoked for ' || coalesce(v_helper_name, 'a helper') || ' from "' || v_booth_name || '".',
          '/my-stands'
        );

      WHEN 'left' THEN
        -- Helper left voluntarily — notify the booth owner
        PERFORM notify_market_event(
          v_owner_id,
          '👋 ' || coalesce(v_helper_name, 'A helper') || ' has left your booth "' || v_booth_name || '".',
          '/my-stands'
        );
        -- Confirm to helper
        PERFORM notify_market_event(
          NEW.helper_id,
          '👋 You have left "' || v_booth_name || '". You can rejoin anytime with a new passcode.',
          '/helping'
        );

      ELSE NULL;
    END CASE;
  END IF;

  RETURN NEW;
END;
$$;
