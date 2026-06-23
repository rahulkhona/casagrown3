-- ============================================================================
-- Migration: Wire up event-based triggers for the drip campaign/sequence system
--
-- Creates database triggers that automatically enroll recipients into active
-- CRM sequences when specific business events occur:
--
--   1. lead.created          — new lead inserted into crm_leads
--   2. user.first_login      — profile_completed_at goes from NULL → NOT NULL
--   3. market_orders.purchase_completed — order status → 'completed' (buyer)
--   4. market_orders.sale_completed     — order status → 'completed' (seller)
--   5. ai_condition (cron)   — evaluates dynamic SQL conditions every 15 min
--
-- All triggers call the enroll-in-sequence Edge Function via net.http_post(),
-- matching the pattern established in 20260503054046_crm_sequence_cron.sql.
-- ============================================================================


-- ═══════════════════════════════════════════════════════════════════════════════
-- Helper: Shared function to call the enroll-in-sequence Edge Function
-- ═══════════════════════════════════════════════════════════════════════════════
-- Centralizes the net.http_post() call so trigger functions stay DRY.
-- Accepts a sequence ID and a JSONB array of {recipient_type, recipient_id}.

CREATE OR REPLACE FUNCTION call_enroll_in_sequence(
  p_sequence_id UUID,
  p_recipients  JSONB
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  -- Skip if no recipients
  IF p_recipients IS NULL OR jsonb_array_length(p_recipients) = 0 THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := COALESCE(
                 current_setting('app.settings.edge_functions_base_url', true),
                 'http://host.docker.internal:54321/functions/v1'
               ) || '/enroll-in-sequence',
    headers := json_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || COALESCE(
                   current_setting('app.settings.service_role_key', true),
                   'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
                 )
               )::jsonb,
    body    := jsonb_build_object(
                 'sequence_id', p_sequence_id,
                 'recipients',  p_recipients
               )
  );
END;
$$;

COMMENT ON FUNCTION call_enroll_in_sequence(UUID, JSONB) IS 'Internal helper — calls the enroll-in-sequence Edge Function via net.http_post(). Used by event triggers and the AI condition cron.';

GRANT EXECUTE ON FUNCTION call_enroll_in_sequence(UUID, JSONB) TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════════
-- Trigger 1: lead.created — AFTER INSERT ON crm_leads
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION trg_sequence_lead_created()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_seq RECORD;
BEGIN
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

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION trg_sequence_lead_created() IS 'Trigger function — enrolls new leads into all active sequences with trigger_event = ''lead.created''.';

DROP TRIGGER IF EXISTS trg_sequence_lead_created ON crm_leads;
CREATE TRIGGER trg_sequence_lead_created
  AFTER INSERT ON crm_leads
  FOR EACH ROW
  EXECUTE FUNCTION trg_sequence_lead_created();


-- ═══════════════════════════════════════════════════════════════════════════════
-- Trigger 2: user.first_login — AFTER UPDATE ON profiles
-- ═══════════════════════════════════════════════════════════════════════════════
-- Fires ONLY when profile_completed_at transitions from NULL to NOT NULL.
-- This represents a user's first completed login (guest mode creates profiles
-- without completing them, so INSERT is not the right event).

CREATE OR REPLACE FUNCTION trg_sequence_user_first_login()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_seq RECORD;
BEGIN
  -- Only fire when profile_completed_at goes from NULL → NOT NULL
  IF OLD.profile_completed_at IS NOT NULL OR NEW.profile_completed_at IS NULL THEN
    RETURN NEW;
  END IF;

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

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION trg_sequence_user_first_login() IS 'Trigger function — enrolls users into active sequences with trigger_event = ''user.first_login'' when profile_completed_at transitions from NULL to NOT NULL.';

DROP TRIGGER IF EXISTS trg_sequence_user_first_login ON profiles;
CREATE TRIGGER trg_sequence_user_first_login
  AFTER UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION trg_sequence_user_first_login();


-- ═══════════════════════════════════════════════════════════════════════════════
-- Trigger 3: market_orders.purchase_completed — AFTER UPDATE ON market_orders
-- ═══════════════════════════════════════════════════════════════════════════════
-- Fires when an order status transitions TO 'completed'. Enrolls the BUYER.

CREATE OR REPLACE FUNCTION trg_sequence_purchase_completed()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_seq RECORD;
BEGIN
  -- Only fire when status transitions TO 'completed'
  IF OLD.status = 'completed' OR NEW.status != 'completed' THEN
    RETURN NEW;
  END IF;

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

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION trg_sequence_purchase_completed() IS 'Trigger function — enrolls the BUYER into active sequences with trigger_event = ''market_orders.purchase_completed'' when order status transitions to ''completed''.';

DROP TRIGGER IF EXISTS trg_sequence_purchase_completed ON market_orders;
CREATE TRIGGER trg_sequence_purchase_completed
  AFTER UPDATE ON market_orders
  FOR EACH ROW
  EXECUTE FUNCTION trg_sequence_purchase_completed();


-- ═══════════════════════════════════════════════════════════════════════════════
-- Trigger 4: market_orders.sale_completed — AFTER UPDATE ON market_orders
-- ═══════════════════════════════════════════════════════════════════════════════
-- Fires when an order status transitions TO 'completed'. Enrolls the SELLER.

CREATE OR REPLACE FUNCTION trg_sequence_sale_completed()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_seq RECORD;
BEGIN
  -- Only fire when status transitions TO 'completed'
  IF OLD.status = 'completed' OR NEW.status != 'completed' THEN
    RETURN NEW;
  END IF;

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

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION trg_sequence_sale_completed() IS 'Trigger function — enrolls the SELLER into active sequences with trigger_event = ''market_orders.sale_completed'' when order status transitions to ''completed''.';

DROP TRIGGER IF EXISTS trg_sequence_sale_completed ON market_orders;
CREATE TRIGGER trg_sequence_sale_completed
  AFTER UPDATE ON market_orders
  FOR EACH ROW
  EXECUTE FUNCTION trg_sequence_sale_completed();


-- ═══════════════════════════════════════════════════════════════════════════════
-- AI Condition Cron: process_ai_condition_enrollments()
-- ═══════════════════════════════════════════════════════════════════════════════
-- Runs every 15 minutes via pg_cron. For each active sequence with
-- trigger_event = 'ai_condition':
--   1. Reads the start node's conditionSql from the DAG definition
--   2. Executes it via execute_audience_query() to find matching recipients
--   3. Filters out anyone already enrolled in this sequence
--   4. Batch-enrolls new matches (max 500 per batch per sequence)

CREATE OR REPLACE FUNCTION process_ai_condition_enrollments()
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_seq           RECORD;
  v_start_node_id TEXT;
  v_nodes         JSONB;
  v_node          JSONB;
  v_condition_sql TEXT;
  v_recipient     RECORD;
  v_recipients    JSONB;
  v_batch_count   INTEGER;
  v_total_enrolled INTEGER := 0;
BEGIN
  -- Iterate over all active AI-condition sequences
  FOR v_seq IN
    SELECT id, definition
    FROM crm_sequences
    WHERE trigger_event = 'ai_condition'
      AND status = 'active'
  LOOP
    -- Extract the start node ID and nodes array from the DAG definition
    v_start_node_id := v_seq.definition::jsonb ->> 'startNodeId';
    v_nodes := v_seq.definition::jsonb -> 'nodes';

    -- Skip if no start node defined
    IF v_start_node_id IS NULL OR v_nodes IS NULL THEN
      CONTINUE;
    END IF;

    -- Find the start node and extract conditionSql
    v_condition_sql := NULL;
    FOR v_node IN SELECT * FROM jsonb_array_elements(v_nodes)
    LOOP
      IF (v_node ->> 'id') = v_start_node_id THEN
        v_condition_sql := v_node -> 'data' ->> 'conditionSql';
        EXIT;
      END IF;
    END LOOP;

    -- Skip if no conditionSql on the start node
    IF v_condition_sql IS NULL OR v_condition_sql = '' THEN
      CONTINUE;
    END IF;

    -- Execute the audience query and collect new recipients not already enrolled.
    -- Batch into groups of 500 for the edge function call.
    v_recipients := '[]'::jsonb;
    v_batch_count := 0;

    FOR v_recipient IN
      SELECT aq.id, aq.recipient_type
      FROM execute_audience_query(v_condition_sql) aq
      WHERE NOT EXISTS (
        SELECT 1 FROM crm_sequence_enrollments e
        WHERE e.sequence_id    = v_seq.id
          AND e.recipient_type = aq.recipient_type
          AND e.recipient_id   = aq.id
      )
      LIMIT 5000  -- hard safety cap per sequence per run
    LOOP
      v_recipients := v_recipients || jsonb_build_array(
        jsonb_build_object(
          'recipient_type', v_recipient.recipient_type,
          'recipient_id',   v_recipient.id
        )
      );
      v_batch_count := v_batch_count + 1;

      -- Flush batch at 500 recipients
      IF v_batch_count >= 500 THEN
        PERFORM call_enroll_in_sequence(v_seq.id, v_recipients);
        v_total_enrolled := v_total_enrolled + v_batch_count;
        v_recipients := '[]'::jsonb;
        v_batch_count := 0;
      END IF;
    END LOOP;

    -- Flush remaining recipients
    IF v_batch_count > 0 THEN
      PERFORM call_enroll_in_sequence(v_seq.id, v_recipients);
      v_total_enrolled := v_total_enrolled + v_batch_count;
    END IF;
  END LOOP;

  IF v_total_enrolled > 0 THEN
    RAISE NOTICE 'AI condition cron: enrolled % new recipients across active sequences', v_total_enrolled;
  END IF;
END;
$$;

COMMENT ON FUNCTION process_ai_condition_enrollments() IS 'Cron function (every 15 min) — evaluates conditionSql from active AI-condition sequences, enrolls new matching recipients in batches of 500.';

GRANT EXECUTE ON FUNCTION process_ai_condition_enrollments() TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════════
-- Schedule the AI condition cron via pg_cron (every 15 minutes)
-- ═══════════════════════════════════════════════════════════════════════════════

DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN

    -- Unschedule if already exists (idempotency)
    BEGIN
      PERFORM cron.unschedule('process-ai-condition-triggers');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- Schedule to run every 15 minutes — calls the PL/pgSQL function directly
    PERFORM cron.schedule(
      'process-ai-condition-triggers',
      '*/15 * * * *',
      'SELECT process_ai_condition_enrollments()'
    );

    RAISE NOTICE 'Scheduled process-ai-condition-triggers to run every 15 minutes';

  ELSE
    RAISE NOTICE 'pg_cron not available, skipping AI condition trigger cron job';
  END IF;
END $outer$;
