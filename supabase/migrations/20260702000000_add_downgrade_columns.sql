-- Add pending downgrade tracking columns to seller_subscriptions
ALTER TABLE seller_subscriptions
  ADD COLUMN IF NOT EXISTS downgrade_to_plan text,
  ADD COLUMN IF NOT EXISTS downgrade_booth_ids text[],
  ADD COLUMN IF NOT EXISTS downgrade_effective_at timestamptz;

COMMENT ON COLUMN seller_subscriptions.downgrade_to_plan IS 'Target plan for pending downgrade (lite/pro)';
COMMENT ON COLUMN seller_subscriptions.downgrade_booth_ids IS 'Booth IDs to keep active after downgrade';
COMMENT ON COLUMN seller_subscriptions.downgrade_effective_at IS 'When the downgrade takes effect (end of billing period)';

-- Add 'archived' to market_booths status constraint
ALTER TABLE market_booths DROP CONSTRAINT IF EXISTS market_booths_status_check;
ALTER TABLE market_booths ADD CONSTRAINT market_booths_status_check
  CHECK (status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text]));
