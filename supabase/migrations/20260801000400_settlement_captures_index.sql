-- ============================================================================
-- BUG-19: Settlement Captures Index
--
-- Add a composite index on settlement_captures(settlement_id, capture_status)
-- to speed up settlement queries that filter by both columns.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_sc_settlement_status
  ON settlement_captures(settlement_id, capture_status);
