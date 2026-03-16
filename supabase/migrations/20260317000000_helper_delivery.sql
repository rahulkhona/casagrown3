-- ============================================================================
-- Helper Delivery System
-- Allows accepted booth helpers to:
--   1. See all pending orders for their booths
--   2. Mark orders as delivered (with proof)
--   3. Chat with buyers on behalf of the booth
--   4. Record who actually fulfilled the delivery
-- ============================================================================

-- ──────────────────────────────────────────────────────────────
-- 1. Schema changes
-- ──────────────────────────────────────────────────────────────

-- Add role to booth_helpers (delivery-only vs full_access)
ALTER TABLE booth_helpers
  ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'delivery'
  CHECK (role IN ('delivery', 'full_access'));

-- Add delivered_by to market_orders (who actually fulfilled)
ALTER TABLE market_orders
  ADD COLUMN IF NOT EXISTS delivered_by UUID REFERENCES profiles(id);

-- Generate passcodes for booths that don't have one
UPDATE market_booths
SET helper_passcode = upper(substr(md5(random()::text), 1, 6))
WHERE helper_passcode IS NULL;


-- ──────────────────────────────────────────────────────────────
-- 2. Helper utility: check if user is accepted helper for a booth
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION is_booth_helper(p_booth_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM booth_helpers
    WHERE booth_id = p_booth_id
      AND helper_id = auth.uid()
      AND status = 'accepted'
  );
END;
$$;


-- ──────────────────────────────────────────────────────────────
-- 3. RLS: Helpers can read orders for their booths
-- ──────────────────────────────────────────────────────────────
CREATE POLICY "Helpers can read booth orders" ON market_orders
  FOR SELECT TO authenticated
  USING (is_booth_helper(booth_id));

CREATE POLICY "Helpers can update booth orders" ON market_orders
  FOR UPDATE TO authenticated
  USING (is_booth_helper(booth_id));


-- ──────────────────────────────────────────────────────────────
-- 4. RLS: Helpers can read/write chat for their booth's orders
-- ──────────────────────────────────────────────────────────────
CREATE POLICY "Helpers can read booth order chat" ON order_chat_messages
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM market_orders o
    WHERE o.id = order_chat_messages.order_id
      AND is_booth_helper(o.booth_id)
  ));

CREATE POLICY "Helpers can send booth order chat" ON order_chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM market_orders o
      WHERE o.id = order_chat_messages.order_id
        AND is_booth_helper(o.booth_id)
    )
  );


-- ──────────────────────────────────────────────────────────────
-- 5. RPC: get_helper_queue — all open orders for helper's booths
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_helper_queue()
RETURNS TABLE (
  order_id UUID,
  product_name TEXT,
  quantity INTEGER,
  status market_order_status,
  fulfillment_type TEXT,
  buyer_name TEXT,
  booth_name TEXT,
  booth_id UUID,
  seller_name TEXT,
  total_usd NUMERIC(10,2),
  created_at TIMESTAMPTZ,
  delivered_by_name TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  RETURN QUERY
  SELECT
    o.id AS order_id,
    o.product_name,
    o.quantity,
    o.status,
    o.fulfillment_type,
    COALESCE(bp.full_name, 'Buyer') AS buyer_name,
    COALESCE(mb.name, 'Booth') AS booth_name,
    o.booth_id,
    COALESCE(sp.full_name, 'Seller') AS seller_name,
    o.total_usd,
    o.created_at,
    dp.full_name AS delivered_by_name
  FROM market_orders o
  JOIN booth_helpers bh ON bh.booth_id = o.booth_id
    AND bh.helper_id = v_uid
    AND bh.status = 'accepted'
  JOIN market_booths mb ON mb.id = o.booth_id
  LEFT JOIN profiles bp ON bp.id = o.buyer_id
  LEFT JOIN profiles sp ON sp.id = o.seller_id
  LEFT JOIN profiles dp ON dp.id = o.delivered_by
  WHERE o.status IN ('pending', 'confirmed', 'delivering', 'delivered')
  ORDER BY
    CASE o.status
      WHEN 'pending' THEN 1
      WHEN 'confirmed' THEN 2
      WHEN 'delivering' THEN 3
      WHEN 'delivered' THEN 4
    END,
    o.created_at DESC;
END;
$$;


-- ──────────────────────────────────────────────────────────────
-- 6. RPC: helper_mark_delivered — helper fulfills an order
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION helper_mark_delivered(
  p_order_id UUID,
  p_proof_urls TEXT[] DEFAULT '{}'
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_order RECORD;
  v_helper_name TEXT;
  v_booth_name TEXT;
BEGIN
  -- Get order + validate helper access
  SELECT o.*, mb.name AS booth_name, mb.owner_id
  INTO v_order
  FROM market_orders o
  JOIN market_booths mb ON mb.id = o.booth_id
  WHERE o.id = p_order_id;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('error', 'Order not found');
  END IF;

  -- Validate caller is accepted helper
  IF NOT is_booth_helper(v_order.booth_id) THEN
    RETURN jsonb_build_object('error', 'Not authorized — you are not a helper for this booth');
  END IF;

  -- Validate order status
  IF v_order.status NOT IN ('pending', 'confirmed', 'delivering') THEN
    RETURN jsonb_build_object('error', 'Order cannot be delivered in its current state: ' || v_order.status);
  END IF;

  -- Get helper name
  SELECT full_name INTO v_helper_name FROM profiles WHERE id = v_uid;

  -- Mark delivered
  UPDATE market_orders SET
    status = 'delivered',
    delivered_at = NOW(),
    delivered_by = v_uid,
    delivery_proof = CASE
      WHEN array_length(p_proof_urls, 1) > 0
      THEN to_jsonb(p_proof_urls)
      ELSE delivery_proof
    END,
    auto_complete_at = NOW() + INTERVAL '48 hours',
    updated_at = NOW()
  WHERE id = p_order_id;

  -- Notify seller
  PERFORM notify_market_event(
    v_order.owner_id,
    '📦 ' || COALESCE(v_helper_name, 'A helper') || ' delivered ' || v_order.product_name || ' to the buyer.',
    '/orders/' || p_order_id
  );

  -- Notify buyer
  PERFORM notify_market_event(
    v_order.buyer_id,
    '📦 Your ' || v_order.product_name || ' has been delivered by ' || COALESCE(v_helper_name, 'a helper') || '. Confirm receipt!',
    '/orders/' || p_order_id
  );

  RETURN jsonb_build_object('success', true);
END;
$$;
