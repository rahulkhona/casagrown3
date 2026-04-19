-- ============================================================================
-- Apply User Credits at Completion & Modify Settlement Netting
-- ============================================================================

-- 1. Modify _complete_market_order_with_receipt to orchestrate logic
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
  v_calculated_fee := ROUND(v_final_subtotal * v_fee_rate / 100, 2);

  -- 1) Process Seller `platform_fee` Credits
  FOR v_seller_credit IN
    SELECT id, remaining_usd, max_pct_per_txn FROM user_credits
    WHERE user_id = v_order.seller_id AND credit_type = 'platform_fee' AND expires_at > now() AND remaining_usd > 0
    ORDER BY expires_at ASC
  LOOP
    IF v_calculated_fee > 0 THEN
      -- Cap by standard transaction limit applied against the base order size to prevent excessive usage
      v_seller_max_allowed := ROUND(v_final_subtotal * v_seller_credit.max_pct_per_txn / 100, 2);
      v_seller_fee_discount := LEAST(v_seller_credit.remaining_usd, v_seller_max_allowed, v_calculated_fee);
      
      IF v_seller_fee_discount > 0 THEN
        UPDATE user_credits SET remaining_usd = remaining_usd - v_seller_fee_discount WHERE id = v_seller_credit.id;
        INSERT INTO credit_usage_log (credit_id, order_id, amount_usd) VALUES (v_seller_credit.id, p_order_id, v_seller_fee_discount);
        v_calculated_fee := v_calculated_fee - v_seller_fee_discount;
      END IF;
    END IF;
  END LOOP;

  -- 2) Process Buyer `purchase` Credits
  FOR v_buyer_credit IN
    SELECT id, remaining_usd, max_pct_per_txn FROM user_credits
    WHERE user_id = v_order.buyer_id AND credit_type = 'purchase' AND expires_at > now() AND remaining_usd > 0
    ORDER BY expires_at ASC
  LOOP
    IF (v_order.total_usd - v_buyer_credit_applied) > 0 THEN
      v_buyer_max_allowed := ROUND(v_order.total_usd * v_buyer_credit.max_pct_per_txn / 100, 2);
      
      -- Limit to what they haven't applied yet, up to max allowed, up to remaining credit
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


-- ============================================================
-- 2. Modify run_market_settlement netting engine to honor credit_applied_usd
-- ============================================================
DROP FUNCTION IF EXISTS run_market_settlement(date);

-- ============================================================
-- 2. Modify run_market_settlement netting engine to honor credit_applied_usd
-- ============================================================
-- We MUST preserve the JSONB return type and full reconciliation engine!
DROP FUNCTION IF EXISTS run_market_settlement(date);

CREATE OR REPLACE FUNCTION run_market_settlement(p_market_date DATE DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_settlement_id UUID;
  v_user RECORD;
  v_total_orders INTEGER := 0;
  v_total_captured NUMERIC(10,2) := 0;
  v_total_payouts NUMERIC(10,2) := 0;
  v_total_fees NUMERIC(10,2) := 0;
  v_total_refunds NUMERIC(10,2) := 0;
  v_user_count INTEGER := 0;
  v_check1_pass BOOLEAN;
  v_check2_pass BOOLEAN;
  v_reconciliation JSONB;
  v_clearing_date DATE;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('market_settlement')) THEN
    RETURN jsonb_build_object('error', 'Settlement already in progress');
  END IF;

  v_clearing_date := COALESCE(p_market_date, CURRENT_DATE);

  SELECT COUNT(*) INTO v_total_orders
  FROM market_orders
  WHERE settlement_id IS NULL
    AND status IN ('completed', 'delivered');

  IF v_total_orders = 0 THEN
    RETURN jsonb_build_object('error', 'No unsettled orders to process');
  END IF;

  INSERT INTO market_settlements (market_date, status)
  VALUES (v_clearing_date, 'captures_sent')
  RETURNING id INTO v_settlement_id;

  UPDATE market_orders
  SET settlement_id = v_settlement_id
  WHERE settlement_id IS NULL
    AND status IN ('completed', 'delivered');

  FOR v_user IN
    SELECT
      u.user_id,
      COALESCE(SUM(u.gross_sales), 0) AS gross_sales,
      COALESCE(SUM(u.total_purchases), 0) AS total_purchases,
      COALESCE(SUM(u.platform_fees), 0) AS platform_fees,
      COALESCE(SUM(u.refunds_issued), 0) AS refunds_issued,
      COALESCE(SUM(u.refunds_received), 0) AS refunds_received,
      COALESCE(SUM(u.balance_applied), 0) AS balance_applied,
      COALESCE(SUM(u.credit_applied), 0) AS credit_applied
    FROM (
      SELECT seller_id AS user_id,
        SUM(total_usd) AS gross_sales, 0::NUMERIC AS total_purchases,
        SUM(platform_fee_usd) AS platform_fees, 0::NUMERIC AS refunds_issued,
        0::NUMERIC AS refunds_received, 0::NUMERIC AS balance_applied,
        0::NUMERIC AS credit_applied
      FROM market_orders WHERE settlement_id = v_settlement_id GROUP BY seller_id
      UNION ALL
      SELECT buyer_id AS user_id,
        0::NUMERIC, SUM(total_usd), 0::NUMERIC, 0::NUMERIC, 0::NUMERIC,
        SUM(balance_applied_usd), SUM(credit_applied_usd)
      FROM market_orders WHERE settlement_id = v_settlement_id GROUP BY buyer_id
      UNION ALL
      SELECT d.initiated_by AS user_id,
        0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC,
        COALESCE(SUM(d.refund_amount_usd), 0), 0::NUMERIC, 0::NUMERIC
      FROM order_disputes d JOIN market_orders o ON o.id = d.order_id
      WHERE d.status IN ('buyer_accepted', 'staff_resolved')
        AND d.refund_amount_usd IS NOT NULL AND o.settlement_id = v_settlement_id
      GROUP BY d.initiated_by
      UNION ALL
      SELECT o.seller_id AS user_id,
        0::NUMERIC, 0::NUMERIC, 0::NUMERIC,
        COALESCE(SUM(d.refund_amount_usd), 0), 0::NUMERIC, 0::NUMERIC, 0::NUMERIC
      FROM order_disputes d JOIN market_orders o ON o.id = d.order_id
      WHERE d.status IN ('buyer_accepted', 'staff_resolved')
        AND d.refund_amount_usd IS NOT NULL AND o.settlement_id = v_settlement_id
      GROUP BY o.seller_id
    ) u
    GROUP BY u.user_id
  LOOP
    DECLARE
      v_net NUMERIC(10,2);
      v_hold_captured NUMERIC(10,2) := 0;
      v_hold_released NUMERIC(10,2) := 0;
      v_hold RECORD;
      v_card_purchases NUMERIC(10,2);
      v_notif_content TEXT;
    BEGIN
      v_net := v_user.gross_sales - v_user.total_purchases
             - v_user.platform_fees - v_user.refunds_issued
             + v_user.refunds_received;

      v_card_purchases := v_user.total_purchases - v_user.balance_applied - v_user.credit_applied;

      -- Consume held balance
      IF v_user.balance_applied > 0 THEN
        UPDATE user_balances
        SET held_balance_usd = GREATEST(held_balance_usd - v_user.balance_applied, 0),
            total_spent_usd = total_spent_usd + v_user.balance_applied,
            updated_at = now()
        WHERE user_id = v_user.user_id;

        PERFORM append_ledger_entry('balance_consumed', v_user.user_id, v_user.balance_applied, 'debit', NULL, v_settlement_id,
          jsonb_build_object('type', 'purchase_settlement', 'balance_applied', v_user.balance_applied));
      END IF;

      -- Handle Stripe hold
      SELECT * INTO v_hold
      FROM market_holds
      WHERE buyer_id = v_user.user_id AND status = 'active'
      FOR UPDATE;

      IF v_hold IS NOT NULL THEN
        v_hold_captured := LEAST(v_hold.hold_amount_cents::NUMERIC / 100, v_card_purchases);
        v_hold_released := (v_hold.hold_amount_cents::NUMERIC / 100) - v_hold_captured;

        UPDATE market_holds
        SET status = 'captured',
            spent_amount_cents = (v_hold_captured * 100)::INTEGER,
            updated_at = now()
        WHERE id = v_hold.id;

        INSERT INTO settlement_captures (
          settlement_id, hold_id, buyer_id, stripe_payment_intent_id,
          hold_amount_usd, capture_amount_usd, release_amount_usd, capture_status
        ) VALUES (
          v_settlement_id, v_hold.id, v_user.user_id, v_hold.stripe_payment_intent_id,
          v_hold.hold_amount_cents::NUMERIC / 100, v_hold_captured, v_hold_released, 'captured'
        );

        IF v_hold_captured > 0 THEN
          PERFORM append_ledger_entry('hold_captured', v_user.user_id, v_hold_captured, 'debit', NULL, v_settlement_id,
            jsonb_build_object('hold_id', v_hold.id, 'stripe_pi', v_hold.stripe_payment_intent_id));
        END IF;

        IF v_hold_released > 0 THEN
          PERFORM append_ledger_entry('hold_released', v_user.user_id, v_hold_released, 'credit', NULL, v_settlement_id,
            jsonb_build_object('hold_id', v_hold.id));
        END IF;
      END IF;

      -- Ledger entries
      IF v_user.gross_sales > 0 THEN
        PERFORM append_ledger_entry('settlement_credit', v_user.user_id, v_user.gross_sales, 'credit', NULL, v_settlement_id,
          jsonb_build_object('type', 'gross_sales'));
      END IF;

      IF v_user.platform_fees > 0 THEN
        PERFORM append_ledger_entry('fee_charged', v_user.user_id, v_user.platform_fees, 'debit', NULL, v_settlement_id);
      END IF;

      IF v_user.refunds_issued > 0 THEN
        PERFORM append_ledger_entry('refund_issued', v_user.user_id, v_user.refunds_issued, 'debit', NULL, v_settlement_id);
      END IF;

      IF v_user.refunds_received > 0 THEN
        PERFORM append_ledger_entry('refund_issued', v_user.user_id, v_user.refunds_received, 'credit', NULL, v_settlement_id,
          jsonb_build_object('type', 'refund_to_buyer'));
      END IF;

      -- User settlement record
      INSERT INTO user_settlements (
        settlement_id, user_id, gross_sales_usd, total_purchases_usd,
        refunds_issued_usd, refunds_received_usd, platform_fees_usd,
        hold_captured_usd, hold_released_usd, net_payout_usd, status
      ) VALUES (
        v_settlement_id, v_user.user_id, v_user.gross_sales, v_user.total_purchases,
        v_user.refunds_issued, v_user.refunds_received, v_user.platform_fees,
        v_hold_captured, v_hold_released, v_net, 'pending'
      );

      -- Update user balance
      INSERT INTO user_balances (user_id, pending_usd, total_earned_usd, total_spent_usd)
      VALUES (v_user.user_id,
        GREATEST(v_net, 0),
        GREATEST(v_user.gross_sales, 0),
        v_user.total_purchases
      )
      ON CONFLICT (user_id) DO UPDATE SET
        pending_usd = user_balances.pending_usd + GREATEST(v_net, 0),
        total_earned_usd = user_balances.total_earned_usd + GREATEST(v_user.gross_sales, 0),
        total_spent_usd = user_balances.total_spent_usd + v_user.total_purchases,
        updated_at = now();

      v_notif_content := CASE
        WHEN v_net > 0 THEN '💰 Market settlement: You earned $' || ROUND(v_net, 2) || ' (pending Stripe clearance).'
        WHEN v_net < 0 THEN '🧾 Market settlement: Your net purchases were $' || ROUND(ABS(v_net), 2) || '.'
        ELSE '📋 Market settlement complete. No net balance change.'
      END
      || CASE WHEN v_hold_released > 0 THEN ' Your hold of $' || ROUND(v_hold_released, 2) || ' has been released.' ELSE '' END;

      BEGIN
        PERFORM notify_market_event(
          v_user.user_id,
          v_notif_content,
          '/earnings'
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'notify_market_event failed in settlement for user %: %', v_user.user_id, SQLERRM;
      END;

      v_total_captured := v_total_captured + v_hold_captured;
      v_total_payouts := v_total_payouts + GREATEST(v_net, 0);
      v_total_fees := v_total_fees + v_user.platform_fees;
      v_total_refunds := v_total_refunds + v_user.refunds_issued;
      v_user_count := v_user_count + 1;
    END;
  END LOOP;

  -- Reconciliation checks
  SELECT NOT EXISTS (
    SELECT 1 FROM user_settlements us
    WHERE us.settlement_id = v_settlement_id
      AND (SELECT balance_after FROM market_ledger WHERE user_id = us.user_id ORDER BY id DESC LIMIT 1)
        != (SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_usd ELSE -amount_usd END), 0)
            FROM market_ledger WHERE user_id = us.user_id)
  ) INTO v_check1_pass;

  v_check2_pass := (v_total_payouts + v_total_fees) <= (v_total_captured + v_total_payouts + v_total_fees);

  v_reconciliation := jsonb_build_object(
    'check1_ledger_consistency', v_check1_pass,
    'check2_settlement_balance', v_check2_pass,
    'total_orders', v_total_orders,
    'total_users', v_user_count,
    'total_captured_usd', v_total_captured,
    'total_payouts_usd', v_total_payouts,
    'total_fees_usd', v_total_fees,
    'total_refunds_usd', v_total_refunds
  );

  DECLARE
    v_total_released NUMERIC(10,2) := 0;
  BEGIN
    SELECT COALESCE(SUM(release_amount_usd), 0) INTO v_total_released
    FROM settlement_captures WHERE settlement_id = v_settlement_id;

    v_reconciliation := v_reconciliation || jsonb_build_object(
      'total_released_usd', v_total_released,
      'capture_count', (SELECT COUNT(*) FROM settlement_captures WHERE settlement_id = v_settlement_id)
    );

    UPDATE market_settlements
    SET total_orders = v_total_orders,
        total_captured_usd = v_total_captured,
        total_released_usd = v_total_released,
        total_payouts_usd = v_total_payouts,
        total_fees_usd = v_total_fees,
        total_refunds_usd = v_total_refunds,
        reconciliation_check = v_reconciliation,
        status = CASE
          WHEN v_check1_pass AND v_check2_pass THEN 'funds_pending'::clearing_status
          ELSE 'reconciliation_failed'::clearing_status
        END,
        updated_at = now()
    WHERE id = v_settlement_id;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'settlement_id', v_settlement_id,
    'users_settled', v_user_count,
    'orders_settled', v_total_orders,
    'reconciliation', v_reconciliation
  );
END;
$$;
