-- ============================================================================
-- Migration: Production Settings
--
-- 1. Set market hours to Saturday 8:00 AM - 11:00 AM only
-- 2. Add missing state-specific 1099-K reporting thresholds
-- 3. Block NY and HI for paid transactions (agent of payee not recognized)
-- ============================================================================

-- ── 1. Production Market Schedule: Saturday only, 8 AM - 11 AM ──────────────
-- Disable all days except Saturday
UPDATE market_schedule_policies SET is_enabled = false WHERE day_of_week != 6;

-- Set Saturday hours to 8:00 AM - 11:00 AM
UPDATE market_schedule_policies SET
  open_time  = '08:00',
  close_time = '11:00',
  is_enabled = true,
  updated_at = now()
WHERE day_of_week = 6;

-- ── 2. Seed additional 1099-K state thresholds ──────────────────────────────
-- Federal default already set: $20,000 + 200 transactions
-- Existing: VA, MA, MD, DC, VT, IL, AR, NJ
-- Adding: NC, MT, MO, RI (states with lower thresholds research confirmed)

INSERT INTO tax_reporting_thresholds (state_code, amount, min_txns, warn_pct) VALUES
  ('NC', 600,  0, 0.75),   -- North Carolina: $600, no min transactions
  ('MT', 600,  0, 0.75),   -- Montana: $600, no min transactions
  ('MO', 1200, 0, 0.75),   -- Missouri: $1,200, no min transactions
  ('RI', 100,  0, 0.75)    -- Rhode Island: $100, no min transactions
ON CONFLICT (state_code) DO NOTHING;

-- Update Illinois to reflect correct threshold (over $1000 + 4 transactions)
UPDATE tax_reporting_thresholds SET amount = 1000, min_txns = 4 WHERE state_code = 'IL';

-- ── 3. Block NY and HI for paid transactions ────────────────────────────────
-- These states don't recognize agent-of-payee status, so paid transactions
-- cannot legally occur. Free sharing ($0 products) is still allowed.
INSERT INTO market_state_blocks (state_id, reason)
SELECT id, 'Agent of payee not recognized — paid transactions prohibited'
FROM states WHERE code = 'NY'
ON CONFLICT (state_id) DO NOTHING;

INSERT INTO market_state_blocks (state_id, reason)
SELECT id, 'Agent of payee not recognized — paid transactions prohibited'
FROM states WHERE code = 'HI'
ON CONFLICT (state_id) DO NOTHING;
