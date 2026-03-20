-- ============================================================================
-- Migration: Notify buyers when a booth reopens during market hours
--
-- Trigger on market_booths.is_open: when is_open changes from false→true AND
-- the market is currently open, send push + in-app notifications to users who
-- have product_reminders for products in this booth, then delete the reminders.
-- ============================================================================

CREATE OR REPLACE FUNCTION trg_booth_open_notify_reminders()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_settings      RECORD;
  v_schedule      RECORD;
  v_now_dow       INTEGER;
  v_now_time      TEXT;
  v_booth_name    TEXT;
  v_reminder      RECORD;
  v_user_ids      UUID[];
  v_reminder_ids  UUID[];
  v_product_names TEXT[];
  v_user_id       UUID;
  v_names         TEXT[];
  v_body          TEXT;
  v_count         INTEGER;
BEGIN
  -- Only fire when is_open changes from false → true
  IF OLD.is_open = true OR NEW.is_open = false THEN
    RETURN NEW;
  END IF;

  -- Check if market is currently open
  SELECT * INTO v_settings FROM market_settings WHERE id = true;

  IF v_settings IS NULL OR NOT v_settings.market_never_closes THEN
    v_now_dow  := EXTRACT(DOW FROM now() AT TIME ZONE 'America/Los_Angeles')::INTEGER;
    v_now_time := to_char(now() AT TIME ZONE 'America/Los_Angeles', 'HH24:MI');

    SELECT * INTO v_schedule
    FROM market_schedule_policies
    WHERE day_of_week = v_now_dow AND is_enabled;

    -- Market not open today
    IF v_schedule IS NULL THEN
      RETURN NEW;
    END IF;

    -- Outside market hours
    IF v_now_time < v_schedule.open_time OR v_now_time >= v_schedule.close_time THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Market is open. Find product reminders for this booth's products.
  v_booth_name := COALESCE(NEW.name, 'A booth');

  -- Collect all reminders for products owned by this booth's owner
  SELECT
    array_agg(DISTINCT pr.user_id),
    array_agg(pr.id)
  INTO v_user_ids, v_reminder_ids
  FROM product_reminders pr
  JOIN market_products mp ON mp.id = pr.product_id
  WHERE mp.seller_id = NEW.owner_id;

  -- No reminders → nothing to do
  IF v_user_ids IS NULL OR array_length(v_user_ids, 1) = 0 THEN
    RETURN NEW;
  END IF;

  -- Send per-user notifications with product names
  FOR v_user_id IN SELECT DISTINCT unnest(v_user_ids)
  LOOP
    -- Get product names for this user
    SELECT array_agg(mp.name)
    INTO v_names
    FROM product_reminders pr
    JOIN market_products mp ON mp.id = pr.product_id
    WHERE pr.user_id = v_user_id
      AND mp.seller_id = NEW.owner_id;

    v_count := COALESCE(array_length(v_names, 1), 0);

    IF v_count = 1 THEN
      v_body := v_booth_name || ' just opened! ' || v_names[1] || ' is now available.';
    ELSIF v_count <= 3 THEN
      v_body := v_booth_name || ' just opened! ' || array_to_string(v_names, ', ') || ' are now available.';
    ELSE
      v_body := v_booth_name || ' just opened! ' || v_count || ' items you saved are now available.';
    END IF;

    -- In-app notification
    INSERT INTO notifications (user_id, content, link_url)
    VALUES (v_user_id, '🌱 ' || v_body, '/market/booth/' || NEW.id);
  END LOOP;

  -- Bulk push to all users at once
  PERFORM send_push_via_edge(
    v_user_ids,
    '🌱 ' || v_booth_name || ' is open!',
    'Items you saved are now available. Shop before they sell out!',
    '/market/booth/' || NEW.id,
    'booth-open-' || NEW.id
  );

  -- Delete fired reminders
  DELETE FROM product_reminders
  WHERE id = ANY(v_reminder_ids);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Booth open notify failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- Trigger: fires only when is_open column is updated
DROP TRIGGER IF EXISTS trg_booth_open_notify ON market_booths;
CREATE TRIGGER trg_booth_open_notify
  AFTER UPDATE OF is_open ON market_booths
  FOR EACH ROW
  EXECUTE FUNCTION trg_booth_open_notify_reminders();
