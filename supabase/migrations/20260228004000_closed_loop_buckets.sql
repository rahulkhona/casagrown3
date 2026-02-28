-- Migration: Closed Loop FIFO Points Buckets & Refund Tracking

-- 1. Create purchased points buckets to track unspent Stripe purchases
CREATE TYPE purchased_bucket_status AS ENUM ('active', 'depleted', 'refunded', 'partially_refunded', 'pending_fulfillment');

CREATE TABLE purchased_points_buckets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  payment_transaction_id uuid NOT NULL REFERENCES payment_transactions(id) ON DELETE CASCADE,
  point_ledger_id uuid REFERENCES point_ledger(id),
  original_amount integer NOT NULL,
  remaining_amount integer NOT NULL,
  status purchased_bucket_status NOT NULL DEFAULT 'active',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_purchased_points_buckets_user ON purchased_points_buckets(user_id);
CREATE INDEX idx_purchased_points_buckets_status ON purchased_points_buckets(status);

ALTER TABLE purchased_points_buckets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own purchased buckets"
  ON purchased_points_buckets FOR SELECT
  USING (auth.uid() = user_id);

-- 2. Create consumption mapping to accurately subtract from FIFO buckets
CREATE TABLE point_bucket_consumptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id uuid NOT NULL REFERENCES purchased_points_buckets(id) ON DELETE CASCADE,
  ledger_id uuid NOT NULL REFERENCES point_ledger(id) ON DELETE CASCADE,
  amount_consumed integer NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_point_bucket_consumptions_bucket ON point_bucket_consumptions(bucket_id);
CREATE INDEX idx_point_bucket_consumptions_ledger ON point_bucket_consumptions(ledger_id);

ALTER TABLE point_bucket_consumptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own bucket consumptions via bucket"
  ON point_bucket_consumptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM purchased_points_buckets ppb
      WHERE ppb.id = bucket_id AND ppb.user_id = auth.uid()
    )
  );

-- 3. Manual Refund Checks Tracking
CREATE TYPE manual_refund_fulfillment_type AS ENUM ('physical_check', 'egift_card');
CREATE TYPE manual_refund_status AS ENUM ('pending_verification', 'verification_failed', 'pending_fulfillment', 'fulfilled');

CREATE TABLE manual_refund_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  bucket_ids uuid[] NOT NULL, -- Array of purchased_points_buckets.id
  fulfillment_type manual_refund_fulfillment_type NOT NULL,
  stripe_verification_session_id text, -- ID from stripe.identity.verificationSessions
  amount_cents integer NOT NULL, -- The final amount minus restocking/identity fees
  mailing_address jsonb, -- Sourced dynamically from Stripe if physical_check
  target_email text, -- Sourced dynamically for egift_card
  status manual_refund_status NOT NULL DEFAULT 'pending_verification',
  tracking_number text,
  fulfilled_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_manual_refund_checks_user ON manual_refund_checks(user_id);
CREATE INDEX idx_manual_refund_checks_status ON manual_refund_checks(status);

ALTER TABLE manual_refund_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own manual refund checks"
  ON manual_refund_checks FOR SELECT
  USING (auth.uid() = user_id);

-- 4. Small Balance Threshold Limits
CREATE TABLE small_balance_refund_thresholds (
  country_iso_3 text NOT NULL REFERENCES countries(iso_3),
  state_code text NOT NULL,
  threshold_cents integer NOT NULL, -- Example: 1000 for $10 in California
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (country_iso_3, state_code)
);

ALTER TABLE small_balance_refund_thresholds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read small balance thresholds"
  ON small_balance_refund_thresholds FOR SELECT
  USING (true);


