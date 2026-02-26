-- Add the delegations table to supabase_realtime publication so the
-- RealtimeNotificationListener can trigger in-app toasts when relationships
-- are accepted, revoked, or rejected.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'delegations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE delegations;
  END IF;
END $$;
