-- ============================================================================
-- Migration: Fix settlement notification text + simple cron URL fixes
-- ============================================================================

SET search_path TO public, extensions;

-- ─── 1. Fix run_market_settlement notification text ──────────────────────────
-- Changes only lines 435-438: "Market settlement" → "Daily settlement"
-- Must re-create entire function since PG requires it.

DROP FUNCTION IF EXISTS run_market_settlement(date);

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
  FROM market_orders WHERE settlement_id IS NULL AND status IN ('completed', 'delivered');

  IF v_total_orders = 0 THEN
    RETURN jsonb_build_object('error', 'No unsettled orders to process');
  END IF;

  INSERT INTO market_settlements (market_date, status)
  VALUES (v_clearing_date, 'captures_sent') RETURNING id INTO v_settlement_id;

  UPDATE market_orders SET settlement_id = v_settlement_id
  WHERE settlement_id IS NULL AND status IN ('completed', 'delivered');

  FOR v_user IN
    SELECT u.user_id,
      COALESCE(SUM(u.gross_sales), 0) AS gross_sales,
      COALESCE(SUM(u.total_purchases), 0) AS total_purchases,
      COALESCE(SUM(u.platform_fees), 0) AS platform_fees,
      COALESCE(SUM(u.refunds_issued), 0) AS refunds_issued,
      COALESCE(SUM(u.refunds_received), 0) AS refunds_received,
      COALESCE(SUM(u.balance_applied), 0) AS balance_applied,
      COALESCE(SUM(u.credit_applied), 0) AS credit_applied
    FROM (
      SELECT seller_id AS user_id, SUM(total_usd) AS gross_sales, 0::NUMERIC AS total_purchases,
        SUM(platform_fee_usd) AS platform_fees, 0::NUMERIC AS refunds_issued,
        0::NUMERIC AS refunds_received, 0::NUMERIC AS balance_applied, 0::NUMERIC AS credit_applied
      FROM market_orders WHERE settlement_id = v_settlement_id GROUP BY seller_id
      UNION ALL
      SELECT buyer_id, 0::NUMERIC, SUM(total_usd), 0::NUMERIC, 0::NUMERIC, 0::NUMERIC,
        SUM(balance_applied_usd), SUM(credit_applied_usd)
      FROM market_orders WHERE settlement_id = v_settlement_id GROUP BY buyer_id
      UNION ALL
      SELECT d.initiated_by, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC,
        COALESCE(SUM(d.refund_amount_usd), 0), 0::NUMERIC, 0::NUMERIC
      FROM order_disputes d JOIN market_orders o ON o.id = d.order_id
      WHERE d.status IN ('buyer_accepted', 'staff_resolved') AND d.refund_amount_usd IS NOT NULL
        AND o.settlement_id = v_settlement_id GROUP BY d.initiated_by
      UNION ALL
      SELECT o.seller_id, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC,
        COALESCE(SUM(d.refund_amount_usd), 0), 0::NUMERIC, 0::NUMERIC, 0::NUMERIC
      FROM order_disputes d JOIN market_orders o ON o.id = d.order_id
      WHERE d.status IN ('buyer_accepted', 'staff_resolved') AND d.refund_amount_usd IS NOT NULL
        AND o.settlement_id = v_settlement_id GROUP BY o.seller_id
    ) u GROUP BY u.user_id
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

      v_card_purchases := v_user.total_purchases - v_user.balance_applied - v_user.credit_applied;

      IF v_user.balance_applied > 0 THEN
        UPDATE user_balances
        SET held_balance_usd = GREATEST(held_balance_usd - v_user.balance_applied, 0),
            total_spent_usd = total_spent_usd + v_user.balance_applied, updated_at = now()
        WHERE user_id = v_user.user_id;
        PERFORM append_ledger_entry('balance_consumed', v_user.user_id, v_user.balance_applied, 'debit', NULL, v_settlement_id,
          jsonb_build_object('type', 'purchase_settlement', 'balance_applied', v_user.balance_applied));
      END IF;

      SELECT * INTO v_hold FROM market_holds
      WHERE buyer_id = v_user.user_id AND status = 'active' FOR UPDATE;

      IF v_hold IS NOT NULL THEN
        v_hold_captured := LEAST(v_hold.hold_amount_cents::NUMERIC / 100, v_card_purchases);
        v_hold_released := (v_hold.hold_amount_cents::NUMERIC / 100) - v_hold_captured;
        UPDATE market_holds SET status = 'captured', spent_amount_cents = (v_hold_captured * 100)::INTEGER, updated_at = now() WHERE id = v_hold.id;
        INSERT INTO settlement_captures (settlement_id, hold_id, buyer_id, stripe_payment_intent_id, hold_amount_usd, capture_amount_usd, release_amount_usd, capture_status)
        VALUES (v_settlement_id, v_hold.id, v_user.user_id, v_hold.stripe_payment_intent_id, v_hold.hold_amount_cents::NUMERIC / 100, v_hold_captured, v_hold_released, 'captured');
        IF v_hold_captured > 0 THEN
          PERFORM append_ledger_entry('hold_captured', v_user.user_id, v_hold_captured, 'debit', NULL, v_settlement_id,
            jsonb_build_object('hold_id', v_hold.id, 'stripe_pi', v_hold.stripe_payment_intent_id));
        END IF;
        IF v_hold_released > 0 THEN
          PERFORM append_ledger_entry('hold_released', v_user.user_id, v_hold_released, 'credit', NULL, v_settlement_id,
            jsonb_build_object('hold_id', v_hold.id));
        END IF;
      END IF;

      IF v_user.gross_sales > 0 THEN
        PERFORM append_ledger_entry('settlement_credit', v_user.user_id, v_user.gross_sales, 'credit', NULL, v_settlement_id, jsonb_build_object('type', 'gross_sales'));
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

      INSERT INTO user_settlements (settlement_id, user_id, gross_sales_usd, total_purchases_usd, refunds_issued_usd, refunds_received_usd, platform_fees_usd, hold_captured_usd, hold_released_usd, net_payout_usd, status)
      VALUES (v_settlement_id, v_user.user_id, v_user.gross_sales, v_user.total_purchases, v_user.refunds_issued, v_user.refunds_received, v_user.platform_fees, v_hold_captured, v_hold_released, v_net, 'pending');

      INSERT INTO user_balances (user_id, pending_usd, total_earned_usd, total_spent_usd)
      VALUES (v_user.user_id, GREATEST(v_net, 0), GREATEST(v_user.gross_sales, 0), v_user.total_purchases)
      ON CONFLICT (user_id) DO UPDATE SET
        pending_usd = user_balances.pending_usd + GREATEST(v_net, 0),
        total_earned_usd = user_balances.total_earned_usd + GREATEST(v_user.gross_sales, 0),
        total_spent_usd = user_balances.total_spent_usd + v_user.total_purchases, updated_at = now();

      -- *** FIXED notification text: "Daily settlement" instead of "Market settlement" ***
      v_notif_content := CASE
        WHEN v_net > 0 THEN '💰 Daily settlement: $' || ROUND(v_net, 2) || ' in earnings now available.'
        WHEN v_net < 0 THEN '🧾 Daily settlement: $' || ROUND(ABS(v_net), 2) || ' in purchases settled.'
        ELSE '📋 Daily settlement complete. No balance change.'
      END
      || CASE WHEN v_hold_released > 0 THEN ' Your hold of $' || ROUND(v_hold_released, 2) || ' has been released.' ELSE '' END;

      BEGIN
        PERFORM notify_market_event(v_user.user_id, v_notif_content, '/earnings');
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

  -- Reconciliation
  SELECT NOT EXISTS (
    SELECT 1 FROM user_settlements us WHERE us.settlement_id = v_settlement_id
      AND (SELECT balance_after FROM market_ledger WHERE user_id = us.user_id ORDER BY id DESC LIMIT 1)
        != (SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_usd ELSE -amount_usd END), 0)
            FROM market_ledger WHERE user_id = us.user_id)
  ) INTO v_check1_pass;

  v_check2_pass := (v_total_payouts + v_total_fees) <= (v_total_captured + v_total_payouts + v_total_fees);

  v_reconciliation := jsonb_build_object(
    'check1_ledger_consistency', v_check1_pass, 'check2_settlement_balance', v_check2_pass,
    'total_orders', v_total_orders, 'total_users', v_user_count,
    'total_captured_usd', v_total_captured, 'total_payouts_usd', v_total_payouts,
    'total_fees_usd', v_total_fees, 'total_refunds_usd', v_total_refunds);

  DECLARE v_total_released NUMERIC(10,2) := 0;
  BEGIN
    SELECT COALESCE(SUM(release_amount_usd), 0) INTO v_total_released
    FROM settlement_captures WHERE settlement_id = v_settlement_id;

    v_reconciliation := v_reconciliation || jsonb_build_object(
      'total_released_usd', v_total_released,
      'capture_count', (SELECT COUNT(*) FROM settlement_captures WHERE settlement_id = v_settlement_id));

    UPDATE market_settlements SET
      total_orders = v_total_orders, total_captured_usd = v_total_captured,
      total_released_usd = v_total_released, total_payouts_usd = v_total_payouts,
      total_fees_usd = v_total_fees, total_refunds_usd = v_total_refunds,
      reconciliation_check = v_reconciliation,
      status = CASE WHEN v_check1_pass AND v_check2_pass THEN 'funds_pending'::clearing_status
                    ELSE 'reconciliation_failed'::clearing_status END,
      updated_at = now()
    WHERE id = v_settlement_id;
  END;

  RETURN jsonb_build_object('success', true, 'settlement_id', v_settlement_id,
    'users_settled', v_user_count, 'orders_settled', v_total_orders,
    'reconciliation', v_reconciliation);
END;
$$;


-- ─── 2. Fix simple cron functions with hardcoded URLs ────────────────────────

-- casabot-starter-post cron: fix hardcoded URL
DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN PERFORM cron.unschedule('casabot-starter-post'); EXCEPTION WHEN OTHERS THEN END;
    PERFORM cron.schedule('casabot-starter-post', '0 14 * * *',
      format('SELECT net.http_post(url := %L || %L, headers := jsonb_build_object(%L, %L, %L, %L || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = %L LIMIT 1)), body := %L::jsonb)',
        (SELECT COALESCE(current_setting('app.settings.edge_functions_base_url', true),
          (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'edge_functions_base_url' LIMIT 1),
          'http://host.docker.internal:54321/functions/v1')),
        '/casabot-starter-post',
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ',
        'service_role_key',
        '{}'::text
      )
    );
    RAISE NOTICE 'Rescheduled casabot-starter-post with vault URL';
  END IF;
END $outer$;

-- casabot-auto-reply cron: fix hardcoded URL
DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN PERFORM cron.unschedule('casabot-auto-reply'); EXCEPTION WHEN OTHERS THEN END;
    PERFORM cron.schedule('casabot-auto-reply', '*/5 * * * *',
      format('SELECT net.http_post(url := %L || %L, headers := jsonb_build_object(%L, %L, %L, %L || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = %L LIMIT 1)), body := %L::jsonb)',
        (SELECT COALESCE(current_setting('app.settings.edge_functions_base_url', true),
          (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'edge_functions_base_url' LIMIT 1),
          'http://host.docker.internal:54321/functions/v1')),
        '/casabot-auto-reply',
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ',
        'service_role_key',
        '{}'::text
      )
    );
    RAISE NOTICE 'Rescheduled casabot-auto-reply with vault URL';
  END IF;
END $outer$;

-- enrich-communities cron: fix hardcoded URL
DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN PERFORM cron.unschedule('enrich-communities'); EXCEPTION WHEN OTHERS THEN END;
    PERFORM cron.schedule('enrich-communities', '30 4 * * *',
      format('SELECT net.http_post(url := %L || %L, headers := jsonb_build_object(%L, %L, %L, %L || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = %L LIMIT 1)), body := %L::jsonb)',
        (SELECT COALESCE(current_setting('app.settings.edge_functions_base_url', true),
          (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'edge_functions_base_url' LIMIT 1),
          'http://host.docker.internal:54321/functions/v1')),
        '/enrich-communities',
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ',
        'service_role_key',
        '{}'::text
      )
    );
    RAISE NOTICE 'Rescheduled enrich-communities with vault URL';
  END IF;
END $outer$;
