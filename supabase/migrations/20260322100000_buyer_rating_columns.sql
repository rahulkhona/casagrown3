-- Buyer Rating Aggregate Columns
-- Adds buyer_avg_rating and buyer_rating_count to profiles,
-- plus a trigger to recompute on buyer_rating insert/update.

-- 1. Add columns
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS buyer_avg_rating NUMERIC(2,1),
  ADD COLUMN IF NOT EXISTS buyer_rating_count INTEGER NOT NULL DEFAULT 0;

-- 2. Trigger function: recompute buyer rating
CREATE OR REPLACE FUNCTION recompute_market_buyer_rating()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old_avg NUMERIC;
  v_old_count INTEGER;
  v_new_rating NUMERIC;
BEGIN
  SELECT COALESCE(buyer_avg_rating, 0), buyer_rating_count
  INTO v_old_avg, v_old_count
  FROM profiles WHERE id = NEW.buyer_id;

  v_new_rating := NEW.buyer_rating;

  IF TG_OP = 'UPDATE' AND OLD.buyer_rating IS NOT NULL THEN
    DECLARE v_old_rating NUMERIC;
    BEGIN
      v_old_rating := OLD.buyer_rating;
      UPDATE profiles SET
        buyer_avg_rating = ROUND((v_old_avg * v_old_count - v_old_rating + v_new_rating) / v_old_count, 1)
      WHERE id = NEW.buyer_id;
    END;
  ELSE
    UPDATE profiles SET
      buyer_avg_rating = ROUND((v_old_avg * v_old_count + v_new_rating) / (v_old_count + 1), 1),
      buyer_rating_count = v_old_count + 1
    WHERE id = NEW.buyer_id;
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Trigger
DROP TRIGGER IF EXISTS trg_recompute_market_buyer_rating ON market_orders;
CREATE TRIGGER trg_recompute_market_buyer_rating
  AFTER INSERT OR UPDATE OF buyer_rating ON market_orders
  FOR EACH ROW
  WHEN (NEW.buyer_rating IS NOT NULL)
  EXECUTE FUNCTION recompute_market_buyer_rating();

-- 4. Backfill existing ratings
WITH buyer_stats AS (
  SELECT buyer_id,
         ROUND(AVG(buyer_rating)::numeric, 1) AS avg_rating,
         COUNT(*) AS rating_count
  FROM market_orders
  WHERE buyer_rating IS NOT NULL
  GROUP BY buyer_id
)
UPDATE profiles p
SET buyer_avg_rating = bs.avg_rating,
    buyer_rating_count = bs.rating_count
FROM buyer_stats bs
WHERE p.id = bs.buyer_id;
