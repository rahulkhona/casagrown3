-- Migration: Fix lead interest sync type resolution, ENUM type conversion, quantity sanitization, and produce family fuzzy matching

SET search_path TO public, extensions;

-- 1. Create PostgreSQL ENUM type for crm_interest_type if not exists
DO $$ BEGIN
  CREATE TYPE public.crm_interest_type AS ENUM ('buy', 'sell');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Drop dependent views and old text CHECK constraints before column type alteration
DROP VIEW IF EXISTS crm_interest_match_candidates;
ALTER TABLE crm_produce_interests DROP CONSTRAINT IF EXISTS crm_produce_interests_interest_type_check;
ALTER TABLE crm_produce_interests DROP CONSTRAINT IF EXISTS crm_produce_interests_check;

-- 3. Data Normalization: Sanitize any legacy text values before converting to ENUM
UPDATE crm_produce_interests
SET interest_type = CASE 
  WHEN lower(trim(interest_type::text)) IN ('buy', 'buyer', 'buying') THEN 'buy'
  ELSE 'sell'
END;

-- 4. Alter interest_type column to crm_interest_type ENUM safely
ALTER TABLE crm_produce_interests 
  ALTER COLUMN interest_type TYPE crm_interest_type 
  USING (
    CASE 
      WHEN lower(trim(interest_type::text)) = 'buy' THEN 'buy'::crm_interest_type
      ELSE 'sell'::crm_interest_type
    END
  );

-- 5. Helper Function: Produce Family Level Canonicalization
CREATE OR REPLACE FUNCTION normalize_produce_family(p_name TEXT)
RETURNS TEXT AS $$
DECLARE
  clean_name TEXT;
BEGIN
  IF p_name IS NULL OR p_name = '' THEN RETURN ''; END IF;
  
  -- Normalize to lowercase & trim
  clean_name := lower(trim(p_name));
  
  -- Family Grouping Patterns
  IF clean_name ~* 'orange|mandarin|tangerine|clementine|satsuma' THEN RETURN 'orange'; END IF;
  IF clean_name ~* 'tomato' THEN RETURN 'tomato'; END IF;
  IF clean_name ~* 'lemon' THEN RETURN 'lemon'; END IF;
  IF clean_name ~* 'lime' THEN RETURN 'lime'; END IF;
  IF clean_name ~* 'pepper|chili|chile|jalapeno|habanero' THEN RETURN 'pepper'; END IF;
  IF clean_name ~* 'strawberry|blueberry|blackberry|raspberry|berry' THEN RETURN 'berry'; END IF;
  IF clean_name ~* 'avocado' THEN RETURN 'avocado'; END IF;
  IF clean_name ~* 'fig' THEN RETURN 'fig'; END IF;
  IF clean_name ~* 'peach|nectarine' THEN RETURN 'peach'; END IF;
  IF clean_name ~* 'plum' THEN RETURN 'plum'; END IF;
  IF clean_name ~* 'apple' THEN RETURN 'apple'; END IF;
  IF clean_name ~* 'pear' THEN RETURN 'pear'; END IF;
  IF clean_name ~* 'egg' THEN RETURN 'egg'; END IF;
  IF clean_name ~* 'honey' THEN RETURN 'honey'; END IF;
  IF clean_name ~* 'flower|sunflower|dahlia|zinnia' THEN RETURN 'flower'; END IF;
  IF clean_name ~* 'seedling|sapling|starter|plant' THEN RETURN 'plant'; END IF;
  
  -- Fallback: Strip leading descriptive adjectives ("organic", "fresh", "homegrown", "picked", "sweet", "large", etc.)
  RETURN trim(regexp_replace(clean_name, '^(organic|fresh|homegrown|local|picked|large|small|sweet|ripe|wild|heritage)\s+', '', 'gi'));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION normalize_produce_family IS 'Canonicalizes produce item titles to produce families (orange, tomato, lemon, pepper, berry, egg, flower, etc.) ignoring adjectives.';

-- 6. Update sync_lead_produce_interests() trigger function
CREATE OR REPLACE FUNCTION sync_lead_produce_interests()
RETURNS TRIGGER AS $$
DECLARE
  p_name TEXT;
  v_type crm_interest_type;
BEGIN
  -- Resolve typed ENUM interest_type: explicit metadata > form_version check > default to sell
  v_type := (
    CASE 
      WHEN lower(trim(COALESCE(NEW.metadata->>'interest_type', ''))) = 'buy' THEN 'buy'::crm_interest_type
      WHEN NEW.form_version = 'v1-nutrition-estimator' THEN 'buy'::crm_interest_type
      ELSE 'sell'::crm_interest_type
    END
  );

  IF NEW.produce_interests IS NOT NULL AND NEW.produce_interests <> '' THEN
    FOR p_name IN SELECT unnest(string_to_array(NEW.produce_interests, ',')) LOOP
      -- Strip quantity parentheses e.g. "Tomatoes (x1)" -> "Tomatoes"
      p_name := trim(regexp_replace(p_name, '\s*\([xX]?\d+\)', '', 'g'));

      IF p_name <> '' THEN
        INSERT INTO crm_produce_interests (
          lead_id,
          interest_type,
          produce_name,
          zipcodes
        ) VALUES (
          NEW.id,
          v_type,
          p_name,
          CASE WHEN NEW.zipcode IS NOT NULL THEN ARRAY[NEW.zipcode] ELSE '{}'::TEXT[] END
        )
        ON CONFLICT (lead_id, interest_type, produce_name) DO NOTHING;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION sync_lead_produce_interests IS 'Parses produce_interests on crm_leads, resolves ENUM interest_type based on form_version/metadata, strips quantity parentheticals, and syncs to crm_produce_interests.';

-- 7. Backfill fix: Remove redundant 'sell' interests for v1-nutrition-estimator leads where a 'buy' interest already exists
DELETE FROM crm_produce_interests cpi
USING crm_leads l, crm_produce_interests buy_cpi
WHERE cpi.lead_id = l.id
  AND l.form_version = 'v1-nutrition-estimator'
  AND cpi.interest_type = 'sell'::crm_interest_type
  AND buy_cpi.lead_id = cpi.lead_id
  AND buy_cpi.interest_type = 'buy'::crm_interest_type
  AND lower(buy_cpi.produce_name) = lower(cpi.produce_name);

-- Update remaining 'sell' rows to 'buy' for v1-nutrition-estimator leads
UPDATE crm_produce_interests cpi
SET interest_type = 'buy'::crm_interest_type
FROM crm_leads l
WHERE cpi.lead_id = l.id
  AND l.form_version = 'v1-nutrition-estimator'
  AND cpi.interest_type = 'sell'::crm_interest_type;

-- 8. Backfill fix: Normalize any produce_name with quantity parentheticals e.g. "Tomatoes (x1)"
UPDATE crm_produce_interests
SET produce_name = trim(regexp_replace(produce_name, '\s*\([xX]?\d+\)', '', 'g'))
WHERE produce_name ~* '\([xX]?\d+\)';

-- 9. Deduplicate any duplicate rows created by old un-sanitized records
DELETE FROM crm_produce_interests a
USING crm_produce_interests b
WHERE a.id > b.id
  AND a.lead_id IS NOT DISTINCT FROM b.lead_id
  AND a.interest_type = b.interest_type
  AND lower(a.produce_name) = lower(b.produce_name);

-- 10. Update Real-time Matching Trigger Functions to use Family Level Normalization
CREATE OR REPLACE FUNCTION match_buyer_to_sellers()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.interest_type = 'buy'::crm_interest_type AND NEW.status = 'active' THEN
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
    WHERE spi.interest_type = 'sell'::crm_interest_type
      AND spi.status = 'active'
      AND normalize_produce_family(spi.produce_name) = normalize_produce_family(NEW.produce_name)
      AND spi.zipcodes && NEW.zipcodes
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 11. Re-create Helper View for AI Campaign Builder
CREATE OR REPLACE VIEW crm_interest_match_candidates AS
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
JOIN crm_produce_interests bpi ON bpi.interest_type = 'buy'::crm_interest_type
  AND bpi.status = 'active'
  AND normalize_produce_family(bpi.produce_name) = normalize_produce_family(spi.produce_name)
  AND bpi.zipcodes && spi.zipcodes
LEFT JOIN crm_interest_matches m ON m.seller_interest_id = spi.id AND m.buyer_interest_id = bpi.id
WHERE spi.interest_type = 'sell'::crm_interest_type
  AND spi.status = 'active'
  AND (m.notified_seller_at IS NULL)
GROUP BY spi.id, spi.lead_id, spi.user_id, u.email, l.email, u.phone_number, l.phone, u.full_name, l.name, spi.produce_name, spi.zipcodes, spi.unsubscribe_token

UNION ALL

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
JOIN market_products p ON normalize_produce_family(p.name) = normalize_produce_family(bpi.produce_name)
  AND p.is_active = true AND p.is_draft = false
LEFT JOIN crm_interest_matches m ON m.buyer_interest_id = bpi.id AND m.created_listing_id = p.id
WHERE bpi.interest_type = 'buy'::crm_interest_type
  AND bpi.status = 'active'
  AND (m.notified_buyer_at IS NULL);

GRANT SELECT ON crm_interest_match_candidates TO anon, authenticated, service_role;
