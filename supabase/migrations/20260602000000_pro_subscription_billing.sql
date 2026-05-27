-- Pro subscription billing: subscription_receipts + GrowBot profile columns
-- ==========================================================================

-- Subscription receipts (billing history for Pro subscriptions)
CREATE TABLE IF NOT EXISTS subscription_receipts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount_usd numeric NOT NULL,
  description text NOT NULL DEFAULT 'CasaGrown Pro — Monthly',
  stripe_session_id text,
  stripe_invoice_id text,
  invoice_url text,
  period_start timestamptz,
  period_end timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sub_receipts_user ON subscription_receipts(user_id);

ALTER TABLE subscription_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own receipts"
  ON subscription_receipts FOR SELECT
  USING (auth.uid() = user_id);

-- GrowBot settings on profiles (account-level, not per-booth)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bot_instructions text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bot_channels jsonb DEFAULT '{"messenger": true, "casagrown_dm": true}'::jsonb;
