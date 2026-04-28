-- Register the Beta Testers RPC into the crm_audience_functions registry
-- This allows the Admin UI to discover the Postgres RPC when a marketer is building a new audience segment.
INSERT INTO crm_audience_functions (name, label, description, is_rpc, is_active)
VALUES (
  'crm_audience_beta_testers',
  'Active Beta Testers',
  'Users who signed up for beta testing and have been marked as active.',
  true,
  true
)
ON CONFLICT (name) DO NOTHING;
