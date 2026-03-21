-- ============================================================================
-- DB Performance Optimizations for Payout System
-- 1. Optimized debit_market_balance — eliminates ledger scan
-- 2. batch_debit_market_balance — bulk debits in single call
-- 3. Composite index on market_ledger for faster lookups
-- ============================================================================

-- ============================================================
-- 1. Composite index: (user_id, id DESC) on market_ledger
-- Speeds up "last entry for user" lookups from O(N) to O(1)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_market_ledger_user_id_desc
  ON market_ledger (user_id, id DESC);

-- ============================================================
-- 2. Optimized debit_market_balance — passes balance_after directly
-- Eliminates the SELECT scan in append_ledger_entry
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
  v_new_balance NUMERIC(10,2);
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

  v_new_balance := v_available - p_amount_usd;

  -- Deduct from available, add to withdrawn
  UPDATE user_balances
  SET available_usd = v_new_balance,
      total_withdrawn_usd = total_withdrawn_usd + p_amount_usd,
      updated_at = now()
  WHERE user_id = p_user_id;

  -- Direct INSERT into market_ledger — SKIP the append_ledger_entry scan
  INSERT INTO market_ledger (
    event_type, user_id, amount_usd, direction, balance_after, metadata
  ) VALUES (
    'payout_sent', p_user_id, p_amount_usd, 'debit', v_new_balance,
    p_metadata || jsonb_build_object('redemption_id', p_redemption_id)
  ) RETURNING id INTO v_entry_id;

  RETURN jsonb_build_object(
    'success', true,
    'debited_usd', p_amount_usd,
    'new_available_usd', v_new_balance,
    'ledger_entry_id', v_entry_id
  );
END;
$$;

-- ============================================================
-- 3. batch_debit_market_balance — process multiple debits in one call
-- Input: JSONB array of {user_id, amount_usd, metadata}
-- Returns: JSONB array of results
-- ============================================================
CREATE OR REPLACE FUNCTION batch_debit_market_balance(
  p_debits JSONB
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item JSONB;
  v_user_id UUID;
  v_amount NUMERIC(10,2);
  v_metadata JSONB;
  v_result JSONB;
  v_results JSONB := '[]'::jsonb;
  v_success_count INTEGER := 0;
  v_fail_count INTEGER := 0;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_debits)
  LOOP
    v_user_id := (v_item->>'user_id')::UUID;
    v_amount := (v_item->>'amount_usd')::NUMERIC;
    v_metadata := COALESCE(v_item->'metadata', '{}'::jsonb);

    v_result := debit_market_balance(v_user_id, v_amount, NULL, v_metadata);

    IF (v_result->>'success')::boolean THEN
      v_success_count := v_success_count + 1;
    ELSE
      v_fail_count := v_fail_count + 1;
    END IF;

    v_results := v_results || jsonb_build_object(
      'user_id', v_user_id,
      'amount_usd', v_amount,
      'success', (v_result->>'success')::boolean,
      'error', v_result->>'error'
    );
  END LOOP;

  RETURN jsonb_build_object(
    'total', jsonb_array_length(p_debits),
    'succeeded', v_success_count,
    'failed', v_fail_count,
    'results', v_results
  );
END;
$$;
