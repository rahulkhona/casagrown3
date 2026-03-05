-- ============================================================================
-- Migration: Compliance & Regulatory Features
-- (a) Point purchase limits table
-- (b) State redemption method blocks
-- (c) is_produce flag on sales_categories
-- (d) is_produce + harvest_date on want_to_sell_details
-- (e) harvest_date on orders
-- (f) tos_accepted_at on profiles
-- (g) digital_receipts + receipt_footers tables
-- (h) Rename enum value escrow → hold
-- ============================================================================

-- ============================================================================
-- 0. States table RLS policy (table created earlier but missing read policy)
-- ============================================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'states' AND policyname = 'Anyone can read states'
  ) THEN
    CREATE POLICY "Anyone can read states" ON public.states FOR SELECT USING (true);
  END IF;
END $$;

-- ============================================================================
-- 1. Point Purchase Limits
-- ============================================================================
CREATE TABLE IF NOT EXISTS point_purchase_limits (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_iso_3        TEXT NOT NULL DEFAULT 'USA',
  max_outstanding_cents INTEGER NOT NULL DEFAULT 200000,  -- $2,000
  daily_limit_cents    INTEGER NOT NULL DEFAULT 50000,     -- $500
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now(),
  UNIQUE(country_iso_3)
);

ALTER TABLE point_purchase_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read purchase limits"
  ON point_purchase_limits FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can manage purchase limits"
  ON point_purchase_limits FOR ALL
  TO authenticated
  USING  (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()));

-- Seed default USA limits
INSERT INTO point_purchase_limits (country_iso_3)
VALUES ('USA')
ON CONFLICT (country_iso_3) DO NOTHING;

-- ============================================================================
-- 2. State Redemption Method Blocks
-- ============================================================================
CREATE TABLE IF NOT EXISTS state_redemption_method_blocks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_iso_3   TEXT NOT NULL DEFAULT 'USA',
  state_code      TEXT NOT NULL,
  method          redemption_method NOT NULL,
  reason          TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(country_iso_3, state_code, method)
);

ALTER TABLE state_redemption_method_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read redemption blocks"
  ON state_redemption_method_blocks FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can manage redemption blocks"
  ON state_redemption_method_blocks FOR ALL
  TO authenticated
  USING  (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()));

-- ============================================================================
-- 3. Produce flag on sales_categories
-- ============================================================================
ALTER TABLE sales_categories ADD COLUMN IF NOT EXISTS is_produce BOOLEAN NOT NULL DEFAULT false;
UPDATE sales_categories SET is_produce = true WHERE name IN ('fruits', 'vegetables', 'herbs');

-- ============================================================================
-- 4. Produce flag + harvest date on want_to_sell_details
-- ============================================================================
ALTER TABLE want_to_sell_details ADD COLUMN IF NOT EXISTS is_produce BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE want_to_sell_details ADD COLUMN IF NOT EXISTS harvest_date DATE;

-- ============================================================================
-- 5. Harvest date on orders
-- ============================================================================
ALTER TABLE orders ADD COLUMN IF NOT EXISTS harvest_date DATE;

-- ============================================================================
-- 6. ToS acceptance timestamp on profiles
-- ============================================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tos_accepted_at TIMESTAMPTZ;

-- ============================================================================
-- 7. Digital Receipts
-- ============================================================================
CREATE TABLE IF NOT EXISTS digital_receipts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES orders(id),
  buyer_receipt   JSONB NOT NULL,
  seller_receipt  JSONB NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE digital_receipts ENABLE ROW LEVEL SECURITY;

-- Buyers and sellers can read their own receipts
CREATE POLICY "Users can read own receipts"
  ON digital_receipts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = digital_receipts.order_id
        AND (o.buyer_id = auth.uid() OR o.seller_id = auth.uid())
    )
  );

CREATE INDEX IF NOT EXISTS idx_digital_receipts_order ON digital_receipts(order_id);

-- ============================================================================
-- 8. Receipt Footers (state-specific legal text)
-- ============================================================================
CREATE TABLE IF NOT EXISTS receipt_footers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_iso_3   TEXT NOT NULL DEFAULT 'USA',
  state_code      TEXT NOT NULL,
  footer_text     TEXT NOT NULL,
  font_size_pt    INTEGER NOT NULL DEFAULT 10,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(country_iso_3, state_code)
);

ALTER TABLE receipt_footers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read receipt footers"
  ON receipt_footers FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can manage receipt footers"
  ON receipt_footers FOR ALL
  TO authenticated
  USING  (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()));

-- Seed Florida cottage food footer
INSERT INTO receipt_footers (state_code, footer_text, font_size_pt) VALUES
  ('FL', 'MADE IN A COTTAGE FOOD OPERATION THAT IS NOT SUBJECT TO FLORIDA''S FOOD SAFETY REGULATIONS.', 10)
ON CONFLICT (country_iso_3, state_code) DO NOTHING;

-- ============================================================================
-- 9. Rename escrow → hold in point_transaction_type enum
-- ============================================================================
ALTER TYPE point_transaction_type RENAME VALUE 'escrow' TO 'hold';

-- Also rename escrow_refund → hold_refund for consistency
ALTER TYPE point_transaction_type RENAME VALUE 'escrow_refund' TO 'hold_refund';
