-- ============================================================================
-- Migration: Fix gaps — role column, harvest_date, nearby_booths overload,
--                       and credit_applied_usd in order completion notification
--
-- 1. Adds missing 'role' column to booth_helpers
-- 2. Adds missing 'harvest_date' column to catalog_items
-- 3. Drops old nearby_booths overloads that cause "function is not unique" errors
-- 4. Restores credit_applied_usd text in order completion notification
-- ============================================================================

-- 1. booth_helpers.role
ALTER TABLE booth_helpers
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'full_access';

ALTER TABLE booth_helpers
  DROP CONSTRAINT IF EXISTS booth_helpers_role_check;

ALTER TABLE booth_helpers
  ADD CONSTRAINT booth_helpers_role_check
  CHECK (role IN ('full_access', 'delivery'));

COMMENT ON COLUMN booth_helpers.role IS 'Helper role: full_access can manage products+orders; delivery can only handle deliveries';

-- 2. catalog_items.harvest_date
ALTER TABLE catalog_items
  ADD COLUMN IF NOT EXISTS harvest_date DATE;

COMMENT ON COLUMN catalog_items.harvest_date IS 'Date the item was harvested, used when allocating to market_products';

-- 3. Drop old nearby_booths overloads
-- The function has been extended with p_limit, p_offset, and other params.
-- Old signatures with fewer parameters create ambiguous overloads.

-- Original 5-param version from browse_market migration
DROP FUNCTION IF EXISTS nearby_booths(
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT
);

-- 9-param version from category_filter and similar migrations
DROP FUNCTION IF EXISTS nearby_booths(
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT,
  NUMERIC, NUMERIC, TEXT, TEXT
);

-- 10-param version (with exclude_demos, no p_limit/p_offset)
DROP FUNCTION IF EXISTS nearby_booths(
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT,
  NUMERIC, NUMERIC, TEXT, TEXT, BOOLEAN
);

-- 12-param version (multi_stand_schema without buyer_zip — conflicts with 13-param zipcode version)
DROP FUNCTION IF EXISTS nearby_booths(
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT,
  NUMERIC, NUMERIC, TEXT, TEXT, BOOLEAN, INTEGER, INTEGER
);

-- 4. Fix allocate_from_catalog — add fulfillment window check and fix harvest_date reference
CREATE OR REPLACE FUNCTION allocate_from_catalog(
  p_catalog_item_id UUID,
  p_booth_id UUID,
  p_quantity INTEGER,
  p_price_override NUMERIC(10,2) DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_item catalog_items;
  v_available INTEGER;
  v_product_id UUID;
  v_has_windows BOOLEAN;
BEGIN
  -- Lock the catalog item
  SELECT * INTO v_item FROM catalog_items
  WHERE id = p_catalog_item_id AND owner_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Catalog item not found';
  END IF;

  -- Verify stand belongs to caller
  IF NOT EXISTS(SELECT 1 FROM market_booths WHERE id = p_booth_id AND owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'Stand not found';
  END IF;

  -- Check booth has fulfillment windows configured
  SELECT (
    (weekly_delivery_windows IS NOT NULL AND weekly_delivery_windows != '{}'::jsonb AND weekly_delivery_windows != '[]'::jsonb)
    OR (weekly_pickup_windows IS NOT NULL AND weekly_pickup_windows != '{}'::jsonb AND weekly_pickup_windows != '[]'::jsonb)
    OR offers_delivery OR offers_pickup
  ) INTO v_has_windows
  FROM market_booths WHERE id = p_booth_id;

  IF NOT v_has_windows THEN
    RAISE EXCEPTION 'This booth has no fulfillment windows configured. Please set up delivery or pickup windows in booth settings first.';
  END IF;

  -- Check available inventory
  SELECT v_item.total_inventory - COALESCE(SUM(mp.inventory), 0)
  INTO v_available
  FROM market_products mp
  WHERE mp.catalog_item_id = p_catalog_item_id
    AND mp.is_active = true
    AND mp.is_deleted = false;

  IF v_available IS NULL THEN
    v_available := v_item.total_inventory;
  END IF;

  IF v_available < p_quantity THEN
    RAISE EXCEPTION 'Insufficient catalog inventory. Available: %, Requested: %',
      v_available, p_quantity;
  END IF;

  -- Create the listing in the target stand
  INSERT INTO market_products (
    seller_id, booth_id, catalog_item_id,
    name, description, photos, category,
    price_usd, unit, inventory,
    market_date, harvested_at, expires_at
  ) VALUES (
    auth.uid(), p_booth_id, p_catalog_item_id,
    v_item.name, v_item.description, v_item.photos, v_item.category,
    COALESCE(p_price_override, v_item.default_price_usd), v_item.default_unit,
    p_quantity,
    CURRENT_DATE,
    CASE WHEN v_item.harvest_date IS NOT NULL THEN v_item.harvest_date::timestamptz ELSE now() END,
    (CURRENT_DATE + interval '2 days')
  ) RETURNING id INTO v_product_id;

  RETURN v_product_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Fix order status notification — restore credit_applied_usd in completion message
-- The multi_stand_schema migration replaced the notification trigger but dropped
-- the credit_applied_usd text that existed in 20260425001000_fix_notification_gaps.
CREATE OR REPLACE FUNCTION trg_market_order_status_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_booth_name TEXT;
  v_pickup_addr TEXT;
  v_credit_str TEXT := '';
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  SELECT b.name, COALESCE(b.pickup_display_address, b.pickup_address)
  INTO v_booth_name, v_pickup_addr
  FROM market_booths b WHERE b.id = NEW.booth_id;

  -- Build credit suffix if applicable
  IF NEW.credit_applied_usd > 0 THEN
    v_credit_str := ' $' || NEW.credit_applied_usd || ' credit applied!';
  END IF;

  CASE NEW.status
    WHEN 'confirmed' THEN
      PERFORM notify_market_event(
        NEW.buyer_id,
        '✅ Your order for ' || NEW.product_name || ' at ' || COALESCE(v_booth_name, 'the stand') || ' has been accepted!',
        '/orders'
      );

    WHEN 'delivered' THEN
      PERFORM notify_market_event(
        NEW.buyer_id,
        '🚚 Your ' || NEW.product_name || ' from ' || COALESCE(v_booth_name, 'the stand') || ' has been delivered! Please confirm receipt.',
        '/orders'
      );

    WHEN 'completed' THEN
      PERFORM notify_market_event(
        NEW.buyer_id,
        '✅ Order completed: ' || NEW.product_name || ' from ' || COALESCE(v_booth_name, 'the stand') || ' — $' || NEW.total_usd || ' settled.' || v_credit_str || ' Rate your experience!',
        '/orders/' || NEW.id
      );
      PERFORM notify_market_event(
        NEW.seller_id,
        '💰 Sale completed at ' || COALESCE(v_booth_name, 'your stand') || ': ' || NEW.product_name || ' — $' || NEW.subtotal_usd || ' earned. Rate the buyer!',
        '/orders/' || NEW.id
      );

    WHEN 'declined' THEN
      PERFORM notify_market_event(
        NEW.buyer_id,
        '❌ Your order for ' || NEW.product_name || ' at ' || COALESCE(v_booth_name, 'the stand') || ' was declined' ||
          CASE WHEN NEW.decline_reason IS NOT NULL THEN ': ' || NEW.decline_reason ELSE '' END,
        '/orders'
      );

    WHEN 'disputed' THEN
      DECLARE
        v_dispute_label TEXT;
      BEGIN
        SELECT CASE d.dispute_type
          WHEN 'not_delivered' THEN 'Order Not Delivered'
          WHEN 'wrong_item' THEN 'Wrong Item Received'
          WHEN 'poor_quality' THEN 'Quality Issue Reported'
          WHEN 'quantity_mismatch' THEN 'Quantity Mismatch'
          ELSE 'Dispute Opened'
        END INTO v_dispute_label
        FROM order_disputes d WHERE d.order_id = NEW.id
        ORDER BY d.created_at DESC LIMIT 1;

        v_dispute_label := coalesce(v_dispute_label, 'Dispute Opened');

        PERFORM notify_market_event(
          NEW.buyer_id,
          '⚠️ ' || v_dispute_label || ' for your ' || NEW.product_name || ' order at ' || COALESCE(v_booth_name, 'the stand') || '.',
          '/orders'
        );
        PERFORM notify_market_event(
          NEW.seller_id,
          '⚠️ ' || v_dispute_label || ' for ' || NEW.product_name || ' sale at ' || COALESCE(v_booth_name, 'your stand') || '.',
          '/orders'
        );
      END;

    WHEN 'escalated' THEN
      PERFORM notify_market_event(
        NEW.buyer_id,
        '📋 Your dispute for ' || NEW.product_name || ' at ' || COALESCE(v_booth_name, 'the stand') || ' has been escalated to admin review.',
        '/orders'
      );
      PERFORM notify_market_event(
        NEW.seller_id,
        '📋 The dispute for ' || NEW.product_name || ' at ' || COALESCE(v_booth_name, 'your stand') || ' has been escalated to admin review.',
        '/orders'
      );

    WHEN 'resolved' THEN
      PERFORM notify_market_event(
        NEW.buyer_id,
        '✅ Your dispute for ' || NEW.product_name || ' at ' || COALESCE(v_booth_name, 'the stand') || ' has been resolved.',
        '/orders'
      );
      PERFORM notify_market_event(
        NEW.seller_id,
        '✅ The dispute for ' || NEW.product_name || ' at ' || COALESCE(v_booth_name, 'your stand') || ' has been resolved.',
        '/orders'
      );

    WHEN 'cancelled' THEN
      PERFORM notify_market_event(
        NEW.buyer_id,
        '🔄 Your order for ' || NEW.product_name || ' at ' || COALESCE(v_booth_name, 'the stand') || ' has been cancelled.',
        '/orders'
      );

    ELSE
      NULL;
  END CASE;

  RETURN NEW;
END;
$$;
