-- ============================================================================
-- Follow Booth + Flagged Product Visibility
--
-- 1. is_flagged column on market_products
-- 2. Update product_flags trigger to set is_flagged = true
-- 3. New product notification trigger for followers
-- 4. RPC to clear flags on product edit (resubmission)
-- ============================================================================

-- ============================================================
-- 1. is_flagged column
-- Distinguishes "community flagged" from "seller deactivated"
-- ============================================================
ALTER TABLE market_products ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN DEFAULT false;

-- ============================================================
-- 2. Update the auto-hide trigger to also set is_flagged
-- ============================================================
CREATE OR REPLACE FUNCTION check_product_flag_threshold()
RETURNS TRIGGER AS $$
DECLARE
  v_flag_count INTEGER;
  v_product RECORD;
BEGIN
  SELECT COUNT(*) INTO v_flag_count
  FROM product_flags WHERE product_id = NEW.product_id;

  IF v_flag_count >= 3 THEN
    SELECT id, seller_id, name, is_active INTO v_product
    FROM market_products WHERE id = NEW.product_id;

    IF v_product.is_active THEN
      UPDATE market_products
      SET is_active = false, is_flagged = true, updated_at = now()
      WHERE id = NEW.product_id;

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

-- ============================================================
-- 3. New Product → Notify Followers trigger
-- When a seller adds a product, notify everyone who follows them
-- ============================================================
CREATE OR REPLACE FUNCTION notify_followers_new_product()
RETURNS TRIGGER AS $$
DECLARE
  v_booth RECORD;
BEGIN
  -- Only notify for active products
  IF NOT NEW.is_active THEN RETURN NEW; END IF;

  -- Get the booth for link building
  SELECT id, name INTO v_booth
  FROM market_booths WHERE owner_id = NEW.seller_id;

  IF v_booth.id IS NULL THEN RETURN NEW; END IF;

  -- Notify all followers
  INSERT INTO notifications (user_id, content, link_url)
  SELECT f.follower_id,
    v_booth.name || ' just listed "' || NEW.name || '"! Check it out.',
    '/market/booth/' || v_booth.id || '/product/' || NEW.id
  FROM followers f
  WHERE f.followed_id = NEW.seller_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_followers_new_product ON market_products;
CREATE TRIGGER trg_notify_followers_new_product
  AFTER INSERT ON market_products
  FOR EACH ROW
  EXECUTE FUNCTION notify_followers_new_product();

-- ============================================================
-- 4. RPC: Clear flags on product edit (resubmission)
-- Seller edits the flagged product → clear flags, reactivate
-- ============================================================
CREATE OR REPLACE FUNCTION clear_product_flags(p_product_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Only the product owner can clear flags
  IF NOT EXISTS (
    SELECT 1 FROM market_products
    WHERE id = p_product_id AND seller_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Delete all flags for this product
  DELETE FROM product_flags WHERE product_id = p_product_id;

  -- Reset flagged status and reactivate
  UPDATE market_products
  SET is_flagged = false, is_active = true, updated_at = now()
  WHERE id = p_product_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
