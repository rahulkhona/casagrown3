-- ==========================================================================
-- Fix: digital_receipts FK + RLS point to legacy 'orders' instead of
--      'market_orders'. Also isolate credit application from receipt
--      generation so receipt errors never roll back credit logic.
--
-- Root cause: The original compliance DDL (20260305000000) created
-- digital_receipts with `REFERENCES orders(id)` (legacy table) instead
-- of `REFERENCES market_orders(id)`. The EXCEPTION WHEN OTHERS handler
-- silently swallowed the FK violation, and since receipts are generated
-- inside a subtransaction, the credit application (done in the same
-- block) got rolled back too.
-- ==========================================================================

-- ══════════════════════════════════════════════════════════════════════════
-- 1. Fix FK constraint: orders → market_orders
-- ══════════════════════════════════════════════════════════════════════════

-- Drop the legacy FK — digital_receipts serves BOTH the legacy orders table
-- (via confirm_order_delivery) AND market_orders (via _complete_market_order_with_receipt).
-- A single FK to either table would break the other path.
ALTER TABLE digital_receipts DROP CONSTRAINT IF EXISTS digital_receipts_order_id_fkey;

-- ══════════════════════════════════════════════════════════════════════════
-- 2. Fix RLS policy: query market_orders instead of orders
-- ══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Users can read own receipts" ON digital_receipts;
CREATE POLICY "Users can read own receipts"
  ON digital_receipts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM market_orders o
      WHERE o.id = digital_receipts.order_id
        AND (o.buyer_id = auth.uid() OR o.seller_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = digital_receipts.order_id
        AND (o.buyer_id = auth.uid() OR o.seller_id = auth.uid())
    )
  );

-- ══════════════════════════════════════════════════════════════════════════
-- 3. Isolate credit application from receipt generation
--    Credit application (Step A) runs in the outer function body.
--    Receipt generation (Step B) runs in its own BEGIN...EXCEPTION block
--    so a receipt failure never rolls back credit updates.
-- ══════════════════════════════════════════════════════════════════════════

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
  
  -- Credit & Math Params
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

  -- --------------------------------------------------------------------------
  -- STEP A: Recalculate Math & Consume Credits (outer block — never rolled back)
  -- --------------------------------------------------------------------------
  
  SELECT COALESCE(SUM(refund_amount_usd), 0) INTO v_seller_refunds
  FROM order_disputes
  WHERE order_id = p_order_id AND status IN ('buyer_accepted', 'staff_resolved');

  v_final_subtotal := GREATEST(v_order.subtotal_usd - v_seller_refunds, 0);

  v_fee_rate := public.get_platform_fee_for_user(v_order.seller_id);
  v_calculated_fee := ROUND(v_final_subtotal * v_fee_rate, 2);

  -- 1) Process Seller platform_fee Credits
  FOR v_seller_credit IN
    SELECT id, remaining_usd, max_pct_per_txn FROM user_credits
    WHERE user_id = v_order.seller_id AND credit_type = 'platform_fee' AND expires_at > now() AND remaining_usd > 0
    ORDER BY expires_at ASC
  LOOP
    IF v_calculated_fee > 0 THEN
      v_seller_max_allowed := ROUND(v_final_subtotal * v_seller_credit.max_pct_per_txn / 100, 2);
      v_seller_fee_discount := LEAST(v_seller_credit.remaining_usd, v_seller_max_allowed, v_calculated_fee);
      
      IF v_seller_fee_discount > 0 THEN
        UPDATE user_credits SET remaining_usd = remaining_usd - v_seller_fee_discount WHERE id = v_seller_credit.id;
        INSERT INTO credit_usage_log (credit_id, order_id, amount_usd) VALUES (v_seller_credit.id, p_order_id, v_seller_fee_discount);
        v_calculated_fee := v_calculated_fee - v_seller_fee_discount;
      END IF;
    END IF;
  END LOOP;

  -- 2) Process Buyer purchase Credits
  FOR v_buyer_credit IN
    SELECT id, remaining_usd, max_pct_per_txn FROM user_credits
    WHERE user_id = v_order.buyer_id AND credit_type = 'purchase' AND expires_at > now() AND remaining_usd > 0
    ORDER BY expires_at ASC
  LOOP
    IF (v_order.total_usd - v_buyer_credit_applied) > 0 THEN
      v_buyer_max_allowed := ROUND(v_order.total_usd * v_buyer_credit.max_pct_per_txn / 100, 2);
      
      DECLARE v_step_apply NUMERIC(10,2);
      BEGIN
        v_step_apply := LEAST(v_buyer_credit.remaining_usd, v_buyer_max_allowed - v_buyer_credit_applied, v_order.total_usd - v_buyer_credit_applied);
        IF v_step_apply > 0 THEN
          UPDATE user_credits SET remaining_usd = remaining_usd - v_step_apply WHERE id = v_buyer_credit.id;
          INSERT INTO credit_usage_log (credit_id, order_id, amount_usd) VALUES (v_buyer_credit.id, p_order_id, v_step_apply);
          v_buyer_credit_applied := v_buyer_credit_applied + v_step_apply;
        END IF;
      END;
    END IF;
  END LOOP;

  -- Persist credit results to the order row
  UPDATE market_orders
  SET platform_fee_usd = v_calculated_fee,
      credit_applied_usd = v_buyer_credit_applied
  WHERE id = p_order_id;
  
  -- Refresh row cache
  SELECT * INTO v_order FROM market_orders WHERE id = p_order_id;

  -- --------------------------------------------------------------------------
  -- STEP B: Generate Digital Receipts (isolated — errors here won't undo Step A)
  -- --------------------------------------------------------------------------
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
      PERFORM net.http_post(
        url := v_edge_fn_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_key
        ),
        body := jsonb_build_object(
          'recipients', jsonb_build_array(
            jsonb_build_object('email', v_buyer_email, 'role', 'buyer')
          ),
          'orderData', v_email_body
        )
      );
    END IF;

    IF v_seller_email IS NOT NULL AND v_service_key IS NOT NULL THEN
      PERFORM net.http_post(
        url := v_edge_fn_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_key
        ),
        body := jsonb_build_object(
          'recipients', jsonb_build_array(
            jsonb_build_object('email', v_seller_email, 'role', 'seller')
          ),
          'orderData', v_email_body
        )
      );
    END IF;

  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Receipt generation failed for order %: %', p_order_id, SQLERRM;
  END;

END;
$$;
