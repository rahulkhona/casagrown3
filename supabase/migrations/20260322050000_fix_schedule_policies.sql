-- ============================================================================
-- Ensure market_schedule_policies has correct RLS + data
-- Re-applies setup that may have been lost during migration ordering
-- ============================================================================

-- Ensure RLS is enabled
ALTER TABLE market_schedule_policies ENABLE ROW LEVEL SECURITY;

-- Re-create the read policy (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'market_schedule_policies'
      AND policyname = 'Anyone can read schedule'
  ) THEN
    CREATE POLICY "Anyone can read schedule"
      ON market_schedule_policies FOR SELECT USING (true);
  END IF;
END $$;

-- Ensure staff can update schedule (the admin app updates via service_role,
-- but this policy is needed if we ever use RLS-respecting clients)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'market_schedule_policies'
      AND policyname = 'Staff can update schedule'
  ) THEN
    CREATE POLICY "Staff can update schedule"
      ON market_schedule_policies FOR ALL
      USING (is_staff(auth.uid()))
      WITH CHECK (is_staff(auth.uid()));
  END IF;
END $$;

-- Ensure all 7 days exist (in case data was lost)
INSERT INTO market_schedule_policies (day_of_week, day_name, open_time, close_time, is_enabled)
VALUES
  (0, 'Sunday',    '08:00', '11:00', false),
  (1, 'Monday',    '08:00', '11:00', false),
  (2, 'Tuesday',   '08:00', '11:00', false),
  (3, 'Wednesday', '08:00', '11:00', false),
  (4, 'Thursday',  '08:00', '11:00', false),
  (5, 'Friday',    '08:00', '11:00', false),
  (6, 'Saturday',  '08:00', '11:00', true)
ON CONFLICT (day_of_week) DO NOTHING;

-- Ensure market_settings singleton row exists
INSERT INTO market_settings (id, products_never_expire, market_never_closes)
VALUES (true, false, false)
ON CONFLICT (id) DO NOTHING;

-- Grant usage on the table to authenticated and anon roles
GRANT SELECT ON market_schedule_policies TO authenticated, anon;
GRANT SELECT ON market_settings TO authenticated, anon;
