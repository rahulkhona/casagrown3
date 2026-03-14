-- ============================================================================
-- Migration: Add county to profiles for jurisdiction resolution
-- ============================================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS county TEXT;
