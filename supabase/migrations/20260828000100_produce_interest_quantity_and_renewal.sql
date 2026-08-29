-- ============================================================
-- Migration: Produce Interest Quantity, Renewal & Trigger Update
-- Rules Enforced:
--   1. Mandatory COMMENT ON for all altered tables and columns
--   2. Safe IF NOT EXISTS column additions
--   3. Trigger enhancement to fire on INSERT OR UPDATE OF quantity/renewal
-- ============================================================

SET search_path TO public, extensions;

-- 1. Add quantity and renewal tracking columns to crm_produce_interests
ALTER TABLE crm_produce_interests 
  ADD COLUMN IF NOT EXISTS requested_quantity NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS requested_unit TEXT DEFAULT 'lb',
  ADD COLUMN IF NOT EXISTS requested_date TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_renewed_at TIMESTAMPTZ DEFAULT now();

COMMENT ON COLUMN crm_produce_interests.requested_quantity IS 'Desired buyer quantity for harvest matching and neighbor demand exchange.';
COMMENT ON COLUMN crm_produce_interests.requested_unit IS 'Unit of requested quantity (e.g. lb, bunch, dozen, each).';
COMMENT ON COLUMN crm_produce_interests.requested_date IS 'Original timestamp when the interest was first recorded.';
COMMENT ON COLUMN crm_produce_interests.last_renewed_at IS 'Timestamp of last renewal when buyer re-signaled active demand.';

-- 2. Add quantity and renewal tracking columns to legacy produce_interests
ALTER TABLE produce_interests 
  ADD COLUMN IF NOT EXISTS requested_quantity NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS requested_unit TEXT DEFAULT 'lb',
  ADD COLUMN IF NOT EXISTS requested_date TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_renewed_at TIMESTAMPTZ DEFAULT now();

COMMENT ON COLUMN produce_interests.requested_quantity IS 'Desired buyer quantity for harvest matching.';
COMMENT ON COLUMN produce_interests.requested_unit IS 'Unit of requested quantity.';
COMMENT ON COLUMN produce_interests.requested_date IS 'Original timestamp when interest was first recorded.';
COMMENT ON COLUMN produce_interests.last_renewed_at IS 'Timestamp of last renewal when user re-signaled active demand.';

-- 3. Enhance trigger_match_buyer_to_sellers to fire on both INSERT and UPDATE
--    This ensures that when a buyer updates their quantity or renews their demand signal,
--    matching sellers are immediately re-evaluated and queued for notifications.
DROP TRIGGER IF EXISTS trigger_match_buyer_to_sellers ON crm_produce_interests;

CREATE TRIGGER trigger_match_buyer_to_sellers
AFTER INSERT OR UPDATE OF requested_quantity, requested_unit, last_renewed_at, status ON crm_produce_interests
FOR EACH ROW
EXECUTE FUNCTION match_buyer_to_sellers();

COMMENT ON TRIGGER trigger_match_buyer_to_sellers ON crm_produce_interests IS 'Fires on insert or quantity/renewal update of buyer interests to queue match notifications.';
