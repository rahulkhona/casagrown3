-- ============================================================================
-- Migration: Add booth status (draft/published) and make name nullable
-- ============================================================================

-- Add status column: draft booths are auto-created, published when ready
ALTER TABLE market_booths
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published'));

-- Allow name to default for auto-created draft booths
ALTER TABLE market_booths ALTER COLUMN name SET DEFAULT 'My Booth';
