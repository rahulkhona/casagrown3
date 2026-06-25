-- ============================================================================
-- Migration: Drip Sequence Enhancements
--
-- Adds database support for:
--   (d) Delivery tracking — delivered_at column on crm_campaign_sends
--   (a) Fork/Join — parent_enrollment_id and fork_node_id on enrollments
--   (b) Optimal send windows — crm_send_slot_defaults settings table
--   (e) Backfill on activation — backfill_on_activate column on sequences
-- ============================================================================


-- ═══════════════════════════════════════════════════════════════════════════════
-- (d) Delivery Tracking — add delivered_at to crm_campaign_sends
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE crm_campaign_sends
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

COMMENT ON COLUMN crm_campaign_sends.delivered_at IS
  'Timestamp when the message was confirmed delivered by the provider (Postmark Delivery webhook for email, Twilio StatusCallback for SMS).';


-- ═══════════════════════════════════════════════════════════════════════════════
-- (a) Fork/Join — add parent_enrollment_id and fork_node_id to enrollments
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE crm_sequence_enrollments
  ADD COLUMN IF NOT EXISTS parent_enrollment_id UUID REFERENCES crm_sequence_enrollments(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS fork_node_id TEXT;

CREATE INDEX IF NOT EXISTS idx_crm_seq_enrollments_parent
  ON crm_sequence_enrollments (parent_enrollment_id)
  WHERE parent_enrollment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_seq_enrollments_fork
  ON crm_sequence_enrollments (sequence_id, fork_node_id, parent_enrollment_id)
  WHERE fork_node_id IS NOT NULL;

COMMENT ON COLUMN crm_sequence_enrollments.parent_enrollment_id IS
  'For fork sub-enrollments, references the parent enrollment that spawned this branch.';
COMMENT ON COLUMN crm_sequence_enrollments.fork_node_id IS
  'The node ID of the fork node that created this sub-enrollment. Used by join nodes to find siblings.';


-- ═══════════════════════════════════════════════════════════════════════════════
-- (b) Optimal Send Windows — settings table for default send slots
-- ═══════════════════════════════════════════════════════════════════════════════
-- Stores default email and SMS send windows as JSONB arrays of
-- { day: string, start: string, end: string } objects.
-- Each row represents one send window for a specific day of the week.
--
-- Example:
-- {
--   "email_slots": [
--     { "day": "tue", "start": "09:00", "end": "11:00" },
--     { "day": "thu", "start": "14:00", "end": "16:00" }
--   ],
--   "sms_slots": [
--     { "day": "wed", "start": "10:00", "end": "12:00" },
--     { "day": "fri", "start": "13:00", "end": "15:00" }
--   ]
-- }

CREATE TABLE IF NOT EXISTS crm_send_slot_defaults (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_slots JSONB NOT NULL DEFAULT '[]'::jsonb,
  sms_slots   JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES profiles(id) ON DELETE SET NULL
);

-- Singleton pattern — ensure only one row exists
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_send_slot_defaults_singleton
  ON crm_send_slot_defaults ((true));

COMMENT ON TABLE crm_send_slot_defaults IS
  'Singleton table storing default optimal send time windows for email and SMS campaigns. Used by the "Wait for Optimal Slot" sequence node.';

ALTER TABLE crm_send_slot_defaults ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'crm_send_slot_defaults_staff_all') THEN
    CREATE POLICY crm_send_slot_defaults_staff_all ON crm_send_slot_defaults
      FOR ALL TO authenticated
      USING (auth.jwt() ->> 'role' = 'service_role' OR public.has_staff_role(auth.uid(), 'admin'))
      WITH CHECK (auth.jwt() ->> 'role' = 'service_role' OR public.has_staff_role(auth.uid(), 'admin'));
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON crm_send_slot_defaults TO authenticated;
GRANT ALL ON crm_send_slot_defaults TO service_role;

-- Seed with sensible defaults
INSERT INTO crm_send_slot_defaults (email_slots, sms_slots)
VALUES (
  '[{"day":"tue","start":"09:00","end":"11:00"},{"day":"thu","start":"14:00","end":"16:00"}]'::jsonb,
  '[{"day":"wed","start":"10:00","end":"12:00"},{"day":"fri","start":"13:00","end":"15:00"}]'::jsonb
)
ON CONFLICT ((true)) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════════════════════
-- (e) Backfill on Activation — add column to crm_sequences
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE crm_sequences
  ADD COLUMN IF NOT EXISTS backfill_on_activate BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN crm_sequences.backfill_on_activate IS
  'When true and the sequence is activated with an event-based trigger, retroactively enroll all existing recipients matching the trigger criteria.';

-- Adjust crm_sequence_enrollments unique constraints to allow Fork & Join sub-enrollments
ALTER TABLE crm_sequence_enrollments DROP CONSTRAINT IF EXISTS crm_sequence_enrollments_sequence_id_recipient_type_recipie_key;

CREATE UNIQUE INDEX IF NOT EXISTS crm_sequence_enrollments_parent_unique_idx 
  ON crm_sequence_enrollments (sequence_id, recipient_type, recipient_id) 
  WHERE parent_enrollment_id IS NULL;

-- Note: child unique index is disabled because multiple branches can merge at Join nodes or point to the same node.
-- CREATE UNIQUE INDEX IF NOT EXISTS crm_sequence_enrollments_child_unique_idx
--   ON crm_sequence_enrollments (parent_enrollment_id, current_node_id)
--   WHERE parent_enrollment_id IS NOT NULL;
