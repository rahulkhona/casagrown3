-- Register get_hubspot_leads in crm_audience_functions
INSERT INTO public.crm_audience_functions (name, label, description, is_rpc, is_active)
VALUES (
  'get_hubspot_leads',
  'HubSpot Leads',
  'Only leads synced from the HubSpot CRM integration.',
  true,
  true
)
ON CONFLICT (name) DO NOTHING;

-- Seed get_hubspot_leads into the saved crm_audiences dropdown options
INSERT INTO public.crm_audiences (name, description, recipient_type, audience_rpc_name)
VALUES (
  'HubSpot Leads',
  'Only leads synced from the HubSpot CRM integration.',
  'leads',
  'get_hubspot_leads'
)
ON CONFLICT DO NOTHING;
