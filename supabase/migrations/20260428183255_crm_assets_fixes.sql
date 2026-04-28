-- Add the missing name column (which was accidentally omitted from the original schema but used in the UI)
ALTER TABLE crm_assets ADD COLUMN IF NOT EXISTS name TEXT;

-- Drop NOT NULL from storage_path since templates (email/sms) do not have files uploaded to storage buckets
ALTER TABLE crm_assets ALTER COLUMN storage_path DROP NOT NULL;
