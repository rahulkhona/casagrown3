-- Per-product fulfillment overrides
ALTER TABLE market_products ADD COLUMN IF NOT EXISTS delivery_radius_miles integer;
ALTER TABLE market_products ADD COLUMN IF NOT EXISTS pickup_address text;
