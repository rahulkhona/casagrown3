-- ============================================================
-- CRM Promo Subscription Discounts
--
-- Third incentive type for CRM Promotions Builder, alongside
-- giveaways (crm_promo_giveaways) and recurring credits
-- (crm_recurring_user_incentives_blueprint).
--
-- Offers a % discount on the Pro subscription price for N months
-- or in perpetuity. Applied when a user enrolls in a promotion
-- via a landing page.
-- ============================================================

-- ─── 1. Subscription Discount Blueprint ─────────────────────
CREATE TABLE IF NOT EXISTS crm_promo_subscription_discounts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id     UUID NOT NULL REFERENCES crm_promotions(id) ON DELETE CASCADE,

  -- Discount: 1–100%
  discount_pct     INTEGER NOT NULL CHECK (discount_pct BETWEEN 1 AND 100),

  -- Duration: NULL = perpetuity (forever at this rate)
  duration_months  INTEGER CHECK (duration_months IS NULL OR duration_months > 0),

  -- Stripe coupon (created when admin saves the promotion)
  stripe_coupon_id TEXT,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(promotion_id)
);

-- ─── 2. Per-user tracking of applied subscription discounts ──
CREATE TABLE IF NOT EXISTS user_subscription_discounts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  promotion_id     UUID NOT NULL REFERENCES crm_promotions(id) ON DELETE CASCADE,
  discount_id      UUID NOT NULL REFERENCES crm_promo_subscription_discounts(id) ON DELETE CASCADE,

  -- Snapshot of the discount at enrollment time
  discount_pct     INTEGER NOT NULL,
  duration_months  INTEGER,            -- NULL = perpetual

  -- Timing
  applied_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at       TIMESTAMPTZ,        -- computed: applied_at + duration_months, NULL = never

  -- Status
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active',      -- currently receiving discount
    'expired',     -- duration ended, reverted to standard pricing
    'revoked'      -- admin manually removed
  )),

  -- Stripe
  stripe_coupon_id TEXT,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One active discount per user
  UNIQUE(user_id, promotion_id)
);

-- ─── 3. RLS Policies ────────────────────────────────────────

ALTER TABLE crm_promo_subscription_discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscription_discounts ENABLE ROW LEVEL SECURITY;

-- Anon and authenticated can read discount blueprints (for landing page rendering)
CREATE POLICY crm_promo_sub_discounts_read ON crm_promo_subscription_discounts
  FOR SELECT TO anon, authenticated USING (true);

-- Staff can manage discount blueprints
CREATE POLICY crm_promo_sub_discounts_staff_all ON crm_promo_subscription_discounts
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()));

-- Users can read their own applied discounts
CREATE POLICY user_sub_discounts_read_own ON user_subscription_discounts
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Staff can manage all user discounts
CREATE POLICY user_sub_discounts_staff_all ON user_subscription_discounts
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()));

-- ─── 4. Grants ──────────────────────────────────────────────

GRANT SELECT ON public.crm_promo_subscription_discounts TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_promo_subscription_discounts TO authenticated;
GRANT ALL ON public.crm_promo_subscription_discounts TO service_role;

GRANT SELECT, INSERT ON public.user_subscription_discounts TO authenticated;
GRANT ALL ON public.user_subscription_discounts TO service_role;

-- ─── 5. Update enrollment function to apply subscription discounts ──

CREATE OR REPLACE FUNCTION public.crm_enroll_in_promotion(p_promotion_id uuid, p_campaign_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_promo crm_promotions%ROWTYPE;
  v_blueprint crm_recurring_user_incentives_blueprint%ROWTYPE;
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
    IF v_blueprint.frequency = 'onetime' THEN
      v_stop_date := NULL;
    ELSIF v_blueprint.frequency = 'monthly' THEN
      v_stop_date := v_blueprint.start_date + (v_blueprint.occurrences || ' months')::interval;
    ELSIF v_blueprint.frequency = 'weekly' THEN
      v_stop_date := v_blueprint.start_date + (v_blueprint.occurrences || ' weeks')::interval;
    ELSIF v_blueprint.frequency = 'quarterly' THEN
      v_stop_date := v_blueprint.start_date + ((v_blueprint.occurrences * 3) || ' months')::interval;
    ELSIF v_blueprint.frequency = 'halfyearly' THEN
      v_stop_date := v_blueprint.start_date + ((v_blueprint.occurrences * 6) || ' months')::interval;
    ELSIF v_blueprint.frequency = 'yearly' THEN
      v_stop_date := v_blueprint.start_date + (v_blueprint.occurrences || ' years')::interval;
    END IF;

    INSERT INTO user_incentives (
      user_id,
      amount_usd,
      credit_type,
      cap_type,
      cap_value,
      expiration_frequency,
      start_date,
      stop_date,
      is_active,
      created_by
    ) VALUES (
      v_uid,
      v_blueprint.amount_usd,
      v_blueprint.credit_type,
      v_blueprint.cap_type,
      v_blueprint.cap_value,
      v_blueprint.frequency,
      v_blueprint.start_date,
      v_stop_date,
      true,
      NULL  -- system-created via promotion enrollment
    );
  END IF;

  -- 8. Apply Pro Subscription Discount (if applicable)
  SELECT * INTO v_sub_discount FROM crm_promo_subscription_discounts WHERE promotion_id = p_promotion_id;
  IF FOUND THEN
    -- Calculate expiration
    IF v_sub_discount.duration_months IS NOT NULL THEN
      v_expires_at := now() + (v_sub_discount.duration_months || ' months')::interval;
    ELSE
      v_expires_at := NULL;  -- perpetual
    END IF;

    -- Record the applied discount for this user
    INSERT INTO user_subscription_discounts (
      user_id,
      promotion_id,
      discount_id,
      discount_pct,
      duration_months,
      applied_at,
      expires_at,
      status,
      stripe_coupon_id
    ) VALUES (
      v_uid,
      p_promotion_id,
      v_sub_discount.id,
      v_sub_discount.discount_pct,
      v_sub_discount.duration_months,
      now(),
      v_expires_at,
      'active',
      v_sub_discount.stripe_coupon_id
    );
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$function$;
