-- Add pickup_instructions and pickup_notice_minutes to market_products and market_orders
ALTER TABLE market_products 
  ADD COLUMN IF NOT EXISTS pickup_instructions TEXT,
  ADD COLUMN IF NOT EXISTS pickup_notice_minutes INT DEFAULT 30;

COMMENT ON COLUMN market_products.pickup_instructions IS 'Seller instructions for order pickup handoff (e.g. "Meet by the park benches")';
COMMENT ON COLUMN market_products.pickup_notice_minutes IS 'Minutes of advance notice buyer should give seller before arriving (e.g. 15, 30, 60)';

ALTER TABLE market_orders 
  ADD COLUMN IF NOT EXISTS pickup_instructions TEXT,
  ADD COLUMN IF NOT EXISTS pickup_notice_minutes INT DEFAULT 30;

COMMENT ON COLUMN market_orders.pickup_instructions IS 'Snapshot of seller instructions for pickup handoff at time of order';
COMMENT ON COLUMN market_orders.pickup_notice_minutes IS 'Snapshot of advance notice minutes required from buyer';
