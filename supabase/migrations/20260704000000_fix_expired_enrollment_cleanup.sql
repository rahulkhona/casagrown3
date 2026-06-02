-- ============================================================================
-- Fix: Expired Promotion Auto-Cleanup + Re-enrollment Support
-- ============================================================================
-- 1. Cron: sweep expired user_subscription_discounts (status → 'expired')
-- 2. Cron: remove stale crm_promo_enrollments when all discounts expired
-- 3. Fix crm_enroll_in_promotion: auto-cleanup stale enrollments before check
-- 4. Fix ON CONFLICT: allow re-enrollment when old discount is expired/revoked
-- ============================================================================

SET search_path TO public, extensions;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Sweep function: expire stale discount rows + cleanup enrollments
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.sweep_expired_subscription_discounts()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_expired_count INTEGER := 0;
  v_enrollment RECORD;
  v_has_active BOOLEAN;
BEGIN
  -- Step A: Mark expired discount rows
  UPDATE user_subscription_discounts
  SET status = 'expired'
  WHERE status = 'active'
    AND expires_at IS NOT NULL
    AND expires_at < now();

  GET DIAGNOSTICS v_expired_count = ROW_COUNT;

  -- Step B: Remove enrollment records where ALL discounts are expired/revoked
  FOR v_enrollment IN
    SELECT DISTINCT e.user_id, e.promotion_id
    FROM crm_promo_enrollments e
  LOOP
    -- Check if this enrollment has any still-active discounts
    SELECT EXISTS (
      SELECT 1 FROM user_subscription_discounts
      WHERE user_id = v_enrollment.user_id
        AND promotion_id = v_enrollment.promotion_id
        AND status = 'active'
        AND (expires_at IS NULL OR expires_at > now())
    ) INTO v_has_active;

    -- Also check for active buyer incentives
    IF NOT v_has_active THEN
      SELECT EXISTS (
        SELECT 1 FROM user_incentives
        WHERE user_id = v_enrollment.user_id
          AND is_active = true
          AND (stop_date IS NULL OR stop_date > now())
          AND created_by IS NULL  -- system-created via promotion
      ) INTO v_has_active;
    END IF;

    -- If no active benefits remain, remove the enrollment
    IF NOT v_has_active THEN
      DELETE FROM crm_promo_enrollments
      WHERE user_id = v_enrollment.user_id
        AND promotion_id = v_enrollment.promotion_id;

      UPDATE crm_promotions
      SET current_enrollees = GREATEST(current_enrollees - 1, 0)
      WHERE id = v_enrollment.promotion_id;

      RAISE NOTICE 'Cleaned up expired enrollment: user=%, promo=%',
        v_enrollment.user_id, v_enrollment.promotion_id;
    END IF;
  END LOOP;

  RETURN v_expired_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sweep_expired_subscription_discounts() TO service_role;

-- Schedule daily cron at 2:00 AM UTC (after pending downgrades at 1:00 AM)
DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN PERFORM cron.unschedule('sweep-expired-discounts'); EXCEPTION WHEN OTHERS THEN END;
    PERFORM cron.schedule('sweep-expired-discounts', '0 2 * * *', $$SELECT sweep_expired_subscription_discounts()$$);
  END IF;
END $outer$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Fix crm_enroll_in_promotion: auto-cleanup stale enrollments
--    + allow re-enrollment via ON CONFLICT DO UPDATE
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
  v_existing_enrollment RECORD;
  v_has_active_benefits BOOLEAN;
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

  -- 4. Single enrollment enforcement — with auto-cleanup of expired enrollments
  SELECT * INTO v_existing_enrollment
  FROM crm_promo_enrollments WHERE user_id = v_uid LIMIT 1;

  IF FOUND THEN
    -- Check if the existing enrollment still has active benefits
    SELECT EXISTS (
      SELECT 1 FROM user_subscription_discounts
      WHERE user_id = v_uid
        AND promotion_id = v_existing_enrollment.promotion_id
        AND status = 'active'
        AND (expires_at IS NULL OR expires_at > now())
    ) INTO v_has_active_benefits;

    -- Also check buyer incentives
    IF NOT v_has_active_benefits THEN
      SELECT EXISTS (
        SELECT 1 FROM user_incentives
        WHERE user_id = v_uid
          AND is_active = true
          AND (stop_date IS NULL OR stop_date > now())
          AND created_by IS NULL
      ) INTO v_has_active_benefits;
    END IF;

    IF v_has_active_benefits THEN
      -- Still has active benefits → block enrollment (must use crm_switch_promotion)
      RAISE EXCEPTION 'User already enrolled in a promotion with active benefits. Use crm_switch_promotion to switch.';
    ELSE
      -- All benefits expired → auto-cleanup stale enrollment
      -- Expire any remaining discount rows
      UPDATE user_subscription_discounts
      SET status = 'expired'
      WHERE user_id = v_uid
        AND promotion_id = v_existing_enrollment.promotion_id
        AND status = 'active';

      -- Deactivate any remaining incentives
      UPDATE user_incentives
      SET is_active = false
      WHERE user_id = v_uid
        AND is_active = true
        AND created_by IS NULL;

      -- Remove old enrollment
      DELETE FROM crm_promo_enrollments
      WHERE user_id = v_uid AND promotion_id = v_existing_enrollment.promotion_id;

      UPDATE crm_promotions
      SET current_enrollees = GREATEST(current_enrollees - 1, 0)
      WHERE id = v_existing_enrollment.promotion_id;
    END IF;
  END IF;
  
  -- 5. Insert into crm_promo_enrollments (with campaign attribution!)
  INSERT INTO crm_promo_enrollments (promotion_id, user_id, campaign_id) VALUES (p_promotion_id, v_uid, p_campaign_id);
  
  -- 6. Increment current_enrollees
  UPDATE crm_promotions SET current_enrollees = current_enrollees + 1 WHERE id = p_promotion_id;

  -- 7. Issue Buyer Discounts (if applicable) — reads from crm_promo_buyer_discounts
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
    -- ON CONFLICT: allow re-enrollment if old discount was expired or revoked
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
    ON CONFLICT (user_id, discount_id) DO UPDATE SET
      discount_pct = EXCLUDED.discount_pct,
      duration_months = EXCLUDED.duration_months,
      applied_at = EXCLUDED.applied_at,
      expires_at = EXCLUDED.expires_at,
      status = 'active',
      stripe_coupon_id = EXCLUDED.stripe_coupon_id,
      platform_fee_reduction_pct = EXCLUDED.platform_fee_reduction_pct,
      stripe_fee_handling_override = EXCLUDED.stripe_fee_handling_override
    WHERE user_subscription_discounts.status IN ('expired', 'revoked');
  END LOOP;

  RETURN jsonb_build_object('success', true);
END;
$function$;
