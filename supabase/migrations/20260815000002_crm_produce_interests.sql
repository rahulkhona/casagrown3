-- ============================================================
-- Migration: crm_produce_interests & crm_interest_matches
-- Schema Rules Enforced:
--   1. Mandatory COMMENT ON for all tables, views, and columns
--   2. Explicit Data API grants for anon, authenticated, service_role
--   3. Strict typed columns for multi-zipcode arrays and radius matching
-- ============================================================

SET search_path TO public, extensions;

-- ─── 1. crm_produce_interests ───────────────────────────────
CREATE TABLE IF NOT EXISTS crm_produce_interests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id             UUID REFERENCES crm_leads (id) ON DELETE CASCADE,
  user_id             UUID REFERENCES profiles (id) ON DELETE CASCADE,
  interest_type       TEXT NOT NULL CHECK (interest_type IN ('buy', 'sell')),
  produce_name        TEXT NOT NULL,
  produce_category    TEXT DEFAULT 'produce',
  zipcodes            TEXT[] NOT NULL DEFAULT '{}',
  radius_miles        INT DEFAULT 5,
  home_address        TEXT,
  latitude            DOUBLE PRECISION,
  longitude           DOUBLE PRECISION,
  preference_delivery BOOLEAN DEFAULT true,
  preference_pickup   BOOLEAN DEFAULT true,
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'deleted')),
  unsubscribe_token   TEXT DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT check_owner_exists CHECK (lead_id IS NOT NULL OR user_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_crm_produce_interests_zipcodes ON crm_produce_interests USING GIN (zipcodes);
CREATE INDEX IF NOT EXISTS idx_crm_produce_interests_match ON crm_produce_interests (interest_type, status);
CREATE INDEX IF NOT EXISTS idx_crm_produce_interests_produce ON crm_produce_interests (lower(produce_name));
CREATE INDEX IF NOT EXISTS idx_crm_produce_interests_token ON crm_produce_interests (unsubscribe_token);

ALTER TABLE crm_produce_interests ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY crm_produce_interests_anon_insert ON crm_produce_interests
    FOR INSERT TO anon, authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY crm_produce_interests_read ON crm_produce_interests
    FOR SELECT TO authenticated USING (user_id = auth.uid() OR lead_id IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 2. crm_interest_matches ────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_interest_matches (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_interest_id     UUID REFERENCES crm_produce_interests (id) ON DELETE CASCADE,
  seller_interest_id    UUID REFERENCES crm_produce_interests (id) ON DELETE CASCADE,
  produce_name          TEXT NOT NULL,
  distance_miles        NUMERIC(6, 2),
  matched_zipcode       TEXT,
  notified_seller_at    TIMESTAMPTZ,
  notified_buyer_at     TIMESTAMPTZ,
  created_listing_id    UUID REFERENCES market_products (id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (buyer_interest_id, seller_interest_id)
);

ALTER TABLE crm_interest_matches ENABLE ROW LEVEL SECURITY;

-- ─── 3. Helper View for AI Audience Builder ───────────────────
CREATE OR REPLACE VIEW crm_interest_match_candidates AS
-- Pass A: Seller Demand Matches (Sellers who grow produce that active buyers in their zipcode are looking for, unnotified)
SELECT
  spi.id AS interest_id,
  spi.lead_id,
  spi.user_id,
  CASE WHEN spi.user_id IS NOT NULL THEN 'user' ELSE 'lead' END AS recipient_type,
  COALESCE(u.email, l.email) AS email,
  COALESCE(u.phone_number, l.phone) AS phone,
  COALESCE(u.full_name, l.name) AS name,
  spi.produce_name,
  spi.zipcodes,
  'seller_demand_match' AS match_type,
  COUNT(bpi.id) AS matching_buyer_count,
  NULL::UUID AS matching_product_id,
  spi.unsubscribe_token
FROM crm_produce_interests spi
LEFT JOIN crm_leads l ON l.id = spi.lead_id
LEFT JOIN profiles u ON u.id = spi.user_id
JOIN crm_produce_interests bpi ON bpi.interest_type = 'buy'
  AND bpi.status = 'active'
  AND lower(bpi.produce_name) = lower(spi.produce_name)
  AND bpi.zipcodes && spi.zipcodes
LEFT JOIN crm_interest_matches m ON m.seller_interest_id = spi.id AND m.buyer_interest_id = bpi.id
WHERE spi.interest_type = 'sell'
  AND spi.status = 'active'
  AND (m.notified_seller_at IS NULL)
GROUP BY spi.id, spi.lead_id, spi.user_id, u.email, l.email, u.phone_number, l.phone, u.full_name, l.name, spi.produce_name, spi.zipcodes, spi.unsubscribe_token

UNION ALL

-- Pass B: Buyer Harvest Matches (Buyers looking for produce where a seller published a matching product in their zipcode, unnotified)
SELECT
  bpi.id AS interest_id,
  bpi.lead_id,
  bpi.user_id,
  CASE WHEN bpi.user_id IS NOT NULL THEN 'user' ELSE 'lead' END AS recipient_type,
  COALESCE(u.email, l.email) AS email,
  COALESCE(u.phone_number, l.phone) AS phone,
  COALESCE(u.full_name, l.name) AS name,
  bpi.produce_name,
  bpi.zipcodes,
  'buyer_harvest_match' AS match_type,
  1 AS matching_buyer_count,
  p.id AS matching_product_id,
  bpi.unsubscribe_token
FROM crm_produce_interests bpi
LEFT JOIN crm_leads l ON l.id = bpi.lead_id
LEFT JOIN profiles u ON u.id = bpi.user_id
JOIN market_products p ON lower(p.name) LIKE '%' || lower(bpi.produce_name) || '%'
  AND p.is_active = true AND p.is_draft = false
LEFT JOIN crm_interest_matches m ON m.buyer_interest_id = bpi.id AND m.created_listing_id = p.id
WHERE bpi.interest_type = 'buy'
  AND bpi.status = 'active'
  AND (m.notified_buyer_at IS NULL);

-- ─── 4. Documentation Comments (COMMENT ON) ────────────────
COMMENT ON TABLE crm_produce_interests IS 'Captures buyer and seller produce interests, multi-zipcode target arrays, matching radius, and notification status.';
COMMENT ON COLUMN crm_produce_interests.interest_type IS 'Intent type: buy (looking for produce) or sell (growing/has produce)';
COMMENT ON COLUMN crm_produce_interests.zipcodes IS 'PostgreSQL array of target 5-digit zipcodes for regional matching';
COMMENT ON COLUMN crm_produce_interests.status IS 'Alert status: active, paused (temporarily muted), deleted (turned off)';
COMMENT ON COLUMN crm_produce_interests.unsubscribe_token IS 'Secure 1-click token for managing alerts without requiring authentication';

COMMENT ON TABLE crm_interest_matches IS 'Log of buyer-seller matches generated by the hourly cron function.';

COMMENT ON VIEW crm_interest_match_candidates IS 'Helper view for AI Campaign Builder. Auto-discovers unnotified seller demand matches and buyer harvest matches.';
COMMENT ON COLUMN crm_interest_match_candidates.match_type IS 'Type of campaign match candidate: seller_demand_match (seller nudges) or buyer_harvest_match (buyer product alerts)';

-- ─── 5. Explicit Data API Grants ────────────────────────────
GRANT SELECT, INSERT, UPDATE ON crm_produce_interests TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON crm_interest_matches TO anon, authenticated, service_role;
GRANT SELECT ON crm_interest_match_candidates TO anon, authenticated, service_role;
