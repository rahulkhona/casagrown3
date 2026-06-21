-- ============================================================================
-- BUG-13: captures_sent Recovery Cron
--
-- Settlements can get stuck in 'captures_sent' status if the settlement
-- process errors after inserting the row but before updating to 'funds_pending'.
-- This function finds settlements stuck for > 1 hour and transitions them
-- to 'funds_pending' so the pipeline can continue.
-- ============================================================================

-- ── 1. Recovery function ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recover_stuck_captures_sent()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_recovered INTEGER := 0;
  v_settlement RECORD;
BEGIN
  FOR v_settlement IN
    SELECT id, market_date, created_at
    FROM market_settlements
    WHERE status = 'captures_sent'
      AND created_at < now() - interval '1 hour'
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE market_settlements
    SET status = 'funds_pending',
        updated_at = now(),
        reconciliation_check = COALESCE(reconciliation_check, '{}'::jsonb)
          || jsonb_build_object('auto_recovered_from_captures_sent', true,
                                'recovered_at', now()::text)
    WHERE id = v_settlement.id;

    v_recovered := v_recovered + 1;

    RAISE NOTICE 'Recovered stuck settlement % (market_date: %, created: %)',
      v_settlement.id, v_settlement.market_date, v_settlement.created_at;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'recovered_count', v_recovered
  );
END;
$fn$;

-- ── 2. Schedule via pg_cron every 2 hours ───────────────────────────────────
DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove any existing job
    BEGIN
      PERFORM cron.unschedule('recover-stuck-captures-sent');
    EXCEPTION WHEN OTHERS THEN
      -- Job doesn't exist yet, ignore
    END;

    -- Schedule: every 2 hours at minute 0
    PERFORM cron.schedule(
      'recover-stuck-captures-sent',
      '0 */2 * * *',
      $$SELECT recover_stuck_captures_sent()$$
    );

    RAISE NOTICE 'Scheduled recover-stuck-captures-sent cron job every 2 hours';
  ELSE
    RAISE NOTICE 'pg_cron not available, skipping captures_sent recovery cron job';
  END IF;
END $outer$;
