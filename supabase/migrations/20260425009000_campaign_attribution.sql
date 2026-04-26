-- Add campaign_id to the enrollments table
ALTER TABLE crm_promo_enrollments ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES crm_campaigns(id) ON DELETE SET NULL;

-- Drop the old overloaded signature to prevent "300 Multiple Choices" ambiguous RPC calls
DROP FUNCTION IF EXISTS crm_enroll_in_promotion(UUID);

-- Update the crm_enroll_in_promotion RPC to accept campaign_id
CREATE OR REPLACE FUNCTION crm_enroll_in_promotion(p_promotion_id UUID, p_campaign_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_promo crm_promotions%ROWTYPE;
  v_blueprint crm_recurring_user_incentives_blueprint%ROWTYPE;
  v_stop_date TIMESTAMPTZ;
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

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

  -- 3. Verify: user_id not already in crm_promo_enrollments
  IF EXISTS (SELECT 1 FROM crm_promo_enrollments WHERE promotion_id = p_promotion_id AND user_id = v_uid) THEN
    RAISE EXCEPTION 'User already enrolled in this promotion';
  END IF;
  
  -- 4. Insert into crm_promo_enrollments (with campaign attribution!)
  INSERT INTO crm_promo_enrollments (promotion_id, user_id, campaign_id) VALUES (p_promotion_id, v_uid, p_campaign_id);
  
  -- 5. Increment current_enrollees
  UPDATE crm_promotions SET current_enrollees = current_enrollees + 1 WHERE id = p_promotion_id;

  -- 6. Issue Blueprint Credits (if applicable)
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
$$;
