-- Create database function to serve as an audience filter for HubSpot leads
CREATE OR REPLACE FUNCTION public.get_hubspot_leads()
RETURNS SETOF public.crm_leads AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.crm_leads
  WHERE metadata->>'ingested_from' = 'hubspot';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.get_hubspot_leads() TO anon, authenticated, service_role;
