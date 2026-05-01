-- ============================================================================
-- Update get_transaction_log for payout_refund
-- ============================================================================

-- Drop the broken unused overload to prevent ambiguity
DROP FUNCTION IF EXISTS get_transaction_log(uuid, timestamp with time zone, timestamp with time zone, integer, integer);

DO $$
DECLARE
  v_def TEXT;
BEGIN
  -- Get the correct active function
  SELECT pg_get_functiondef(oid) INTO v_def
  FROM pg_proc
  WHERE oid = 'get_transaction_log(date,date,integer,integer)'::regprocedure;
  
  -- Replace the Refunds block with enriched version for payout_refund
  v_def := replace(v_def,
    $STR$'refund'::TEXT,
    ml.created_at,
    CASE ml.direction WHEN 'credit' THEN 'Refund received' ELSE 'Refund issued' END,$STR$,
    $STR$CASE WHEN ml.metadata->>'type' = 'payout_refund' THEN 'payout_refund' ELSE 'refund' END::TEXT,
    ml.created_at,
    CASE WHEN ml.metadata->>'type' = 'payout_refund' THEN 'Payout cancelled & refunded'
         WHEN ml.direction = 'credit' THEN 'Refund received'
         ELSE 'Refund issued'
    END,$STR$
  );

  EXECUTE v_def;
END
$$;
