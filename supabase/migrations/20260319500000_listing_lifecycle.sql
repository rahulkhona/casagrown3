-- ============================================================================
-- Migration: Add listing lifecycle (expires_at) to market_products
-- 
-- - Adds expires_at column with category-based defaults
-- - Perishable categories (fruits, vegetables, herbs, flowers, eggs): 3 days
-- - Non-perishable categories (honey, preserved, garden_equipment, etc.): 30 days
-- - Trigger auto-computes expires_at on insert if not explicitly set
-- - Index for efficient filtering of expired listings
-- ============================================================================

-- 1. Add column
ALTER TABLE market_products
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- 2. Backfill: compute expires_at for existing rows
-- Perishable items: 3 days from creation
UPDATE market_products
  SET expires_at = created_at + interval '3 days'
  WHERE expires_at IS NULL
    AND category IN ('produce', 'fruits', 'vegetables', 'herbs', 'flowers', 'flower_arrangements', 'eggs');

-- Non-perishable items: 30 days from creation
UPDATE market_products
  SET expires_at = created_at + interval '30 days'
  WHERE expires_at IS NULL;

-- 3. Trigger: auto-compute expires_at on INSERT if not set
CREATE OR REPLACE FUNCTION set_product_expires_at()
RETURNS trigger AS $$
DECLARE
  v_days INTEGER;
BEGIN
  -- Only compute if caller didn't explicitly set expires_at
  IF NEW.expires_at IS NULL THEN
    -- Perishable categories get shorter defaults
    IF NEW.category IN ('produce', 'fruits', 'vegetables', 'herbs', 'flowers', 'flower_arrangements', 'eggs') THEN
      v_days := 3;
    ELSE
      v_days := 30;
    END IF;
    NEW.expires_at := COALESCE(NEW.created_at, now()) + (v_days || ' days')::interval;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_product_expires_at ON market_products;
CREATE TRIGGER trg_set_product_expires_at
  BEFORE INSERT ON market_products
  FOR EACH ROW EXECUTE FUNCTION set_product_expires_at();

-- 4. Index for efficient expiration filtering
CREATE INDEX IF NOT EXISTS idx_market_products_expires_at
  ON market_products(expires_at)
  WHERE is_active = true;

-- 5. Update refresh_product_data to respect expires_at
CREATE OR REPLACE FUNCTION refresh_product_data(product_ids UUID[])
RETURNS TABLE(id UUID, price_usd NUMERIC, inventory INTEGER, is_active BOOLEAN)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT mp.id, mp.price_usd, mp.inventory,
    -- Mark as inactive if expired by date or by expires_at
    (mp.is_active AND mp.market_date >= CURRENT_DATE
     AND (mp.expires_at IS NULL OR mp.expires_at > now())) AS is_active
  FROM market_products mp
  WHERE mp.id = ANY(product_ids);
$$;

