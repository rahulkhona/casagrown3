-- Migration: FIFO RPC Updates and Balances
-- Creates get_user_balances and the FIFO bucket consumption trigger

-- 1. Helper Function: get_user_balances
CREATE OR REPLACE FUNCTION public.get_user_balances(p_user_id uuid)
RETURNS TABLE (
  total_balance integer,
  purchased_balance integer,
  earned_balance integer
) AS $$
DECLARE
  v_total integer;
  v_purchased integer;
BEGIN
  -- Get total balance
  SELECT coalesce(sum(amount), 0) INTO v_total
  FROM point_ledger
  WHERE user_id = p_user_id;

  -- Get active purchased balance
  SELECT coalesce(sum(remaining_amount), 0) INTO v_purchased
  FROM purchased_points_buckets
  WHERE user_id = p_user_id AND status IN ('active', 'partially_refunded');

  -- Earned is simply total - purchased, but bounded by 0 just in case
  total_balance := v_total;
  purchased_balance := v_purchased;
  earned_balance := greatest(0, v_total - v_purchased);

  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Trigger for FIFO Bucket Consumption
CREATE OR REPLACE FUNCTION public.consume_fifo_buckets()
RETURNS TRIGGER AS $$
DECLARE
  v_remaining_to_consume integer;
  v_bucket RECORD;
  v_consume_amount integer;
  v_new_bucket_status purchased_bucket_status;
BEGIN
  -- We only consume purchased buckets if points are being spent on platform transactions.
  -- Exclude redemptions/donations because those MUST consume earned points exclusively.
  IF NEW.amount < 0 AND NEW.type IN ('payment', 'platform_charge') THEN
    v_remaining_to_consume := abs(NEW.amount);

    FOR v_bucket IN
      SELECT id, remaining_amount, status
      FROM purchased_points_buckets
      WHERE user_id = NEW.user_id AND status IN ('active', 'partially_refunded')
      ORDER BY created_at ASC
      FOR UPDATE
    LOOP
      IF v_remaining_to_consume <= 0 THEN
        EXIT;
      END IF;

      -- Determine how much to consume from this bucket
      v_consume_amount := least(v_remaining_to_consume, v_bucket.remaining_amount);

      -- Deduct from the remaining amount
      v_remaining_to_consume := v_remaining_to_consume - v_consume_amount;
      
      -- Update bucket
      IF v_bucket.remaining_amount - v_consume_amount = 0 THEN
        v_new_bucket_status := 'depleted';
      ELSE
        v_new_bucket_status := v_bucket.status;
      END IF;

      UPDATE purchased_points_buckets
      SET remaining_amount = remaining_amount - v_consume_amount,
          status = v_new_bucket_status,
          updated_at = now()
      WHERE id = v_bucket.id;

      -- Log consumption
      INSERT INTO point_bucket_consumptions (bucket_id, ledger_id, amount_consumed)
      VALUES (v_bucket.id, NEW.id, v_consume_amount);

    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach the trigger AFTER insert on point_ledger
-- It must be AFTER insert to have access to NEW.id
CREATE TRIGGER trg_consume_fifo_buckets
  AFTER INSERT ON point_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.consume_fifo_buckets();
