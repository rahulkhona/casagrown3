-- ============================================================================
-- Migration: Flush stuck sequence enrollments (email + SMS)
--
-- Resets next_evaluation_at to NOW for all active enrollments that have a
-- future next_evaluation_at.  This ensures the next cron invocation of
-- process-sequence-step picks them up immediately rather than waiting for
-- a future send-slot window that was incorrectly calculated.
-- ============================================================================

-- First, audit how many are stuck (logged via RAISE NOTICE for visibility)
DO $$
DECLARE
  stuck_count INTEGER;
BEGIN
  SELECT count(*)
    INTO stuck_count
    FROM crm_sequence_enrollments
   WHERE status = 'active'
     AND next_evaluation_at > now();

  RAISE NOTICE 'Resetting % stuck active enrollments to process immediately', stuck_count;
END $$;

-- Reset all stuck active enrollments so the cron picks them up on the next run
UPDATE crm_sequence_enrollments
   SET next_evaluation_at = now()
 WHERE status = 'active'
   AND next_evaluation_at > now();
