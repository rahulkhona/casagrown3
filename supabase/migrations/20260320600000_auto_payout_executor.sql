-- ============================================================================
-- Auto-Payout Executor: debit_market_balance RPC, eligible users query, cron
-- ============================================================================

-- ============================================================
-- 1. Add 'payout_sent' to market_ledger event_type (already in CHECK list)
--    Need to also add 'balance_held', 'balance_released', 'balance_consumed'
--    which are added by balance_first_hold migration
-- ============================================================
-- The event_type CHECK already includes 'payout_sent' from the original migration.
-- No DDL change needed for event_type.

-- ============================================================
-- 2. debit_market_balance — atomically debit available_usd for payout
--    Creates market_ledger 'payout_sent' entry and updates user_balances
-- ============================================================
CREATE OR REPLACE FUNCTION debit_market_balance(
  p_user_id UUID,
  p_amount_usd NUMERIC,
  p_redemption_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_available NUMERIC(10,2);
  v_entry_id INTEGER;
BEGIN
  -- Lock the row to prevent race conditions
  SELECT available_usd INTO v_available
  FROM user_balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_available IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No balance record found');
  END IF;

  IF v_available < p_amount_usd THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Insufficient balance. Available: $' || ROUND(v_available, 2) || ', requested: $' || ROUND(p_amount_usd, 2),
      'available_usd', v_available);
  END IF;

  -- Deduct from available, add to withdrawn
  UPDATE user_balances
  SET available_usd = available_usd - p_amount_usd,
      total_withdrawn_usd = total_withdrawn_usd + p_amount_usd,
      updated_at = now()
  WHERE user_id = p_user_id;

  -- Append ledger entry
  v_entry_id := append_ledger_entry(
    'payout_sent', p_user_id, p_amount_usd, 'debit',
    NULL, NULL, p_metadata || jsonb_build_object('redemption_id', p_redemption_id)
  );

  RETURN jsonb_build_object(
    'success', true,
    'debited_usd', p_amount_usd,
    'new_available_usd', v_available - p_amount_usd,
    'ledger_entry_id', v_entry_id
  );
END;
$$;

-- ============================================================
-- 3. get_auto_payout_eligible_users — returns users who need payouts
-- ============================================================
CREATE OR REPLACE FUNCTION get_auto_payout_eligible_users()
RETURNS TABLE (
  user_id UUID,
  available_usd NUMERIC(10,2),
  trigger_reason TEXT,
  payout_method TEXT,
  threshold_usd NUMERIC(10,2),
  cashout_payout_id TEXT,
  gift_card_brand TEXT,
  gift_card_amount_usd NUMERIC(10,2),
  charity_project_id TEXT,
  charity_project_name TEXT,
  payout_handle TEXT,
  payout_handle_type TEXT,
  payout_verified BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY

  -- A) Users with auto-payout enabled whose balance >= their threshold
  SELECT
    ub.user_id,
    ub.available_usd,
    'threshold'::TEXT AS trigger_reason,
    arc.method AS payout_method,
    arc.threshold_usd,
    arc.cashout_payout_id,
    arc.gift_card_brand,
    arc.gift_card_amount_usd,
    arc.charity_project_id,
    arc.charity_project_name,
    p.payout_handle,
    p.payout_handle_type,
    COALESCE(p.payout_verified, false) AS payout_verified
  FROM user_balances ub
  JOIN user_auto_redemption_config arc ON arc.user_id = ub.user_id AND arc.enabled = true
  JOIN profiles p ON p.id = ub.user_id
  WHERE ub.available_usd >= arc.threshold_usd
    AND ub.available_usd > 0

  UNION ALL

  -- B) $500 AML cap (mandatory, regardless of auto-payout setting)
  SELECT
    ub.user_id,
    ub.available_usd,
    'aml_cap'::TEXT AS trigger_reason,
    COALESCE(arc.method, 'giftcards') AS payout_method,
    500.00 AS threshold_usd,
    arc.cashout_payout_id,
    COALESCE(arc.gift_card_brand, 'Visa') AS gift_card_brand,
    arc.gift_card_amount_usd,
    arc.charity_project_id,
    arc.charity_project_name,
    p.payout_handle,
    p.payout_handle_type,
    COALESCE(p.payout_verified, false) AS payout_verified
  FROM user_balances ub
  LEFT JOIN user_auto_redemption_config arc ON arc.user_id = ub.user_id
  JOIN profiles p ON p.id = ub.user_id
  WHERE ub.available_usd >= 500
    -- Exclude users already matched by threshold
    AND NOT (arc.enabled IS TRUE AND ub.available_usd >= arc.threshold_usd)

  UNION ALL

  -- C) 90-day inactivity sweep
  SELECT
    ub.user_id,
    ub.available_usd,
    'inactivity_sweep'::TEXT AS trigger_reason,
    COALESCE(arc.method, 'giftcards') AS payout_method,
    0.00 AS threshold_usd,
    arc.cashout_payout_id,
    COALESCE(arc.gift_card_brand, 'Visa') AS gift_card_brand,
    arc.gift_card_amount_usd,
    arc.charity_project_id,
    arc.charity_project_name,
    p.payout_handle,
    p.payout_handle_type,
    COALESCE(p.payout_verified, false) AS payout_verified
  FROM user_balances ub
  LEFT JOIN user_auto_redemption_config arc ON arc.user_id = ub.user_id
  JOIN profiles p ON p.id = ub.user_id
  WHERE ub.available_usd > 0
    AND p.last_active_at < now() - INTERVAL '90 days'
    -- Exclude users already matched by threshold or cap
    AND NOT (arc.enabled IS TRUE AND ub.available_usd >= arc.threshold_usd)
    AND ub.available_usd < 500;
END;
$$;

-- ============================================================
-- 4. Cron: execute-auto-payouts — daily at 00:30 (after captures at 00:05)
-- ============================================================
DO $outer$
BEGIN
  BEGIN
    PERFORM cron.unschedule('execute-auto-payouts');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  PERFORM cron.schedule(
    'execute-auto-payouts',
    '30 0 * * *',
    $$
    SELECT net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/execute-auto-payouts',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := jsonb_build_object('action', 'auto_payout')
    );
    $$
  );

  RAISE NOTICE 'Scheduled execute-auto-payouts cron at 00:30 daily';
END $outer$;

-- ============================================================
-- 5. Cron: process-redemptions — every 15 minutes
-- ============================================================
DO $outer$
BEGIN
  BEGIN
    PERFORM cron.unschedule('process-redemptions');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  PERFORM cron.schedule(
    'process-redemptions',
    '*/15 * * * *',
    $$
    SELECT net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/process-redemptions',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := jsonb_build_object('source', 'cron')
    );
    $$
  );

  RAISE NOTICE 'Scheduled process-redemptions cron every 15 minutes';
END $outer$;

