-- ============================================================================
-- Fix: Add 'produce' and 'eggs' to perishable category list
-- The original listing lifecycle trigger only included fruits/vegetables/herbs
-- but the seeded sales_categories use 'produce' (not fruits/vegetables).
-- ============================================================================

CREATE OR REPLACE FUNCTION set_product_expires_at()
RETURNS trigger AS $$
DECLARE
  v_days INTEGER;
BEGIN
  IF NEW.expires_at IS NULL THEN
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

-- Also backfill any existing 'produce' or 'eggs' products that got 30-day expiry
UPDATE market_products
  SET expires_at = created_at + interval '3 days'
  WHERE category IN ('produce', 'eggs')
    AND expires_at > created_at + interval '4 days';
