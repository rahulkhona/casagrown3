-- Create the RPC for the Active Beta Testers audience
CREATE OR REPLACE FUNCTION crm_audience_beta_testers()
RETURNS TABLE(
  id UUID, recipient_type TEXT, email TEXT, phone TEXT, name TEXT,
  state_code TEXT, city TEXT, zip_code TEXT, community_h3 TEXT,
  joined_at TIMESTAMPTZ, accepts_email BOOLEAN, accepts_sms BOOLEAN
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    b.id, 'lead'::TEXT, b.email, b.phone_number, b.full_name,
    NULL::TEXT, NULL::TEXT, b.zip_code, NULL::TEXT, b.created_at,
    TRUE, (b.phone_number IS NOT NULL)
  FROM beta_testers b
  WHERE b.status = 'active';
$$;

-- Register the audience in the CRM so it appears in dropdowns
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM crm_audiences WHERE audience_rpc_name = 'crm_audience_beta_testers') THEN
    INSERT INTO crm_audiences (name, description, recipient_type, audience_rpc_name)
    VALUES (
      'Active Beta Testers',
      'Users who signed up for beta testing and have been marked as active.',
      'leads',
      'crm_audience_beta_testers'
    );
  END IF;
END $$;
