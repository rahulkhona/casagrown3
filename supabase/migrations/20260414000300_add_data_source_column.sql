-- ============================================================================
-- Migration: Add missing data_source column to quarantine_zones
-- The sync_bot_quarantines RPC references this column but it was never
-- added to the table schema.
-- ============================================================================

ALTER TABLE quarantine_zones
  ADD COLUMN IF NOT EXISTS data_source TEXT NOT NULL DEFAULT 'seed';
