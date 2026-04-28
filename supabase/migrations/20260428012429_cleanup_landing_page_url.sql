-- Ensure the stray 'url' column is formally dropped from all environments
ALTER TABLE crm_landing_pages DROP COLUMN IF EXISTS url;
