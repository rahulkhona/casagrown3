-- Migration: MAB RPCs, Sequence Experiments Schema, and Event Trigger Interception
-- Purely additive tables and trigger overrides.

-- 1. Sequence Experiments Tables
CREATE TABLE IF NOT EXISTS crm_sequence_experiments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT UNIQUE NOT NULL,
  description       TEXT,
  trigger_event     TEXT NOT NULL,      -- e.g. 'lead.created', 'user.first_login'
  conversion_event  TEXT NOT NULL DEFAULT 'lead_converted', -- lead_converted | purchase_completed | sale_completed
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm_sequence_experiment_variants (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id     UUID NOT NULL REFERENCES crm_sequence_experiments(id) ON DELETE CASCADE,
  sequence_id       UUID REFERENCES crm_sequences(id) ON DELETE CASCADE,
  prior_alpha       INTEGER NOT NULL DEFAULT 1,
  prior_beta        INTEGER NOT NULL DEFAULT 9,
  sends_count       INTEGER NOT NULL DEFAULT 0, -- number of enrollments routed to this variant
  conversions_count INTEGER NOT NULL DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(experiment_id, sequence_id)
);

COMMENT ON TABLE crm_sequence_experiments IS 'Defines A/B testing experiments that route users to different sequence journeys.';
COMMENT ON COLUMN crm_sequence_experiments.id IS 'Primary key UUID.';
COMMENT ON COLUMN crm_sequence_experiments.name IS 'Internal name of the sequence experiment.';
COMMENT ON COLUMN crm_sequence_experiments.description IS 'Optional description.';
COMMENT ON COLUMN crm_sequence_experiments.trigger_event IS 'The event trigger that initiates routing (e.g. lead.created).';
COMMENT ON COLUMN crm_sequence_experiments.conversion_event IS 'The downstream conversion event to measure against.';
COMMENT ON COLUMN crm_sequence_experiments.is_active IS 'Whether this experiment is currently routing users.';
COMMENT ON COLUMN crm_sequence_experiments.created_at IS 'Creation timestamp.';

COMMENT ON TABLE crm_sequence_experiment_variants IS 'The specific sequence variants attached to an experiment.';
COMMENT ON COLUMN crm_sequence_experiment_variants.id IS 'Primary key UUID.';
COMMENT ON COLUMN crm_sequence_experiment_variants.experiment_id IS 'Associated experiment ID.';
COMMENT ON COLUMN crm_sequence_experiment_variants.sequence_id IS 'The sequence journey to route the user into.';
COMMENT ON COLUMN crm_sequence_experiment_variants.prior_alpha IS 'The Alpha prior for the Beta distribution.';
COMMENT ON COLUMN crm_sequence_experiment_variants.prior_beta IS 'The Beta prior for the Beta distribution.';
COMMENT ON COLUMN crm_sequence_experiment_variants.sends_count IS 'Number of times users were routed to this sequence variant.';
COMMENT ON COLUMN crm_sequence_experiment_variants.conversions_count IS 'Number of conversions attributed to this variant.';
COMMENT ON COLUMN crm_sequence_experiment_variants.is_active IS 'Active status flag.';
COMMENT ON COLUMN crm_sequence_experiment_variants.created_at IS 'Creation timestamp.';

CREATE INDEX IF NOT EXISTS idx_crm_sequence_experiments_trigger
  ON crm_sequence_experiments(trigger_event) WHERE is_active = true;

-- RLS Enablement
ALTER TABLE crm_sequence_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_sequence_experiment_variants ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY crm_seq_exp_staff_all ON crm_sequence_experiments
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY crm_seq_exp_var_staff_all ON crm_sequence_experiment_variants
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_sequence_experiments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_sequence_experiment_variants TO authenticated;


-- 2. Thompson Sampling Selection Functions

-- Thompson Sampling for step-level (node) copy variants
CREATE OR REPLACE FUNCTION get_message_variant_for_node(
  p_sequence_id UUID,
  p_node_id TEXT
)
RETURNS UUID AS $$
DECLARE
  v_variant_id UUID;
BEGIN
  -- Select winning variant
  SELECT id INTO v_variant_id
  FROM (
    SELECT
      id,
      random_beta(
        prior_alpha + conversions_count,
        prior_beta + sends_count - conversions_count
      ) AS draw
    FROM crm_message_variants
    WHERE sequence_id = p_sequence_id
      AND node_id = p_node_id
      AND is_active = true
    ORDER BY draw DESC, random()
    LIMIT 1
  ) t;

  -- Increment sends_count atomically on selection
  IF v_variant_id IS NOT NULL THEN
    UPDATE crm_message_variants
    SET sends_count = sends_count + 1
    WHERE id = v_variant_id;
  END IF;

  RETURN v_variant_id;
END;
$$ LANGUAGE plpgsql;

-- Thompson Sampling for campaign-level copy variants
CREATE OR REPLACE FUNCTION get_message_variant_for_campaign(
  p_campaign_id UUID
)
RETURNS UUID AS $$
DECLARE
  v_variant_id UUID;
BEGIN
  -- Select winning variant
  SELECT id INTO v_variant_id
  FROM (
    SELECT
      id,
      random_beta(
        prior_alpha + conversions_count,
        prior_beta + sends_count - conversions_count
      ) AS draw
    FROM crm_message_variants
    WHERE campaign_id = p_campaign_id
      AND is_active = true
    ORDER BY draw DESC, random()
    LIMIT 1
  ) t;

  -- Increment sends_count atomically on selection
  IF v_variant_id IS NOT NULL THEN
    UPDATE crm_message_variants
    SET sends_count = sends_count + 1
    WHERE id = v_variant_id;
  END IF;

  RETURN v_variant_id;
END;
$$ LANGUAGE plpgsql;

-- Bulk increment function for edge functions
CREATE OR REPLACE FUNCTION increment_message_variant_sends_by(
  p_variant_id UUID,
  p_inc INTEGER
)
RETURNS VOID AS $$
BEGIN
  UPDATE crm_message_variants
  SET sends_count = sends_count + p_inc
  WHERE id = p_variant_id;
END;
$$ LANGUAGE plpgsql;

-- Thompson Sampling for sequence-level journey splits
CREATE OR REPLACE FUNCTION get_sequence_variant_for_trigger(
  p_trigger_event TEXT
)
RETURNS UUID AS $$
DECLARE
  v_sequence_id UUID;
  v_experiment_id UUID;
BEGIN
  -- 1. Find active sequence experiment for this trigger
  SELECT id INTO v_experiment_id
  FROM crm_sequence_experiments
  WHERE trigger_event = p_trigger_event
    AND is_active = true
  LIMIT 1;

  IF v_experiment_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- 2. Draw winning variant using random_beta
  SELECT sequence_id INTO v_sequence_id
  FROM (
    SELECT
      sequence_id,
      random_beta(
        prior_alpha + conversions_count,
        prior_beta + sends_count - conversions_count
      ) AS draw
    FROM crm_sequence_experiment_variants
    WHERE experiment_id = v_experiment_id
      AND is_active = true
    ORDER BY draw DESC, random()
    LIMIT 1
  ) t;

  -- 3. Increment enrollment routing count (sends_count)
  IF v_sequence_id IS NOT NULL THEN
    UPDATE crm_sequence_experiment_variants
    SET sends_count = sends_count + 1
    WHERE experiment_id = v_experiment_id AND sequence_id = v_sequence_id;
  END IF;

  RETURN v_sequence_id;
END;
$$ LANGUAGE plpgsql;


-- 3. Sequence Trigger Interceptions (CREATE OR REPLACE Trigger Functions)

-- Lead Created
CREATE OR REPLACE FUNCTION trg_sequence_lead_created()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_seq RECORD;
  v_mab_seq_id UUID;
BEGIN
  -- Check for active sequence experiment routing first
  v_mab_seq_id := get_sequence_variant_for_trigger('lead.created');

  IF v_mab_seq_id IS NOT NULL THEN
    BEGIN
      PERFORM call_enroll_in_sequence(
        v_mab_seq_id,
        jsonb_build_array(
          jsonb_build_object('recipient_type', 'lead', 'recipient_id', NEW.id)
        )
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'trg_sequence_lead_created (MAB): enrollment failed for sequence %, lead %: %', v_mab_seq_id, NEW.id, SQLERRM;
    END;
  ELSE
    -- Default: Fall back to enrolling into all active sequences with trigger_event = 'lead.created'
    FOR v_seq IN
      SELECT id FROM crm_sequences
      WHERE trigger_event = 'lead.created'
        AND status = 'active'
    LOOP
      BEGIN
        PERFORM call_enroll_in_sequence(
          v_seq.id,
          jsonb_build_array(
            jsonb_build_object('recipient_type', 'lead', 'recipient_id', NEW.id)
          )
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'trg_sequence_lead_created: enrollment failed for sequence %, lead %: %', v_seq.id, NEW.id, SQLERRM;
      END;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- User First Login
CREATE OR REPLACE FUNCTION trg_sequence_user_first_login()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_seq RECORD;
  v_mab_seq_id UUID;
BEGIN
  -- Only fire when profile_completed_at goes from NULL → NOT NULL
  IF OLD.profile_completed_at IS NOT NULL OR NEW.profile_completed_at IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check for active sequence experiment routing
  v_mab_seq_id := get_sequence_variant_for_trigger('user.first_login');

  IF v_mab_seq_id IS NOT NULL THEN
    BEGIN
      PERFORM call_enroll_in_sequence(
        v_mab_seq_id,
        jsonb_build_array(
          jsonb_build_object('recipient_type', 'user', 'recipient_id', NEW.id)
        )
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'trg_sequence_user_first_login (MAB): enrollment failed for sequence %, user %: %', v_mab_seq_id, NEW.id, SQLERRM;
    END;
  ELSE
    -- Fall back to standard behavior
    FOR v_seq IN
      SELECT id FROM crm_sequences
      WHERE trigger_event = 'user.first_login'
        AND status = 'active'
    LOOP
      BEGIN
        PERFORM call_enroll_in_sequence(
          v_seq.id,
          jsonb_build_array(
            jsonb_build_object('recipient_type', 'user', 'recipient_id', NEW.id)
          )
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'trg_sequence_user_first_login: enrollment failed for sequence %, user %: %', v_seq.id, NEW.id, SQLERRM;
      END;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- Purchase Completed
CREATE OR REPLACE FUNCTION trg_sequence_purchase_completed()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_seq RECORD;
  v_mab_seq_id UUID;
BEGIN
  -- Only fire when status transitions TO 'completed'
  IF OLD.status = 'completed' OR NEW.status != 'completed' THEN
    RETURN NEW;
  END IF;

  -- Check for active sequence experiment routing
  v_mab_seq_id := get_sequence_variant_for_trigger('market_orders.purchase_completed');

  IF v_mab_seq_id IS NOT NULL THEN
    BEGIN
      PERFORM call_enroll_in_sequence(
        v_mab_seq_id,
        jsonb_build_array(
          jsonb_build_object('recipient_type', 'user', 'recipient_id', NEW.buyer_id)
        )
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'trg_sequence_purchase_completed (MAB): enrollment failed for sequence %, buyer %: %', v_mab_seq_id, NEW.buyer_id, SQLERRM;
    END;
  ELSE
    -- Fall back to standard behavior
    FOR v_seq IN
      SELECT id FROM crm_sequences
      WHERE trigger_event = 'market_orders.purchase_completed'
        AND status = 'active'
    LOOP
      BEGIN
        PERFORM call_enroll_in_sequence(
          v_seq.id,
          jsonb_build_array(
            jsonb_build_object('recipient_type', 'user', 'recipient_id', NEW.buyer_id)
          )
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'trg_sequence_purchase_completed: enrollment failed for sequence %, buyer %: %', v_seq.id, NEW.buyer_id, SQLERRM;
      END;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- Sale Completed
CREATE OR REPLACE FUNCTION trg_sequence_sale_completed()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_seq RECORD;
  v_mab_seq_id UUID;
BEGIN
  -- Only fire when status transitions TO 'completed'
  IF OLD.status = 'completed' OR NEW.status != 'completed' THEN
    RETURN NEW;
  END IF;

  -- Check for active sequence experiment routing
  v_mab_seq_id := get_sequence_variant_for_trigger('market_orders.sale_completed');

  IF v_mab_seq_id IS NOT NULL THEN
    BEGIN
      PERFORM call_enroll_in_sequence(
        v_mab_seq_id,
        jsonb_build_array(
          jsonb_build_object('recipient_type', 'user', 'recipient_id', NEW.seller_id)
        )
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'trg_sequence_sale_completed (MAB): enrollment failed for sequence %, seller %: %', v_mab_seq_id, NEW.seller_id, SQLERRM;
    END;
  ELSE
    -- Fall back to standard behavior
    FOR v_seq IN
      SELECT id FROM crm_sequences
      WHERE trigger_event = 'market_orders.sale_completed'
        AND status = 'active'
    LOOP
      BEGIN
        PERFORM call_enroll_in_sequence(
          v_seq.id,
          jsonb_build_array(
            jsonb_build_object('recipient_type', 'user', 'recipient_id', NEW.seller_id)
          )
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'trg_sequence_sale_completed: enrollment failed for sequence %, seller %: %', v_seq.id, NEW.seller_id, SQLERRM;
      END;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;
