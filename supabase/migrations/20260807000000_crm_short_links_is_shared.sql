-- Migration: Add is_shared column to crm_short_links to prevent share metrics false positives
ALTER TABLE crm_short_links ADD COLUMN IF NOT EXISTS is_shared BOOLEAN DEFAULT false;

-- Create index on is_shared for faster metrics querying
CREATE INDEX IF NOT EXISTS idx_crm_short_links_is_shared ON crm_short_links (is_shared);

-- Backfill existing records to true to preserve historical metrics data
UPDATE crm_short_links SET is_shared = true WHERE is_shared IS DISTINCT FROM true;
