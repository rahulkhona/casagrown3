-- ============================================================================
-- Migration: Expand crm_leads with strict columns for waitlist data
-- ============================================================================
-- Replaces JSONB metadata reliance with strict typed columns to prevent key drift
-- ============================================================================

SET search_path TO public, extensions;

ALTER TABLE crm_leads 
  ADD COLUMN IF NOT EXISTS zipcode TEXT,
  ADD COLUMN IF NOT EXISTS has_backyard BOOLEAN,
  ADD COLUMN IF NOT EXISTS produce_interests TEXT,
  ADD COLUMN IF NOT EXISTS ip_address TEXT,
  ADD COLUMN IF NOT EXISTS device_type TEXT;

-- Add an index on zipcode since it's a common regional filtering parameter
CREATE INDEX IF NOT EXISTS idx_crm_leads_zipcode ON crm_leads (zipcode);
