-- ============================================================================
-- Migration: Credit Consumption Visibility & Universal Credits
-- ============================================================================

-- 1. Add 'universal' to credit_type ENUM
ALTER TYPE credit_type ADD VALUE IF NOT EXISTS 'universal';

-- 1.5 Add UNIQUE constraint to digital_receipts.order_id for ON CONFLICT support
ALTER TABLE digital_receipts DROP CONSTRAINT IF EXISTS digital_receipts_order_id_key;
ALTER TABLE digital_receipts ADD CONSTRAINT digital_receipts_order_id_key UNIQUE (order_id);

-- 2. Modify _complete_market_order_with_receipt to handle new cap_type and universal credits,
--    and export creditApplied to emails and receipts.
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
  -- STEP A: Recalculate Math & Consume Credits!
  -- --------------------------------------------------------------------------
  
  -- Calculate Total Seller Refunds from Disputes
  SELECT COALESCE(SUM(refund_amount_usd), 0) INTO v_seller_refunds
  FROM order_disputes
  WHERE order_id = p_order_id AND status IN ('buyer_accepted', 'staff_resolved');

  v_final_subtotal := GREATEST(v_order.subtotal_usd - v_seller_refunds, 0);

  -- Determine Standard Fee on the natively adjusted subtotal
  v_fee_rate := public.get_platform_fee_for_user(v_order.seller_id);
  v_calculated_fee := ROUND(v_final_subtotal * v_fee_rate, 2);

  -- 1) Process Seller `platform_fee` & `universal` Credits
  FOR v_seller_credit IN
    SELECT id, remaining_usd, cap_value, cap_type FROM user_credits
    WHERE user_id = v_order.seller_id AND credit_type IN ('platform_fee', 'universal') AND (expires_at IS NULL OR expires_at > now()) AND remaining_usd > 0
    ORDER BY CASE WHEN source = 'escalation_resolution' THEN 0 ELSE 1 END ASC, created_at ASC
  LOOP
    IF v_calculated_fee > 0 THEN
      -- Handle percentage vs flat cap
      IF v_seller_credit.cap_type = 'flat_amount' THEN
        v_seller_max_allowed := v_seller_credit.cap_value;
      ELSE
        v_seller_max_allowed := ROUND(v_final_subtotal * v_seller_credit.cap_value / 100, 2);
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

  -- 2) Process Buyer `purchase` & `universal` Credits
  FOR v_buyer_credit IN
    SELECT id, remaining_usd, cap_value, cap_type FROM user_credits
    WHERE user_id = v_order.buyer_id AND credit_type IN ('purchase', 'universal') AND (expires_at IS NULL OR expires_at > now()) AND remaining_usd > 0
    ORDER BY CASE WHEN source = 'escalation_resolution' THEN 0 ELSE 1 END ASC, created_at ASC
  LOOP
    IF (v_order.total_usd - v_buyer_credit_applied) > 0 THEN
      IF v_buyer_credit.cap_type = 'flat_amount' THEN
        v_buyer_max_allowed := v_buyer_credit.cap_value;
      ELSE
        v_buyer_max_allowed := ROUND(v_order.total_usd * v_buyer_credit.cap_value / 100, 2);
      END IF;
      
      -- Limit to what they haven't applied yet, up to max allowed, up to remaining credit
      DECLARE v_step_apply NUMERIC(10,2);
      BEGIN
        v_step_apply := LEAST(v_buyer_credit.remaining_usd, GREATEST(v_buyer_max_allowed - v_buyer_credit_applied, 0::numeric), v_order.total_usd - v_buyer_credit_applied);
        IF v_step_apply > 0 THEN
          UPDATE user_credits SET remaining_usd = remaining_usd - v_step_apply WHERE id = v_buyer_credit.id;
          INSERT INTO credit_usage_log (credit_id, order_id, amount_usd) VALUES (v_buyer_credit.id, p_order_id, v_step_apply);
          v_buyer_credit_applied := v_buyer_credit_applied + v_step_apply;
          EXIT; -- Strict 1 credit per txn
        END IF;
      END;
    END IF;
  END LOOP;

  -- Update row so netting picks up these values natively!
  UPDATE market_orders
  SET platform_fee_usd = v_calculated_fee,
      credit_applied_usd = v_buyer_credit_applied
  WHERE id = p_order_id;
  
  -- Refresh row cache
  SELECT * INTO v_order FROM market_orders WHERE id = p_order_id;

  -- --------------------------------------------------------------------------
  -- STEP B: Generate Digital Receipts
  -- --------------------------------------------------------------------------

  -- Profiles
  SELECT full_name, zip_code INTO v_buyer_profile FROM profiles WHERE id = v_order.buyer_id;
  SELECT full_name, zip_code INTO v_seller_profile FROM profiles WHERE id = v_order.seller_id;

  -- Emails
  v_buyer_email := get_user_email(v_order.buyer_id);
  v_seller_email := get_user_email(v_order.seller_id);

  -- Receipt footer (state-specific compliance text)
  SELECT rf.footer_text INTO v_receipt_footer
  FROM receipt_footers rf
  JOIN profiles p ON p.id = v_order.seller_id
  JOIN communities c ON c.h3_index = p.home_community_h3_index
  WHERE rf.state_code = c.state
  LIMIT 1;

  -- Service role key
  v_service_key := COALESCE(
    current_setting('app.settings.service_role_key', true),
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
  );
  v_edge_fn_url := COALESCE(
    current_setting('app.settings.edge_functions_base_url', true),
    current_setting('app.settings.supabase_url', true) || '/functions/v1',
    'http://host.docker.internal:54321/functions/v1'
  ) || '/send-transaction-email';

  -- Generate digital receipt
  UPDATE digital_receipts SET
    buyer_receipt = jsonb_build_object(
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
      'credit_applied', v_buyer_credit_applied,  -- INJECTED CREDIT CONSUMPTION
      'total', v_order.total_usd,
      'fulfillment_type', v_order.fulfillment_type,
      'footer', v_receipt_footer
    ),
    seller_receipt = jsonb_build_object(
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
  WHERE order_id = p_order_id;

  IF NOT FOUND THEN
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
        'credit_applied', v_buyer_credit_applied,  -- INJECTED CREDIT CONSUMPTION
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
  END IF;

  -- Build email payload (send-transaction-email format)
  v_email_body := jsonb_build_object(
    'transactionId', v_order.id,
    'date', now(),
    'product', v_order.product_name,
    'quantity', v_order.quantity,
    'unit', 'unit',
    'pointsPerUnit', ROUND(v_order.subtotal_usd / GREATEST(v_order.quantity, 1), 2),
    'subtotal', v_order.subtotal_usd,
    'tax', COALESCE(v_order.tax_amount_usd, 0),
    'creditApplied', v_buyer_credit_applied,     -- INJECTED CREDIT CONSUMPTION
    'sellerFeeCredit', v_seller_fee_discount,    -- INJECTED SELLER FEE CREDIT
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

  -- Send buyer receipt email
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

  -- Send seller receipt email
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
$$;


-- 3. Modify trg_market_order_status_notify to show credit in completion push notification
CREATE OR REPLACE FUNCTION trg_market_order_status_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  CASE NEW.status
    WHEN 'confirmed' THEN
      PERFORM notify_market_event(
        NEW.buyer_id,
        '✅ Your order for ' || NEW.product_name || ' has been accepted by the seller!',
        '/orders/' || NEW.id,
        true, true
      );

    WHEN 'delivered' THEN
      IF NEW.fulfillment_type = 'pickup' THEN
        PERFORM notify_market_event(
          NEW.buyer_id,
          '📍 Your ' || NEW.product_name || ' is ready for pickup!',
          '/orders/' || NEW.id,
          true, true
        );
      ELSE
        PERFORM notify_market_event(
          NEW.buyer_id,
          '🚚 Your ' || NEW.product_name || ' has been delivered! You have 4 hours to confirm receipt before auto-completion.',
          '/orders/' || NEW.id,
          true, true
        );
      END IF;

    WHEN 'completed' THEN
      IF NEW.credit_applied_usd > 0 THEN
        PERFORM notify_market_event(
          NEW.buyer_id,
          '✅ Order completed: ' || NEW.product_name || '. $' || NEW.credit_applied_usd || ' credit applied! Rate your experience!',
          '/orders/' || NEW.id,
          true, true
        );
      ELSE
        PERFORM notify_market_event(
          NEW.buyer_id,
          '✅ Order completed: ' || NEW.product_name || '. Rate your experience!',
          '/orders/' || NEW.id,
          true, true
        );
      END IF;
      
      PERFORM notify_market_event(
        NEW.seller_id,
        '💰 Sale completed: ' || NEW.product_name || ' — $' || NEW.subtotal_usd || ' earned. Rate the buyer!',
        '/orders/' || NEW.id,
        true, true
      );

    WHEN 'declined' THEN
      PERFORM notify_market_event(
        NEW.buyer_id,
        '❌ Your order for ' || NEW.product_name || ' was declined' ||
          CASE WHEN NEW.decline_reason IS NOT NULL THEN ': ' || NEW.decline_reason ELSE '' END,
        '/orders/' || NEW.id,
        true, true
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

        PERFORM notify_market_event(NEW.buyer_id, '⚠️ ' || v_dispute_label || ' for your ' || NEW.product_name || ' order.', '/orders/' || NEW.id, true, true);
        PERFORM notify_market_event(NEW.seller_id, '⚠️ ' || v_dispute_label || ' for your ' || NEW.product_name || ' sale.', '/orders/' || NEW.id, true, true);
      END;

    WHEN 'escalated' THEN
      PERFORM notify_market_event(NEW.buyer_id, '📋 Your dispute for ' || NEW.product_name || ' has been escalated to admin review.', '/orders/' || NEW.id, true, true);
      PERFORM notify_market_event(NEW.seller_id, '📋 The dispute for ' || NEW.product_name || ' has been escalated to admin review.', '/orders/' || NEW.id, true, true);

    WHEN 'resolved' THEN
      PERFORM notify_market_event(NEW.buyer_id, '✅ Your dispute for ' || NEW.product_name || ' has been resolved.', '/orders/' || NEW.id, true, true);
      PERFORM notify_market_event(NEW.seller_id, '✅ The dispute for ' || NEW.product_name || ' has been resolved.', '/orders/' || NEW.id, true, true);

    WHEN 'cancelled' THEN
      PERFORM notify_market_event(NEW.buyer_id, '🔄 Your order for ' || NEW.product_name || ' has been cancelled.', '/orders/' || NEW.id, true, true);

    ELSE NULL;
  END CASE;

  RETURN NEW;
END;
$$;


-- 4. RPC: get_user_credit_balance (Include 'universal')
CREATE OR REPLACE FUNCTION get_user_credit_balance(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_purchase NUMERIC := 0;
  v_platform_fee NUMERIC := 0;
  v_universal NUMERIC := 0;
BEGIN
  SELECT COALESCE(SUM(remaining_usd), 0) INTO v_purchase
  FROM user_credits
  WHERE user_id = p_user_id
    AND credit_type = 'purchase'
    AND remaining_usd > 0
    AND (expires_at IS NULL OR expires_at > now());

  SELECT COALESCE(SUM(remaining_usd), 0) INTO v_platform_fee
  FROM user_credits
  WHERE user_id = p_user_id
    AND credit_type = 'platform_fee'
    AND remaining_usd > 0
    AND (expires_at IS NULL OR expires_at > now());

  SELECT COALESCE(SUM(remaining_usd), 0) INTO v_universal
  FROM user_credits
  WHERE user_id = p_user_id
    AND credit_type = 'universal'
    AND remaining_usd > 0
    AND (expires_at IS NULL OR expires_at > now());

  RETURN jsonb_build_object(
    'purchase_credits_usd', v_purchase,
    'platform_fee_credits_usd', v_platform_fee,
    'universal_credits_usd', v_universal,
    'total_credits_usd', v_purchase + v_platform_fee + v_universal
  );
END;
$$;

-- 5. RPC: apply_credits_to_order (for legacy flow)
CREATE OR REPLACE FUNCTION apply_credits_to_order(
  p_order_id UUID,
  p_user_id  UUID
)
RETURNS NUMERIC
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_order RECORD;
  v_credit RECORD;
  v_total_applied NUMERIC := 0;
  v_max_for_credit NUMERIC;
  v_to_apply NUMERIC;
  v_remaining_order NUMERIC;
BEGIN
  -- Lock the order
  SELECT * INTO v_order FROM market_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order IS NULL THEN RETURN 0; END IF;

  v_remaining_order := v_order.total_usd;

  -- Iterate credits FIFO (oldest first), only 'purchase' or 'universal'
  FOR v_credit IN
    SELECT * FROM user_credits
    WHERE user_id = p_user_id
      AND credit_type IN ('purchase', 'universal')
      AND remaining_usd > 0
      AND (expires_at IS NULL OR expires_at > now())
    ORDER BY created_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining_order <= 0;

    -- Cap by cap_value of original order total
    IF v_credit.cap_type = 'flat_amount' THEN
      v_max_for_credit := v_credit.cap_value;
    ELSE
      v_max_for_credit := ROUND(v_order.total_usd * v_credit.cap_value / 100, 2);
    END IF;
    
    -- Cap at what's left on the order
    v_max_for_credit := LEAST(v_max_for_credit, v_remaining_order);
    -- Cap at what's remaining in this credit
    v_to_apply := LEAST(v_credit.remaining_usd, v_max_for_credit);

    IF v_to_apply > 0 THEN
      -- Deduct from credit
      UPDATE user_credits SET remaining_usd = remaining_usd - v_to_apply
      WHERE id = v_credit.id;

      -- Log usage
      INSERT INTO credit_usage_log (credit_id, order_id, amount_usd)
      VALUES (v_credit.id, p_order_id, v_to_apply);

      v_total_applied := v_total_applied + v_to_apply;
      v_remaining_order := v_remaining_order - v_to_apply;
    END IF;
  END LOOP;

  -- Update order with total credits applied
  IF v_total_applied > 0 THEN
    UPDATE market_orders
    SET credit_applied_usd = v_total_applied
    WHERE id = p_order_id;
  END IF;

  RETURN v_total_applied;
END;
$$;
