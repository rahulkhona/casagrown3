-- ============================================================================
-- Order Lifecycle: extended statuses, delivery proof, disputes, passcodes
-- ============================================================================

-- ============================================================
-- 1. Extend market_order_status enum
-- ============================================================
ALTER TYPE market_order_status ADD VALUE IF NOT EXISTS 'delivering';
ALTER TYPE market_order_status ADD VALUE IF NOT EXISTS 'delivered';
ALTER TYPE market_order_status ADD VALUE IF NOT EXISTS 'completed';
ALTER TYPE market_order_status ADD VALUE IF NOT EXISTS 'declined';
ALTER TYPE market_order_status ADD VALUE IF NOT EXISTS 'disputed';
ALTER TYPE market_order_status ADD VALUE IF NOT EXISTS 'escalated';
ALTER TYPE market_order_status ADD VALUE IF NOT EXISTS 'resolved';
ALTER TYPE market_order_status ADD VALUE IF NOT EXISTS 'ready_for_pickup';
ALTER TYPE market_order_status ADD VALUE IF NOT EXISTS 'pickup_declined';

-- ============================================================
-- 2. Add columns to market_orders
-- ============================================================
ALTER TABLE market_orders ADD COLUMN IF NOT EXISTS decline_reason TEXT;
ALTER TABLE market_orders ADD COLUMN IF NOT EXISTS delivery_proof JSONB DEFAULT '[]'::jsonb;
ALTER TABLE market_orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE market_orders ADD COLUMN IF NOT EXISTS auto_complete_at TIMESTAMPTZ;
ALTER TABLE market_orders ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE market_orders ADD COLUMN IF NOT EXISTS buyer_passcode TEXT;
ALTER TABLE market_orders ADD COLUMN IF NOT EXISTS seller_passcode TEXT;
ALTER TABLE market_orders ADD COLUMN IF NOT EXISTS buyer_passcode_entered BOOLEAN DEFAULT false;
ALTER TABLE market_orders ADD COLUMN IF NOT EXISTS seller_passcode_entered BOOLEAN DEFAULT false;

-- Seller UPDATE policy (needed for order actions)
CREATE POLICY "Sellers can update their orders"
  ON market_orders FOR UPDATE TO authenticated
  USING (seller_id = auth.uid());

CREATE POLICY "Buyers can update their orders"
  ON market_orders FOR UPDATE TO authenticated
  USING (buyer_id = auth.uid());

-- ============================================================
-- 3. order_disputes table
-- ============================================================
CREATE TYPE dispute_status AS ENUM (
  'open', 'seller_responded', 'buyer_accepted',
  'escalated', 'staff_resolved'
);

CREATE TABLE order_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES market_orders(id) ON DELETE CASCADE,
  initiated_by UUID NOT NULL REFERENCES profiles(id),
  reason TEXT NOT NULL,
  photos JSONB DEFAULT '[]'::jsonb,
  refund_type TEXT CHECK (refund_type IN ('full', 'partial')),
  refund_amount_usd NUMERIC(10,2),
  pickup_offered BOOLEAN DEFAULT false,
  status dispute_status NOT NULL DEFAULT 'open',
  staff_decision TEXT,
  staff_notes TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(order_id) -- one dispute per order
);

ALTER TABLE order_disputes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Order participants can view disputes"
  ON order_disputes FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM market_orders o
      WHERE o.id = order_disputes.order_id
        AND (o.buyer_id = auth.uid() OR o.seller_id = auth.uid())
    )
  );

-- ============================================================
-- 4. order_dispute_messages table
-- ============================================================
CREATE TABLE order_dispute_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID NOT NULL REFERENCES order_disputes(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id),
  body TEXT NOT NULL,
  photos JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE order_dispute_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Order participants can view dispute messages"
  ON order_dispute_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM order_disputes d
      JOIN market_orders o ON o.id = d.order_id
      WHERE d.id = order_dispute_messages.dispute_id
        AND (o.buyer_id = auth.uid() OR o.seller_id = auth.uid())
    )
  );

CREATE POLICY "Order participants can send dispute messages"
  ON order_dispute_messages FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM order_disputes d
      JOIN market_orders o ON o.id = d.order_id
      WHERE d.id = order_dispute_messages.dispute_id
        AND (o.buyer_id = auth.uid() OR o.seller_id = auth.uid())
    )
  );

-- ============================================================
-- 5. Storage bucket for order evidence
-- ============================================================
DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('order-evidence', 'order-evidence', true)
  ON CONFLICT (id) DO NOTHING;

  BEGIN CREATE POLICY "order_evidence_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'order-evidence');
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE POLICY "order_evidence_select" ON storage.objects FOR SELECT USING (bucket_id = 'order-evidence');
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ============================================================
-- 6. RPCs
-- ============================================================

-- 6a. Seller declines order
CREATE OR REPLACE FUNCTION seller_decline_order(p_order_id UUID, p_reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order RECORD;
BEGIN
  SELECT * INTO v_order FROM market_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order IS NULL THEN RETURN jsonb_build_object('error', 'Order not found'); END IF;
  IF v_order.seller_id != auth.uid() THEN RETURN jsonb_build_object('error', 'Not authorized'); END IF;
  IF v_order.status != 'pending' THEN RETURN jsonb_build_object('error', 'Can only decline pending orders'); END IF;

  -- Cancel order
  UPDATE market_orders SET status = 'declined', decline_reason = p_reason, updated_at = now() WHERE id = p_order_id;

  -- Restore inventory
  UPDATE market_products SET inventory = inventory + v_order.quantity, updated_at = now() WHERE id = v_order.product_id;

  -- Notify buyer
  INSERT INTO notifications (user_id, content, link_url)
  VALUES (v_order.buyer_id, 'Your order for "' || v_order.product_name || '" was declined by the seller: ' || p_reason, '/orders/' || p_order_id);

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 6b. Seller marks delivering (delivery orders)
CREATE OR REPLACE FUNCTION seller_mark_delivering(p_order_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order RECORD;
BEGIN
  SELECT * INTO v_order FROM market_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order IS NULL THEN RETURN jsonb_build_object('error', 'Order not found'); END IF;
  IF v_order.seller_id != auth.uid() THEN RETURN jsonb_build_object('error', 'Not authorized'); END IF;
  IF v_order.status != 'pending' THEN RETURN jsonb_build_object('error', 'Can only mark pending orders as delivering'); END IF;
  IF v_order.fulfillment_type != 'delivery' THEN RETURN jsonb_build_object('error', 'Only delivery orders'); END IF;

  UPDATE market_orders SET status = 'delivering', updated_at = now() WHERE id = p_order_id;

  INSERT INTO notifications (user_id, content, link_url)
  VALUES (v_order.buyer_id, 'Your order for "' || v_order.product_name || '" is on its way! 🚗', '/orders/' || p_order_id);

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 6c. Seller marks delivered with proof photos
CREATE OR REPLACE FUNCTION seller_mark_delivered(p_order_id UUID, p_proof JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order RECORD;
BEGIN
  SELECT * INTO v_order FROM market_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order IS NULL THEN RETURN jsonb_build_object('error', 'Order not found'); END IF;
  IF v_order.seller_id != auth.uid() THEN RETURN jsonb_build_object('error', 'Not authorized'); END IF;
  IF v_order.status NOT IN ('pending', 'delivering') THEN RETURN jsonb_build_object('error', 'Invalid status for delivery'); END IF;
  IF v_order.fulfillment_type != 'delivery' THEN RETURN jsonb_build_object('error', 'Only delivery orders'); END IF;

  UPDATE market_orders
  SET status = 'delivered',
      delivery_proof = p_proof,
      delivered_at = now(),
      auto_complete_at = now() + interval '4 hours',
      updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO notifications (user_id, content, link_url)
  VALUES (v_order.buyer_id, 'Your order for "' || v_order.product_name || '" has been delivered! Please confirm receipt within 4 hours. 📦', '/orders/' || p_order_id);

  RETURN jsonb_build_object('success', true, 'auto_complete_at', (now() + interval '4 hours'));
END;
$$;

-- 6d. Buyer confirms delivery
CREATE OR REPLACE FUNCTION buyer_confirm_delivery(p_order_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order RECORD;
BEGIN
  SELECT * INTO v_order FROM market_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order IS NULL THEN RETURN jsonb_build_object('error', 'Order not found'); END IF;
  IF v_order.buyer_id != auth.uid() THEN RETURN jsonb_build_object('error', 'Not authorized'); END IF;
  IF v_order.status != 'delivered' THEN RETURN jsonb_build_object('error', 'Order is not in delivered status'); END IF;

  UPDATE market_orders SET status = 'completed', completed_at = now(), updated_at = now() WHERE id = p_order_id;

  INSERT INTO notifications (user_id, content, link_url)
  VALUES (v_order.seller_id, 'Buyer confirmed delivery of "' || v_order.product_name || '". Order complete! ✓', '/orders/' || p_order_id);

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 6e. Buyer disputes delivery
CREATE OR REPLACE FUNCTION buyer_dispute_order(p_order_id UUID, p_reason TEXT, p_photos JSONB DEFAULT '[]')
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order RECORD;
  v_dispute_id UUID;
BEGIN
  SELECT * INTO v_order FROM market_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order IS NULL THEN RETURN jsonb_build_object('error', 'Order not found'); END IF;
  IF v_order.buyer_id != auth.uid() THEN RETURN jsonb_build_object('error', 'Not authorized'); END IF;
  IF v_order.status != 'delivered' THEN RETURN jsonb_build_object('error', 'Can only dispute delivered orders'); END IF;

  UPDATE market_orders SET status = 'disputed', updated_at = now() WHERE id = p_order_id;

  INSERT INTO order_disputes (order_id, initiated_by, reason, photos)
  VALUES (p_order_id, auth.uid(), p_reason, p_photos)
  RETURNING id INTO v_dispute_id;

  INSERT INTO notifications (user_id, content, link_url)
  VALUES (v_order.seller_id, 'Buyer has disputed their order for "' || v_order.product_name || '". Please respond. ⚠️', '/orders/' || p_order_id);

  RETURN jsonb_build_object('success', true, 'dispute_id', v_dispute_id);
END;
$$;

-- 6f. Seller responds to dispute
CREATE OR REPLACE FUNCTION seller_respond_dispute(p_dispute_id UUID, p_refund_type TEXT, p_refund_amount NUMERIC, p_pickup_offered BOOLEAN DEFAULT false)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_dispute RECORD;
  v_order RECORD;
BEGIN
  SELECT * INTO v_dispute FROM order_disputes WHERE id = p_dispute_id FOR UPDATE;
  IF v_dispute IS NULL THEN RETURN jsonb_build_object('error', 'Dispute not found'); END IF;

  SELECT * INTO v_order FROM market_orders WHERE id = v_dispute.order_id;
  IF v_order.seller_id != auth.uid() THEN RETURN jsonb_build_object('error', 'Not authorized'); END IF;
  IF v_dispute.status != 'open' THEN RETURN jsonb_build_object('error', 'Dispute already responded to'); END IF;

  UPDATE order_disputes
  SET status = 'seller_responded',
      refund_type = p_refund_type,
      refund_amount_usd = p_refund_amount,
      pickup_offered = p_pickup_offered,
      updated_at = now()
  WHERE id = p_dispute_id;

  INSERT INTO notifications (user_id, content, link_url)
  VALUES (v_order.buyer_id, 'Seller has responded to your dispute for "' || v_order.product_name || '" with a ' || p_refund_type || ' refund offer.', '/orders/' || v_order.id);

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 6g. Buyer accepts refund (resolves dispute)
CREATE OR REPLACE FUNCTION buyer_accept_refund(p_dispute_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_dispute RECORD;
  v_order RECORD;
BEGIN
  SELECT * INTO v_dispute FROM order_disputes WHERE id = p_dispute_id FOR UPDATE;
  IF v_dispute IS NULL THEN RETURN jsonb_build_object('error', 'Dispute not found'); END IF;

  SELECT * INTO v_order FROM market_orders WHERE id = v_dispute.order_id;
  IF v_order.buyer_id != auth.uid() THEN RETURN jsonb_build_object('error', 'Not authorized'); END IF;
  IF v_dispute.status != 'seller_responded' THEN RETURN jsonb_build_object('error', 'Seller has not responded yet'); END IF;

  UPDATE order_disputes SET status = 'buyer_accepted', resolved_at = now(), updated_at = now() WHERE id = p_dispute_id;
  UPDATE market_orders SET status = 'resolved', updated_at = now() WHERE id = v_dispute.order_id;

  INSERT INTO notifications (user_id, content, link_url)
  VALUES (v_order.seller_id, 'Buyer accepted your refund offer for "' || v_order.product_name || '". Dispute resolved. ✓', '/orders/' || v_order.id);

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 6h. Either party escalates dispute
CREATE OR REPLACE FUNCTION escalate_dispute(p_dispute_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_dispute RECORD;
  v_order RECORD;
BEGIN
  SELECT * INTO v_dispute FROM order_disputes WHERE id = p_dispute_id FOR UPDATE;
  IF v_dispute IS NULL THEN RETURN jsonb_build_object('error', 'Dispute not found'); END IF;

  SELECT * INTO v_order FROM market_orders WHERE id = v_dispute.order_id;
  IF v_order.buyer_id != auth.uid() AND v_order.seller_id != auth.uid() THEN
    RETURN jsonb_build_object('error', 'Not authorized');
  END IF;
  IF v_dispute.status IN ('buyer_accepted', 'staff_resolved') THEN
    RETURN jsonb_build_object('error', 'Dispute already resolved');
  END IF;

  UPDATE order_disputes SET status = 'escalated', updated_at = now() WHERE id = p_dispute_id;
  UPDATE market_orders SET status = 'escalated', updated_at = now() WHERE id = v_dispute.order_id;

  -- Notify both parties
  INSERT INTO notifications (user_id, content, link_url) VALUES
    (v_order.buyer_id, 'Dispute for "' || v_order.product_name || '" has been escalated to CasaGrown staff.', '/orders/' || v_order.id),
    (v_order.seller_id, 'Dispute for "' || v_order.product_name || '" has been escalated to CasaGrown staff.', '/orders/' || v_order.id);

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 6i. Buyer resolves dispute (accepts current state)
CREATE OR REPLACE FUNCTION buyer_resolve_dispute(p_dispute_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_dispute RECORD;
  v_order RECORD;
BEGIN
  SELECT * INTO v_dispute FROM order_disputes WHERE id = p_dispute_id FOR UPDATE;
  IF v_dispute IS NULL THEN RETURN jsonb_build_object('error', 'Dispute not found'); END IF;

  SELECT * INTO v_order FROM market_orders WHERE id = v_dispute.order_id;
  IF v_order.buyer_id != auth.uid() THEN RETURN jsonb_build_object('error', 'Not authorized'); END IF;
  IF v_dispute.status IN ('buyer_accepted', 'staff_resolved') THEN RETURN jsonb_build_object('error', 'Already resolved'); END IF;

  UPDATE order_disputes SET status = 'buyer_accepted', resolved_at = now(), updated_at = now() WHERE id = p_dispute_id;
  UPDATE market_orders SET status = 'resolved', updated_at = now() WHERE id = v_dispute.order_id;

  INSERT INTO notifications (user_id, content, link_url)
  VALUES (v_order.seller_id, 'Buyer resolved the dispute for "' || v_order.product_name || '". ✓', '/orders/' || v_order.id);

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 6j. Seller marks ready for pickup (generates passcodes)
CREATE OR REPLACE FUNCTION seller_mark_ready_pickup(p_order_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order RECORD;
  v_buyer_code TEXT;
  v_seller_code TEXT;
BEGIN
  SELECT * INTO v_order FROM market_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order IS NULL THEN RETURN jsonb_build_object('error', 'Order not found'); END IF;
  IF v_order.seller_id != auth.uid() THEN RETURN jsonb_build_object('error', 'Not authorized'); END IF;
  IF v_order.status != 'pending' THEN RETURN jsonb_build_object('error', 'Can only mark pending orders as ready'); END IF;
  IF v_order.fulfillment_type != 'pickup' THEN RETURN jsonb_build_object('error', 'Only pickup orders'); END IF;

  -- Generate 4-digit passcodes
  v_buyer_code := lpad(floor(random() * 10000)::text, 4, '0');
  v_seller_code := lpad(floor(random() * 10000)::text, 4, '0');

  UPDATE market_orders
  SET status = 'ready_for_pickup',
      buyer_passcode = v_buyer_code,
      seller_passcode = v_seller_code,
      updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO notifications (user_id, content, link_url)
  VALUES (v_order.buyer_id, 'Your order for "' || v_order.product_name || '" is ready for pickup! Check your order for the pickup passcode. 📍', '/orders/' || p_order_id);

  RETURN jsonb_build_object('success', true, 'seller_passcode', v_seller_code);
END;
$$;

-- 6k. Enter pickup passcode
CREATE OR REPLACE FUNCTION enter_pickup_passcode(p_order_id UUID, p_passcode TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order RECORD;
  v_is_buyer BOOLEAN;
  v_is_seller BOOLEAN;
  v_expected TEXT;
BEGIN
  SELECT * INTO v_order FROM market_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order IS NULL THEN RETURN jsonb_build_object('error', 'Order not found'); END IF;
  IF v_order.status != 'ready_for_pickup' THEN RETURN jsonb_build_object('error', 'Order is not ready for pickup'); END IF;

  v_is_buyer := (v_order.buyer_id = auth.uid());
  v_is_seller := (v_order.seller_id = auth.uid());

  IF NOT v_is_buyer AND NOT v_is_seller THEN
    RETURN jsonb_build_object('error', 'Not authorized');
  END IF;

  -- Buyer enters SELLER's passcode (to prove seller identity)
  -- Seller enters BUYER's passcode (to prove buyer identity)
  IF v_is_buyer THEN
    v_expected := v_order.seller_passcode;
    IF p_passcode != v_expected THEN
      RETURN jsonb_build_object('error', 'Invalid passcode');
    END IF;
    UPDATE market_orders SET buyer_passcode_entered = true, updated_at = now() WHERE id = p_order_id;
  ELSE
    v_expected := v_order.buyer_passcode;
    IF p_passcode != v_expected THEN
      RETURN jsonb_build_object('error', 'Invalid passcode');
    END IF;
    UPDATE market_orders SET seller_passcode_entered = true, updated_at = now() WHERE id = p_order_id;
  END IF;

  -- Check if both entered: complete the order
  SELECT * INTO v_order FROM market_orders WHERE id = p_order_id;
  IF v_order.buyer_passcode_entered AND v_order.seller_passcode_entered THEN
    UPDATE market_orders SET status = 'completed', completed_at = now(), updated_at = now() WHERE id = p_order_id;

    INSERT INTO notifications (user_id, content, link_url) VALUES
      (v_order.buyer_id, 'Pickup complete for "' || v_order.product_name || '"! ✓', '/orders/' || p_order_id),
      (v_order.seller_id, 'Pickup complete for "' || v_order.product_name || '"! ✓', '/orders/' || p_order_id);

    RETURN jsonb_build_object('success', true, 'completed', true);
  END IF;

  RETURN jsonb_build_object('success', true, 'completed', false, 'waiting_for_other', true);
END;
$$;

-- 6l. Buyer declines pickup
CREATE OR REPLACE FUNCTION buyer_decline_pickup(p_order_id UUID, p_reason TEXT, p_photos JSONB DEFAULT '[]')
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order RECORD;
BEGIN
  SELECT * INTO v_order FROM market_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order IS NULL THEN RETURN jsonb_build_object('error', 'Order not found'); END IF;
  IF v_order.buyer_id != auth.uid() THEN RETURN jsonb_build_object('error', 'Not authorized'); END IF;
  IF v_order.status != 'ready_for_pickup' THEN RETURN jsonb_build_object('error', 'Order is not ready for pickup'); END IF;

  UPDATE market_orders
  SET status = 'pickup_declined',
      decline_reason = p_reason,
      delivery_proof = p_photos, -- reuse field for evidence
      updated_at = now()
  WHERE id = p_order_id;

  -- Restore inventory
  UPDATE market_products SET inventory = inventory + v_order.quantity, updated_at = now() WHERE id = v_order.product_id;

  INSERT INTO notifications (user_id, content, link_url)
  VALUES (v_order.seller_id, 'Buyer declined pickup for "' || v_order.product_name || '": ' || p_reason, '/orders/' || p_order_id);

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ============================================================
-- 7. Auto-complete check function (called by app or cron)
-- ============================================================
CREATE OR REPLACE FUNCTION auto_complete_delivered_orders()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH completed AS (
    UPDATE market_orders
    SET status = 'completed', completed_at = now(), updated_at = now()
    WHERE status = 'delivered'
      AND auto_complete_at IS NOT NULL
      AND auto_complete_at <= now()
    RETURNING id, buyer_id, seller_id, product_name
  )
  INSERT INTO notifications (user_id, content, link_url)
  SELECT seller_id, 'Order for "' || product_name || '" auto-completed (buyer did not respond within 4 hours). ✓', '/orders/' || id
  FROM completed;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ============================================================
-- 8. Midnight settling: auto-cancel stale orders
--    Orders still pending or ready_for_pickup from before today
--    are cancelled, inventory restored, parties notified.
-- ============================================================
CREATE OR REPLACE FUNCTION settle_stale_orders()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count INTEGER := 0;
  v_rec RECORD;
BEGIN
  -- Cancel pending orders from before today
  FOR v_rec IN
    SELECT id, buyer_id, seller_id, product_id, product_name, quantity
    FROM market_orders
    WHERE status IN ('pending', 'ready_for_pickup')
      AND created_at < CURRENT_DATE
    FOR UPDATE
  LOOP
    UPDATE market_orders
    SET status = 'cancelled',
        decline_reason = 'Auto-cancelled: market day ended without completion',
        updated_at = now()
    WHERE id = v_rec.id;

    -- Restore inventory
    UPDATE market_products
    SET inventory = inventory + v_rec.quantity, updated_at = now()
    WHERE id = v_rec.product_id;

    -- Notify both parties
    INSERT INTO notifications (user_id, content, link_url) VALUES
      (v_rec.buyer_id, 'Order for "' || v_rec.product_name || '" was auto-cancelled (market day ended). ✕', '/orders/' || v_rec.id),
      (v_rec.seller_id, 'Order for "' || v_rec.product_name || '" was auto-cancelled (market day ended). ✕', '/orders/' || v_rec.id);

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;
