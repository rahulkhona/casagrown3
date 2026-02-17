-- Add orders and point_ledger tables to supabase_realtime publication so the
-- chat UI receives live updates when an order is modified/cancelled/accepted,
-- and the points balance auto-refreshes when escrow/refund entries are created.

ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE point_ledger;
