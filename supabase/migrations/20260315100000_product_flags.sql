-- ============================================================================
-- Product Flagging for Content Moderation
-- Mirrors the post_flags + check_post_flag_threshold() pattern.
--
-- 1. product_flags table (one flag per user per product)
-- 2. Auto-hide trigger: ≥3 flags → deactivate product + notify seller
-- 3. RLS policies
-- ============================================================================

-- ============================================================
-- 1. Product Flags Table
-- ============================================================
CREATE TABLE IF NOT EXISTS product_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES market_products(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  reason TEXT NOT NULL CHECK (reason IN ('offensive', 'misleading', 'prohibited', 'other')),
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_product_flags_product ON product_flags(product_id);

ALTER TABLE product_flags ENABLE ROW LEVEL SECURITY;

-- Users can see their own flags
CREATE POLICY "Users can see own product flags"
  ON product_flags FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Authenticated users can flag products
CREATE POLICY "Authenticated users can flag products"
  ON product_flags FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can remove their own flags
CREATE POLICY "Users can remove own product flags"
  ON product_flags FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- 2. Flag Threshold Trigger
-- When a product receives ≥ 3 flags, auto-deactivate it
-- and notify the seller.
-- ============================================================
CREATE OR REPLACE FUNCTION check_product_flag_threshold()
RETURNS TRIGGER AS $$
DECLARE
  v_flag_count INTEGER;
  v_product RECORD;
BEGIN
  -- Count total flags for this product
  SELECT COUNT(*) INTO v_flag_count
  FROM product_flags WHERE product_id = NEW.product_id;

  IF v_flag_count >= 3 THEN
    -- Get the product
    SELECT id, seller_id, name, is_active INTO v_product
    FROM market_products WHERE id = NEW.product_id;

    -- Only deactivate if currently active
    IF v_product.is_active THEN
      UPDATE market_products SET is_active = false, updated_at = now()
      WHERE id = NEW.product_id;

      -- Notify the seller
      INSERT INTO notifications (user_id, content, link_url)
      VALUES (
        v_product.seller_id,
        'Your product "' || v_product.name || '" has been flagged by community members and has been hidden pending review.',
        '/my-booth/products'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_product_flag_threshold ON product_flags;
CREATE TRIGGER trg_product_flag_threshold
  AFTER INSERT ON product_flags
  FOR EACH ROW
  EXECUTE FUNCTION check_product_flag_threshold();
