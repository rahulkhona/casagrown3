-- ============================================================================
-- Set market_never_closes = true in the database.
-- The market is now always on — traffic is driven by notifications on market days.
-- ============================================================================

UPDATE market_settings SET market_never_closes = true WHERE id = true;
