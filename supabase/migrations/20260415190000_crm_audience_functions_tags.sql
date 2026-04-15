-- ============================================================
-- Add tags column to crm_audience_functions
-- ============================================================
-- Allows tagging functions for keyword search in the Admin UI.
-- Tags are a text array, e.g. ARRAY['buyers', 'high-value', 'loyalty']
-- ============================================================

ALTER TABLE crm_audience_functions
  ADD COLUMN IF NOT EXISTS tags text[];

-- Back-fill built-in functions with starter tags
UPDATE crm_audience_functions
SET tags = ARRAY['all', 'contacts', 'leads', 'users']
WHERE name = 'crm_audience_all';

UPDATE crm_audience_functions
SET tags = ARRAY['leads', 'facebook', 'forms', 'unregistered']
WHERE name = 'crm_audience_leads_only';

UPDATE crm_audience_functions
SET tags = ARRAY['users', 'registered', 'accounts']
WHERE name = 'crm_audience_users_only';
