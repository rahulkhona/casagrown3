-- ============================================================================
-- BUG-28: user_balances CHECK Constraint
--
-- Prevent available_usd from going negative, which would indicate a
-- double-spend or balance accounting bug. This is a safety net — the
-- application logic should never allow this, but the constraint ensures
-- data integrity at the database level.
-- ============================================================================

-- Fix any existing negative balances before adding constraint
UPDATE user_balances SET available_usd = 0 WHERE available_usd < 0;

-- Add constraint (use DO block to skip if already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_available_usd_non_negative'
  ) THEN
    ALTER TABLE user_balances
      ADD CONSTRAINT chk_available_usd_non_negative CHECK (available_usd >= 0);
  END IF;
END $$;
