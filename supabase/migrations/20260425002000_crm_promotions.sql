-- ============================================================
-- CRM Promotions and Incentive Blueprints
-- ============================================================

-- ─── 1. Base Promotion Limits ───────────────────────────────
CREATE TABLE IF NOT EXISTS crm_promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description_html TEXT,
  enrollment_deadline TIMESTAMPTZ NOT NULL,
  max_enrollees INT NOT NULL,
  current_enrollees INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 2. Specific Behavior: Giveaways ────────────────────────
CREATE TABLE IF NOT EXISTS crm_promo_giveaways (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id UUID NOT NULL REFERENCES crm_promotions(id) ON DELETE CASCADE,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  photos TEXT[] NOT NULL DEFAULT '{}',
  UNIQUE(promotion_id)
);

-- ─── 3. Specific Behavior: Recurring Credits (The Template) ─
CREATE TABLE IF NOT EXISTS crm_recurring_user_incentives_blueprint (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id UUID NOT NULL REFERENCES crm_promotions(id) ON DELETE CASCADE,
  amount_usd NUMERIC(10,2) NOT NULL CHECK (amount_usd > 0),
  credit_type credit_type NOT NULL DEFAULT 'purchase',
  cap_type credit_cap_type NOT NULL DEFAULT 'percentage',
  cap_value NUMERIC(10,2) NOT NULL,
  frequency expiration_frequency NOT NULL,  
  occurrences INT NOT NULL CHECK (occurrences > 0),                 
  start_date TIMESTAMPTZ NOT NULL,
  UNIQUE(promotion_id)
);

-- ─── 4. Ledger: Tracks who enrolled in what ─────────────────
CREATE TABLE IF NOT EXISTS crm_promo_enrollments (
  promotion_id UUID REFERENCES crm_promotions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (promotion_id, user_id)
);

-- ─── 5. Linking to CRM Hierarchy ────────────────────────────
-- Adding foreign keys to existing CRM tables
ALTER TABLE crm_campaigns ADD COLUMN IF NOT EXISTS promotion_id UUID REFERENCES crm_promotions(id) ON DELETE SET NULL;
ALTER TABLE crm_landing_pages ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES crm_campaigns(id) ON DELETE SET NULL;

-- ─── RLS Policies ───────────────────────────────────────────
ALTER TABLE crm_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_promo_giveaways ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_recurring_user_incentives_blueprint ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_promo_enrollments ENABLE ROW LEVEL SECURITY;

-- Anon and authenticated users can read promotions to render the landing page
CREATE POLICY crm_promotions_read ON crm_promotions
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY crm_promo_giveaways_read ON crm_promo_giveaways
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY crm_recurring_user_incentives_blueprint_read ON crm_recurring_user_incentives_blueprint
  FOR SELECT TO anon, authenticated USING (true);

-- Authenticated users can read their own enrollments
CREATE POLICY crm_promo_enrollments_read_own ON crm_promo_enrollments
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Staff can do everything
CREATE POLICY crm_promotions_staff_all ON crm_promotions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()));

CREATE POLICY crm_promo_giveaways_staff_all ON crm_promo_giveaways
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()));

CREATE POLICY crm_recurring_user_incentives_blueprint_staff_all ON crm_recurring_user_incentives_blueprint
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()));

CREATE POLICY crm_promo_enrollments_staff_all ON crm_promo_enrollments
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()));

-- ─── RPCs ───────────────────────────────────────────────────

-- 1. Secure check for existing email
CREATE OR REPLACE FUNCTION is_email_registered(p_email TEXT) 
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM auth.users WHERE email = p_email);
END;
$$;

-- 2. Securely enroll in a promotion
CREATE OR REPLACE FUNCTION crm_enroll_in_promotion(p_promotion_id UUID)
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
  
  -- 4. Insert into crm_promo_enrollments
  INSERT INTO crm_promo_enrollments (promotion_id, user_id) VALUES (p_promotion_id, v_uid);
  
  -- 5. Increment current_enrollees
  UPDATE crm_promotions SET current_enrollees = current_enrollees + 1 WHERE id = p_promotion_id;
  
  -- 6. Process Credits if a blueprint exists
  SELECT * INTO v_blueprint FROM crm_recurring_user_incentives_blueprint WHERE promotion_id = p_promotion_id;
  IF FOUND THEN
     -- Calculate v_stop_date based on frequency * occurrences
     IF v_blueprint.frequency = 'onetime' THEN
       v_stop_date := NULL;
     ELSIF v_blueprint.frequency = 'weekly' THEN
       v_stop_date := v_blueprint.start_date + (v_blueprint.occurrences || ' weeks')::INTERVAL;
     ELSIF v_blueprint.frequency = 'monthly' THEN
       v_stop_date := v_blueprint.start_date + (v_blueprint.occurrences || ' months')::INTERVAL;
     ELSIF v_blueprint.frequency = 'quarterly' THEN
       v_stop_date := v_blueprint.start_date + ((v_blueprint.occurrences * 3) || ' months')::INTERVAL;
     ELSIF v_blueprint.frequency = 'halfyearly' THEN
       v_stop_date := v_blueprint.start_date + ((v_blueprint.occurrences * 6) || ' months')::INTERVAL;
     ELSIF v_blueprint.frequency = 'yearly' THEN
       v_stop_date := v_blueprint.start_date + (v_blueprint.occurrences || ' years')::INTERVAL;
     END IF;
     
     -- Insert row into user_incentives for this specific user using the blueprint data
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
       TRUE,
       NULL -- System created
     );
  END IF;
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- Table Grants
GRANT SELECT ON public.crm_promotions TO anon, authenticated;
GRANT SELECT ON public.crm_promo_giveaways TO anon, authenticated;
GRANT SELECT ON public.crm_recurring_user_incentives_blueprint TO anon, authenticated;

GRANT SELECT, INSERT ON public.crm_promo_enrollments TO authenticated;

GRANT ALL ON public.crm_promotions TO authenticated;
GRANT ALL ON public.crm_promo_giveaways TO authenticated;
GRANT ALL ON public.crm_recurring_user_incentives_blueprint TO authenticated;
GRANT ALL ON public.crm_promo_enrollments TO authenticated;
