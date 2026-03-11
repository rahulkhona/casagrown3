-- ============================================================================
-- Migration: Update Restriction & Threshold Tables for Jurisdictions
-- Includes:
-- 1. category_restrictions update
-- 2. blocked_products update
-- 3. redemption_merchandize_restrictions update
-- 4. small_balance_refund_thresholds update
-- ============================================================================

-- 1. category_restrictions
ALTER TABLE category_restrictions
DROP CONSTRAINT IF EXISTS category_restrictions_category_name_community_h3_index_key,
DROP COLUMN IF EXISTS community_h3_index;

ALTER TABLE category_restrictions
ADD COLUMN IF NOT EXISTS country_iso_3 TEXT REFERENCES countries(iso_3),
ADD COLUMN IF NOT EXISTS state_id UUID REFERENCES states(id),
ADD COLUMN IF NOT EXISTS county_id UUID REFERENCES counties(id),
ADD COLUMN IF NOT EXISTS city_id UUID REFERENCES cities(id);

CREATE UNIQUE INDEX IF NOT EXISTS category_restrictions_unified_idx 
ON category_restrictions (
  category_name, 
  COALESCE(country_iso_3, ''), 
  COALESCE(state_id, '00000000-0000-0000-0000-000000000000'::uuid), 
  COALESCE(county_id, '00000000-0000-0000-0000-000000000000'::uuid), 
  COALESCE(city_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

-- 2. blocked_products
ALTER TABLE blocked_products
DROP CONSTRAINT IF EXISTS blocked_products_product_name_community_h3_index_key,
DROP COLUMN IF EXISTS community_h3_index;

ALTER TABLE blocked_products
ADD COLUMN IF NOT EXISTS country_iso_3 TEXT REFERENCES countries(iso_3),
ADD COLUMN IF NOT EXISTS state_id UUID REFERENCES states(id),
ADD COLUMN IF NOT EXISTS county_id UUID REFERENCES counties(id),
ADD COLUMN IF NOT EXISTS city_id UUID REFERENCES cities(id);

CREATE UNIQUE INDEX IF NOT EXISTS blocked_products_unified_idx
ON blocked_products (
  product_name,
  COALESCE(country_iso_3, ''), 
  COALESCE(state_id, '00000000-0000-0000-0000-000000000000'::uuid), 
  COALESCE(county_id, '00000000-0000-0000-0000-000000000000'::uuid), 
  COALESCE(city_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

-- 3. redemption_merchandize_restrictions
ALTER TABLE redemption_merchandize_restrictions
DROP CONSTRAINT IF EXISTS redemption_merchandize_restric_merchandize_id_scope_count_key,
DROP COLUMN IF EXISTS zip_code,
DROP COLUMN IF EXISTS community_h3_index;

ALTER TABLE redemption_merchandize_restrictions
ADD COLUMN IF NOT EXISTS county_id UUID REFERENCES counties(id);

CREATE UNIQUE INDEX IF NOT EXISTS redemption_merchandize_restrictions_unified_idx
ON redemption_merchandize_restrictions (
  merchandize_id,
  scope,
  COALESCE(country_iso_3, ''), 
  COALESCE(state_id, '00000000-0000-0000-0000-000000000000'::uuid), 
  COALESCE(county_id, '00000000-0000-0000-0000-000000000000'::uuid), 
  COALESCE(city_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

-- 4. small_balance_refund_thresholds
ALTER TABLE small_balance_refund_thresholds
DROP CONSTRAINT IF EXISTS small_balance_refund_thresholds_pkey;

ALTER TABLE small_balance_refund_thresholds
DROP COLUMN IF EXISTS state_code;

ALTER TABLE small_balance_refund_thresholds
ADD COLUMN IF NOT EXISTS country_iso_3 TEXT REFERENCES countries(iso_3) DEFAULT 'USA',
ADD COLUMN IF NOT EXISTS state_id UUID REFERENCES states(id),
ADD COLUMN IF NOT EXISTS county_id UUID REFERENCES counties(id),
ADD COLUMN IF NOT EXISTS city_id UUID REFERENCES cities(id);

CREATE UNIQUE INDEX IF NOT EXISTS small_balance_refund_thresholds_pk_idx
ON small_balance_refund_thresholds (
  COALESCE(country_iso_3, ''),
  COALESCE(state_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(county_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(city_id, '00000000-0000-0000-0000-000000000000'::uuid)
);
