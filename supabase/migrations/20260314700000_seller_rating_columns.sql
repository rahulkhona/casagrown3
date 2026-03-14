-- Add materialized rating columns to profiles
-- Maintained incrementally by trigger (no full re-aggregation)

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS seller_avg_rating NUMERIC(2,1),
  ADD COLUMN IF NOT EXISTS seller_rating_count INTEGER NOT NULL DEFAULT 0;

-- Incremental update: new_avg = (old_avg * old_count + new_rating) / (old_count + 1)
CREATE OR REPLACE FUNCTION recompute_seller_rating()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_old_avg NUMERIC;
  v_old_count INTEGER;
  v_new_rating NUMERIC;
BEGIN
  SELECT COALESCE(seller_avg_rating, 0), seller_rating_count
  INTO v_old_avg, v_old_count
  FROM profiles WHERE id = NEW.seller_id;

  v_new_rating := NEW.seller_rating::text::numeric;

  IF TG_OP = 'UPDATE' AND OLD.seller_rating IS NOT NULL THEN
    -- Rating changed: subtract old, add new
    DECLARE v_old_rating NUMERIC;
    BEGIN
      v_old_rating := OLD.seller_rating::text::numeric;
      UPDATE profiles SET
        seller_avg_rating = ROUND((v_old_avg * v_old_count - v_old_rating + v_new_rating) / v_old_count, 1)
      WHERE id = NEW.seller_id;
    END;
  ELSE
    -- New rating: increment count and compute new average
    UPDATE profiles SET
      seller_avg_rating = ROUND((v_old_avg * v_old_count + v_new_rating) / (v_old_count + 1), 1),
      seller_rating_count = v_old_count + 1
    WHERE id = NEW.seller_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_recompute_seller_rating
  AFTER INSERT OR UPDATE OF seller_rating ON orders
  FOR EACH ROW
  WHEN (NEW.seller_rating IS NOT NULL)
  EXECUTE FUNCTION recompute_seller_rating();
