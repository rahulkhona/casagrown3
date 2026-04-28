-- Fix the All audience to actually include both leads and users
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
  -- Leads
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
  UNION ALL
  -- Users (Profiles)
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
  FROM profiles p;
$$;

-- Create the completely missing Leads Only audience
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
  WHERE l.status != 'archived';
$$;

-- Create the completely missing Users Only audience
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
  FROM profiles p;
$$;
