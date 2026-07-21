-- Migration: CRM Predefined MAB Metrics
-- Purely additive DDL, zero downtime.

-- 1. Add completed_at column to crm_sequence_enrollments
ALTER TABLE crm_sequence_enrollments ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
COMMENT ON COLUMN crm_sequence_enrollments.completed_at IS 'Timestamp when the enrollment reached terminal state or completed.';

-- Trigger to automatically stamp completed_at when status becomes completed
CREATE OR REPLACE FUNCTION trg_set_completed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    NEW.completed_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_completed_at_event ON crm_sequence_enrollments;
CREATE TRIGGER trg_set_completed_at_event
  BEFORE UPDATE ON crm_sequence_enrollments
  FOR EACH ROW
  EXECUTE FUNCTION trg_set_completed_at();

-- Backfill completed_at for existing terminal/completed sequence enrollments
UPDATE crm_sequence_enrollments enroll
SET completed_at = COALESCE(
  (
    SELECT max(s.sent_at)
    FROM crm_campaign_sends s
    WHERE s.recipient_id = enroll.recipient_id
      AND s.sequence_id = enroll.sequence_id
  ),
  enroll.enrolled_at
)
WHERE enroll.status IN ('completed', 'unsubscribed', 'failed')
  AND enroll.completed_at IS NULL;


-- 2. Expand crm_message_variants with pre-defined metrics columns
ALTER TABLE crm_message_variants ADD COLUMN IF NOT EXISTS listings_created_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE crm_message_variants ADD COLUMN IF NOT EXISTS accounts_created_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE crm_message_variants ADD COLUMN IF NOT EXISTS profiles_completed_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE crm_message_variants ADD COLUMN IF NOT EXISTS optimize_metric TEXT NOT NULL DEFAULT 'clicks'; -- opens | clicks | listings | accounts | profiles

COMMENT ON COLUMN crm_message_variants.listings_created_count IS 'Attributed products created via this variant.';
COMMENT ON COLUMN crm_message_variants.accounts_created_count IS 'Attributed accounts registered via this variant.';
COMMENT ON COLUMN crm_message_variants.profiles_completed_count IS 'Attributed profiles completed via this variant.';
COMMENT ON COLUMN crm_message_variants.optimize_metric IS 'Metric that Thompson Sampling optimizes for: opens, clicks, listings, accounts, or profiles.';


-- 3. Dynamic Selection Functions using optimize_metric
CREATE OR REPLACE FUNCTION get_message_variant_for_node(
  p_sequence_id UUID,
  p_node_id TEXT
)
RETURNS UUID AS $$
DECLARE
  v_variant_id UUID;
BEGIN
  SELECT id INTO v_variant_id
  FROM (
    SELECT
      id,
      random_beta(
        prior_alpha + CASE 
          WHEN optimize_metric = 'opens' THEN opens_count
          WHEN optimize_metric = 'clicks' THEN clicks_count
          WHEN optimize_metric = 'listings' THEN listings_created_count
          WHEN optimize_metric = 'accounts' THEN accounts_created_count
          WHEN optimize_metric = 'profiles' THEN profiles_completed_count
          ELSE clicks_count
        END,
        prior_beta + sends_count - CASE 
          WHEN optimize_metric = 'opens' THEN opens_count
          WHEN optimize_metric = 'clicks' THEN clicks_count
          WHEN optimize_metric = 'listings' THEN listings_created_count
          WHEN optimize_metric = 'accounts' THEN accounts_created_count
          WHEN optimize_metric = 'profiles' THEN profiles_completed_count
          ELSE clicks_count
        END
      ) AS draw
    FROM crm_message_variants
    WHERE sequence_id = p_sequence_id
      AND node_id = p_node_id
      AND is_active = true
    ORDER BY draw DESC, random()
    LIMIT 1
  ) t;

  IF v_variant_id IS NOT NULL THEN
    UPDATE crm_message_variants
    SET sends_count = sends_count + 1
    WHERE id = v_variant_id;
  END IF;

  RETURN v_variant_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_message_variant_for_campaign(
  p_campaign_id UUID
)
RETURNS UUID AS $$
DECLARE
  v_variant_id UUID;
BEGIN
  SELECT id INTO v_variant_id
  FROM (
    SELECT
      id,
      random_beta(
        prior_alpha + CASE 
          WHEN optimize_metric = 'opens' THEN opens_count
          WHEN optimize_metric = 'clicks' THEN clicks_count
          WHEN optimize_metric = 'listings' THEN listings_created_count
          WHEN optimize_metric = 'accounts' THEN accounts_created_count
          WHEN optimize_metric = 'profiles' THEN profiles_completed_count
          ELSE clicks_count
        END,
        prior_beta + sends_count - CASE 
          WHEN optimize_metric = 'opens' THEN opens_count
          WHEN optimize_metric = 'clicks' THEN clicks_count
          WHEN optimize_metric = 'listings' THEN listings_created_count
          WHEN optimize_metric = 'accounts' THEN accounts_created_count
          WHEN optimize_metric = 'profiles' THEN profiles_completed_count
          ELSE clicks_count
        END
      ) AS draw
    FROM crm_message_variants
    WHERE campaign_id = p_campaign_id
      AND is_active = true
    ORDER BY draw DESC, random()
    LIMIT 1
  ) t;

  IF v_variant_id IS NOT NULL THEN
    UPDATE crm_message_variants
    SET sends_count = sends_count + 1
    WHERE id = v_variant_id;
  END IF;

  RETURN v_variant_id;
END;
$$ LANGUAGE plpgsql;


-- 4. Dynamic Journey Experiments Conversions Calculation
CREATE OR REPLACE FUNCTION calculate_journey_conversions(p_experiment_id UUID)
RETURNS TABLE (
  sequence_id UUID,
  sends_count INTEGER,
  conversions_count INTEGER
) AS $$
DECLARE
  v_metric TEXT;
BEGIN
  -- Read targeted conversion metric name
  SELECT conversion_event INTO v_metric
  FROM crm_sequence_experiments
  WHERE id = p_experiment_id;

  RETURN QUERY
  SELECT 
    ev.sequence_id,
    ev.sends_count,
    CASE 
      WHEN v_metric = 'listings_created' THEN
        -- Count listings created during sequence active window + 7 days grace
        (
          SELECT COUNT(DISTINCT p.id)::INTEGER
          FROM market_products p
          JOIN crm_sequence_enrollments enroll ON enroll.recipient_id = p.seller_id
          WHERE enroll.sequence_id = ev.sequence_id
            AND enroll.recipient_type = 'user'
            AND p.created_at >= enroll.enrolled_at
            AND p.created_at <= COALESCE(enroll.completed_at, now()) + INTERVAL '7 days'
        )
      WHEN v_metric = 'accounts_created' THEN
        -- Count converted leads within active window + 7 days grace (mapped by email match)
        (
          SELECT COUNT(DISTINCT l.id)::INTEGER
          FROM crm_leads l
          JOIN crm_sequence_enrollments enroll ON enroll.recipient_id = l.id
          JOIN profiles pr ON pr.email = l.email
          WHERE enroll.sequence_id = ev.sequence_id
            AND enroll.recipient_type = 'lead'
            AND pr.created_at >= enroll.enrolled_at
            AND pr.created_at <= COALESCE(enroll.completed_at, now()) + INTERVAL '7 days'
        )
      WHEN v_metric = 'profiles_completed' THEN
        -- Count completed profiles within active window + 7 days grace
        (
          SELECT COUNT(DISTINCT pr.id)::INTEGER
          FROM profiles pr
          JOIN crm_sequence_enrollments enroll ON enroll.recipient_id = pr.id
          WHERE enroll.sequence_id = ev.sequence_id
            AND enroll.recipient_type = 'user'
            AND pr.profile_completed_at IS NOT NULL
            AND pr.profile_completed_at >= enroll.enrolled_at
            AND pr.profile_completed_at <= COALESCE(enroll.completed_at, now()) + INTERVAL '7 days'
        )
      ELSE
        -- Fallback to standard variant conversion_count column
        ev.conversions_count
    END AS conversions_count
  FROM crm_sequence_experiment_variants ev
  WHERE ev.experiment_id = p_experiment_id;
END;
$$ LANGUAGE plpgsql;

-- 4.5. Dynamic Journey Experiments All Metrics Breakdown
CREATE OR REPLACE FUNCTION calculate_journey_metrics_breakdown(p_experiment_id UUID)
RETURNS TABLE (
  sequence_id UUID,
  listings_created INTEGER,
  accounts_created INTEGER,
  profiles_completed INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ev.sequence_id,
    -- Count listings created during sequence active window + 7 days grace
    (
      SELECT COUNT(DISTINCT p.id)::INTEGER
      FROM market_products p
      JOIN crm_sequence_enrollments enroll ON enroll.recipient_id = p.seller_id
      WHERE enroll.sequence_id = ev.sequence_id
        AND enroll.recipient_type = 'user'
        AND p.created_at >= enroll.enrolled_at
        AND p.created_at <= COALESCE(enroll.completed_at, now()) + INTERVAL '7 days'
    ) AS listings_created,
    (
      SELECT COUNT(DISTINCT l.id)::INTEGER
      FROM crm_leads l
      JOIN crm_sequence_enrollments enroll ON enroll.recipient_id = l.id
      JOIN profiles pr ON pr.email = l.email
      WHERE enroll.sequence_id = ev.sequence_id
        AND enroll.recipient_type = 'lead'
        AND pr.created_at >= enroll.enrolled_at
        AND pr.created_at <= COALESCE(enroll.completed_at, now()) + INTERVAL '7 days'
    ) AS accounts_created,
    -- Count completed profiles within active window + 7 days grace
    (
      SELECT COUNT(DISTINCT pr.id)::INTEGER
      FROM profiles pr
      JOIN crm_sequence_enrollments enroll ON enroll.recipient_id = pr.id
      WHERE enroll.sequence_id = ev.sequence_id
        AND enroll.recipient_type = 'user'
        AND pr.profile_completed_at IS NOT NULL
        AND pr.profile_completed_at >= enroll.enrolled_at
        AND pr.profile_completed_at <= COALESCE(enroll.completed_at, now()) + INTERVAL '7 days'
    ) AS profiles_completed
  FROM crm_sequence_experiment_variants ev
  WHERE ev.experiment_id = p_experiment_id;
END;
$$ LANGUAGE plpgsql;


-- 5. Trigger functions for link-attributed message conversions

-- Trigger A: Accounts Created (New profile inserted - check matching lead by email)
CREATE OR REPLACE FUNCTION trg_mab_message_account_created()
RETURNS TRIGGER AS $$
DECLARE
  v_lead_id UUID;
  v_variant_id UUID;
BEGIN
  -- Find lead with matching email
  SELECT id INTO v_lead_id
  FROM crm_leads
  WHERE email = NEW.email
  LIMIT 1;

  IF v_lead_id IS NOT NULL THEN
    -- Find the last page visit variant ID for this lead
    SELECT variant_id INTO v_variant_id
    FROM crm_page_visits
    WHERE lead_id = v_lead_id AND variant_id IS NOT NULL
    ORDER BY visited_at DESC
    LIMIT 1;

    IF v_variant_id IS NOT NULL THEN
      UPDATE crm_message_variants
      SET accounts_created_count = accounts_created_count + 1
      WHERE id = v_variant_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mab_message_account_created_event ON profiles;
CREATE TRIGGER trg_mab_message_account_created_event
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION trg_mab_message_account_created();

-- Trigger B: Profiles Completed (profile_completed_at is populated)
CREATE OR REPLACE FUNCTION trg_mab_message_profile_completed()
RETURNS TRIGGER AS $$
DECLARE
  v_lead_id UUID;
  v_variant_id UUID;
BEGIN
  IF NEW.profile_completed_at IS NOT NULL AND OLD.profile_completed_at IS NULL THEN
    -- Find the associated lead by email match
    SELECT id INTO v_lead_id
    FROM crm_leads
    WHERE email = NEW.email
    LIMIT 1;

    IF v_lead_id IS NOT NULL THEN
      SELECT variant_id INTO v_variant_id
      FROM crm_page_visits
      WHERE lead_id = v_lead_id AND variant_id IS NOT NULL
      ORDER BY visited_at DESC
      LIMIT 1;

      IF v_variant_id IS NOT NULL THEN
        UPDATE crm_message_variants
        SET profiles_completed_count = profiles_completed_count + 1
        WHERE id = v_variant_id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mab_message_profile_completed_event ON profiles;
CREATE TRIGGER trg_mab_message_profile_completed_event
  AFTER UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION trg_mab_message_profile_completed();

-- Trigger C: Listings Created (New product inserted in market_products)
CREATE OR REPLACE FUNCTION trg_mab_message_listing_created()
RETURNS TRIGGER AS $$
DECLARE
  v_email TEXT;
  v_lead_id UUID;
  v_variant_id UUID;
BEGIN
  IF NEW.seller_id IS NOT NULL THEN
    -- Find email associated with this seller
    SELECT email INTO v_email
    FROM profiles
    WHERE id = NEW.seller_id
    LIMIT 1;

    IF v_email IS NOT NULL THEN
      -- Find lead associated with this email
      SELECT id INTO v_lead_id
      FROM crm_leads
      WHERE email = v_email
      LIMIT 1;

      IF v_lead_id IS NOT NULL THEN
        SELECT variant_id INTO v_variant_id
        FROM crm_page_visits
        WHERE lead_id = v_lead_id AND variant_id IS NOT NULL
        ORDER BY visited_at DESC
        LIMIT 1;

        IF v_variant_id IS NOT NULL THEN
          UPDATE crm_message_variants
          SET listings_created_count = listings_created_count + 1
          WHERE id = v_variant_id;
        END IF;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mab_message_listing_created_event ON market_products;
CREATE TRIGGER trg_mab_message_listing_created_event
  AFTER INSERT ON market_products
  FOR EACH ROW
  EXECUTE FUNCTION trg_mab_message_listing_created();
