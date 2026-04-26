-- Seed initial CRM Audience
INSERT INTO crm_audiences (name, description, recipient_type, audience_rpc_name)
SELECT 'All Leads + Existing Users', 'A combined, deduplicated list of all registered users and all captured marketing leads.', 'both', 'crm_audience_valid_leads_and_users'
WHERE NOT EXISTS (
  SELECT 1 FROM crm_audiences WHERE audience_rpc_name = 'crm_audience_valid_leads_and_users'
);
