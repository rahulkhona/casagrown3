-- ============================================================================
-- Migration: Recurring User Incentives & Flat Cap Support
-- ============================================================================

-- 1. Modify user_credits schema
CREATE TYPE credit_cap_type AS ENUM ('percentage', 'flat_amount');

ALTER TABLE user_credits RENAME COLUMN max_pct_per_txn TO cap_value;
ALTER TABLE user_credits ADD COLUMN cap_type credit_cap_type NOT NULL DEFAULT 'percentage';

-- 2. Create user_incentives schema
CREATE TYPE expiration_frequency AS ENUM ('weekly', 'monthly', 'quarterly', 'halfyearly', 'yearly', 'onetime');

CREATE TABLE user_incentives (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount_usd NUMERIC(10,2) NOT NULL CHECK (amount_usd > 0),
  credit_type credit_type NOT NULL DEFAULT 'purchase',
  cap_type credit_cap_type NOT NULL DEFAULT 'percentage',
  cap_value NUMERIC(10,2) NOT NULL,
  expiration_frequency expiration_frequency NOT NULL,
  start_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  stop_date TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_incentives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view user incentives"
  ON user_incentives FOR SELECT
  USING (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()));

CREATE POLICY "Service role manages user incentives"
  ON user_incentives FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');


-- 3. RPC: process_recurring_incentives
CREATE OR REPLACE FUNCTION process_recurring_incentives()
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_incentive RECORD;
  v_period_start TIMESTAMPTZ;
  v_period_end TIMESTAMPTZ;
  v_credit_exists BOOLEAN;
BEGIN
  FOR v_incentive IN
    SELECT * FROM user_incentives
    WHERE is_active = true
      AND now() >= start_date
      AND (stop_date IS NULL OR now() <= stop_date)
  LOOP
    -- Calculate period end
    CASE v_incentive.expiration_frequency
      WHEN 'weekly' THEN
        v_period_end := date_trunc('week', now()) + interval '1 week';
      WHEN 'monthly' THEN
        v_period_end := date_trunc('month', now()) + interval '1 month';
      WHEN 'quarterly' THEN
        v_period_end := date_trunc('quarter', now()) + interval '3 months';
      WHEN 'halfyearly' THEN
        v_period_end := date_trunc('month', now()) + interval '6 months';
      WHEN 'yearly' THEN
        v_period_end := date_trunc('year', now()) + interval '1 year';
      WHEN 'onetime' THEN
        v_period_end := v_incentive.start_date + interval '100 years';
    END CASE;

    IF v_incentive.expiration_frequency = 'onetime' THEN
      SELECT EXISTS (
        SELECT 1 FROM user_credits
        WHERE source_id = v_incentive.id AND source = 'promotion'
      ) INTO v_credit_exists;
    ELSE
      SELECT EXISTS (
        SELECT 1 FROM user_credits
        WHERE source_id = v_incentive.id 
          AND source = 'promotion'
          AND expires_at = v_period_end
      ) INTO v_credit_exists;
    END IF;

    IF NOT v_credit_exists THEN
      INSERT INTO user_credits (
        user_id, amount_usd, remaining_usd, credit_type,
        cap_type, cap_value, source, source_id,
        reason, expires_at
      ) VALUES (
        v_incentive.user_id, v_incentive.amount_usd, v_incentive.amount_usd, v_incentive.credit_type,
        v_incentive.cap_type, v_incentive.cap_value, 'promotion', v_incentive.id,
        'Recurring Incentive Program', v_period_end
      );
    END IF;

  END LOOP;
END;
$$;


-- 4. Add pg_cron job
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'process_recurring_incentives',
      '0 0 * * *',
      'SELECT process_recurring_incentives()'
    );
  END IF;
END $$;


-- 5. Update _complete_market_order_with_receipt to handle new cap types and strict 1-credit logic
CREATE OR REPLACE FUNCTION _complete_market_order_with_receipt(p_order_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order RECORD;
  v_buyer_profile RECORD;
  v_seller_profile RECORD;
  v_buyer_email TEXT;
  v_seller_email TEXT;
  v_receipt_footer TEXT;
  v_edge_fn_url TEXT;
  v_service_key TEXT;
  v_email_body JSONB;
  
  v_seller_refunds NUMERIC(10,2) := 0;
  v_final_subtotal NUMERIC(10,2) := 0;
  v_fee_rate NUMERIC;
  v_calculated_fee NUMERIC(10,2) := 0;
  
  v_buyer_credit RECORD;
  v_seller_credit RECORD;
  
  v_buyer_credit_applied NUMERIC(10,2) := 0;
  v_seller_fee_discount NUMERIC(10,2) := 0;
  v_buyer_max_allowed NUMERIC(10,2) := 0;
  v_seller_max_allowed NUMERIC(10,2) := 0;
BEGIN
  SELECT * INTO v_order FROM market_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order IS NULL THEN RETURN; END IF;

  SELECT COALESCE(SUM(refund_amount_usd), 0) INTO v_seller_refunds
  FROM order_disputes
  WHERE order_id = p_order_id AND status IN ('buyer_accepted', 'staff_resolved');

  v_final_subtotal := GREATEST(v_order.subtotal_usd - v_seller_refunds, 0);

  v_fee_rate := public.get_platform_fee_for_user(v_order.seller_id);
  v_calculated_fee := ROUND(v_final_subtotal * v_fee_rate, 2);

  -- Process Seller platform_fee Credits (Strict 1-credit per txn)
  FOR v_seller_credit IN
    SELECT id, remaining_usd, cap_type, cap_value FROM user_credits
    WHERE user_id = v_order.seller_id AND credit_type = 'platform_fee' AND expires_at > now() AND remaining_usd > 0
    ORDER BY CASE WHEN source = 'escalation_resolution' THEN 0 ELSE 1 END ASC, created_at ASC
  LOOP
    IF v_calculated_fee > 0 THEN
      IF v_seller_credit.cap_type = 'percentage' THEN
        v_seller_max_allowed := ROUND(v_final_subtotal * v_seller_credit.cap_value / 100, 2);
      ELSE
        v_seller_max_allowed := v_seller_credit.cap_value;
      END IF;

      v_seller_fee_discount := LEAST(v_seller_credit.remaining_usd, v_seller_max_allowed, v_calculated_fee);
      
      IF v_seller_fee_discount > 0 THEN
        UPDATE user_credits SET remaining_usd = remaining_usd - v_seller_fee_discount WHERE id = v_seller_credit.id;
        INSERT INTO credit_usage_log (credit_id, order_id, amount_usd) VALUES (v_seller_credit.id, p_order_id, v_seller_fee_discount);
        v_calculated_fee := v_calculated_fee - v_seller_fee_discount;
        EXIT; -- Strict 1 credit per txn
      END IF;
    END IF;
  END LOOP;

  -- Process Buyer purchase Credits (Strict 1-credit per txn)
  FOR v_buyer_credit IN
    SELECT id, remaining_usd, cap_type, cap_value FROM user_credits
    WHERE user_id = v_order.buyer_id AND credit_type = 'purchase' AND expires_at > now() AND remaining_usd > 0
    ORDER BY CASE WHEN source = 'escalation_resolution' THEN 0 ELSE 1 END ASC, created_at ASC
  LOOP
    IF (v_order.total_usd - v_buyer_credit_applied) > 0 THEN
      IF v_buyer_credit.cap_type = 'percentage' THEN
        v_buyer_max_allowed := ROUND(v_order.total_usd * v_buyer_credit.cap_value / 100, 2);
      ELSE
        v_buyer_max_allowed := v_buyer_credit.cap_value;
      END IF;
      
      DECLARE v_step_apply NUMERIC(10,2);
      BEGIN
        v_step_apply := LEAST(v_buyer_credit.remaining_usd, v_buyer_max_allowed - v_buyer_credit_applied, v_order.total_usd - v_buyer_credit_applied);
        IF v_step_apply > 0 THEN
          UPDATE user_credits SET remaining_usd = remaining_usd - v_step_apply WHERE id = v_buyer_credit.id;
          INSERT INTO credit_usage_log (credit_id, order_id, amount_usd) VALUES (v_buyer_credit.id, p_order_id, v_step_apply);
          v_buyer_credit_applied := v_buyer_credit_applied + v_step_apply;
          EXIT; -- Strict 1 credit per txn
        END IF;
      END;
    END IF;
  END LOOP;

  UPDATE market_orders
  SET platform_fee_usd = v_calculated_fee,
      credit_applied_usd = v_buyer_credit_applied
  WHERE id = p_order_id;
  
  SELECT * INTO v_order FROM market_orders WHERE id = p_order_id;

  -- STEP B: Generate Digital Receipts
  BEGIN
    SELECT full_name, zip_code INTO v_buyer_profile FROM profiles WHERE id = v_order.buyer_id;
    SELECT full_name, zip_code INTO v_seller_profile FROM profiles WHERE id = v_order.seller_id;

    v_buyer_email := get_user_email(v_order.buyer_id);
    v_seller_email := get_user_email(v_order.seller_id);

    SELECT rf.footer_text INTO v_receipt_footer
    FROM receipt_footers rf
    JOIN profiles p ON p.id = v_order.seller_id
    JOIN communities c ON c.h3_index = p.home_community_h3_index
    WHERE rf.state_code = c.state
    LIMIT 1;

    v_service_key := COALESCE(
      current_setting('app.settings.service_role_key', true),
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
    );
    v_edge_fn_url := COALESCE(
      current_setting('app.settings.edge_functions_base_url', true),
      current_setting('app.settings.supabase_url', true) || '/functions/v1',
      'http://host.docker.internal:54321/functions/v1'
    ) || '/send-transaction-email';

    INSERT INTO digital_receipts (order_id, buyer_receipt, seller_receipt)
    VALUES (
      p_order_id,
      jsonb_build_object(
        'transaction_id', v_order.id,
        'date', now(),
        'type', 'CasaGrown Market Purchase',
        'buyer_name', v_buyer_profile.full_name,
        'buyer_zip', v_buyer_profile.zip_code,
        'seller_name', v_seller_profile.full_name,
        'seller_zip', v_seller_profile.zip_code,
        'product', v_order.product_name,
        'quantity', v_order.quantity,
        'price_per_unit', v_order.subtotal_usd / GREATEST(v_order.quantity, 1),
        'subtotal', v_order.subtotal_usd,
        'tax_amount', COALESCE(v_order.tax_amount_usd, 0),
        'credit_applied', v_buyer_credit_applied,
        'total', v_order.total_usd,
        'fulfillment_type', v_order.fulfillment_type,
        'footer', v_receipt_footer
      ),
      jsonb_build_object(
        'transaction_id', v_order.id,
        'date', now(),
        'type', 'CasaGrown Market Sale',
        'buyer_name', v_buyer_profile.full_name,
        'buyer_zip', v_buyer_profile.zip_code,
        'seller_name', v_seller_profile.full_name,
        'seller_zip', v_seller_profile.zip_code,
        'product', v_order.product_name,
        'quantity', v_order.quantity,
        'price_per_unit', v_order.subtotal_usd / GREATEST(v_order.quantity, 1),
        'subtotal', v_order.subtotal_usd,
        'tax_amount', COALESCE(v_order.tax_amount_usd, 0),
        'total', v_order.total_usd,
        'platform_fee', COALESCE(v_order.platform_fee_usd, 0),
        'seller_payout', v_order.subtotal_usd - COALESCE(v_order.platform_fee_usd, 0),
        'fulfillment_type', v_order.fulfillment_type,
        'footer', v_receipt_footer
      )
    );

    v_email_body := jsonb_build_object(
      'transactionId', v_order.id,
      'date', now(),
      'product', v_order.product_name,
      'quantity', v_order.quantity,
      'unit', 'unit',
      'pointsPerUnit', ROUND(v_order.subtotal_usd / GREATEST(v_order.quantity, 1), 2),
      'subtotal', v_order.subtotal_usd,
      'tax', COALESCE(v_order.tax_amount_usd, 0),
      'creditApplied', v_buyer_credit_applied,
      'total', v_order.total_usd,
      'sellerName', v_seller_profile.full_name,
      'sellerZip', COALESCE(v_seller_profile.zip_code, ''),
      'buyerName', v_buyer_profile.full_name,
      'buyerZip', COALESCE(v_buyer_profile.zip_code, ''),
      'platformFee', COALESCE(v_order.platform_fee_usd, 0),
      'feeRate', v_fee_rate,
      'sellerPayout', v_order.subtotal_usd - COALESCE(v_order.platform_fee_usd, 0),
      'delegated', false,
      'receiptFooter', COALESCE(v_receipt_footer, '')
    );

    IF v_buyer_email IS NOT NULL AND v_service_key IS NOT NULL THEN
      PERFORM net.http_post(url := v_edge_fn_url, headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key), body := jsonb_build_object('recipients', jsonb_build_array(jsonb_build_object('email', v_buyer_email, 'role', 'buyer')), 'orderData', v_email_body));
    END IF;

    IF v_seller_email IS NOT NULL AND v_service_key IS NOT NULL THEN
      PERFORM net.http_post(url := v_edge_fn_url, headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key), body := jsonb_build_object('recipients', jsonb_build_array(jsonb_build_object('email', v_seller_email, 'role', 'seller')), 'orderData', v_email_body));
    END IF;

  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Receipt generation failed for order %: %', p_order_id, SQLERRM;
  END;

END;
$$;


-- 6. Update admin_resolve_escalation to support cap_type
DROP FUNCTION IF EXISTS admin_resolve_escalation(
  UUID, escalation_resolution_type, TEXT, NUMERIC, NUMERIC, credit_type, NUMERIC, NUMERIC, credit_type, NUMERIC
);

CREATE OR REPLACE FUNCTION admin_resolve_escalation(
  p_order_id                UUID,
  p_resolution_type         escalation_resolution_type,
  p_reason                  TEXT,
  p_refund_amount_usd       NUMERIC DEFAULT NULL,
  p_credit_amount_usd       NUMERIC DEFAULT NULL,
  p_credit_type             credit_type DEFAULT 'purchase',
  p_credit_cap_value        NUMERIC DEFAULT 20,
  p_credit_cap_type         credit_cap_type DEFAULT 'percentage',
  p_secondary_credit_usd    NUMERIC DEFAULT NULL,
  p_secondary_credit_type   credit_type DEFAULT 'purchase',
  p_secondary_credit_cap_value NUMERIC DEFAULT 20,
  p_secondary_credit_cap_type  credit_cap_type DEFAULT 'percentage'
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_admin_id UUID;
  v_order RECORD;
  v_dispute RECORD;
  v_credit_id UUID;
  v_secondary_credit_id UUID;
  v_buyer_name TEXT;
  v_seller_name TEXT;
  v_msg TEXT;
  v_effective_cap_value NUMERIC;
  v_secondary_effective_cap_value NUMERIC;
BEGIN
  v_admin_id := auth.uid();
  IF NOT EXISTS (SELECT 1 FROM staff_members WHERE user_id = v_admin_id) THEN RETURN jsonb_build_object('error', 'Staff access required'); END IF;

  SELECT * INTO v_order FROM market_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order IS NULL THEN RETURN jsonb_build_object('error', 'Order not found'); END IF;
  IF v_order.status NOT IN ('disputed', 'escalated') THEN RETURN jsonb_build_object('error', 'Order must be in disputed or escalated status', 'current_status', v_order.status); END IF;

  SELECT * INTO v_dispute FROM order_disputes WHERE order_id = p_order_id;
  IF v_dispute IS NULL THEN RETURN jsonb_build_object('error', 'No dispute found for this order'); END IF;

  v_effective_cap_value := CASE WHEN p_credit_type = 'platform_fee' AND p_credit_cap_type = 'percentage' THEN LEAST(p_credit_cap_value, 10) ELSE p_credit_cap_value END;
  v_secondary_effective_cap_value := CASE WHEN p_secondary_credit_type = 'platform_fee' AND p_secondary_credit_cap_type = 'percentage' THEN LEAST(p_secondary_credit_cap_value, 10) ELSE p_secondary_credit_cap_value END;

  SELECT full_name INTO v_buyer_name FROM profiles WHERE id = v_order.buyer_id;
  SELECT full_name INTO v_seller_name FROM profiles WHERE id = v_order.seller_id;

  CASE p_resolution_type
    WHEN 'refund_full' THEN
      INSERT INTO market_ledger (user_id, event_type, direction, amount_usd, order_id, balance_after, metadata)
      VALUES (v_order.buyer_id, 'refund_issued', 'credit', v_order.total_usd, p_order_id, 0, jsonb_build_object('resolution', 'full_refund', 'admin', v_admin_id, 'reason', p_reason));
      v_msg := 'Full refund of $' || v_order.total_usd || ' issued to buyer.';

    WHEN 'refund_partial' THEN
      IF p_refund_amount_usd IS NULL OR p_refund_amount_usd <= 0 THEN RETURN jsonb_build_object('error', 'Partial refund requires a positive amount'); END IF;
      IF p_refund_amount_usd > v_order.total_usd THEN RETURN jsonb_build_object('error', 'Refund amount exceeds order total'); END IF;
      INSERT INTO market_ledger (user_id, event_type, direction, amount_usd, order_id, balance_after, metadata)
      VALUES (v_order.buyer_id, 'refund_issued', 'credit', p_refund_amount_usd, p_order_id, 0, jsonb_build_object('resolution', 'partial_refund', 'admin', v_admin_id, 'reason', p_reason));
      v_msg := 'Partial refund of $' || p_refund_amount_usd || ' issued to buyer.';

    WHEN 'credit_buyer' THEN
      IF p_credit_amount_usd IS NULL OR p_credit_amount_usd <= 0 THEN RETURN jsonb_build_object('error', 'Credit amount required'); END IF;
      INSERT INTO user_credits (user_id, amount_usd, remaining_usd, credit_type, cap_type, cap_value, source, source_id, reason, granted_by)
      VALUES (v_order.buyer_id, p_credit_amount_usd, p_credit_amount_usd, p_credit_type, p_credit_cap_type, v_effective_cap_value, 'escalation_resolution', v_dispute.id, p_reason, v_admin_id)
      RETURNING id INTO v_credit_id;
      v_msg := '$' || p_credit_amount_usd || ' credit issued to buyer.';

    WHEN 'credit_seller' THEN
      IF p_credit_amount_usd IS NULL OR p_credit_amount_usd <= 0 THEN RETURN jsonb_build_object('error', 'Credit amount required'); END IF;
      INSERT INTO user_credits (user_id, amount_usd, remaining_usd, credit_type, cap_type, cap_value, source, source_id, reason, granted_by)
      VALUES (v_order.seller_id, p_credit_amount_usd, p_credit_amount_usd, p_credit_type, p_credit_cap_type, v_effective_cap_value, 'escalation_resolution', v_dispute.id, p_reason, v_admin_id)
      RETURNING id INTO v_credit_id;
      v_msg := '$' || p_credit_amount_usd || ' credit issued to seller.';

    WHEN 'refund_full_credit_seller' THEN
      INSERT INTO market_ledger (user_id, event_type, direction, amount_usd, order_id, balance_after, metadata)
      VALUES (v_order.buyer_id, 'refund_issued', 'credit', v_order.total_usd, p_order_id, 0, jsonb_build_object('resolution', 'full_refund_credit_seller', 'admin', v_admin_id, 'reason', p_reason));
      IF p_secondary_credit_usd IS NOT NULL AND p_secondary_credit_usd > 0 THEN
        INSERT INTO user_credits (user_id, amount_usd, remaining_usd, credit_type, cap_type, cap_value, source, source_id, reason, granted_by)
        VALUES (v_order.seller_id, p_secondary_credit_usd, p_secondary_credit_usd, p_secondary_credit_type, p_secondary_credit_cap_type, v_secondary_effective_cap_value, 'escalation_resolution', v_dispute.id, 'Goodwill credit: ' || p_reason, v_admin_id)
        RETURNING id INTO v_secondary_credit_id;
      END IF;
      v_msg := 'Full refund of $' || v_order.total_usd || ' to buyer + $' || COALESCE(p_secondary_credit_usd, 0) || ' credit to seller.';

    WHEN 'refund_partial_credit_seller' THEN
      IF p_refund_amount_usd IS NULL OR p_refund_amount_usd <= 0 THEN RETURN jsonb_build_object('error', 'Partial refund requires a positive amount'); END IF;
      INSERT INTO market_ledger (user_id, event_type, direction, amount_usd, order_id, balance_after, metadata)
      VALUES (v_order.buyer_id, 'refund_issued', 'credit', p_refund_amount_usd, p_order_id, 0, jsonb_build_object('resolution', 'partial_refund_credit_seller', 'admin', v_admin_id, 'reason', p_reason));
      IF p_secondary_credit_usd IS NOT NULL AND p_secondary_credit_usd > 0 THEN
        INSERT INTO user_credits (user_id, amount_usd, remaining_usd, credit_type, cap_type, cap_value, source, source_id, reason, granted_by)
        VALUES (v_order.seller_id, p_secondary_credit_usd, p_secondary_credit_usd, p_secondary_credit_type, p_secondary_credit_cap_type, v_secondary_effective_cap_value, 'escalation_resolution', v_dispute.id, 'Goodwill credit: ' || p_reason, v_admin_id)
        RETURNING id INTO v_secondary_credit_id;
      END IF;
      v_msg := 'Partial refund of $' || p_refund_amount_usd || ' to buyer + $' || COALESCE(p_secondary_credit_usd, 0) || ' credit to seller.';

    WHEN 'credit_both' THEN
      IF p_credit_amount_usd IS NULL OR p_credit_amount_usd <= 0 THEN RETURN jsonb_build_object('error', 'Buyer credit amount required'); END IF;
      INSERT INTO user_credits (user_id, amount_usd, remaining_usd, credit_type, cap_type, cap_value, source, source_id, reason, granted_by)
      VALUES (v_order.buyer_id, p_credit_amount_usd, p_credit_amount_usd, p_credit_type, p_credit_cap_type, v_effective_cap_value, 'escalation_resolution', v_dispute.id, p_reason, v_admin_id)
      RETURNING id INTO v_credit_id;
      IF p_secondary_credit_usd IS NOT NULL AND p_secondary_credit_usd > 0 THEN
        INSERT INTO user_credits (user_id, amount_usd, remaining_usd, credit_type, cap_type, cap_value, source, source_id, reason, granted_by)
        VALUES (v_order.seller_id, p_secondary_credit_usd, p_secondary_credit_usd, p_secondary_credit_type, p_secondary_credit_cap_type, v_secondary_effective_cap_value, 'escalation_resolution', v_dispute.id, 'Goodwill credit: ' || p_reason, v_admin_id)
        RETURNING id INTO v_secondary_credit_id;
      END IF;
      v_msg := '$' || p_credit_amount_usd || ' credit to buyer + $' || COALESCE(p_secondary_credit_usd, 0) || ' credit to seller.';

    WHEN 'no_action' THEN
      v_msg := 'Resolved in seller''s favor — no refund or credit issued.';

  END CASE;

  UPDATE order_disputes
  SET status = 'staff_resolved', staff_decision = p_resolution_type::TEXT, staff_notes = p_reason, resolved_by = v_admin_id, resolved_at = now(), updated_at = now(),
      refund_type = CASE WHEN p_resolution_type IN ('refund_full', 'refund_full_credit_seller') THEN 'full' WHEN p_resolution_type IN ('refund_partial', 'refund_partial_credit_seller') THEN 'partial' ELSE refund_type END,
      refund_amount_usd = CASE WHEN p_resolution_type IN ('refund_full', 'refund_full_credit_seller') THEN v_order.total_usd WHEN p_resolution_type IN ('refund_partial', 'refund_partial_credit_seller') THEN p_refund_amount_usd ELSE refund_amount_usd END
  WHERE id = v_dispute.id;

  UPDATE market_orders SET status = 'resolved', updated_at = now() WHERE id = p_order_id;

  INSERT INTO order_dispute_messages (dispute_id, sender_id, body) VALUES (v_dispute.id, v_admin_id, '🔒 Admin Resolution: ' || v_msg || E'\nReason: ' || p_reason);

  PERFORM notify_market_event(v_order.buyer_id, '✅ Your dispute on "' || v_order.product_name || '" has been resolved. ' || v_msg, '/orders/' || p_order_id);
  PERFORM notify_market_event(v_order.seller_id, '📋 Dispute on "' || v_order.product_name || '" resolved. ' || v_msg, '/orders/' || p_order_id);

  IF p_resolution_type IN ('credit_buyer', 'credit_both') THEN
    PERFORM notify_market_event(v_order.buyer_id, '💰 You received $' || p_credit_amount_usd || ' in ' || p_credit_type || ' credits. Use up to ' || p_credit_cap_value || CASE WHEN p_credit_cap_type = 'percentage' THEN '%' ELSE '$' END || ' per transaction.', '/orders/' || p_order_id);
  END IF;

  IF p_resolution_type IN ('credit_seller', 'credit_both', 'refund_full_credit_seller', 'refund_partial_credit_seller') AND p_secondary_credit_usd IS NOT NULL THEN
    PERFORM notify_market_event(v_order.seller_id, '💰 You received $' || p_secondary_credit_usd || ' in ' || p_secondary_credit_type || ' credits as goodwill.', '/orders/' || p_order_id);
  ELSIF p_resolution_type = 'credit_seller' THEN
    PERFORM notify_market_event(v_order.seller_id, '💰 You received $' || p_credit_amount_usd || ' in ' || p_credit_type || ' credits.', '/orders/' || p_order_id);
  END IF;

  RETURN jsonb_build_object('success', true, 'resolution_type', p_resolution_type, 'message', v_msg, 'credit_id', v_credit_id, 'secondary_credit_id', v_secondary_credit_id);
END;
$$;


-- 7. Admin RPCs for managing user_incentives
CREATE OR REPLACE FUNCTION admin_get_user_incentives()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()) THEN RAISE EXCEPTION 'Staff access required'; END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', ui.id,
      'user_id', ui.user_id,
      'user_name', p.full_name,
      'user_email', u.email,
      'amount_usd', ui.amount_usd,
      'credit_type', ui.credit_type,
      'cap_type', ui.cap_type,
      'cap_value', ui.cap_value,
      'expiration_frequency', ui.expiration_frequency,
      'start_date', ui.start_date,
      'stop_date', ui.stop_date,
      'is_active', ui.is_active,
      'created_at', ui.created_at
    ) ORDER BY ui.created_at DESC), '[]'::jsonb)
    FROM user_incentives ui
    JOIN profiles p ON p.id = ui.user_id
    JOIN auth.users u ON u.id = ui.user_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION admin_create_user_incentive(
  p_user_id UUID,
  p_amount_usd NUMERIC,
  p_credit_type credit_type,
  p_cap_type credit_cap_type,
  p_cap_value NUMERIC,
  p_expiration_frequency expiration_frequency,
  p_start_date TIMESTAMPTZ DEFAULT now(),
  p_stop_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()) THEN RAISE EXCEPTION 'Staff access required'; END IF;

  INSERT INTO user_incentives (
    user_id, amount_usd, credit_type, cap_type, cap_value, 
    expiration_frequency, start_date, stop_date, created_by
  ) VALUES (
    p_user_id, p_amount_usd, p_credit_type, p_cap_type, p_cap_value,
    p_expiration_frequency, p_start_date, p_stop_date, auth.uid()
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION admin_update_user_incentive(
  p_id UUID,
  p_is_active BOOLEAN,
  p_stop_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()) THEN RAISE EXCEPTION 'Staff access required'; END IF;

  UPDATE user_incentives
  SET is_active = p_is_active,
      stop_date = COALESCE(p_stop_date, stop_date),
      updated_at = now()
  WHERE id = p_id;

  RETURN jsonb_build_object('success', true);
END;
$$;


-- 8. Update trg_market_order_status_notify to include credit string
CREATE OR REPLACE FUNCTION trg_market_order_status_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_dispute_label TEXT;
  v_credit_str TEXT := '';
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  IF NEW.credit_applied_usd IS NOT NULL AND NEW.credit_applied_usd > 0 THEN
    v_credit_str := ' ($' || NEW.credit_applied_usd || ' store credit applied)';
  END IF;

  CASE NEW.status
    WHEN 'delivered' THEN
      PERFORM notify_market_event(NEW.buyer_id, CASE NEW.fulfillment_type WHEN 'delivery' THEN '🚚 Your ' || NEW.product_name || ' has been delivered! Confirm receipt within 4 hours.' ELSE '📍 Your ' || NEW.product_name || ' is ready for pickup! Confirm within 4 hours.' END, '/orders/' || NEW.id);

    WHEN 'completed' THEN
      PERFORM notify_market_event(NEW.buyer_id, '✅ Order completed: ' || NEW.product_name || v_credit_str || '. Rate your experience!', '/orders/' || NEW.id);
      PERFORM notify_market_event(NEW.seller_id, '💰 Sale completed: ' || NEW.product_name || ' — $' || NEW.subtotal_usd || ' earned. Rate the buyer!', '/orders/' || NEW.id);

    WHEN 'disputed' THEN
      BEGIN
        SELECT CASE d.dispute_type WHEN 'not_delivered' THEN 'Order Not Delivered' WHEN 'wrong_item' THEN 'Wrong Item Received' WHEN 'poor_quality' THEN 'Quality Issue Reported' WHEN 'quantity_mismatch' THEN 'Quantity Mismatch' ELSE 'Dispute Opened' END INTO v_dispute_label FROM order_disputes d WHERE d.order_id = NEW.id ORDER BY d.created_at DESC LIMIT 1;
        v_dispute_label := coalesce(v_dispute_label, 'Dispute Opened');
        PERFORM notify_market_event(NEW.buyer_id, '⚠️ ' || v_dispute_label || ' for your ' || NEW.product_name || ' order.', '/orders/' || NEW.id);
        PERFORM notify_market_event(NEW.seller_id, '⚠️ ' || v_dispute_label || ' for your ' || NEW.product_name || ' sale.', '/orders/' || NEW.id);
      END;

    WHEN 'escalated' THEN
      PERFORM notify_market_event(NEW.buyer_id, '📋 Your dispute for ' || NEW.product_name || ' has been escalated to admin review.', '/orders/' || NEW.id);
      PERFORM notify_market_event(NEW.seller_id, '📋 The dispute for ' || NEW.product_name || ' has been escalated to admin review.', '/orders/' || NEW.id);

    WHEN 'resolved' THEN
      PERFORM notify_market_event(NEW.buyer_id, '✅ Your dispute for ' || NEW.product_name || ' has been resolved.', '/orders/' || NEW.id);
      PERFORM notify_market_event(NEW.seller_id, '✅ The dispute for ' || NEW.product_name || ' has been resolved.', '/orders/' || NEW.id);

    WHEN 'cancelled' THEN
      PERFORM notify_market_event(NEW.buyer_id, '🔄 Your order for ' || NEW.product_name || ' has been cancelled.', '/orders/' || NEW.id);

    ELSE
      NULL;
  END CASE;

  RETURN NEW;
END;
$$;

-- Update get_escalation_detail_admin to use cap_type and cap_value
CREATE OR REPLACE FUNCTION get_escalation_detail_admin(p_dispute_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_dispute RECORD;
  v_order RECORD;
  v_messages JSONB;
  v_credits JSONB;
  v_booth RECORD;
  v_product RECORD;
  v_fulfillment_verification JSONB;
  v_proof_lat NUMERIC;
  v_proof_lng NUMERIC;
  v_proof_ts TIMESTAMPTZ;
  v_delivery_windows JSONB;
  v_pickup_windows JSONB;
  v_window_end TIMESTAMPTZ;
  v_booth_lat NUMERIC;
  v_booth_lng NUMERIC;
  v_distance_miles NUMERIC;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Staff access required';
  END IF;

  SELECT * INTO v_dispute FROM order_disputes WHERE id = p_dispute_id;
  IF v_dispute IS NULL THEN
    RETURN jsonb_build_object('error', 'Dispute not found');
  END IF;

  SELECT * INTO v_order FROM market_orders WHERE id = v_dispute.order_id;

  -- Get booth and product for verification
  SELECT * INTO v_booth FROM market_booths WHERE id = v_order.booth_id;
  SELECT * INTO v_product FROM market_products WHERE id = v_order.product_id;

  -- Get dispute messages
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', m.id,
    'sender_id', m.sender_id,
    'sender_name', COALESCE(p.full_name, 'System'),
    'is_staff', EXISTS(SELECT 1 FROM staff_members sm WHERE sm.user_id = m.sender_id),
    'is_buyer', m.sender_id = v_order.buyer_id,
    'is_seller', m.sender_id = v_order.seller_id,
    'body', m.body,
    'photos', m.photos,
    'created_at', m.created_at
  ) ORDER BY m.created_at ASC), '[]'::jsonb)
  INTO v_messages
  FROM order_dispute_messages m
  LEFT JOIN profiles p ON p.id = m.sender_id
  WHERE m.dispute_id = p_dispute_id;

  -- Get any credits issued for this dispute
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', uc.id,
    'user_id', uc.user_id,
    'recipient_name', p.full_name,
    'amount_usd', uc.amount_usd,
    'remaining_usd', uc.remaining_usd,
    'credit_type', uc.credit_type,
    'cap_type', uc.cap_type,
    'cap_value', uc.cap_value,
    'reason', uc.reason,
    'created_at', uc.created_at
  )), '[]'::jsonb)
  INTO v_credits
  FROM user_credits uc
  LEFT JOIN profiles p ON p.id = uc.user_id
  WHERE uc.source = 'escalation_resolution' AND uc.source_id = p_dispute_id;

  -- ──── Fulfillment Verification ────
  -- Extract proof geotag and timestamp from delivery_proof JSONB
  IF v_order.delivery_proof IS NOT NULL AND jsonb_typeof(v_order.delivery_proof) = 'array'
     AND jsonb_array_length(v_order.delivery_proof) > 0 THEN
    v_proof_lat := (v_order.delivery_proof->0->>'latitude')::NUMERIC;
    v_proof_lng := (v_order.delivery_proof->0->>'longitude')::NUMERIC;
    v_proof_ts  := (v_order.delivery_proof->0->>'timestamp')::TIMESTAMPTZ;
  END IF;

  -- Get fulfillment windows from product
  IF v_order.fulfillment_type = 'delivery' THEN
    v_delivery_windows := v_product.product_delivery_windows;
    v_window_end := _get_latest_window_end(v_order.product_id, 'delivery');
  ELSE
    v_pickup_windows := v_product.product_pickup_windows;
    v_window_end := _get_latest_window_end(v_order.product_id, 'pickup');
  END IF;

  -- For pickup: compute distance from booth location to proof geotag
  IF v_order.fulfillment_type = 'pickup' AND v_booth.pickup_location IS NOT NULL
     AND v_proof_lat IS NOT NULL THEN
    v_booth_lat := ST_Y(v_booth.pickup_location::geometry);
    v_booth_lng := ST_X(v_booth.pickup_location::geometry);
    -- Haversine approximation in miles
    v_distance_miles := ROUND(
      3959 * acos(
        LEAST(1, cos(radians(v_booth_lat)) * cos(radians(v_proof_lat)) *
        cos(radians(v_proof_lng) - radians(v_booth_lng)) +
        sin(radians(v_booth_lat)) * sin(radians(v_proof_lat)))
      )::NUMERIC, 2);
  END IF;

  v_fulfillment_verification := jsonb_build_object(
    'fulfillment_type', v_order.fulfillment_type,
    -- Proof data
    'proof_geotag', CASE WHEN v_proof_lat IS NOT NULL
      THEN jsonb_build_object('latitude', v_proof_lat, 'longitude', v_proof_lng)
      ELSE NULL END,
    'proof_timestamp', v_proof_ts,
    'delivered_at', v_order.delivered_at,
    -- Window data
    'window_end', v_window_end,
    'proof_within_window', CASE
      WHEN v_window_end IS NOT NULL AND v_order.delivered_at IS NOT NULL
      THEN v_order.delivered_at <= v_window_end
      ELSE NULL END,
    -- Delivery-specific
    'delivery_address', v_order.delivery_address,
    'delivery_windows', v_delivery_windows,
    -- Pickup-specific: use actual ready_for_pickup_at column (not delivered_at)
    'ready_for_pickup_at', v_order.ready_for_pickup_at,
    'pickup_windows', v_pickup_windows,
    'pickup_address', v_booth.pickup_display_address,
    'booth_location', CASE WHEN v_booth_lat IS NOT NULL
      THEN jsonb_build_object('latitude', v_booth_lat, 'longitude', v_booth_lng)
      ELSE NULL END,
    'proof_distance_from_pickup_miles', v_distance_miles,
    'proof_distance_ok', CASE
      WHEN v_distance_miles IS NOT NULL THEN v_distance_miles <= 0.5
      ELSE NULL END,
    -- explicit flag for whether seller marked ready before window expired
    'seller_marked_ready', v_order.ready_for_pickup_at IS NOT NULL,
    'seller_marked_ready_within_window', CASE
      WHEN v_window_end IS NOT NULL AND v_order.ready_for_pickup_at IS NOT NULL
      THEN v_order.ready_for_pickup_at <= v_window_end
      ELSE NULL END
  );

  RETURN jsonb_build_object(
    'dispute', jsonb_build_object(
      'id', v_dispute.id,
      'order_id', v_dispute.order_id,
      'initiated_by', v_dispute.initiated_by,
      'reason', v_dispute.reason,
      'dispute_type', v_dispute.dispute_type,
      'photos', v_dispute.photos,
      'status', v_dispute.status,
      'staff_decision', v_dispute.staff_decision,
      'staff_notes', v_dispute.staff_notes,
      'resolved_by', v_dispute.resolved_by,
      'resolved_by_name', (SELECT full_name FROM profiles WHERE id = v_dispute.resolved_by),
      'resolved_at', v_dispute.resolved_at,
      'created_at', v_dispute.created_at
    ),
    'order', jsonb_build_object(
      'id', v_order.id,
      'product_name', v_order.product_name,
      'product_id', v_order.product_id,
      'quantity', v_order.quantity,
      'unit_price_usd', v_order.unit_price_usd,
      'subtotal_usd', v_order.subtotal_usd,
      'tax_amount_usd', v_order.tax_amount_usd,
      'platform_fee_usd', v_order.platform_fee_usd,
      'total_usd', v_order.total_usd,
      'fulfillment_type', v_order.fulfillment_type,
      'status', v_order.status,
      'delivery_proof', v_order.delivery_proof,
      'delivered_at', v_order.delivered_at,
      'ready_for_pickup_at', v_order.ready_for_pickup_at,
      'delivery_address', v_order.delivery_address,
      'created_at', v_order.created_at,
      'credit_applied_usd', v_order.credit_applied_usd
    ),
    'buyer', (SELECT jsonb_build_object(
      'id', p.id,
      'name', p.full_name,
      'email', u.email,
      'created_at', p.created_at
    ) FROM profiles p JOIN auth.users u ON u.id = p.id WHERE p.id = v_order.buyer_id),
    'seller', (SELECT jsonb_build_object(
      'id', p.id,
      'name', p.full_name,
      'email', u.email,
      'created_at', p.created_at
    ) FROM profiles p JOIN auth.users u ON u.id = p.id WHERE p.id = v_order.seller_id),
    'messages', v_messages,
    'credits_issued', v_credits,
    'fulfillment_verification', v_fulfillment_verification
  );
END;
$$;
