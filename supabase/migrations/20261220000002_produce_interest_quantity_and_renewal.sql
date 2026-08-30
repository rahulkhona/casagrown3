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

-- 3. Enhance match_buyer_to_sellers and match_listing_to_buyers with SECURITY DEFINER
CREATE OR REPLACE FUNCTION match_buyer_to_sellers()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.interest_type = 'buy' AND NEW.status = 'active' THEN
    INSERT INTO crm_interest_matches (
      buyer_interest_id,
      seller_interest_id,
      produce_name,
      seller_user_id,
      seller_lead_id,
      buyer_user_id,
      buyer_lead_id,
      seller_email,
      buyer_email
    )
    SELECT
      NEW.id,
      spi.id,
      NEW.produce_name,
      spi.user_id,
      spi.lead_id,
      NEW.user_id,
      NEW.lead_id,
      COALESCE(su.email, sl.email),
      COALESCE(bu.email, bl.email)
    FROM crm_produce_interests spi
    LEFT JOIN profiles su ON su.id = spi.user_id
    LEFT JOIN crm_leads sl ON sl.id = spi.lead_id
    LEFT JOIN profiles bu ON bu.id = NEW.user_id
    LEFT JOIN crm_leads bl ON bl.id = NEW.lead_id
    WHERE spi.interest_type = 'sell'
      AND spi.status = 'active'
      AND lower(spi.produce_name) = lower(NEW.produce_name)
      AND spi.zipcodes && NEW.zipcodes
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION match_listing_to_buyers()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_active = true AND NEW.is_draft = false THEN
    INSERT INTO crm_interest_matches (
      buyer_interest_id,
      seller_interest_id,
      produce_name,
      created_listing_id,
      seller_user_id,
      buyer_user_id,
      buyer_lead_id,
      seller_email,
      buyer_email
    )
    SELECT
      bpi.id,
      spi.id,
      NEW.name,
      NEW.id,
      NEW.seller_id,
      bpi.user_id,
      bpi.lead_id,
      COALESCE(su.email, sl.email),
      COALESCE(bu.email, bl.email)
    FROM crm_produce_interests bpi
    JOIN crm_produce_interests spi ON spi.user_id = NEW.seller_id AND spi.interest_type = 'sell'
    LEFT JOIN profiles su ON su.id = spi.user_id
    LEFT JOIN crm_leads sl ON sl.id = spi.lead_id
    LEFT JOIN profiles bu ON bu.id = bpi.user_id
    LEFT JOIN crm_leads bl ON bl.id = bpi.lead_id
    WHERE bpi.interest_type = 'buy'
      AND bpi.status = 'active'
      AND lower(NEW.name) LIKE '%' || lower(bpi.produce_name) || '%'
      AND bpi.zipcodes && spi.zipcodes
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Enhance trigger_match_buyer_to_sellers to fire on both INSERT and UPDATE
--    This ensures that when a buyer updates their quantity or renews their demand signal,
--    matching sellers are immediately re-evaluated and queued for notifications.
DROP TRIGGER IF EXISTS trigger_match_buyer_to_sellers ON crm_produce_interests;

CREATE TRIGGER trigger_match_buyer_to_sellers
AFTER INSERT OR UPDATE OF requested_quantity, requested_unit, last_renewed_at, status ON crm_produce_interests
FOR EACH ROW
EXECUTE FUNCTION match_buyer_to_sellers();

COMMENT ON TRIGGER trigger_match_buyer_to_sellers ON crm_produce_interests IS 'Fires on insert or quantity/renewal update of buyer interests to queue match notifications.';

