-- ============================================================================
-- Migration: Booth Settings Persistence & Helpers
-- Adds missing columns to market_booths for full settings persistence,
-- creates booth_helpers table using the delegation pairing-code pattern.
-- ============================================================================

-- 1. Add missing booth settings columns
ALTER TABLE market_booths
  ADD COLUMN IF NOT EXISTS header_image_url TEXT,
  ADD COLUMN IF NOT EXISTS delivery_windows JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pickup_windows JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'automatic',
  ADD COLUMN IF NOT EXISTS venmo_handle TEXT,
  ADD COLUMN IF NOT EXISTS charity_name TEXT,
  ADD COLUMN IF NOT EXISTS helper_passcode TEXT;

COMMENT ON COLUMN market_booths.delivery_windows IS 'Array of time window objects, e.g. [{"id":"8-10","start":"08:00","end":"10:00"}]';
COMMENT ON COLUMN market_booths.pickup_windows IS 'Array of time window objects, same format as delivery_windows';
COMMENT ON COLUMN market_booths.payment_method IS 'automatic | manual';
COMMENT ON COLUMN market_booths.venmo_handle IS 'Venmo username, email, or phone for payouts';
COMMENT ON COLUMN market_booths.charity_name IS 'Charity name if payout goes to charity';
COMMENT ON COLUMN market_booths.helper_passcode IS '6-character passcode for helper pairing (mirrors delegation pairing_code pattern)';

-- 2. Booth Helpers table — mirrors delegation pairing pattern
-- Helpers can manage booth products/orders but have no financial split
CREATE TABLE booth_helpers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booth_id UUID NOT NULL REFERENCES market_booths(id) ON DELETE CASCADE,
  helper_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(booth_id, helper_id)
);

CREATE INDEX idx_booth_helpers_booth ON booth_helpers(booth_id);
CREATE INDEX idx_booth_helpers_helper ON booth_helpers(helper_id);

-- 3. RLS for booth_helpers
ALTER TABLE booth_helpers ENABLE ROW LEVEL SECURITY;

-- Booth owner + helper can read
CREATE POLICY "Booth parties can read helpers"
  ON booth_helpers FOR SELECT TO authenticated
  USING (
    helper_id = auth.uid()
    OR booth_id IN (SELECT id FROM market_booths WHERE owner_id = auth.uid())
  );

-- Booth owner can insert helpers (or self-insert via passcode — handled by RPC)
CREATE POLICY "Booth owner can add helpers"
  ON booth_helpers FOR INSERT TO authenticated
  WITH CHECK (
    booth_id IN (SELECT id FROM market_booths WHERE owner_id = auth.uid())
  );

-- Helper can update own status (accept), owner can update (revoke)
CREATE POLICY "Helper or owner can update"
  ON booth_helpers FOR UPDATE TO authenticated
  USING (
    helper_id = auth.uid()
    OR booth_id IN (SELECT id FROM market_booths WHERE owner_id = auth.uid())
  );

-- Booth owner can remove helpers
CREATE POLICY "Booth owner can delete helpers"
  ON booth_helpers FOR DELETE TO authenticated
  USING (
    booth_id IN (SELECT id FROM market_booths WHERE owner_id = auth.uid())
  );

-- 4. RPC: Join booth as helper using passcode
-- Mirrors the delegation pairing flow: helper enters passcode → auto-accepted
CREATE OR REPLACE FUNCTION join_booth_as_helper(p_passcode TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_booth_id UUID;
  v_helper_id UUID;
BEGIN
  v_helper_id := auth.uid();
  IF v_helper_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Find booth by passcode
  SELECT id INTO v_booth_id
  FROM market_booths
  WHERE helper_passcode = p_passcode;

  IF v_booth_id IS NULL THEN
    RAISE EXCEPTION 'Invalid passcode';
  END IF;

  -- Cannot be helper of own booth
  IF EXISTS (SELECT 1 FROM market_booths WHERE id = v_booth_id AND owner_id = v_helper_id) THEN
    RAISE EXCEPTION 'Cannot be helper of your own booth';
  END IF;

  -- Upsert: re-accept if previously revoked, or create new
  INSERT INTO booth_helpers (booth_id, helper_id, status)
  VALUES (v_booth_id, v_helper_id, 'accepted')
  ON CONFLICT (booth_id, helper_id)
  DO UPDATE SET status = 'accepted', updated_at = now();

  RETURN v_booth_id;
END;
$$;

-- 5. Update market_products RLS to also allow booth helpers to manage products
-- Helpers can manage products for the booth owner they're helping
CREATE POLICY "Booth helpers can insert products"
  ON market_products FOR INSERT TO authenticated
  WITH CHECK (
    seller_id IN (
      SELECT mb.owner_id FROM booth_helpers bh
      JOIN market_booths mb ON mb.id = bh.booth_id
      WHERE bh.helper_id = auth.uid() AND bh.status = 'accepted'
    )
  );

CREATE POLICY "Booth helpers can update products"
  ON market_products FOR UPDATE TO authenticated
  USING (
    seller_id IN (
      SELECT mb.owner_id FROM booth_helpers bh
      JOIN market_booths mb ON mb.id = bh.booth_id
      WHERE bh.helper_id = auth.uid() AND bh.status = 'accepted'
    )
  );
