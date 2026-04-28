-- Add the content column
ALTER TABLE crm_assets ADD COLUMN IF NOT EXISTS content TEXT;

-- Drop the old constraint and add the new one with template types
ALTER TABLE crm_assets DROP CONSTRAINT IF EXISTS crm_assets_type_check;

ALTER TABLE crm_assets ADD CONSTRAINT crm_assets_type_check 
  CHECK (type IN ('image', 'video', 'audio', 'document', 'email_template', 'sms_template'));
