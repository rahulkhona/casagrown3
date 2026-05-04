-- Restore structured error logging to quarantine_bot_health.
-- The log_summary column was previously dropped to save space (20260406000000_bot_cache_and_health.sql).
-- Re-adding as error_log (jsonb) to persist per-source errors and schema issues
-- so the admin dashboard can surface exactly which source/URL failed without
-- requiring Supabase dashboard access.
--
-- Schema: { source_name: { status, errors[], warnings[], schema_issues[] } }

ALTER TABLE quarantine_bot_health
ADD COLUMN IF NOT EXISTS error_log jsonb;
