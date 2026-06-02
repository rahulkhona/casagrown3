-- ============================================================================
-- Migration: Unify Promotion Buyer Discounts & Fix Fee Function
-- ============================================================================
-- 1. Create crm_promo_buyer_discounts (replaces crm_recurring_user_incentives_blueprint)
-- 2. Migrate legacy data
-- 3. Fix _complete_market_order_with_receipt (critical: use get_seller_fee_rate)
-- 4. Update crm_enroll_in_promotion (new table + single enrollment enforcement)
-- 5. Update crm_get_landing_page_promotion (rename credits → buyer_discounts)
-- 6. Create crm_switch_promotion RPC
-- 7. Add downgrade flow columns + RPCs
-- 8. Drop legacy table
-- ============================================================================

SET search_path TO public, extensions;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Create crm_promo_buyer_discounts
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS crm_promo_buyer_discounts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id        UUID NOT NULL REFERENCES crm_promotions(id) ON DELETE CASCADE,
  discount_amount_usd NUMERIC(10,2) NOT NULL CHECK (discount_amount_usd > 0),
  discount_cap_type   credit_cap_type NOT NULL DEFAULT 'percentage',
  discount_cap_value  NUMERIC(10,2) NOT NULL,
  discount_type       credit_type NOT NULL DEFAULT 'purchase',
  frequency           expiration_frequency NOT NULL,
  occurrences         INT NOT NULL CHECK (occurrences > 0),
  start_date          TIMESTAMPTZ NOT NULL,
  image_url           TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(promotion_id)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Migrate data from legacy table
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO crm_promo_buyer_discounts (
  promotion_id, discount_amount_usd, discount_cap_type, discount_cap_value,
  discount_type, frequency, occurrences, start_date
)
SELECT
  promotion_id, amount_usd, cap_type, cap_value,
  credit_type, frequency, occurrences, start_date
FROM crm_recurring_user_incentives_blueprint
ON CONFLICT (promotion_id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. RLS Policies & Grants
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE crm_promo_buyer_discounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY crm_promo_buyer_discounts_read ON crm_promo_buyer_discounts
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY crm_promo_buyer_discounts_staff_all ON crm_promo_buyer_discounts
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()));

GRANT SELECT ON public.crm_promo_buyer_discounts TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_promo_buyer_discounts TO authenticated;
GRANT ALL ON public.crm_promo_buyer_discounts TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. CRITICAL FIX: _complete_market_order_with_receipt
--    Change get_platform_fee_for_user() → get_seller_fee_rate()
--    NOTE: get_platform_fee_for_user returns decimal (0.10 = 10%)
--          get_seller_fee_rate returns percentage (10.00 = 10%)
-- ═══════════════════════════════════════════════════════════════════════════

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

  -- FIX: Use tier-aware + promo-aware fee function (returns percentage, divide by 100)
  v_fee_rate := public.get_seller_fee_rate(v_order.seller_id);
  v_calculated_fee := ROUND(v_final_subtotal * (v_fee_rate / 100.0), 2);

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
      'fee_rate_pct', v_fee_rate,
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
        'fee_rate_pct', v_fee_rate,
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


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Update crm_enroll_in_promotion
--    - Single enrollment enforcement (only 1 promotion per user)
--    - Read from crm_promo_buyer_discounts instead of legacy table
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.crm_enroll_in_promotion(p_promotion_id uuid, p_campaign_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_promo crm_promotions%ROWTYPE;
  v_buyer_discount crm_promo_buyer_discounts%ROWTYPE;
  v_sub_discount crm_promo_subscription_discounts%ROWTYPE;
  v_stop_date TIMESTAMPTZ;
  v_expires_at TIMESTAMPTZ;
  v_uid UUID;
  v_email TEXT;
  v_audience_rpc TEXT;
  v_is_in_audience BOOLEAN := false;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO v_email FROM profiles WHERE id = v_uid;

  -- 1. Lock the crm_promotions row (FOR UPDATE)
  SELECT * INTO v_promo FROM crm_promotions WHERE id = p_promotion_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Promotion not found';
  END IF;

  -- 2. Verify: now() <= enrollment_deadline, current_enrollees < max_enrollees
  IF now() > v_promo.enrollment_deadline THEN
    RAISE EXCEPTION 'Promotion enrollment deadline has passed';
  END IF;
  
  IF v_promo.current_enrollees >= v_promo.max_enrollees THEN
    RAISE EXCEPTION 'Promotion capacity has been reached';
  END IF;

  -- 3. Verify Audience Restrictions
  IF v_promo.audience_id IS NOT NULL THEN
    SELECT audience_rpc_name INTO v_audience_rpc FROM crm_audiences WHERE id = v_promo.audience_id;
    IF v_audience_rpc IS NOT NULL THEN
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I() WHERE lower(email) = lower($1))', v_audience_rpc)
      INTO v_is_in_audience
      USING v_email;
      
      IF NOT v_is_in_audience THEN
        RAISE EXCEPTION 'You are not eligible for this targeted promotion';
      END IF;
    END IF;
  END IF;

  -- 4. Single enrollment enforcement: only ONE active promotion per user
  IF EXISTS (SELECT 1 FROM crm_promo_enrollments WHERE user_id = v_uid) THEN
    RAISE EXCEPTION 'User already enrolled in a promotion. Must unenroll first via crm_switch_promotion.';
  END IF;
  
  -- 5. Insert into crm_promo_enrollments (with campaign attribution!)
  INSERT INTO crm_promo_enrollments (promotion_id, user_id, campaign_id) VALUES (p_promotion_id, v_uid, p_campaign_id);
  
  -- 6. Increment current_enrollees
  UPDATE crm_promotions SET current_enrollees = current_enrollees + 1 WHERE id = p_promotion_id;

  -- 7. Issue Buyer Discounts (if applicable) — reads from NEW crm_promo_buyer_discounts
  SELECT * INTO v_buyer_discount FROM crm_promo_buyer_discounts WHERE promotion_id = p_promotion_id;
  IF FOUND THEN
    -- Calculate stop_date based on frequency and occurrences
    IF v_buyer_discount.frequency = 'onetime' THEN
      v_stop_date := NULL;
    ELSIF v_buyer_discount.frequency = 'monthly' THEN
      v_stop_date := v_buyer_discount.start_date + (v_buyer_discount.occurrences || ' months')::interval;
    ELSIF v_buyer_discount.frequency = 'weekly' THEN
      v_stop_date := v_buyer_discount.start_date + (v_buyer_discount.occurrences || ' weeks')::interval;
    ELSIF v_buyer_discount.frequency = 'quarterly' THEN
      v_stop_date := v_buyer_discount.start_date + ((v_buyer_discount.occurrences * 3) || ' months')::interval;
    ELSIF v_buyer_discount.frequency = 'halfyearly' THEN
      v_stop_date := v_buyer_discount.start_date + ((v_buyer_discount.occurrences * 6) || ' months')::interval;
    ELSIF v_buyer_discount.frequency = 'yearly' THEN
      v_stop_date := v_buyer_discount.start_date + (v_buyer_discount.occurrences || ' years')::interval;
    END IF;

    INSERT INTO user_incentives (
      user_id, amount_usd, credit_type, cap_type, cap_value,
      expiration_frequency, start_date, stop_date, is_active, created_by
    ) VALUES (
      v_uid,
      v_buyer_discount.discount_amount_usd,
      v_buyer_discount.discount_type,
      v_buyer_discount.discount_cap_type,
      v_buyer_discount.discount_cap_value,
      v_buyer_discount.frequency,
      v_buyer_discount.start_date,
      v_stop_date,
      true,
      NULL  -- system-created via promotion enrollment
    );
  END IF;

  -- 8. Apply Subscription Discounts (for all plans configured in the promotion)
  FOR v_sub_discount IN 
    SELECT * FROM crm_promo_subscription_discounts WHERE promotion_id = p_promotion_id
  LOOP
    -- Calculate expiration
    IF v_sub_discount.duration_months IS NOT NULL THEN
      v_expires_at := now() + (v_sub_discount.duration_months || ' months')::interval;
    ELSE
      v_expires_at := NULL;  -- perpetual
    END IF;

    -- Record the applied discount for this user
    INSERT INTO user_subscription_discounts (
      user_id, promotion_id, discount_id, discount_pct,
      duration_months, applied_at, expires_at, status, stripe_coupon_id,
      platform_fee_reduction_pct, stripe_fee_handling_override
    ) VALUES (
      v_uid, p_promotion_id, v_sub_discount.id, v_sub_discount.discount_pct,
      v_sub_discount.duration_months, now(), v_expires_at, 'active',
      v_sub_discount.stripe_coupon_id,
      v_sub_discount.platform_fee_reduction_pct,
      v_sub_discount.stripe_fee_handling_override
    )
    ON CONFLICT (user_id, discount_id) DO NOTHING;
  END LOOP;

  RETURN jsonb_build_object('success', true);
END;
$function$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Create crm_switch_promotion — Atomic promotion switch
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.crm_switch_promotion(p_new_promotion_id uuid, p_campaign_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_uid UUID;
  v_old_enrollment RECORD;
  v_old_promo_id UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 1. Find existing enrollment
  SELECT * INTO v_old_enrollment FROM crm_promo_enrollments WHERE user_id = v_uid LIMIT 1;

  -- 2. If enrolled, revoke all old incentives
  IF FOUND THEN
    v_old_promo_id := v_old_enrollment.promotion_id;

    -- Revoke seller subscription discounts
    UPDATE user_subscription_discounts
    SET status = 'revoked'
    WHERE user_id = v_uid
      AND promotion_id = v_old_promo_id
      AND status = 'active';

    -- Deactivate buyer incentives (user_incentives fed from old promotion)
    -- We match by the user and the start_date/amount pattern from the old blueprint
    UPDATE user_incentives
    SET is_active = false
    WHERE user_id = v_uid
      AND is_active = true
      AND created_by IS NULL;  -- system-created via promotion enrollment

    -- Remove old enrollment & decrement counter
    DELETE FROM crm_promo_enrollments WHERE user_id = v_uid AND promotion_id = v_old_promo_id;
    UPDATE crm_promotions SET current_enrollees = GREATEST(current_enrollees - 1, 0) WHERE id = v_old_promo_id;
  END IF;

  -- 3. Enroll in new promotion (this checks deadlines, capacity, audience)
  RETURN public.crm_enroll_in_promotion(p_new_promotion_id, p_campaign_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.crm_switch_promotion(uuid, uuid) TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Update crm_get_landing_page_promotion — new table + rename key
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.crm_get_landing_page_promotion(p_slug text, p_promo_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT CASE WHEN p.id IS NULL THEN NULL ELSE
    jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'description_html', p.description_html,
      'enrollment_deadline', p.enrollment_deadline,
      'hero_image_url', lp.hero_image_url,
      'allow_existing_users', p.allow_existing_users,
      'is_capacity_reached', (p.current_enrollees >= p.max_enrollees),
      'giveaway', (
        SELECT jsonb_build_object(
          'title', g.title, 'description', g.description,
          'start_date', g.start_date, 'end_date', g.end_date, 'photos', g.photos
        )
        FROM crm_promo_giveaways g
        WHERE g.promotion_id = p.id
        LIMIT 1
      ),
      -- Renamed from 'credits' to 'buyer_discounts', now reads from new table
      'buyer_discounts', (
        SELECT jsonb_build_object(
          'discount_amount_usd', bd.discount_amount_usd,
          'discount_type', bd.discount_type,
          'discount_cap_type', bd.discount_cap_type,
          'discount_cap_value', bd.discount_cap_value,
          'frequency', bd.frequency,
          'occurrences', bd.occurrences,
          'start_date', bd.start_date,
          'image_url', bd.image_url
        )
        FROM crm_promo_buyer_discounts bd
        WHERE bd.promotion_id = p.id
        LIMIT 1
      ),
      -- Keep backward compat: 'credits' alias for any code not yet updated
      'credits', (
        SELECT jsonb_build_object(
          'amount_usd', bd.discount_amount_usd,
          'credit_type', bd.discount_type,
          'cap_type', bd.discount_cap_type,
          'cap_value', bd.discount_cap_value,
          'frequency', bd.frequency,
          'occurrences', bd.occurrences,
          'start_date', bd.start_date,
          'image_url', bd.image_url
        )
        FROM crm_promo_buyer_discounts bd
        WHERE bd.promotion_id = p.id
        LIMIT 1
      ),
      'sub_discount', (
        SELECT jsonb_build_object(
          'discount_pct', sd.discount_pct,
          'duration_months', sd.duration_months,
          'pro_monthly_price', COALESCE(
            (SELECT pro_monthly_price_usd FROM platform_settings LIMIT 1), 10.00
          )
        )
        FROM crm_promo_subscription_discounts sd
        WHERE sd.promotion_id = p.id
        LIMIT 1
      ),
      'sub_discounts', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'plan', sd.plan,
          'discount_pct', sd.discount_pct,
          'duration_months', sd.duration_months,
          'platform_fee_reduction_pct', sd.platform_fee_reduction_pct,
          'stripe_fee_handling_override', sd.stripe_fee_handling_override
        )), '[]'::jsonb)
        FROM crm_promo_subscription_discounts sd
        WHERE sd.promotion_id = p.id
      )
    )
  END
  FROM crm_landing_pages lp
  LEFT JOIN crm_promotions p ON p.landing_page_id = lp.id
    AND (p_promo_id IS NULL OR p.id = p_promo_id)
  WHERE lp.slug = p_slug
    AND lp.is_active = TRUE
  ORDER BY p.created_at DESC
  LIMIT 1;
$function$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 8. Downgrade Flow: Add pending downgrade columns to seller_subscriptions
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.seller_subscriptions ADD COLUMN IF NOT EXISTS pending_downgrade_plan TEXT;
ALTER TABLE public.seller_subscriptions ADD COLUMN IF NOT EXISTS pending_booth_keep_ids UUID[];
ALTER TABLE public.seller_subscriptions ADD COLUMN IF NOT EXISTS downgrade_effective_at TIMESTAMPTZ;


-- ═══════════════════════════════════════════════════════════════════════════
-- 9. initiate_downgrade RPC
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.initiate_downgrade(
  p_target_plan TEXT,
  p_keep_booth_ids UUID[]
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID;
  v_current_sub RECORD;
  v_target_max_booths INTEGER;
  v_current_booths INTEGER;
  v_effective_at TIMESTAMPTZ;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get current subscription
  SELECT * INTO v_current_sub FROM seller_subscriptions
  WHERE user_id = v_uid AND status IN ('active', 'trialing');
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active subscription found';
  END IF;

  -- Verify target plan is a downgrade
  IF p_target_plan NOT IN ('lite', 'pro', 'elite') THEN
    RAISE EXCEPTION 'Invalid target plan: %', p_target_plan;
  END IF;

  -- Get target tier booth limit
  SELECT max_booths INTO v_target_max_booths FROM subscription_tiers WHERE tier_name = p_target_plan;
  IF v_target_max_booths IS NULL THEN
    v_target_max_booths := 1;
  END IF;

  -- Verify keep_booth_ids count is within target limit
  IF array_length(p_keep_booth_ids, 1) > v_target_max_booths THEN
    RAISE EXCEPTION 'Selected % booths but target plan allows only %', 
      array_length(p_keep_booth_ids, 1), v_target_max_booths;
  END IF;

  -- Verify all keep_booth_ids belong to this user
  SELECT COUNT(*) INTO v_current_booths
  FROM market_booths
  WHERE owner_id = v_uid AND id = ANY(p_keep_booth_ids) AND status != 'archived';
  
  IF v_current_booths != array_length(p_keep_booth_ids, 1) THEN
    RAISE EXCEPTION 'Some selected booths do not belong to you or are already archived';
  END IF;

  -- Calculate effective date: end of current billing period
  v_effective_at := COALESCE(v_current_sub.current_period_end, now() + interval '1 day');

  -- Store pending downgrade
  UPDATE seller_subscriptions SET
    pending_downgrade_plan = p_target_plan,
    pending_booth_keep_ids = p_keep_booth_ids,
    downgrade_effective_at = v_effective_at,
    updated_at = now()
  WHERE user_id = v_uid;

  RETURN jsonb_build_object(
    'success', true,
    'effective_at', v_effective_at,
    'target_plan', p_target_plan,
    'booths_to_keep', array_length(p_keep_booth_ids, 1),
    'booths_to_archive', (
      SELECT COUNT(*) FROM market_booths 
      WHERE owner_id = v_uid AND status != 'archived' AND NOT (id = ANY(p_keep_booth_ids))
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.initiate_downgrade(TEXT, UUID[]) TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- 10. process_pending_downgrades — daily cron function
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.process_pending_downgrades()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR v_sub IN
    SELECT * FROM seller_subscriptions
    WHERE pending_downgrade_plan IS NOT NULL
      AND downgrade_effective_at IS NOT NULL
      AND downgrade_effective_at <= now()
      AND status IN ('active', 'trialing')
  LOOP
    -- Mark booths NOT in the keep list for archival
    UPDATE market_booths
    SET marked_for_archival = true, updated_at = now()
    WHERE owner_id = v_sub.user_id
      AND COALESCE(marked_for_archival, false) = false
      AND NOT (v_sub.pending_booth_keep_ids IS NOT NULL AND id = ANY(v_sub.pending_booth_keep_ids));

    -- Update subscription to new plan
    UPDATE seller_subscriptions SET
      plan = v_sub.pending_downgrade_plan,
      pending_downgrade_plan = NULL,
      pending_booth_keep_ids = NULL,
      downgrade_effective_at = NULL,
      updated_at = now()
    WHERE user_id = v_sub.user_id;

    -- Update is_pro flag
    IF v_sub.pending_downgrade_plan = 'lite' THEN
      UPDATE profiles SET is_pro = false WHERE id = v_sub.user_id;
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_pending_downgrades() TO service_role;

-- Schedule daily cron for pending downgrades (1:00 AM UTC)
DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN PERFORM cron.unschedule('process-pending-downgrades'); EXCEPTION WHEN OTHERS THEN END;
    PERFORM cron.schedule('process-pending-downgrades', '0 1 * * *', $$SELECT process_pending_downgrades()$$);
  END IF;
END $outer$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 11. Update explicit data API grants for new table
-- ═══════════════════════════════════════════════════════════════════════════

GRANT SELECT ON public.crm_promo_buyer_discounts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_promo_buyer_discounts TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- 12. Drop legacy table (data already migrated in step 2)
-- ═══════════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS crm_recurring_user_incentives_blueprint CASCADE;
