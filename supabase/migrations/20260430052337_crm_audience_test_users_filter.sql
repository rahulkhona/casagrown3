-- Recreate crm_audience_valid_leads_and_users to properly exclude E2E test users and admins
DROP FUNCTION IF EXISTS crm_audience_valid_leads_and_users();
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
  -- Step 1: Get all valid users from profiles
  WITH valid_users AS (
    SELECT
      p.id,
      'user'::TEXT   AS recipient_type,
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
      AND p.email NOT ILIKE '%@test.com'
      AND p.email NOT ILIKE '%@test.local'
      AND p.email NOT ILIKE '%@casagrown.local'
      AND p.email NOT ILIKE 'casabot@casagrown.com'
      AND p.email NOT ILIKE 'admin@casagrown.com'
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
      AND l.email NOT ILIKE '%@test.com'
      AND l.email NOT ILIKE '%@test.local'
      AND l.email NOT ILIKE '%@casagrown.local'
      AND l.email NOT ILIKE 'casabot@casagrown.com'
      AND l.email NOT ILIKE 'admin@casagrown.com'
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
