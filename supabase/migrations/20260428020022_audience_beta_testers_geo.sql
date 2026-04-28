-- Update the RPC for the Active Beta Testers audience to map zip_code to geography
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
  WHERE b.status = 'active';
$$;
