-- The public_url column was added manually to the Staging database via Supabase Studio, 
-- but it was made NOT NULL. Since email/sms templates do not have public URLs (and the UI 
-- doesn't send them during creation), we need to ensure this column exists in source control 
-- and that it allows NULL values.

ALTER TABLE crm_assets DROP COLUMN IF EXISTS public_url;
