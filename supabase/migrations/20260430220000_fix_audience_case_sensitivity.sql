-- Fix Case Sensitivity in Promotion Audience Checks

BEGIN;

CREATE OR REPLACE FUNCTION public.crm_check_promo_eligibility(p_promo_id uuid, p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_promo crm_promotions%ROWTYPE;
  v_is_registered boolean;
  v_audience_rpc text;
  v_is_in_audience boolean := false;
BEGIN
  SELECT * INTO v_promo FROM crm_promotions WHERE id = p_promo_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('eligible', false, 'error', 'Promotion not found');
  END IF;

  SELECT EXISTS(SELECT 1 FROM profiles WHERE lower(email) = lower(p_email)) INTO v_is_registered;

  IF v_is_registered AND NOT v_promo.allow_existing_users THEN
    RETURN jsonb_build_object('eligible', false, 'error', 'This promotion is for new users only. Please sign in normally.');
  END IF;

  IF v_promo.audience_id IS NOT NULL THEN
    SELECT audience_rpc_name INTO v_audience_rpc FROM crm_audiences WHERE id = v_promo.audience_id;
    IF v_audience_rpc IS NOT NULL THEN
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I() WHERE lower(email) = lower($1))', v_audience_rpc)
      INTO v_is_in_audience
      USING p_email;
      
      IF NOT v_is_in_audience THEN
        RETURN jsonb_build_object('eligible', false, 'error', 'You are not eligible for this targeted promotion.');
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('eligible', true, 'is_registered', v_is_registered);
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_enroll_in_promotion(p_promotion_id uuid, p_campaign_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_promo crm_promotions%ROWTYPE;
  v_blueprint crm_recurring_user_incentives_blueprint%ROWTYPE;
  v_stop_date TIMESTAMPTZ;
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

  -- 4. Verify: user_id not already in crm_promo_enrollments
  IF EXISTS (SELECT 1 FROM crm_promo_enrollments WHERE promotion_id = p_promotion_id AND user_id = v_uid) THEN
    RAISE EXCEPTION 'User already enrolled in this promotion';
  END IF;
  
  -- 5. Insert into crm_promo_enrollments (with campaign attribution!)
  INSERT INTO crm_promo_enrollments (promotion_id, user_id, campaign_id) VALUES (p_promotion_id, v_uid, p_campaign_id);
  
  -- 6. Increment current_enrollees
  UPDATE crm_promotions SET current_enrollees = current_enrollees + 1 WHERE id = p_promotion_id;

  -- 7. Issue Blueprint Credits (if applicable)
  SELECT * INTO v_blueprint FROM crm_recurring_user_incentives_blueprint WHERE promotion_id = p_promotion_id;
  IF FOUND THEN
    -- Calculate stop_date based on frequency and occurrences
    IF v_blueprint.frequency = 'monthly' THEN
      v_stop_date := v_blueprint.start_date + (v_blueprint.occurrences || ' months')::interval;
    ELSIF v_blueprint.frequency = 'weekly' THEN
      v_stop_date := v_blueprint.start_date + (v_blueprint.occurrences || ' weeks')::interval;
    ELSE
      v_stop_date := v_blueprint.start_date + interval '1 day';
    END IF;

    -- Upsert the user blueprint (active)
    INSERT INTO user_recurring_incentives (
      user_id,
      amount_usd,
      credit_type,
      cap_type,
      cap_value,
      frequency,
      start_date,
      stop_date,
      is_active
    ) VALUES (
      v_uid,
      v_blueprint.amount_usd,
      v_blueprint.credit_type,
      v_blueprint.cap_type,
      v_blueprint.cap_value,
      v_blueprint.frequency,
      v_blueprint.start_date,
      v_stop_date,
      true
    )
    ON CONFLICT (user_id) DO UPDATE SET
      amount_usd = EXCLUDED.amount_usd,
      credit_type = EXCLUDED.credit_type,
      cap_type = EXCLUDED.cap_type,
      cap_value = EXCLUDED.cap_value,
      frequency = EXCLUDED.frequency,
      start_date = EXCLUDED.start_date,
      stop_date = EXCLUDED.stop_date,
      is_active = true,
      updated_at = now();
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$function$;

COMMIT;
