-- ─── 1. Experiments Schema ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_experiments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT UNIQUE NOT NULL,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm_experiment_variants (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id     UUID NOT NULL REFERENCES crm_experiments(id) ON DELETE CASCADE,
  slug              TEXT NOT NULL,
  name              TEXT NOT NULL,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  prior_conversions INTEGER NOT NULL DEFAULT 1,
  prior_failures    INTEGER NOT NULL DEFAULT 1,
  views_count       INTEGER NOT NULL DEFAULT 0,
  conversions_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(experiment_id, slug)
);

CREATE TABLE IF NOT EXISTS crm_experiment_assignments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anonymous_id  TEXT NOT NULL,
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  experiment_id UUID NOT NULL REFERENCES crm_experiments(id) ON DELETE CASCADE,
  variant_slug  TEXT NOT NULL,
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  converted_at  TIMESTAMPTZ,
  UNIQUE(anonymous_id, experiment_id)
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_crm_experiments_name ON crm_experiments(name);
CREATE INDEX IF NOT EXISTS idx_crm_experiment_variants_slug ON crm_experiment_variants(slug);
CREATE INDEX IF NOT EXISTS idx_crm_experiment_assignments_anon ON crm_experiment_assignments(anonymous_id);

-- Comments
COMMENT ON TABLE crm_experiments IS 'Stores A/B and Multi-Arm Bandit experiment definitions.';
COMMENT ON COLUMN crm_experiments.id IS 'Primary key UUID for the experiment.';
COMMENT ON COLUMN crm_experiments.name IS 'Unique name identifier for the experiment.';
COMMENT ON COLUMN crm_experiments.description IS 'Detailed description of the experiment purpose.';
COMMENT ON COLUMN crm_experiments.is_active IS 'Whether this experiment is currently running and accepting traffic.';
COMMENT ON COLUMN crm_experiments.created_at IS 'Timestamp when the experiment record was created.';

COMMENT ON TABLE crm_experiment_variants IS 'Stores variants/arms associated with each experiment.';
COMMENT ON COLUMN crm_experiment_variants.id IS 'Primary key UUID for the experiment variant.';
COMMENT ON COLUMN crm_experiment_variants.experiment_id IS 'Foreign key reference to crm_experiments.';
COMMENT ON COLUMN crm_experiment_variants.slug IS 'The URL or page path slug representing the variant.';
COMMENT ON COLUMN crm_experiment_variants.name IS 'Human-readable name of the variant.';
COMMENT ON COLUMN crm_experiment_variants.is_active IS 'Whether this variant is currently active in the bandit loop.';
COMMENT ON COLUMN crm_experiment_variants.prior_conversions IS 'Prior conversion successes parameter for Beta distribution prior.';
COMMENT ON COLUMN crm_experiment_variants.prior_failures IS 'Prior failures parameter for Beta distribution prior.';
COMMENT ON COLUMN crm_experiment_variants.views_count IS 'Total actual views/impressions received by this variant.';
COMMENT ON COLUMN crm_experiment_variants.conversions_count IS 'Total actual conversions achieved by this variant.';

COMMENT ON TABLE crm_experiment_assignments IS 'Stores sticky assignment of website visitors/users to experiment variants.';
COMMENT ON COLUMN crm_experiment_assignments.id IS 'Primary key UUID for the sticky assignment.';
COMMENT ON COLUMN crm_experiment_assignments.anonymous_id IS 'Anonymous visitor session identifier.';
COMMENT ON COLUMN crm_experiment_assignments.user_id IS 'Foreign key reference to auth.users if logged in.';
COMMENT ON COLUMN crm_experiment_assignments.experiment_id IS 'Foreign key reference to crm_experiments.';
COMMENT ON COLUMN crm_experiment_assignments.variant_slug IS 'The assigned variant slug.';
COMMENT ON COLUMN crm_experiment_assignments.assigned_at IS 'Timestamp when the assignment was first made.';
COMMENT ON COLUMN crm_experiment_assignments.converted_at IS 'Timestamp when the assigned visitor converted (if applicable).';

-- RLS Enablement
ALTER TABLE crm_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_experiment_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_experiment_assignments ENABLE ROW LEVEL SECURITY;

-- Policies
DO $$ BEGIN
  CREATE POLICY crm_experiments_select ON crm_experiments
    FOR SELECT TO anon, authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY crm_experiments_write ON crm_experiments
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY crm_experiment_variants_select ON crm_experiment_variants
    FOR SELECT TO anon, authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY crm_experiment_variants_write ON crm_experiment_variants
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY crm_experiment_assignments_select ON crm_experiment_assignments
    FOR SELECT TO anon, authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY crm_experiment_assignments_insert ON crm_experiment_assignments
    FOR INSERT TO anon, authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY crm_experiment_assignments_update ON crm_experiment_assignments
    FOR UPDATE TO anon, authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Grants
GRANT SELECT ON public.crm_experiments TO anon, authenticated;
GRANT SELECT ON public.crm_experiment_variants TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.crm_experiment_assignments TO anon, authenticated;


-- ─── 2. Thompson Sampling Functions ────────────────────────────────
CREATE OR REPLACE FUNCTION random_beta(p_alpha integer, p_beta integer)
RETURNS numeric AS $$
DECLARE
  v_x numeric := 0;
  v_y numeric := 0;
  i integer;
BEGIN
  IF p_alpha <= 0 THEN p_alpha := 1; END IF;
  IF p_beta <= 0 THEN p_beta := 1; END IF;

  FOR i IN 1..p_alpha LOOP
    v_x := v_x - ln(random());
  END LOOP;

  FOR i IN 1..p_beta LOOP
    v_y := v_y - ln(random());
  END LOOP;

  IF (v_x + v_y) = 0 THEN
    RETURN 0.5;
  END IF;

  RETURN v_x / (v_x + v_y);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_or_assign_bandit_variant(
  p_experiment_name text,
  p_anonymous_id text,
  p_user_id uuid DEFAULT NULL
)
RETURNS text AS $$
DECLARE
  v_experiment_id uuid;
  v_assigned_slug text;
BEGIN
  -- 1. Resolve experiment
  SELECT id INTO v_experiment_id FROM crm_experiments 
  WHERE name = p_experiment_name AND is_active = true;
  
  IF v_experiment_id IS NULL THEN
    RETURN '/create-listing-wizard'; -- default fallback
  END IF;

  -- 2. Check for existing sticky assignment
  SELECT variant_slug INTO v_assigned_slug 
  FROM crm_experiment_assignments
  WHERE anonymous_id = p_anonymous_id AND experiment_id = v_experiment_id;

  IF v_assigned_slug IS NOT NULL THEN
    RETURN v_assigned_slug;
  END IF;

  -- 3. Run Thompson Sampling
  WITH variant_draws AS (
    SELECT 
      slug,
      random_beta(
        COALESCE(prior_conversions, 1) + COALESCE(conversions_count, 0),
        COALESCE(prior_failures, 1) + COALESCE(views_count, 0) - COALESCE(conversions_count, 0)
      ) as draw_value
    FROM crm_experiment_variants
    WHERE experiment_id = v_experiment_id AND is_active = true
  )
  SELECT slug INTO v_assigned_slug 
  FROM variant_draws
  ORDER BY draw_value DESC, random()
  LIMIT 1;

  -- Fallback if no active variants
  IF v_assigned_slug IS NULL THEN
    RETURN '/create-listing-wizard';
  END IF;

  -- 4. Create sticky assignment
  INSERT INTO crm_experiment_assignments (anonymous_id, user_id, experiment_id, variant_slug)
  VALUES (p_anonymous_id, p_user_id, v_experiment_id, v_assigned_slug)
  ON CONFLICT (anonymous_id, experiment_id) DO NOTHING;

  -- 5. Increment views
  UPDATE crm_experiment_variants 
  SET views_count = views_count + 1 
  WHERE experiment_id = v_experiment_id AND slug = v_assigned_slug;

  RETURN v_assigned_slug;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION mark_experiment_conversion(
  p_anonymous_id text,
  p_experiment_name text
)
RETURNS void AS $$
DECLARE
  v_experiment_id uuid;
  v_assigned_slug text;
BEGIN
  SELECT id INTO v_experiment_id FROM crm_experiments 
  WHERE name = p_experiment_name AND is_active = true;

  IF v_experiment_id IS NULL THEN
    RETURN;
  END IF;

  SELECT variant_slug INTO v_assigned_slug 
  FROM crm_experiment_assignments
  WHERE anonymous_id = p_anonymous_id 
    AND experiment_id = v_experiment_id 
    AND converted_at IS NULL;

  IF v_assigned_slug IS NULL THEN
    RETURN;
  END IF;

  -- Mark converted
  UPDATE crm_experiment_assignments
  SET converted_at = now()
  WHERE anonymous_id = p_anonymous_id 
    AND experiment_id = v_experiment_id 
    AND converted_at IS NULL;

  -- Increment conversions
  UPDATE crm_experiment_variants
  SET conversions_count = conversions_count + 1
  WHERE experiment_id = v_experiment_id AND slug = v_assigned_slug;
END;
$$ LANGUAGE plpgsql;

-- ─── 3. Seed Experiments ──────────────────────────────────────────
INSERT INTO crm_experiments (name, description, is_active)
VALUES (
  'listing_wizard_v2',
  'Thompson Sampling experiment between standard and simple listing wizards',
  true
) ON CONFLICT (name) DO NOTHING;

INSERT INTO crm_experiment_variants (
  experiment_id,
  slug,
  name,
  prior_conversions,
  prior_failures,
  is_active
)
VALUES (
  (SELECT id FROM crm_experiments WHERE name = 'listing_wizard_v2'),
  '/create-listing-wizard',
  'Standard step-by-step listing wizard',
  10,
  90,
  true
),
(
  (SELECT id FROM crm_experiments WHERE name = 'listing_wizard_v2'),
  '/create-listing-simple',
  'Simple text and photo wizard',
  90,
  10,
  true
) ON CONFLICT (experiment_id, slug) DO NOTHING;

-- ─── 4. Register Landing Page ──────────────────────────────────────
INSERT INTO crm_landing_pages (slug, title, is_active)
VALUES ('/create-listing-wizard', 'Standard Listing Wizard', true)
ON CONFLICT (slug) DO NOTHING;
