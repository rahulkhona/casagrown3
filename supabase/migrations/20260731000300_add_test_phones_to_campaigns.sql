-- ============================================================================
-- Migration: Add test_phones to crm_campaigns
-- Adds `test_phones TEXT[]` column to support testing SMS marketing campaigns.
-- ============================================================================

ALTER TABLE crm_campaigns ADD COLUMN IF NOT EXISTS test_phones TEXT[] NOT NULL DEFAULT '{}';
