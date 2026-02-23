-- ============================================================================
-- Redemption Provider Integration
-- 
-- Adds tables for tracking provider accounts (Reloadly, Tremendous, GlobalGiving),
-- logging provider API transactions, and enriching the existing redemptions table
-- with delivery details (gift card codes, donation receipts).
-- ============================================================================

-- 1. Add 'donation' to point_transaction_type enum
ALTER TYPE point_transaction_type ADD VALUE IF NOT EXISTS 'donation';
ALTER TYPE point_transaction_type ADD VALUE IF NOT EXISTS 'refund';


-- 2. Provider accounts — tracks API credentials reference and balance snapshots
CREATE TABLE provider_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name text NOT NULL UNIQUE,              -- 'reloadly', 'tremendous', 'globalgiving'
  display_name text NOT NULL,                       -- 'Reloadly', 'Tremendous', 'GlobalGiving'
  is_active boolean NOT NULL DEFAULT true,
  balance_cents integer,                            -- current balance in cents (USD)
  balance_updated_at timestamptz,                   -- last time balance was synced
  low_balance_threshold_cents integer DEFAULT 10000, -- alert when below $100
  metadata jsonb DEFAULT '{}',                      -- provider-specific config
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Seed initial provider accounts
INSERT INTO provider_accounts (provider_name, display_name) VALUES
  ('reloadly', 'Reloadly'),
  ('tremendous', 'Tremendous'),
  ('globalgiving', 'GlobalGiving');


-- 3. Provider transactions — log every API call to external providers
CREATE TYPE provider_transaction_status AS ENUM ('pending', 'success', 'failed', 'refunded');

CREATE TABLE provider_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name text NOT NULL,                      -- 'reloadly', 'tremendous', 'globalgiving'
  redemption_id uuid REFERENCES redemptions(id),    -- link to user redemption
  user_id uuid NOT NULL REFERENCES profiles(id),
  
  -- Order details
  external_order_id text,                           -- provider's order ID
  item_type text NOT NULL,                          -- 'gift_card', 'donation'
  item_name text NOT NULL,                          -- e.g. 'Amazon $25 Gift Card'
  face_value_cents integer NOT NULL,                -- face value in cents
  cost_cents integer,                               -- what we paid (after discount/fee)
  discount_cents integer DEFAULT 0,                 -- discount from provider
  fee_cents integer DEFAULT 0,                      -- processing fee charged
  
  -- Status
  status provider_transaction_status NOT NULL DEFAULT 'pending',
  status_message text,                              -- error message if failed
  
  -- Request/response logging
  request_payload jsonb DEFAULT '{}',
  response_payload jsonb DEFAULT '{}',
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_provider_txn_user ON provider_transactions(user_id);
CREATE INDEX idx_provider_txn_redemption ON provider_transactions(redemption_id);
CREATE INDEX idx_provider_txn_status ON provider_transactions(status);
CREATE INDEX idx_provider_txn_created ON provider_transactions(created_at DESC);


-- 4. Gift card deliveries — stores delivered card details
CREATE TABLE gift_card_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  redemption_id uuid NOT NULL REFERENCES redemptions(id) ON DELETE CASCADE,
  provider_transaction_id uuid REFERENCES provider_transactions(id),
  
  brand_name text NOT NULL,                         -- e.g. 'Amazon', 'Starbucks'
  face_value_cents integer NOT NULL,                -- face value in cents
  card_code text,                                   -- gift card code (encrypted at rest)
  card_url text,                                    -- redemption URL
  card_pin text,                                    -- PIN if applicable
  expiry_date date,                                 -- card expiry
  
  delivered_at timestamptz,                         -- when the card was delivered
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_gc_delivery_redemption ON gift_card_deliveries(redemption_id);


-- 5. Donation receipts — stores donation confirmation details
CREATE TABLE donation_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  redemption_id uuid NOT NULL REFERENCES redemptions(id) ON DELETE CASCADE,
  provider_transaction_id uuid REFERENCES provider_transactions(id),
  
  organization_name text NOT NULL,                  -- e.g. 'Food For All Foundation'
  project_title text,                               -- specific project name
  theme text,                                       -- 'Hunger', 'Environment', etc.
  donation_amount_cents integer NOT NULL,            -- amount donated in cents
  points_spent integer NOT NULL,                    -- points deducted from user
  
  receipt_url text,                                 -- downloadable receipt URL
  receipt_number text,                              -- receipt reference number
  tax_deductible boolean DEFAULT true,
  
  donated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_donation_receipt_redemption ON donation_receipts(redemption_id);


-- 6. Add provider-related columns to existing redemptions table
ALTER TABLE redemptions
  ADD COLUMN IF NOT EXISTS provider text,            -- 'reloadly', 'tremendous', 'globalgiving'
  ADD COLUMN IF NOT EXISTS provider_order_id text,   -- external order ID
  ADD COLUMN IF NOT EXISTS failed_reason text,       -- reason if failed
  ADD COLUMN IF NOT EXISTS completed_at timestamptz, -- when fulfillment completed
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz;  -- when points were refunded (on failure)


-- 7. Enable RLS on new tables
ALTER TABLE provider_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gift_card_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE donation_receipts ENABLE ROW LEVEL SECURITY;


-- 8. RLS Policies

-- provider_accounts: admin/service_role only (no user access)
CREATE POLICY "provider_accounts_service_role"
  ON provider_accounts FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- provider_transactions: admin/service_role only for writes, users can read their own
CREATE POLICY "provider_transactions_service_role"
  ON provider_transactions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "provider_transactions_user_read"
  ON provider_transactions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- gift_card_deliveries: users can read their own (via redemption ownership)
CREATE POLICY "gift_card_deliveries_service_write"
  ON gift_card_deliveries FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "gift_card_deliveries_user_read"
  ON gift_card_deliveries FOR SELECT
  TO authenticated
  USING (
    redemption_id IN (
      SELECT id FROM redemptions WHERE user_id = auth.uid()
    )
  );

-- donation_receipts: users can read their own
CREATE POLICY "donation_receipts_service_write"
  ON donation_receipts FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "donation_receipts_user_read"
  ON donation_receipts FOR SELECT
  TO authenticated
  USING (
    redemption_id IN (
      SELECT id FROM redemptions WHERE user_id = auth.uid()
    )
  );


-- 9. Add realtime for redemptions status updates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'redemptions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE redemptions;
  END IF;
END $$;
