-- ============================================================================
-- Migration: Add Geography columns to crm_leads and update Audience RPCs
-- ============================================================================
-- Adds city, county, state_code, country to crm_leads and exposes them in
-- all crm_audience_* RPCs to enable native geographic targeting.
-- ============================================================================

SET search_path TO public, extensions;

-- 1. Add new columns to crm_leads
ALTER TABLE crm_leads 
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS county TEXT,
  ADD COLUMN IF NOT EXISTS state_code TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT;

-- 2. Drop existing Audience RPCs since we are changing their return signature
DROP FUNCTION IF EXISTS crm_audience_all();
DROP FUNCTION IF EXISTS crm_audience_has_bought_before();
DROP FUNCTION IF EXISTS crm_audience_has_sold_before();
DROP FUNCTION IF EXISTS crm_audience_expressed_buying_interest();

-- 3. Recreate RPCs with the new `county` and `country` columns

-- Default: all leads + users
CREATE OR REPLACE FUNCTION crm_audience_all()
RETURNS TABLE(
  id             UUID,
  recipient_type TEXT,
  email          TEXT,
  phone          TEXT,
  name           TEXT,
  state_code     TEXT,
  city           TEXT,
  county         TEXT,
  country        TEXT,
  zip_code       TEXT,
  community_h3   TEXT,
  joined_at      TIMESTAMPTZ,
  accepts_email  BOOLEAN,
  accepts_sms    BOOLEAN
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    l.id,
    'lead'::TEXT  AS recipient_type,
    l.email,
    l.phone,
    l.name,
    l.state_code,
    l.city,
    l.county,
    l.country,
    l.zipcode     AS zip_code,
    NULL::TEXT    AS community_h3,
    l.created_at  AS joined_at,
    l.accepts_email,
    l.accepts_sms
  FROM crm_leads l
  WHERE l.status != 'archived'

  UNION ALL

  SELECT
    p.id,
    'user'::TEXT  AS recipient_type,
    p.email,
    p.phone_number AS phone,
    p.full_name    AS name,
    p.state_code,
    p.city,
    p.county,
    p.country_code AS country,
    p.zip_code,
    NULL::TEXT     AS community_h3,
    p.created_at   AS joined_at,
    TRUE           AS accepts_email,
    (p.phone_number IS NOT NULL) AS accepts_sms
  FROM profiles p;
$$;

-- Users who completed at least one order
CREATE OR REPLACE FUNCTION crm_audience_has_bought_before()
RETURNS TABLE(
  id UUID, recipient_type TEXT, email TEXT, phone TEXT, name TEXT,
  state_code TEXT, city TEXT, county TEXT, country TEXT, zip_code TEXT, community_h3 TEXT,
  joined_at TIMESTAMPTZ, accepts_email BOOLEAN, accepts_sms BOOLEAN
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    p.id, 'user'::TEXT, p.email, p.phone_number, p.full_name,
    p.state_code, p.city, p.county, p.country_code, p.zip_code, NULL::TEXT, p.created_at,
    TRUE, (p.phone_number IS NOT NULL)
  FROM profiles p
  WHERE EXISTS (
    SELECT 1 FROM market_orders o
    WHERE o.buyer_id = p.id AND o.status = 'completed'
  );
$$;

-- Users who have made at least one completed sale
CREATE OR REPLACE FUNCTION crm_audience_has_sold_before()
RETURNS TABLE(
  id UUID, recipient_type TEXT, email TEXT, phone TEXT, name TEXT,
  state_code TEXT, city TEXT, county TEXT, country TEXT, zip_code TEXT, community_h3 TEXT,
  joined_at TIMESTAMPTZ, accepts_email BOOLEAN, accepts_sms BOOLEAN
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    p.id, 'user'::TEXT, p.email, p.phone_number, p.full_name,
    p.state_code, p.city, p.county, p.country_code, p.zip_code, NULL::TEXT, p.created_at,
    TRUE, (p.phone_number IS NOT NULL)
  FROM profiles p
  WHERE EXISTS (
    SELECT 1 FROM market_orders o
    WHERE o.seller_id = p.id AND o.status = 'completed'
  );
$$;

-- Users who have expressed buying intent via product watches
CREATE OR REPLACE FUNCTION crm_audience_expressed_buying_interest()
RETURNS TABLE(
  id UUID, recipient_type TEXT, email TEXT, phone TEXT, name TEXT,
  state_code TEXT, city TEXT, county TEXT, country TEXT, zip_code TEXT, community_h3 TEXT,
  joined_at TIMESTAMPTZ, accepts_email BOOLEAN, accepts_sms BOOLEAN
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT DISTINCT
    p.id, 'user'::TEXT, p.email, p.phone_number, p.full_name,
    p.state_code, p.city, p.county, p.country_code, p.zip_code, NULL::TEXT, p.created_at,
    TRUE, (p.phone_number IS NOT NULL)
  FROM profiles p
  WHERE EXISTS (
    SELECT 1 FROM product_watches w
    WHERE w.user_id = p.id
  );
$$;
