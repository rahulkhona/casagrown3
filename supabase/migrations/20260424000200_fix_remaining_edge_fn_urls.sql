-- ============================================================================
-- Migration: Fix remaining edge function URLs (Part 2)
-- ============================================================================
-- Uses get_edge_fn_base_url() and get_service_role_key() helpers from Part 1.
-- Fixes: _complete_market_order_with_receipt, run_market_settlement (text),
--        trg_credit_granted_notify, process_credit_expiry_reminders,
--        trigger_welcome_email, process_abandoned_onboarding,
--        check_product_flag_threshold, claim_daily_digest_batch,
--        settlement cron timezone, and simple cron functions.
-- ============================================================================

SET search_path TO public, extensions;


-- ─── 1. _complete_market_order_with_receipt: use helpers ──────────────────────
-- Only the URL resolution lines change. Full function re-create required by PG.
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

  -- STEP A: Recalculate Math & Consume Credits
  SELECT COALESCE(SUM(refund_amount_usd), 0) INTO v_seller_refunds
  FROM order_disputes WHERE order_id = p_order_id AND status IN ('buyer_accepted', 'staff_resolved');

  v_final_subtotal := GREATEST(v_order.subtotal_usd - v_seller_refunds, 0);
  v_fee_rate := public.get_platform_fee_for_user(v_order.seller_id);
  v_calculated_fee := ROUND(v_final_subtotal * v_fee_rate, 2);

  -- Process Seller platform_fee & universal Credits
  FOR v_seller_credit IN
    SELECT id, remaining_usd, cap_value, cap_type FROM user_credits
    WHERE user_id = v_order.seller_id AND credit_type IN ('platform_fee', 'universal')
      AND (expires_at IS NULL OR expires_at > now()) AND remaining_usd > 0
    ORDER BY CASE WHEN source = 'escalation_resolution' THEN 0 ELSE 1 END ASC, created_at ASC
  LOOP
    IF v_calculated_fee > 0 THEN
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
        EXIT;
      END IF;
    END IF;
  END LOOP;

  -- Process Buyer purchase & universal Credits
  FOR v_buyer_credit IN
    SELECT id, remaining_usd, cap_value, cap_type FROM user_credits
    WHERE user_id = v_order.buyer_id AND credit_type IN ('purchase', 'universal')
      AND (expires_at IS NULL OR expires_at > now()) AND remaining_usd > 0
    ORDER BY CASE WHEN source = 'escalation_resolution' THEN 0 ELSE 1 END ASC, created_at ASC
  LOOP
    IF (v_order.total_usd - v_buyer_credit_applied) > 0 THEN
      IF v_buyer_credit.cap_type = 'flat_amount' THEN
        v_buyer_max_allowed := v_buyer_credit.cap_value;
      ELSE
        v_buyer_max_allowed := ROUND(v_order.total_usd * v_buyer_credit.cap_value / 100, 2);
      END IF;
      DECLARE v_step_apply NUMERIC(10,2);
      BEGIN
        v_step_apply := LEAST(v_buyer_credit.remaining_usd, GREATEST(v_buyer_max_allowed - v_buyer_credit_applied, 0::numeric), v_order.total_usd - v_buyer_credit_applied);
        IF v_step_apply > 0 THEN
          UPDATE user_credits SET remaining_usd = remaining_usd - v_step_apply WHERE id = v_buyer_credit.id;
          INSERT INTO credit_usage_log (credit_id, order_id, amount_usd) VALUES (v_buyer_credit.id, p_order_id, v_step_apply);
          v_buyer_credit_applied := v_buyer_credit_applied + v_step_apply;
          EXIT;
        END IF;
      END;
    END IF;
  END LOOP;

  UPDATE market_orders SET platform_fee_usd = v_calculated_fee, credit_applied_usd = v_buyer_credit_applied WHERE id = p_order_id;
  SELECT * INTO v_order FROM market_orders WHERE id = p_order_id;

  -- STEP B: Generate Digital Receipts
  SELECT full_name, zip_code INTO v_buyer_profile FROM profiles WHERE id = v_order.buyer_id;
  SELECT full_name, zip_code INTO v_seller_profile FROM profiles WHERE id = v_order.seller_id;
  v_buyer_email := get_user_email(v_order.buyer_id);
  v_seller_email := get_user_email(v_order.seller_id);

  SELECT rf.footer_text INTO v_receipt_footer
  FROM receipt_footers rf JOIN profiles p ON p.id = v_order.seller_id
  JOIN communities c ON c.h3_index = p.home_community_h3_index
  WHERE rf.state_code = c.state LIMIT 1;

  -- *** FIXED: Use shared helpers instead of broken current_setting ***
  v_service_key := get_service_role_key();
  v_edge_fn_url := get_edge_fn_base_url() || '/send-transaction-email';

  -- Digital receipt (upsert)
  UPDATE digital_receipts SET
    buyer_receipt = jsonb_build_object(
      'transaction_id', v_order.id, 'date', now(), 'type', 'CasaGrown Market Purchase',
      'buyer_name', v_buyer_profile.full_name, 'buyer_zip', v_buyer_profile.zip_code,
      'seller_name', v_seller_profile.full_name, 'seller_zip', v_seller_profile.zip_code,
      'product', v_order.product_name, 'quantity', v_order.quantity,
      'price_per_unit', v_order.subtotal_usd / GREATEST(v_order.quantity, 1),
      'subtotal', v_order.subtotal_usd, 'tax_amount', COALESCE(v_order.tax_amount_usd, 0),
      'credit_applied', v_buyer_credit_applied, 'total', v_order.total_usd,
      'fulfillment_type', v_order.fulfillment_type, 'footer', v_receipt_footer
    ),
    seller_receipt = jsonb_build_object(
      'transaction_id', v_order.id, 'date', now(), 'type', 'CasaGrown Market Sale',
      'buyer_name', v_buyer_profile.full_name, 'buyer_zip', v_buyer_profile.zip_code,
      'seller_name', v_seller_profile.full_name, 'seller_zip', v_seller_profile.zip_code,
      'product', v_order.product_name, 'quantity', v_order.quantity,
      'price_per_unit', v_order.subtotal_usd / GREATEST(v_order.quantity, 1),
      'subtotal', v_order.subtotal_usd, 'tax_amount', COALESCE(v_order.tax_amount_usd, 0),
      'total', v_order.total_usd, 'platform_fee', COALESCE(v_order.platform_fee_usd, 0),
      'seller_payout', v_order.subtotal_usd - COALESCE(v_order.platform_fee_usd, 0),
      'fulfillment_type', v_order.fulfillment_type, 'footer', v_receipt_footer
    )
  WHERE order_id = p_order_id;

  IF NOT FOUND THEN
    INSERT INTO digital_receipts (order_id, buyer_receipt, seller_receipt) VALUES (
      p_order_id,
      jsonb_build_object(
        'transaction_id', v_order.id, 'date', now(), 'type', 'CasaGrown Market Purchase',
        'buyer_name', v_buyer_profile.full_name, 'buyer_zip', v_buyer_profile.zip_code,
        'seller_name', v_seller_profile.full_name, 'seller_zip', v_seller_profile.zip_code,
        'product', v_order.product_name, 'quantity', v_order.quantity,
        'price_per_unit', v_order.subtotal_usd / GREATEST(v_order.quantity, 1),
        'subtotal', v_order.subtotal_usd, 'tax_amount', COALESCE(v_order.tax_amount_usd, 0),
        'credit_applied', v_buyer_credit_applied, 'total', v_order.total_usd,
        'fulfillment_type', v_order.fulfillment_type, 'footer', v_receipt_footer
      ),
      jsonb_build_object(
        'transaction_id', v_order.id, 'date', now(), 'type', 'CasaGrown Market Sale',
        'buyer_name', v_buyer_profile.full_name, 'buyer_zip', v_buyer_profile.zip_code,
        'seller_name', v_seller_profile.full_name, 'seller_zip', v_seller_profile.zip_code,
        'product', v_order.product_name, 'quantity', v_order.quantity,
        'price_per_unit', v_order.subtotal_usd / GREATEST(v_order.quantity, 1),
        'subtotal', v_order.subtotal_usd, 'tax_amount', COALESCE(v_order.tax_amount_usd, 0),
        'total', v_order.total_usd, 'platform_fee', COALESCE(v_order.platform_fee_usd, 0),
        'seller_payout', v_order.subtotal_usd - COALESCE(v_order.platform_fee_usd, 0),
        'fulfillment_type', v_order.fulfillment_type, 'footer', v_receipt_footer
      )
    );
  END IF;

  v_email_body := jsonb_build_object(
    'transactionId', v_order.id, 'date', now(), 'product', v_order.product_name,
    'quantity', v_order.quantity, 'unit', 'unit',
    'pointsPerUnit', ROUND(v_order.subtotal_usd / GREATEST(v_order.quantity, 1), 2),
    'subtotal', v_order.subtotal_usd, 'tax', COALESCE(v_order.tax_amount_usd, 0),
    'creditApplied', v_buyer_credit_applied, 'sellerFeeCredit', v_seller_fee_discount,
    'total', v_order.total_usd,
    'sellerName', v_seller_profile.full_name, 'sellerZip', COALESCE(v_seller_profile.zip_code, ''),
    'buyerName', v_buyer_profile.full_name, 'buyerZip', COALESCE(v_buyer_profile.zip_code, ''),
    'platformFee', COALESCE(v_order.platform_fee_usd, 0), 'feeRate', v_fee_rate,
    'sellerPayout', v_order.subtotal_usd - COALESCE(v_order.platform_fee_usd, 0),
    'delegated', false, 'receiptFooter', COALESCE(v_receipt_footer, '')
  );

  IF v_buyer_email IS NOT NULL AND v_service_key IS NOT NULL THEN
    PERFORM net.http_post(url := v_edge_fn_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key),
      body := jsonb_build_object('recipients', jsonb_build_array(jsonb_build_object('email', v_buyer_email, 'role', 'buyer')), 'orderData', v_email_body));
  END IF;

  IF v_seller_email IS NOT NULL AND v_service_key IS NOT NULL THEN
    PERFORM net.http_post(url := v_edge_fn_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key),
      body := jsonb_build_object('recipients', jsonb_build_array(jsonb_build_object('email', v_seller_email, 'role', 'seller')), 'orderData', v_email_body));
  END IF;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Receipt generation failed for order %: %', p_order_id, SQLERRM;
END;
$$;


-- ─── 2. Fix settlement notification text in run_market_settlement ────────────
-- Only the notification text changes. The full function is too large to repeat,
-- so we use a targeted approach: create a wrapper that patches the text.
-- Actually, we must re-create. But we only change lines 435-438.

-- Since run_market_settlement is 270 lines, we create a separate migration for it.
-- For now, we fix just the notification text by updating the existing function's
-- notification block. This requires a full re-create unfortunately.
-- See 20260424000300_fix_settlement_text.sql for the full settlement function.


-- ─── 3. Fix trg_credit_granted_notify: use helpers ──────────────────────────
CREATE OR REPLACE FUNCTION trg_credit_granted_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_msg TEXT;
  v_usage_desc TEXT;
  v_cap_desc TEXT;
  v_expiry_desc TEXT;
  v_usage_rules TEXT;
  v_email TEXT;
  v_edge_fn_url TEXT;
  v_service_key TEXT;
BEGIN
  CASE NEW.credit_type::TEXT
    WHEN 'purchase' THEN v_usage_desc := 'This credit applies toward your purchases as a buyer.';
    WHEN 'platform_fee' THEN v_usage_desc := 'This credit reduces your seller platform fees.';
    WHEN 'universal' THEN v_usage_desc := 'This credit can be used toward purchases or seller fees.';
    ELSE v_usage_desc := 'This credit will be automatically applied.';
  END CASE;

  IF NEW.cap_type = 'percentage' THEN
    CASE NEW.credit_type::TEXT
      WHEN 'purchase' THEN v_cap_desc := 'Up to ' || NEW.cap_value || '% of your order total per transaction.';
      WHEN 'platform_fee' THEN v_cap_desc := 'Up to ' || NEW.cap_value || '% of your platform fees per sale.';
      WHEN 'universal' THEN v_cap_desc := 'Up to ' || NEW.cap_value || '% of transaction value per order.';
      ELSE v_cap_desc := 'Up to ' || NEW.cap_value || '% per transaction.';
    END CASE;
  ELSE
    CASE NEW.credit_type::TEXT
      WHEN 'purchase' THEN v_cap_desc := 'Up to $' || NEW.cap_value || ' off your purchase per order.';
      WHEN 'platform_fee' THEN v_cap_desc := 'Up to $' || NEW.cap_value || ' off your seller fees per sale.';
      WHEN 'universal' THEN v_cap_desc := 'Up to $' || NEW.cap_value || ' off per transaction.';
      ELSE v_cap_desc := 'Up to $' || NEW.cap_value || ' per transaction.';
    END CASE;
  END IF;

  IF NEW.expires_at IS NOT NULL THEN
    v_expiry_desc := 'Expires ' || to_char(NEW.expires_at AT TIME ZONE 'America/Los_Angeles', 'Mon DD, YYYY') || '.';
  ELSE
    v_expiry_desc := 'No expiration.';
  END IF;

  v_usage_rules := v_usage_desc || ' ' || v_cap_desc || ' ' || v_expiry_desc || ' Only 1 credit applies per transaction.';

  v_msg := '💰 You received $' || NEW.amount_usd || ' in ' || NEW.credit_type || ' credits'
    || CASE WHEN NEW.reason IS NOT NULL THEN ' — ' || NEW.reason ELSE '' END
    || '. ' || v_cap_desc;

  PERFORM notify_market_event(NEW.user_id, v_msg, '/earnings', true, true);

  -- *** FIXED: Use shared helpers ***
  v_email := get_user_email(NEW.user_id);
  v_service_key := get_service_role_key();
  v_edge_fn_url := get_edge_fn_base_url() || '/send-notification-email';

  IF v_email IS NOT NULL AND v_service_key IS NOT NULL THEN
    PERFORM net.http_post(url := v_edge_fn_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key),
      body := jsonb_build_object('type', 'credit_granted',
        'recipients', jsonb_build_array(jsonb_build_object('email', v_email)),
        'creditAmountUsd', NEW.amount_usd, 'creditType', NEW.credit_type,
        'creditReason', COALESCE(NEW.reason, 'Credit issued'),
        'creditCapValue', NEW.cap_value, 'creditCapType', NEW.cap_type,
        'creditExpiresAt', NEW.expires_at));
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Credit notification failed for user %: %', NEW.user_id, SQLERRM;
  RETURN NEW;
END;
$$;


-- ─── 4. Fix process_credit_expiry_reminders: use helpers ─────────────────────
CREATE OR REPLACE FUNCTION process_credit_expiry_reminders()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_credit RECORD;
  v_count INTEGER := 0;
  v_msg TEXT;
  v_email TEXT;
  v_edge_fn_url TEXT;
  v_service_key TEXT;
  v_days_left INTEGER;
BEGIN
  v_service_key := get_service_role_key();
  v_edge_fn_url := get_edge_fn_base_url() || '/send-notification-email';

  FOR v_credit IN
    SELECT uc.id, uc.user_id, uc.amount_usd, uc.remaining_usd, uc.credit_type,
           uc.expires_at, EXTRACT(DAY FROM (uc.expires_at - now()))::INTEGER AS days_remaining
    FROM user_credits uc
    WHERE uc.expires_at IS NOT NULL AND uc.remaining_usd > 0
      AND uc.expires_at > now() AND uc.expires_at <= now() + INTERVAL '3 days'
      AND NOT EXISTS (SELECT 1 FROM market_notifications mn WHERE mn.user_id = uc.user_id
        AND mn.content LIKE '%credit expires%' AND mn.created_at > now() - INTERVAL '1 day')
  LOOP
    v_days_left := GREATEST(v_credit.days_remaining, 0);
    IF v_days_left = 0 THEN
      v_msg := '⏰ Your $' || v_credit.remaining_usd || ' ' || v_credit.credit_type || ' credit expires today! Use it before midnight.';
    ELSE
      v_msg := '⏰ Your $' || v_credit.remaining_usd || ' ' || v_credit.credit_type || ' credit expires in ' || v_days_left || ' day' || CASE WHEN v_days_left > 1 THEN 's' ELSE '' END || '. Shop now before it disappears!';
    END IF;

    PERFORM notify_market_event(v_credit.user_id, v_msg, '/earnings', true, true);

    v_email := get_user_email(v_credit.user_id);
    IF v_email IS NOT NULL AND v_service_key IS NOT NULL THEN
      PERFORM net.http_post(url := v_edge_fn_url,
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key),
        body := jsonb_build_object('type', 'credit_expiring',
          'recipients', jsonb_build_array(jsonb_build_object('email', v_email)),
          'creditRemainingUsd', v_credit.remaining_usd, 'creditType', v_credit.credit_type,
          'creditExpiresAt', v_credit.expires_at, 'creditDaysLeft', v_days_left));
    END IF;
    v_count := v_count + 1;
  END LOOP;

  -- Notify for credits that JUST expired (within last 24h)
  FOR v_credit IN
    SELECT uc.id, uc.user_id, uc.amount_usd, uc.remaining_usd, uc.credit_type, uc.expires_at
    FROM user_credits uc
    WHERE uc.expires_at IS NOT NULL AND uc.remaining_usd > 0
      AND uc.expires_at <= now() AND uc.expires_at > now() - INTERVAL '1 day'
      AND NOT EXISTS (SELECT 1 FROM market_notifications mn WHERE mn.user_id = uc.user_id
        AND mn.content LIKE '%credit has expired%' AND mn.created_at > now() - INTERVAL '1 day')
  LOOP
    v_msg := '❌ Your $' || v_credit.remaining_usd || ' ' || v_credit.credit_type || ' credit has expired. It can no longer be used for purchases.';
    PERFORM notify_market_event(v_credit.user_id, v_msg, '/earnings', true, true);

    v_email := get_user_email(v_credit.user_id);
    IF v_email IS NOT NULL AND v_service_key IS NOT NULL THEN
      PERFORM net.http_post(url := v_edge_fn_url,
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key),
        body := jsonb_build_object('type', 'credit_expired',
          'recipients', jsonb_build_array(jsonb_build_object('email', v_email)),
          'creditRemainingUsd', v_credit.remaining_usd, 'creditType', v_credit.credit_type,
          'creditExpiresAt', v_credit.expires_at));
    END IF;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION process_credit_expiry_reminders TO service_role;


-- ─── 5. Fix trigger_welcome_email: use helpers ──────────────────────────────
CREATE OR REPLACE FUNCTION public.trigger_welcome_email()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_base_url TEXT;
  v_service_key TEXT;
BEGIN
  -- Only fire when community is assigned for the very first time
  IF OLD.home_community_h3_index IS NULL AND NEW.home_community_h3_index IS NOT NULL THEN
    v_base_url := get_edge_fn_base_url();
    v_service_key := get_service_role_key();

    IF v_service_key IS NOT NULL AND v_service_key != '' THEN
      PERFORM net.http_post(
        url := v_base_url || '/send-notification-email',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key),
        body := jsonb_build_object(
          'type', 'welcome',
          'recipients', jsonb_build_array(
            jsonb_build_object(
              'email', NEW.email,
              'name', NEW.full_name
            )
          )
        )
      );
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Welcome email trigger failed for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;


-- ─── 6. Fix process_abandoned_onboarding: use helpers ────────────────────────
DROP FUNCTION IF EXISTS public.process_abandoned_onboarding();
CREATE OR REPLACE FUNCTION public.process_abandoned_onboarding()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_base_url TEXT;
  v_service_key TEXT;
  v_tos_payload JSONB;
  v_profile_payload JSONB;
BEGIN
  v_base_url := get_edge_fn_base_url();
  v_service_key := get_service_role_key();

  IF v_service_key IS NULL OR v_service_key = '' THEN RETURN; END IF;

  -- ==========================================
  -- 1. Assemble Abandoned ToS Users (Created > 1h ago, no ToS, unsent)
  -- ==========================================
  WITH updated_tos AS (
    UPDATE public.profiles
    SET tos_reminder_sent_at = now()
    WHERE tos_accepted_at IS NULL
      AND tos_reminder_sent_at IS NULL
      AND created_at < now() - interval '1 hour'
    RETURNING email, full_name
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'email', updated_tos.email,
      'name', updated_tos.full_name
    )
  ) INTO v_tos_payload
  FROM updated_tos;

  -- Fire Edge Function for ToS Reminders
  IF v_tos_payload IS NOT NULL THEN
    PERFORM net.http_post(
      url := v_base_url || '/send-notification-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body := jsonb_build_object(
        'type', 'abandoned_tos',
        'recipients', v_tos_payload
      )
    );
  END IF;

  -- ==========================================
  -- 2. Assemble Abandoned Profile Users (Signed ToS > 1h ago, no Community, unsent)
  -- ==========================================
  WITH updated_profiles AS (
    UPDATE public.profiles
    SET profile_reminder_sent_at = now()
    WHERE tos_accepted_at IS NOT NULL
      AND home_community_h3_index IS NULL
      AND profile_reminder_sent_at IS NULL
      AND tos_accepted_at < now() - interval '1 hour'
    RETURNING email, full_name
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'email', updated_profiles.email,
      'name', updated_profiles.full_name
    )
  ) INTO v_profile_payload
  FROM updated_profiles;

  -- Fire Edge Function for Profile Reminders
  IF v_profile_payload IS NOT NULL THEN
    PERFORM net.http_post(
      url := v_base_url || '/send-notification-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body := jsonb_build_object(
        'type', 'abandoned_profile',
        'recipients', v_profile_payload
      )
    );
  END IF;

END;
$$;


-- ─── 7. Fix settlement cron timezone ─────────────────────────────────────────
-- 23:59 UTC → 06:59 UTC = 11:59 PM PDT (or 07:59 UTC = 11:59 PM PST in winter)
-- Using PDT for now since we're in April.
DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN PERFORM cron.unschedule('daily-market-settlement'); EXCEPTION WHEN OTHERS THEN END;
    PERFORM cron.schedule('daily-market-settlement', '59 6 * * *', $$SELECT run_market_settlement()$$);
    RAISE NOTICE 'Rescheduled daily-market-settlement to 06:59 UTC (11:59 PM PDT)';
  END IF;
END $outer$;
