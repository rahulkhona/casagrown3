-- Add top_up_count to market_holds to track and enforce max top-ups (Stripe limit)
ALTER TABLE market_holds ADD COLUMN IF NOT EXISTS top_up_count INTEGER NOT NULL DEFAULT 0;
COMMENT ON COLUMN market_holds.top_up_count IS 'Number of times this hold has been topped up. Max 10 per hold.';
