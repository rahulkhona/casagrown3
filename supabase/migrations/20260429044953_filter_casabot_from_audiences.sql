-- ============================================================
-- CRM Audience RPC: Valid Leads & Users (Deduped)
-- ============================================================

-- This function returns a deduped list of users and leads with valid emails.
-- It excludes common test domains (@example.com, @test.com).
-- If an email exists in both tables, the user record takes precedence over the lead record.

CREATE OR REPLACE FUNCTION crm_audience_valid_leads_and_users()
RETURNS TABLE(
  id             UUID,
  recipient_type TEXT,
  email          TEXT,
  phone          TEXT,
  name           TEXT,
  state_code     TEXT,
  city           TEXT,
  zip_code       TEXT,
  community_h3   TEXT,
  joined_at      TIMESTAMPTZ,
  accepts_email  BOOLEAN,
  accepts_sms    BOOLEAN
)
LANGUAGE sql SECURITY DEFINER AS $$
  -- Step 1: Get all valid users
  WITH valid_users AS (
    SELECT
      p.id,
      'user'::TEXT  AS recipient_type,
      p.email,
      p.phone_number AS phone,
      p.full_name    AS name,
      p.state_code,
      NULL::TEXT     AS city,
      p.zip_code,
      NULL::TEXT     AS community_h3,
      p.created_at   AS joined_at,
      TRUE           AS accepts_email,
      (p.phone_number IS NOT NULL) AS accepts_sms
    FROM profiles p
    WHERE p.email IS NOT NULL
      AND p.email NOT ILIKE '%@example.com'
      AND p.email NOT ILIKE '%@test.com' AND p.email NOT ILIKE 'casabot@casagrown.com'
  ),
  -- Step 2: Get all valid leads, deduping against profiles table
  valid_leads AS (
    SELECT
      l.id,
      'lead'::TEXT  AS recipient_type,
      l.email,
      l.phone,
      l.name,
      NULL::TEXT    AS state_code,
      NULL::TEXT    AS city,
      NULL::TEXT    AS zip_code,
      NULL::TEXT    AS community_h3,
      l.created_at  AS joined_at,
      l.accepts_email,
      l.accepts_sms
    FROM crm_leads l
    WHERE l.status != 'archived'
      AND l.email IS NOT NULL
      AND l.email NOT ILIKE '%@example.com'
      AND l.email NOT ILIKE '%@test.com' AND l.email NOT ILIKE 'casabot@casagrown.com'
      -- Ensure this email does not already exist in the profiles table
      AND NOT EXISTS (
        SELECT 1 FROM profiles p WHERE p.email = l.email
      )
  )
  -- Step 3: Combine them and enforce unique emails
  SELECT DISTINCT ON (email) * 
  FROM (
    SELECT * FROM valid_users
    UNION ALL
    SELECT * FROM valid_leads
  ) combined_audience;
$$;
-- Recreate ALL audience functions to filter out automated E2E test users

DROP FUNCTION IF EXISTS crm_audience_all();
CREATE OR REPLACE FUNCTION crm_audience_all()
RETURNS TABLE(
  id             UUID,
  recipient_type TEXT,
  email          TEXT,
  phone          TEXT,
  name           TEXT,
  state_code     TEXT,
  city           TEXT,
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
    NULL::TEXT    AS state_code,
    NULL::TEXT    AS city,
    NULL::TEXT    AS zip_code,
    NULL::TEXT    AS community_h3,
    l.created_at  AS joined_at,
    l.accepts_email,
    l.accepts_sms
  FROM crm_leads l
  WHERE l.status != 'archived'
    AND l.email NOT LIKE '%@test.local' AND l.email NOT LIKE '%@casagrown.local' AND l.email NOT ILIKE 'casabot@casagrown.com'
  UNION ALL
  SELECT
    p.id,
    'user'::TEXT AS recipient_type,
    p.email,
    p.phone_number AS phone,
    p.full_name AS name,
    p.state_code,
    NULL::TEXT AS city,
    p.zip_code,
    NULL::TEXT AS community_h3,
    p.created_at AS joined_at,
    TRUE AS accepts_email,
    (p.phone_number IS NOT NULL) AS accepts_sms
  FROM profiles p
  WHERE p.email NOT LIKE '%@test.local' AND p.email NOT LIKE '%@casagrown.local' AND p.email NOT ILIKE 'casabot@casagrown.com';
$$;

DROP FUNCTION IF EXISTS crm_audience_leads_only();
CREATE OR REPLACE FUNCTION crm_audience_leads_only()
RETURNS TABLE(
  id             UUID,
  recipient_type TEXT,
  email          TEXT,
  phone          TEXT,
  name           TEXT,
  state_code     TEXT,
  city           TEXT,
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
    NULL::TEXT    AS state_code,
    NULL::TEXT    AS city,
    NULL::TEXT    AS zip_code,
    NULL::TEXT    AS community_h3,
    l.created_at  AS joined_at,
    l.accepts_email,
    l.accepts_sms
  FROM crm_leads l
  WHERE l.status != 'archived'
    AND l.email NOT LIKE '%@test.local' AND l.email NOT LIKE '%@casagrown.local' AND l.email NOT ILIKE 'casabot@casagrown.com';
$$;

DROP FUNCTION IF EXISTS crm_audience_users_only();
CREATE OR REPLACE FUNCTION crm_audience_users_only()
RETURNS TABLE(
  id             UUID,
  recipient_type TEXT,
  email          TEXT,
  phone          TEXT,
  name           TEXT,
  state_code     TEXT,
  city           TEXT,
  zip_code       TEXT,
  community_h3   TEXT,
  joined_at      TIMESTAMPTZ,
  accepts_email  BOOLEAN,
  accepts_sms    BOOLEAN
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    p.id,
    'user'::TEXT AS recipient_type,
    p.email,
    p.phone_number AS phone,
    p.full_name AS name,
    p.state_code,
    NULL::TEXT AS city,
    p.zip_code,
    NULL::TEXT AS community_h3,
    p.created_at AS joined_at,
    TRUE AS accepts_email,
    (p.phone_number IS NOT NULL) AS accepts_sms
  FROM profiles p
  WHERE p.email NOT LIKE '%@test.local' AND p.email NOT LIKE '%@casagrown.local' AND p.email NOT ILIKE 'casabot@casagrown.com';
$$;

DROP FUNCTION IF EXISTS crm_audience_beta_testers();
CREATE OR REPLACE FUNCTION crm_audience_beta_testers()
RETURNS TABLE(
  id UUID, recipient_type TEXT, email TEXT, phone TEXT, name TEXT,
  state_code TEXT, city TEXT, zip_code TEXT, community_h3 TEXT,
  joined_at TIMESTAMPTZ, accepts_email BOOLEAN, accepts_sms BOOLEAN
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    b.id, 'lead'::TEXT, b.email, b.phone_number, b.full_name,
    s.code AS state_code, 
    c.name AS city, 
    b.zip_code, 
    NULL::TEXT, 
    b.created_at,
    TRUE, (b.phone_number IS NOT NULL)
  FROM beta_testers b
  LEFT JOIN zip_codes z ON z.zip_code = b.zip_code
  LEFT JOIN cities c ON c.id = z.city_id
  LEFT JOIN states s ON s.id = c.state_id
  WHERE b.status = 'active'
    AND b.email NOT LIKE '%@test.local' AND b.email NOT LIKE '%@casagrown.local' AND b.email NOT ILIKE 'casabot@casagrown.com';
$$;

DROP FUNCTION IF EXISTS crm_audience_has_bought_before();
CREATE OR REPLACE FUNCTION crm_audience_has_bought_before()
RETURNS TABLE(
  id UUID, recipient_type TEXT, email TEXT, phone TEXT, name TEXT,
  state_code TEXT, city TEXT, zip_code TEXT, community_h3 TEXT,
  joined_at TIMESTAMPTZ, accepts_email BOOLEAN, accepts_sms BOOLEAN
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    p.id, 'user'::TEXT, p.email, p.phone_number, p.full_name,
    p.state_code, NULL::TEXT, p.zip_code, NULL::TEXT, p.created_at,
    TRUE, (p.phone_number IS NOT NULL)
  FROM profiles p
  WHERE p.email NOT LIKE '%@test.local' AND p.email NOT LIKE '%@casagrown.local' AND p.email NOT ILIKE 'casabot@casagrown.com'
  AND EXISTS (
    SELECT 1 FROM market_orders o
    WHERE o.buyer_id = p.id AND o.status = 'completed'
  );
$$;

DROP FUNCTION IF EXISTS crm_audience_has_sold_before();
CREATE OR REPLACE FUNCTION crm_audience_has_sold_before()
RETURNS TABLE(
  id UUID, recipient_type TEXT, email TEXT, phone TEXT, name TEXT,
  state_code TEXT, city TEXT, zip_code TEXT, community_h3 TEXT,
  joined_at TIMESTAMPTZ, accepts_email BOOLEAN, accepts_sms BOOLEAN
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    p.id, 'user'::TEXT, p.email, p.phone_number, p.full_name,
    p.state_code, NULL::TEXT, p.zip_code, NULL::TEXT, p.created_at,
    TRUE, (p.phone_number IS NOT NULL)
  FROM profiles p
  WHERE p.email NOT LIKE '%@test.local' AND p.email NOT LIKE '%@casagrown.local' AND p.email NOT ILIKE 'casabot@casagrown.com'
  AND EXISTS (
    SELECT 1 FROM market_orders o
    WHERE o.seller_id = p.id AND o.status = 'completed'
  );
$$;

DROP FUNCTION IF EXISTS crm_audience_expressed_buying_interest();
CREATE OR REPLACE FUNCTION crm_audience_expressed_buying_interest()
RETURNS TABLE(
  id UUID, recipient_type TEXT, email TEXT, phone TEXT, name TEXT,
  state_code TEXT, city TEXT, zip_code TEXT, community_h3 TEXT,
  joined_at TIMESTAMPTZ, accepts_email BOOLEAN, accepts_sms BOOLEAN
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT DISTINCT
    p.id, 'user'::TEXT, p.email, p.phone_number, p.full_name,
    p.state_code, NULL::TEXT, p.zip_code, NULL::TEXT, p.created_at,
    TRUE, (p.phone_number IS NOT NULL)
  FROM profiles p
  JOIN product_watches pw ON pw.user_id = p.id
  WHERE p.email NOT LIKE '%@test.local' AND p.email NOT LIKE '%@casagrown.local' AND p.email NOT ILIKE 'casabot@casagrown.com';
$$;
