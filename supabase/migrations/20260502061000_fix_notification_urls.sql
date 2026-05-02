-- Fix notification URLs in trg_redemption_notify
-- /earnings/redeem does not exist, should be /earnings

CREATE OR REPLACE FUNCTION trg_redemption_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_item_name TEXT;
  v_item_type TEXT;
  v_is_auto   BOOLEAN;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  SELECT name, type::text INTO v_item_name, v_item_type
  FROM redemption_merchandize WHERE id = NEW.item_id;

  v_is_auto := COALESCE((NEW.metadata->>'source') = 'auto_payout', false);

  IF NEW.status = 'completed' THEN
    IF v_is_auto THEN
      PERFORM notify_market_event(NEW.user_id, '⚡ Auto-withdrawal complete: ' || coalesce(v_item_name, 'Your withdrawal') || ' is ready!', '/earnings', true, true);
    ELSE
      PERFORM notify_market_event(NEW.user_id, '🎁 Withdrawal complete: ' || coalesce(v_item_name, 'Your withdrawal') || ' is ready!', '/earnings', true, true);
    END IF;
  ELSIF NEW.status = 'failed' THEN
    PERFORM notify_market_event(NEW.user_id, '❌ Withdrawal failed for ' || coalesce(v_item_name, 'your request') || '. Please try again.', '/earnings', true, false);
  ELSIF NEW.status = 'cancelled' THEN
    PERFORM notify_market_event(
      NEW.user_id,
      '❌ Your payout request for $' || (NEW.point_cost / 100.0) || ' was cancelled by administration.' || CHR(10) || 'Reason: ' || COALESCE(NEW.failed_reason, 'No reason provided.'),
      '/earnings',
      true,
      true
    );
  END IF;

  RETURN NEW;
END;
$$;
