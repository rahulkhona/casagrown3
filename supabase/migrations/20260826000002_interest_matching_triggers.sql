-- Migration: Interest Matching Triggers

SET search_path TO public, extensions;

-- 1. Add denormalized columns
ALTER TABLE crm_interest_matches
  ADD COLUMN IF NOT EXISTS seller_user_id UUID,
  ADD COLUMN IF NOT EXISTS seller_lead_id UUID,
  ADD COLUMN IF NOT EXISTS buyer_user_id UUID,
  ADD COLUMN IF NOT EXISTS buyer_lead_id UUID,
  ADD COLUMN IF NOT EXISTS seller_email TEXT,
  ADD COLUMN IF NOT EXISTS buyer_email TEXT;

COMMENT ON COLUMN crm_interest_matches.seller_user_id IS 'Denormalized seller user ID for quick lookup';
COMMENT ON COLUMN crm_interest_matches.seller_lead_id IS 'Denormalized seller lead ID for quick lookup';
COMMENT ON COLUMN crm_interest_matches.buyer_user_id IS 'Denormalized buyer user ID for quick lookup';
COMMENT ON COLUMN crm_interest_matches.buyer_lead_id IS 'Denormalized buyer lead ID for quick lookup';
COMMENT ON COLUMN crm_interest_matches.seller_email IS 'Denormalized seller email for quick lookup';
COMMENT ON COLUMN crm_interest_matches.buyer_email IS 'Denormalized buyer email for quick lookup';

-- 2. Trigger 1: match_buyer_to_sellers
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

DROP TRIGGER IF EXISTS trigger_match_buyer_to_sellers ON crm_produce_interests;
CREATE TRIGGER trigger_match_buyer_to_sellers
AFTER INSERT ON crm_produce_interests
FOR EACH ROW
EXECUTE FUNCTION match_buyer_to_sellers();

COMMENT ON FUNCTION match_buyer_to_sellers IS 'Matches newly inserted buyer interests to existing active seller interests.';
COMMENT ON TRIGGER trigger_match_buyer_to_sellers ON crm_produce_interests IS 'Fires on insert of buyer interests.';

-- 3. Trigger 2: match_listing_to_buyers
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

DROP TRIGGER IF EXISTS trigger_match_listing_to_buyers ON market_products;
CREATE TRIGGER trigger_match_listing_to_buyers
AFTER INSERT ON market_products
FOR EACH ROW
EXECUTE FUNCTION match_listing_to_buyers();

COMMENT ON FUNCTION match_listing_to_buyers IS 'Matches newly created market products to active buyer interests.';
COMMENT ON TRIGGER trigger_match_listing_to_buyers ON market_products IS 'Fires on insert of market products.';
