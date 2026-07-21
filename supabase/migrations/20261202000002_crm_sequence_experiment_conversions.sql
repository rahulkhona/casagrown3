-- Migration: Add sequence-level experiment conversion attribution triggers
-- Purely additive DDL, zero downtime.

-- 1. General attribution helper function
CREATE OR REPLACE FUNCTION track_sequence_experiment_conversion(
  p_recipient_id UUID,
  p_recipient_type TEXT,
  p_conversion_event TEXT
)
RETURNS VOID AS $$
DECLARE
  v_variant RECORD;
BEGIN
  -- Look for active experiment variants that this recipient is/was enrolled in
  -- where the experiment's target conversion_event matches the one that just fired.
  FOR v_variant IN
    SELECT ev.experiment_id, ev.sequence_id
    FROM crm_sequence_experiment_variants ev
    JOIN crm_sequence_experiments e ON e.id = ev.experiment_id
    JOIN crm_sequence_enrollments enroll ON enroll.sequence_id = ev.sequence_id
    WHERE e.is_active = true
      AND ev.is_active = true
      AND e.conversion_event = p_conversion_event
      AND enroll.recipient_id = p_recipient_id
      AND enroll.recipient_type = p_recipient_type
  LOOP
    UPDATE crm_sequence_experiment_variants
    SET conversions_count = conversions_count + 1
    WHERE experiment_id = v_variant.experiment_id AND sequence_id = v_variant.sequence_id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 2. Trigger function for Lead Converted (status -> converted)
CREATE OR REPLACE FUNCTION trg_mab_lead_converted()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status = 'converted' AND (OLD.status IS NULL OR OLD.status != 'converted') THEN
    PERFORM track_sequence_experiment_conversion(NEW.id, 'lead', 'lead_converted');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mab_lead_converted_event ON crm_leads;
CREATE TRIGGER trg_mab_lead_converted_event
  AFTER UPDATE ON crm_leads
  FOR EACH ROW
  EXECUTE FUNCTION trg_mab_lead_converted();

-- 3. Trigger function for Order Completed (Buyer & Seller conversions)
CREATE OR REPLACE FUNCTION trg_mab_order_completed()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    -- Track conversion for buyer (purchase_completed)
    IF NEW.buyer_id IS NOT NULL THEN
      PERFORM track_sequence_experiment_conversion(NEW.buyer_id, 'user', 'purchase_completed');
    END IF;
    -- Track conversion for seller (sale_completed)
    IF NEW.seller_id IS NOT NULL THEN
      PERFORM track_sequence_experiment_conversion(NEW.seller_id, 'user', 'sale_completed');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mab_order_completed_event ON market_orders;
CREATE TRIGGER trg_mab_order_completed_event
  AFTER UPDATE ON market_orders
  FOR EACH ROW
  EXECUTE FUNCTION trg_mab_order_completed();

-- 4. Trigger function for Profile Completed (Sign Up Conversion)
CREATE OR REPLACE FUNCTION trg_mab_profile_completed()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NEW.profile_completed_at IS NOT NULL AND OLD.profile_completed_at IS NULL THEN
    PERFORM track_sequence_experiment_conversion(NEW.id, 'user', 'profile_completed');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mab_profile_completed_event ON profiles;
CREATE TRIGGER trg_mab_profile_completed_event
  AFTER UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION trg_mab_profile_completed();
