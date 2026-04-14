-- ============================================================================
-- Migration: Add missing data_source column
-- Fixes a bug in the main branch where the atomic_bot_sync RPC 
-- attempts to insert a data_source value into the quarantine_zones 
-- table, but the column was never formally created.
-- ============================================================================

ALTER TABLE public.quarantine_zones
  ADD COLUMN IF NOT EXISTS data_source TEXT NOT NULL DEFAULT 'seed';
