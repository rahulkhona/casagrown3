-- Migration: Add is_ghosted flag to profiles for shadow banning
-- Ghosted users' posts are hidden from other users' feeds but visible to themselves.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_ghosted boolean NOT NULL DEFAULT false;

-- Sparse index: most users are NOT ghosted, so this index is tiny
CREATE INDEX IF NOT EXISTS idx_profiles_ghosted ON profiles (id) WHERE is_ghosted = true;
