-- BUG-18: Add processing_started_at column for soft-lock concurrency control
-- Prevents overlapping cron runs from grabbing the same settlement_captures rows.
ALTER TABLE public.settlement_captures
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN public.settlement_captures.processing_started_at
  IS 'Soft lock timestamp — set when a capture worker begins processing. Rows with a recent value are skipped by concurrent workers.';

-- BUG-42: Atomic market_ledger insert with row-level locking on balance
-- Prevents race conditions when two webhooks fire simultaneously and both
-- read the same balance_after before inserting.
CREATE OR REPLACE FUNCTION public.append_market_ledger_entry(
  p_user_id UUID,
  p_event_type TEXT,
  p_amount_usd NUMERIC,
  p_direction TEXT,
  p_metadata JSONB DEFAULT '{}'::JSONB,
  p_order_id UUID DEFAULT NULL,
  p_settlement_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_balance NUMERIC;
  v_new_balance NUMERIC;
  v_entry_id BIGINT;
BEGIN
  -- Lock the user's most recent ledger row to serialize concurrent inserts.
  -- If no rows exist yet, the SELECT returns NULL and we start from 0.
  SELECT balance_after INTO v_current_balance
  FROM public.market_ledger
  WHERE user_id = p_user_id
  ORDER BY id DESC
  LIMIT 1
  FOR UPDATE;

  v_current_balance := COALESCE(v_current_balance, 0);

  IF p_direction = 'debit' THEN
    v_new_balance := ROUND(v_current_balance - p_amount_usd, 2);
  ELSE
    v_new_balance := ROUND(v_current_balance + p_amount_usd, 2);
  END IF;

  INSERT INTO public.market_ledger (
    user_id, event_type, amount_usd, direction, balance_after,
    metadata, order_id, settlement_id
  ) VALUES (
    p_user_id, p_event_type, p_amount_usd, p_direction, v_new_balance,
    p_metadata, p_order_id, p_settlement_id
  )
  RETURNING id INTO v_entry_id;

  RETURN jsonb_build_object(
    'id', v_entry_id,
    'balance_after', v_new_balance
  );
END;
$$;

COMMENT ON FUNCTION public.append_market_ledger_entry IS
  'Atomically appends a market_ledger entry with serialized balance reads via FOR UPDATE row locking.';
