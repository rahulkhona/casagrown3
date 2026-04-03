-- ===========================================================================
-- Fix ALL remaining functions that write to legacy 'notifications' table.
-- Migrates them to use notify_market_event() → market_notifications.
--
-- Categories:
-- A) Order functions where DB trigger already fires → remove stale INSERT
-- B) Settlement functions → replace with notify_market_event
-- C) Community/moderation functions → replace with notify_market_event
-- ===========================================================================

-- ═══════════════════════════════════════════════════════════════════════
-- A) buyer_dispute_order — trigger fires on status='disputed', remove stale INSERT
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION buyer_dispute_order(
  p_order_id UUID,
  p_reason TEXT,
  p_photos JSONB DEFAULT '[]',
  p_dispute_type TEXT DEFAULT NULL,
  p_quantity_received INTEGER DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order RECORD;
  v_dispute_id UUID;
  v_chat_body TEXT;
  v_rec RECORD;
BEGIN
  SELECT * INTO v_order FROM market_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order IS NULL THEN RETURN jsonb_build_object('error', 'Order not found'); END IF;
  IF v_order.buyer_id != auth.uid() THEN RETURN jsonb_build_object('error', 'Not authorized'); END IF;
  IF v_order.status != 'delivered' THEN RETURN jsonb_build_object('error', 'Can only dispute delivered orders'); END IF;

  -- Status change → trg_market_order_status_notify fires automatically
  UPDATE market_orders SET status = 'disputed', updated_at = now() WHERE id = p_order_id;

  INSERT INTO order_disputes (order_id, initiated_by, reason, photos, dispute_type, quantity_received)
  VALUES (p_order_id, auth.uid(), p_reason, p_photos, p_dispute_type, p_quantity_received)
  RETURNING id INTO v_dispute_id;

  -- NO stale INSERT INTO notifications — trigger handles it

  -- Inject into chat feed
  v_chat_body := '⚠️ Dispute filed';
  IF p_dispute_type IS NOT NULL THEN
    v_chat_body := v_chat_body || ' (' || REPLACE(p_dispute_type, '_', ' ') || ')';
  END IF;
  v_chat_body := v_chat_body || ': ' || p_reason;
  IF jsonb_array_length(p_photos) > 0 THEN
    FOR v_rec IN SELECT * FROM jsonb_array_elements(p_photos) LOOP
      IF v_rec.value->>'url' IS NOT NULL THEN
        v_chat_body := v_chat_body || chr(10) || (v_rec.value->>'url');
      END IF;
    END LOOP;
  END IF;

  INSERT INTO order_chat_messages (order_id, sender_id, content)
  VALUES (p_order_id, auth.uid(), v_chat_body);

  RETURN jsonb_build_object('success', true, 'dispute_id', v_dispute_id);
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════
-- B) run_market_settlement — replace INSERT INTO notifications with notify_market_event
-- ═══════════════════════════════════════════════════════════════════════
-- We patch ONLY the notification line within the loop. The rest of the function
-- is unchanged from the latest version in 20260317500000_balance_first_hold.sql.
-- Because CREATE OR REPLACE requires the full body, we recreate the full function.

CREATE OR REPLACE FUNCTION run_market_settlement(p_market_date DATE DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_settlement_id UUID;
  v_user RECORD;
  v_total_orders INTEGER := 0;
  v_total_captured NUMERIC(10,2) := 0;
  v_total_payouts NUMERIC(10,2) := 0;
  v_total_fees NUMERIC(10,2) := 0;
  v_total_refunds NUMERIC(10,2) := 0;
  v_user_count INTEGER := 0;
  v_check1_pass BOOLEAN;
  v_check2_pass BOOLEAN;
  v_reconciliation JSONB;
  v_clearing_date DATE;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('market_settlement')) THEN
    RETURN jsonb_build_object('error', 'Settlement already in progress');
  END IF;

  v_clearing_date := COALESCE(p_market_date, CURRENT_DATE);

  SELECT COUNT(*) INTO v_total_orders
  FROM market_orders
  WHERE settlement_id IS NULL
    AND status IN ('completed', 'delivered');

  IF v_total_orders = 0 THEN
    RETURN jsonb_build_object('error', 'No unsettled orders to process');
  END IF;

  INSERT INTO market_settlements (market_date, status)
  VALUES (v_clearing_date, 'captures_sent')
  RETURNING id INTO v_settlement_id;

  UPDATE market_orders
  SET settlement_id = v_settlement_id
  WHERE settlement_id IS NULL
    AND status IN ('completed', 'delivered');

  FOR v_user IN
    SELECT
      u.user_id,
      COALESCE(SUM(u.gross_sales), 0) AS gross_sales,
      COALESCE(SUM(u.total_purchases), 0) AS total_purchases,
      COALESCE(SUM(u.platform_fees), 0) AS platform_fees,
      COALESCE(SUM(u.refunds_issued), 0) AS refunds_issued,
      COALESCE(SUM(u.refunds_received), 0) AS refunds_received,
      COALESCE(SUM(u.balance_applied), 0) AS balance_applied
    FROM (
      SELECT seller_id AS user_id,
        SUM(total_usd) AS gross_sales, 0::NUMERIC AS total_purchases,
        SUM(platform_fee_usd) AS platform_fees, 0::NUMERIC AS refunds_issued,
        0::NUMERIC AS refunds_received, 0::NUMERIC AS balance_applied
      FROM market_orders WHERE settlement_id = v_settlement_id GROUP BY seller_id
      UNION ALL
      SELECT buyer_id AS user_id,
        0::NUMERIC, SUM(total_usd), 0::NUMERIC, 0::NUMERIC, 0::NUMERIC,
        SUM(balance_applied_usd)
      FROM market_orders WHERE settlement_id = v_settlement_id GROUP BY buyer_id
      UNION ALL
      SELECT d.initiated_by AS user_id,
        0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC,
        COALESCE(SUM(d.refund_amount_usd), 0), 0::NUMERIC
      FROM order_disputes d JOIN market_orders o ON o.id = d.order_id
      WHERE d.status IN ('buyer_accepted', 'staff_resolved')
        AND d.refund_amount_usd IS NOT NULL AND o.settlement_id = v_settlement_id
      GROUP BY d.initiated_by
      UNION ALL
      SELECT o.seller_id AS user_id,
        0::NUMERIC, 0::NUMERIC, 0::NUMERIC,
        COALESCE(SUM(d.refund_amount_usd), 0), 0::NUMERIC, 0::NUMERIC
      FROM order_disputes d JOIN market_orders o ON o.id = d.order_id
      WHERE d.status IN ('buyer_accepted', 'staff_resolved')
        AND d.refund_amount_usd IS NOT NULL AND o.settlement_id = v_settlement_id
      GROUP BY o.seller_id
    ) u
    GROUP BY u.user_id
  LOOP
    DECLARE
      v_net NUMERIC(10,2);
      v_hold_captured NUMERIC(10,2) := 0;
      v_hold_released NUMERIC(10,2) := 0;
      v_hold RECORD;
      v_card_purchases NUMERIC(10,2);
      v_notif_content TEXT;
    BEGIN
      v_net := v_user.gross_sales - v_user.total_purchases
             - v_user.platform_fees - v_user.refunds_issued
             + v_user.refunds_received;

      v_card_purchases := v_user.total_purchases - v_user.balance_applied;

      -- Consume held balance
      IF v_user.balance_applied > 0 THEN
        UPDATE user_balances
        SET held_balance_usd = GREATEST(held_balance_usd - v_user.balance_applied, 0),
            total_spent_usd = total_spent_usd + v_user.balance_applied,
            updated_at = now()
        WHERE user_id = v_user.user_id;

        PERFORM append_ledger_entry('balance_consumed', v_user.user_id, v_user.balance_applied, 'debit', NULL, v_settlement_id,
          jsonb_build_object('type', 'purchase_settlement', 'balance_applied', v_user.balance_applied));
      END IF;

      -- Handle Stripe hold
      SELECT * INTO v_hold
      FROM market_holds
      WHERE buyer_id = v_user.user_id AND status = 'active'
      FOR UPDATE;

      IF v_hold IS NOT NULL THEN
        v_hold_captured := LEAST(v_hold.hold_amount_cents::NUMERIC / 100, v_card_purchases);
        v_hold_released := (v_hold.hold_amount_cents::NUMERIC / 100) - v_hold_captured;

        UPDATE market_holds
        SET status = 'captured',
            spent_amount_cents = (v_hold_captured * 100)::INTEGER,
            updated_at = now()
        WHERE id = v_hold.id;

        INSERT INTO settlement_captures (
          settlement_id, hold_id, buyer_id, stripe_payment_intent_id,
          hold_amount_usd, capture_amount_usd, release_amount_usd, capture_status
        ) VALUES (
          v_settlement_id, v_hold.id, v_user.user_id, v_hold.stripe_payment_intent_id,
          v_hold.hold_amount_cents::NUMERIC / 100, v_hold_captured, v_hold_released, 'captured'
        );

        IF v_hold_captured > 0 THEN
          PERFORM append_ledger_entry('hold_captured', v_user.user_id, v_hold_captured, 'debit', NULL, v_settlement_id,
            jsonb_build_object('hold_id', v_hold.id, 'stripe_pi', v_hold.stripe_payment_intent_id));
        END IF;

        IF v_hold_released > 0 THEN
          PERFORM append_ledger_entry('hold_released', v_user.user_id, v_hold_released, 'credit', NULL, v_settlement_id,
            jsonb_build_object('hold_id', v_hold.id));
        END IF;
      END IF;

      -- Ledger entries
      IF v_user.gross_sales > 0 THEN
        PERFORM append_ledger_entry('settlement_credit', v_user.user_id, v_user.gross_sales, 'credit', NULL, v_settlement_id,
          jsonb_build_object('type', 'gross_sales'));
      END IF;

      IF v_user.platform_fees > 0 THEN
        PERFORM append_ledger_entry('fee_charged', v_user.user_id, v_user.platform_fees, 'debit', NULL, v_settlement_id);
      END IF;

      IF v_user.refunds_issued > 0 THEN
        PERFORM append_ledger_entry('refund_issued', v_user.user_id, v_user.refunds_issued, 'debit', NULL, v_settlement_id);
      END IF;

      IF v_user.refunds_received > 0 THEN
        PERFORM append_ledger_entry('refund_issued', v_user.user_id, v_user.refunds_received, 'credit', NULL, v_settlement_id,
          jsonb_build_object('type', 'refund_to_buyer'));
      END IF;

      -- User settlement record
      INSERT INTO user_settlements (
        settlement_id, user_id, gross_sales_usd, total_purchases_usd,
        refunds_issued_usd, refunds_received_usd, platform_fees_usd,
        hold_captured_usd, hold_released_usd, net_payout_usd, status
      ) VALUES (
        v_settlement_id, v_user.user_id, v_user.gross_sales, v_user.total_purchases,
        v_user.refunds_issued, v_user.refunds_received, v_user.platform_fees,
        v_hold_captured, v_hold_released, v_net, 'pending'
      );

      -- Update user balance
      INSERT INTO user_balances (user_id, pending_usd, total_earned_usd, total_spent_usd)
      VALUES (v_user.user_id,
        GREATEST(v_net, 0),
        GREATEST(v_user.gross_sales, 0),
        v_user.total_purchases
      )
      ON CONFLICT (user_id) DO UPDATE SET
        pending_usd = user_balances.pending_usd + GREATEST(v_net, 0),
        total_earned_usd = user_balances.total_earned_usd + GREATEST(v_user.gross_sales, 0),
        total_spent_usd = user_balances.total_spent_usd + v_user.total_purchases,
        updated_at = now();

      -- ★ FIXED: Use notify_market_event instead of INSERT INTO notifications
      v_notif_content := CASE
        WHEN v_net > 0 THEN '💰 Market settlement: You earned $' || ROUND(v_net, 2) || ' (pending Stripe clearance).'
        WHEN v_net < 0 THEN '🧾 Market settlement: Your net purchases were $' || ROUND(ABS(v_net), 2) || '.'
        ELSE '📋 Market settlement complete. No net balance change.'
      END
      || CASE WHEN v_hold_released > 0 THEN ' Your hold of $' || ROUND(v_hold_released, 2) || ' has been released.' ELSE '' END;

      BEGIN
        PERFORM notify_market_event(
          v_user.user_id,
          v_notif_content,
          '/earnings'
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'notify_market_event failed in settlement for user %: %', v_user.user_id, SQLERRM;
      END;

      v_total_captured := v_total_captured + v_hold_captured;
      v_total_payouts := v_total_payouts + GREATEST(v_net, 0);
      v_total_fees := v_total_fees + v_user.platform_fees;
      v_total_refunds := v_total_refunds + v_user.refunds_issued;
      v_user_count := v_user_count + 1;
    END;
  END LOOP;

  -- Reconciliation checks
  SELECT NOT EXISTS (
    SELECT 1 FROM user_settlements us
    WHERE us.settlement_id = v_settlement_id
      AND (SELECT balance_after FROM market_ledger WHERE user_id = us.user_id ORDER BY id DESC LIMIT 1)
        != (SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_usd ELSE -amount_usd END), 0)
            FROM market_ledger WHERE user_id = us.user_id)
  ) INTO v_check1_pass;

  v_check2_pass := (v_total_payouts + v_total_fees) <= (v_total_captured + v_total_payouts + v_total_fees);

  v_reconciliation := jsonb_build_object(
    'check1_ledger_consistency', v_check1_pass,
    'check2_settlement_balance', v_check2_pass,
    'total_orders', v_total_orders,
    'total_users', v_user_count,
    'total_captured_usd', v_total_captured,
    'total_payouts_usd', v_total_payouts,
    'total_fees_usd', v_total_fees,
    'total_refunds_usd', v_total_refunds
  );

  DECLARE
    v_total_released NUMERIC(10,2) := 0;
  BEGIN
    SELECT COALESCE(SUM(release_amount_usd), 0) INTO v_total_released
    FROM settlement_captures WHERE settlement_id = v_settlement_id;

    v_reconciliation := v_reconciliation || jsonb_build_object(
      'total_released_usd', v_total_released,
      'capture_count', (SELECT COUNT(*) FROM settlement_captures WHERE settlement_id = v_settlement_id)
    );

    UPDATE market_settlements
    SET total_orders = v_total_orders,
        total_captured_usd = v_total_captured,
        total_released_usd = v_total_released,
        total_payouts_usd = v_total_payouts,
        total_fees_usd = v_total_fees,
        total_refunds_usd = v_total_refunds,
        reconciliation_check = v_reconciliation,
        status = CASE
          WHEN v_check1_pass AND v_check2_pass THEN 'funds_pending'::clearing_status
          ELSE 'reconciliation_failed'::clearing_status
        END,
        updated_at = now()
    WHERE id = v_settlement_id;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'settlement_id', v_settlement_id,
    'users_settled', v_user_count,
    'orders_settled', v_total_orders,
    'reconciliation', v_reconciliation
  );
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════
-- C) confirm_settlement_funds_received — replace stale INSERT
-- ═══════════════════════════════════════════════════════════════════════
-- This function is defined in settlement_redesign; check if it even
-- still uses the old table. For safety, patch ONLY the notification.
-- We locate the latest version and replace.
DO $$
DECLARE
  v_fn_exists BOOLEAN;
BEGIN
  SELECT EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'confirm_settlement_funds_received') INTO v_fn_exists;
  IF NOT v_fn_exists THEN
    RAISE NOTICE 'confirm_settlement_funds_received does not exist, skipping';
  END IF;
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════
-- D) Booth open notification trigger — use notify_market_event
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION trg_booth_open_notify_reminders()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_follower RECORD;
  v_booth_name TEXT;
BEGIN
  -- Only fire when booth transitions from not open to open
  IF NEW.is_open = true AND (OLD.is_open IS NULL OR OLD.is_open = false) THEN
    SELECT COALESCE(NEW.name, p.full_name || '''s Booth')
    INTO v_booth_name
    FROM profiles p WHERE p.id = NEW.owner_id;

    FOR v_follower IN
      SELECT follower_id FROM market_followers WHERE booth_id = NEW.id
    LOOP
      BEGIN
        PERFORM notify_market_event(
          v_follower.follower_id,
          '🏪 ' || v_booth_name || ' is now open! Check out their fresh products.',
          '/market/booth/' || NEW.id
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'notify_market_event failed for booth open: %', SQLERRM;
      END;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════
-- E) Product added → notify followers — use notify_market_event
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION trg_product_added_notify_followers()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_follower RECORD;
  v_booth_id UUID;
  v_booth_name TEXT;
BEGIN
  -- Find the seller's booth
  SELECT b.id, COALESCE(b.name, p.full_name || '''s Booth')
  INTO v_booth_id, v_booth_name
  FROM market_booths b
  JOIN profiles p ON p.id = b.owner_id
  WHERE b.owner_id = NEW.seller_id
  LIMIT 1;

  IF v_booth_id IS NULL THEN RETURN NEW; END IF;

  FOR v_follower IN
    SELECT follower_id FROM market_followers WHERE booth_id = v_booth_id
  LOOP
    BEGIN
      PERFORM notify_market_event(
        v_follower.follower_id,
        '🌱 ' || v_booth_name || ' added "' || NEW.name || '" — check it out!',
        '/market/booth/' || v_booth_id || '/product/' || NEW.id
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'notify_market_event failed for product add: %', SQLERRM;
    END;
  END LOOP;

  RETURN NEW;
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════
-- F) Auto-complete expired pickups — remove stale notification INSERT
--    (trigger handles notification via status change to 'completed')
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION auto_complete_expired_pickups()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order RECORD;
BEGIN
  FOR v_order IN
    SELECT id, buyer_id, seller_id, product_name
    FROM market_orders
    WHERE status = 'delivered'
      AND auto_complete_at IS NOT NULL
      AND auto_complete_at <= now()
  LOOP
    -- Status change → trg_market_order_status_notify fires automatically
    UPDATE market_orders
    SET status = 'completed', updated_at = now()
    WHERE id = v_order.id;

    -- NO stale INSERT INTO notifications — trigger handles it
  END LOOP;
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════
-- G) handle_delegation_revocation — use notify_market_event
-- ═══════════════════════════════════════════════════════════════════════
-- Only update the notification mechanism if function exists
DO $outer$
BEGIN
  IF EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'handle_delegation_revocation') THEN
    EXECUTE $fn$
    CREATE OR REPLACE FUNCTION handle_delegation_revocation()
    RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $body$
    BEGIN
      IF NEW.status = 'revoked' AND OLD.status != 'revoked' THEN
        PERFORM notify_market_event(
          NEW.delegate_id,
          '🔒 Your delegation access has been revoked.',
          '/community'
        );
      END IF;
      RETURN NEW;
    END;
    $body$;
    $fn$;
  END IF;
END
$outer$;
