CREATE TABLE IF NOT EXISTS crm_data_sources (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  description       TEXT,
  rpc_name          TEXT NOT NULL,
  return_schema     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE crm_campaigns ADD COLUMN IF NOT EXISTS data_source_id UUID REFERENCES crm_data_sources (id) ON DELETE SET NULL;
ALTER TABLE crm_campaigns ADD COLUMN IF NOT EXISTS postmark_template_alias TEXT;
ALTER TABLE crm_campaigns ADD COLUMN IF NOT EXISTS system_alias TEXT UNIQUE;
ALTER TABLE crm_campaigns ADD COLUMN IF NOT EXISTS target_states TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE crm_campaigns ADD COLUMN IF NOT EXISTS target_cities TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE crm_campaigns ADD COLUMN IF NOT EXISTS target_counties TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE crm_campaigns ADD COLUMN IF NOT EXISTS target_zips TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE crm_campaigns ADD COLUMN IF NOT EXISTS target_h3s TEXT[] NOT NULL DEFAULT '{}';
