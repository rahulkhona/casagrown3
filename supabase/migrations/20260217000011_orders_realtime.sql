-- Add orders and point_ledger tables to supabase_realtime publication so the
-- chat UI receives live updates when an order is modified/cancelled/accepted,
-- and the points balance auto-refreshes when escrow/refund entries are created.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE orders;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'point_ledger'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE point_ledger;
  END IF;
END $$;
