-- ============================================================
-- Migration: Order Status Log + Stripe Disputes
-- Adds audit trail for order status transitions and
-- chargeback dispute management infrastructure
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. ORDER STATUS LOG — automatic audit trail
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_status_log (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  old_status  TEXT,           -- NULL on initial insert
  new_status  TEXT NOT NULL,
  changed_by  UUID,           -- NULL = system/cron
  changed_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  metadata    JSONB           -- optional context (e.g. "auto-completed by settle_market_day")
);

CREATE INDEX IF NOT EXISTS idx_osl_order_id ON order_status_log(order_id, changed_at);
CREATE INDEX IF NOT EXISTS idx_osl_changed_at ON order_status_log(changed_at);

-- Trigger: log every status UPDATE
CREATE OR REPLACE FUNCTION log_order_status_change()
RETURNS trigger AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO order_status_log (order_id, old_status, new_status, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_order_status_log ON orders;
CREATE TRIGGER trg_order_status_log
  AFTER UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION log_order_status_change();

-- Trigger: log initial INSERT (order placed)
CREATE OR REPLACE FUNCTION log_order_created()
RETURNS trigger AS $$
BEGIN
  INSERT INTO order_status_log (order_id, old_status, new_status, changed_by)
  VALUES (NEW.id, NULL, NEW.status, auth.uid());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_order_status_log_insert ON orders;
CREATE TRIGGER trg_order_status_log_insert
  AFTER INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION log_order_created();

-- RLS: staff can read, service_role can write (via triggers)
ALTER TABLE order_status_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view order status logs"
  ON order_status_log FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid())
    OR auth.uid() = changed_by
    OR EXISTS (SELECT 1 FROM orders o WHERE o.id = order_id AND (o.buyer_id = auth.uid() OR o.seller_id = auth.uid()))
  );

-- Service role inserts via trigger (SECURITY DEFINER bypasses RLS)


-- ────────────────────────────────────────────────────────────
-- 2. STRIPE DISPUTES TABLE
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stripe_disputes (
  id                        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  stripe_dispute_id         TEXT UNIQUE NOT NULL,
  stripe_charge_id          TEXT,
  stripe_payment_intent_id  TEXT,
  buyer_id                  UUID REFERENCES auth.users(id),
  amount_usd                NUMERIC(10,2) NOT NULL,
  fee_usd                   NUMERIC(10,2) DEFAULT 15.00,
  reason                    TEXT,
  status                    TEXT NOT NULL DEFAULT 'needs_response'
    CHECK (status IN (
      'needs_response', 'warning_needs_response',
      'under_review', 'warning_under_review',
      'won', 'lost',
      'warning_closed'
    )),
  evidence_due_by           TIMESTAMPTZ,
  evidence_submitted_at     TIMESTAMPTZ,
  evidence_json             JSONB,
  settlement_id             UUID,
  market_date               DATE,
  resolved_at               TIMESTAMPTZ,
  stripe_metadata           JSONB,
  admin_notes               TEXT,
  created_at                TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at                TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_disputes_status ON stripe_disputes(status);
CREATE INDEX IF NOT EXISTS idx_disputes_buyer ON stripe_disputes(buyer_id);
CREATE INDEX IF NOT EXISTS idx_disputes_pi ON stripe_disputes(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_disputes_due ON stripe_disputes(evidence_due_by) WHERE status IN ('needs_response', 'warning_needs_response');

-- RLS: Staff-only SELECT. Inserts via service_role (webhook).
ALTER TABLE stripe_disputes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view disputes"
  ON stripe_disputes FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Service role can manage disputes"
  ON stripe_disputes FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');


-- ────────────────────────────────────────────────────────────
-- 3. ADMIN RPCs
-- ────────────────────────────────────────────────────────────

-- 3a. List disputes with optional status filter
CREATE OR REPLACE FUNCTION get_disputes_admin(
  p_status TEXT DEFAULT NULL,
  p_limit  INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Staff check
  IF NOT EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Staff access required';
  END IF;

  SELECT jsonb_agg(row_to_json(d)::jsonb ORDER BY d.created_at DESC)
  INTO v_result
  FROM (
    SELECT
      sd.id,
      sd.stripe_dispute_id,
      sd.stripe_payment_intent_id,
      sd.amount_usd,
      sd.fee_usd,
      sd.reason,
      sd.status,
      sd.evidence_due_by,
      sd.evidence_submitted_at,
      sd.market_date,
      sd.resolved_at,
      sd.created_at,
      sd.admin_notes,
      p.full_name AS buyer_name,
      u.email AS buyer_email,
      -- deadline helpers
      CASE
        WHEN sd.evidence_due_by IS NOT NULL AND sd.status IN ('needs_response', 'warning_needs_response')
        THEN EXTRACT(EPOCH FROM (sd.evidence_due_by - now())) / 86400.0
        ELSE NULL
      END AS days_remaining
    FROM stripe_disputes sd
    LEFT JOIN auth.users u ON u.id = sd.buyer_id
    LEFT JOIN profiles p ON p.id = sd.buyer_id
    WHERE (p_status IS NULL OR sd.status = p_status)
    ORDER BY sd.created_at DESC
    LIMIT p_limit OFFSET p_offset
  ) d;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- 3b. Dispute stats
CREATE OR REPLACE FUNCTION get_dispute_stats()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Staff access required';
  END IF;

  SELECT jsonb_build_object(
    'needs_response', COUNT(*) FILTER (WHERE status IN ('needs_response', 'warning_needs_response')),
    'under_review', COUNT(*) FILTER (WHERE status IN ('under_review', 'warning_under_review')),
    'won', COUNT(*) FILTER (WHERE status = 'won'),
    'lost', COUNT(*) FILTER (WHERE status = 'lost'),
    'total', COUNT(*),
    'total_disputed_usd', COALESCE(SUM(amount_usd), 0),
    'total_won_usd', COALESCE(SUM(amount_usd) FILTER (WHERE status = 'won'), 0),
    'total_lost_usd', COALESCE(SUM(amount_usd) FILTER (WHERE status = 'lost'), 0),
    'total_fees_usd', COALESCE(SUM(fee_usd), 0),
    'nearest_deadline', MIN(evidence_due_by) FILTER (WHERE status IN ('needs_response', 'warning_needs_response'))
  )
  INTO v_result
  FROM stripe_disputes;

  RETURN v_result;
END;
$$;

-- 3c. Assemble full evidence package for a dispute
CREATE OR REPLACE FUNCTION get_dispute_evidence(p_dispute_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_dispute   RECORD;
  v_buyer     RECORD;
  v_result    JSONB;
  v_purchases JSONB;
  v_sales     JSONB;
  v_status_logs JSONB;
  v_chat_logs JSONB;
  v_opening_balance NUMERIC := 0;
  v_net       JSONB;
  v_purchases_total NUMERIC := 0;
  v_sales_total     NUMERIC := 0;
  v_platform_fee    NUMERIC := 0;
  v_refunds         NUMERIC := 0;
  v_market_start TIMESTAMPTZ;
  v_market_end   TIMESTAMPTZ;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Staff access required';
  END IF;

  SELECT * INTO v_dispute FROM stripe_disputes WHERE id = p_dispute_id;
  IF v_dispute IS NULL THEN
    RETURN jsonb_build_object('error', 'Dispute not found');
  END IF;

  v_market_start := COALESCE(v_dispute.market_date::timestamptz, v_dispute.created_at - interval '1 day');
  v_market_end   := v_market_start + interval '1 day';

  SELECT p.full_name, u.email, p.created_at AS profile_created
  INTO v_buyer
  FROM auth.users u LEFT JOIN profiles p ON p.id = u.id
  WHERE u.id = v_dispute.buyer_id;

  -- Opening balance from market_ledger
  SELECT COALESCE(SUM(
    CASE WHEN direction = 'credit' THEN amount_usd
         WHEN direction = 'debit' THEN -amount_usd
         ELSE 0 END
  ), 0)
  INTO v_opening_balance
  FROM market_ledger
  WHERE user_id = v_dispute.buyer_id
    AND created_at < v_market_start;

  -- Purchases (market_orders where buyer bought)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'order_id', o.id,
    'seller_name', sp.full_name,
    'product_name', o.product_name,
    'quantity', o.quantity,
    'unit_price', o.unit_price_usd,
    'total', o.total_usd,
    'status', o.status,
    'fulfillment_method', o.fulfillment_type,
    'delivery_proof', o.delivery_proof,
    'delivered_at', o.delivered_at,
    'created_at', o.created_at
  ) ORDER BY o.created_at), '[]'::jsonb)
  INTO v_purchases
  FROM market_orders o
  LEFT JOIN profiles sp ON sp.id = o.seller_id
  WHERE o.buyer_id = v_dispute.buyer_id
    AND o.created_at >= v_market_start AND o.created_at < v_market_end;

  SELECT COALESCE(SUM(o.total_usd), 0) INTO v_purchases_total
  FROM market_orders o WHERE o.buyer_id = v_dispute.buyer_id
    AND o.created_at >= v_market_start AND o.created_at < v_market_end;

  -- Sales (market_orders where dispute buyer was seller)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'order_id', o.id,
    'buyer_name', bp.full_name,
    'product_name', o.product_name,
    'quantity', o.quantity,
    'unit_price', o.unit_price_usd,
    'total', o.total_usd,
    'status', o.status,
    'fulfillment_method', o.fulfillment_type,
    'delivery_proof', o.delivery_proof,
    'delivered_at', o.delivered_at,
    'created_at', o.created_at
  ) ORDER BY o.created_at), '[]'::jsonb)
  INTO v_sales
  FROM market_orders o
  LEFT JOIN profiles bp ON bp.id = o.buyer_id
  WHERE o.seller_id = v_dispute.buyer_id
    AND o.created_at >= v_market_start AND o.created_at < v_market_end;

  SELECT COALESCE(SUM(o.total_usd), 0) INTO v_sales_total
  FROM market_orders o WHERE o.seller_id = v_dispute.buyer_id
    AND o.created_at >= v_market_start AND o.created_at < v_market_end;

  -- Order status logs (empty for now — trigger is on legacy orders table)
  v_status_logs := '[]'::jsonb;

  -- Chat logs from market_chat_messages
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'from_name', fp.full_name,
    'text', m.content,
    'sent_at', m.created_at
  ) ORDER BY m.created_at), '[]'::jsonb)
  INTO v_chat_logs
  FROM market_chat_messages m
  LEFT JOIN profiles fp ON fp.id = m.sender_id
  WHERE m.sender_id = v_dispute.buyer_id
    AND m.created_at BETWEEN (v_market_start - interval '1 day') AND (v_market_end + interval '1 day');

  -- Platform fee
  SELECT COALESCE(SUM(amount_usd), 0) INTO v_platform_fee
  FROM market_ledger
  WHERE user_id = v_dispute.buyer_id
    AND created_at >= v_market_start AND created_at < v_market_end
    AND event_type = 'fee_charged';

  -- Refunds
  SELECT COALESCE(SUM(amount_usd), 0) INTO v_refunds
  FROM market_ledger
  WHERE user_id = v_dispute.buyer_id
    AND created_at >= v_market_start AND created_at < v_market_end
    AND event_type = 'refund_issued';

  v_net := jsonb_build_object(
    'opening_balance', v_opening_balance,
    'purchases_total', v_purchases_total,
    'sales_total', v_sales_total,
    'platform_fee', v_platform_fee,
    'refunds', v_refunds,
    'net_charged', v_purchases_total - v_sales_total + v_opening_balance + v_platform_fee - v_refunds
  );

  v_result := jsonb_build_object(
    'dispute', row_to_json(v_dispute)::jsonb,
    'buyer', jsonb_build_object(
      'name', v_buyer.full_name,
      'email', v_buyer.email,
      'profile_created', v_buyer.profile_created
    ),
    'opening_balance', jsonb_build_object(
      'amount_usd', v_opening_balance,
      'source', 'Prior market day unsettled balance'
    ),
    'purchases', v_purchases,
    'sales', v_sales,
    'net_calculation', v_net,
    'order_status_logs', v_status_logs,
    'chat_logs', v_chat_logs,
    'fulfillment_photos', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'order_id', o.id,
        'fulfillment_method', o.fulfillment_type,
        'proof', o.delivery_proof,
        'delivered_at', o.delivered_at
      )), '[]'::jsonb)
      FROM market_orders o
      WHERE (o.buyer_id = v_dispute.buyer_id OR o.seller_id = v_dispute.buyer_id)
        AND o.created_at >= v_market_start AND o.created_at < v_market_end
        AND o.delivery_proof IS NOT NULL
    )
  );

  RETURN v_result;
END;
$$;


-- 3d. Save draft evidence
CREATE OR REPLACE FUNCTION save_dispute_evidence_draft(
  p_dispute_id UUID,
  p_evidence   JSONB
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Staff access required';
  END IF;

  UPDATE stripe_disputes
  SET evidence_json = p_evidence, updated_at = now()
  WHERE id = p_dispute_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Grant execute to authenticated + service_role
GRANT EXECUTE ON FUNCTION get_disputes_admin TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_dispute_stats TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_dispute_evidence TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION save_dispute_evidence_draft TO authenticated, service_role;
