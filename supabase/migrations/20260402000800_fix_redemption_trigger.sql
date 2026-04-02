-- Fix redemption pipeline reliability
-- 1. Fix trg_redemption_notify to not reference non-existent is_auto column
-- 2. Fix get_transaction_log to LEFT JOIN redemption_merchandize for market redemptions

-- Fix 1: trg_redemption_notify
CREATE OR REPLACE FUNCTION trg_redemption_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_item_name TEXT;
  v_item_type TEXT;
  v_is_auto BOOLEAN;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  SELECT name, type::text INTO v_item_name, v_item_type
  FROM redemption_merchandize WHERE id = NEW.item_id;

  -- Fallback to metadata for market redemptions (no item_id)
  IF v_item_name IS NULL THEN
    v_item_name := NEW.metadata->>'brand_name';
  END IF;

  -- Check if this was an auto redemption from metadata
  v_is_auto := COALESCE((NEW.metadata->>'source') = 'auto_payout', false);

  IF NEW.status = 'completed' THEN
    IF v_is_auto THEN
      PERFORM notify_market_event(
        NEW.user_id,
        '⚡ Auto-withdrawal complete: ' || coalesce(v_item_name, 'Your withdrawal') || ' is ready!',
        '/earnings'
      );
    ELSE
      PERFORM notify_market_event(
        NEW.user_id,
        '🎁 Withdrawal complete: ' || coalesce(v_item_name, 'Your withdrawal') || ' is ready!',
        '/earnings'
      );
    END IF;
  ELSIF NEW.status = 'failed' THEN
    PERFORM notify_market_event(
      NEW.user_id,
      '❌ Withdrawal failed for ' || coalesce(v_item_name, 'your request') || '. Please try again.',
      '/earnings/payout'
    );
  END IF;

  RETURN NEW;
END;
$$;
