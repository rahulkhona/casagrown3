-- ============================================================================
-- Migration: Add Admin Flags to Quarantine Zones
-- Modifies the table to track 'created_by_admin' and 'admin_overridden'
-- ============================================================================

ALTER TABLE quarantine_zones 
ADD COLUMN IF NOT EXISTS created_by_admin BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS admin_overridden BOOLEAN NOT NULL DEFAULT false;

-- Add a comment explaining the schema policy
COMMENT ON COLUMN quarantine_zones.created_by_admin IS 'True if an admin manually added this row. Bots should never delete or overwrite these rows.';
COMMENT ON COLUMN quarantine_zones.admin_overridden IS 'True if an admin explicitly disabled a bot-created row (marking is_active=false). Bots should ignore updates to this row until an admin re-enables it or deletes it.';
