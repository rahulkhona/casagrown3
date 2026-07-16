-- Fix: Add retry counter to crm_sequence_enrollments to prevent infinite SMS retry loops.
-- Previously, permanent Twilio errors (e.g. invalid phone number) would cause enrollments
-- to retry every 15 minutes indefinitely, inflating error counts and blocking progress.
--
-- Schema: crm_sequence_enrollments
-- New column: sms_retry_count INTEGER NOT NULL DEFAULT 0

ALTER TABLE crm_sequence_enrollments
  ADD COLUMN IF NOT EXISTS sms_retry_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN crm_sequence_enrollments.sms_retry_count IS
  'Number of consecutive SMS send failures. After 3 retries, the enrollment skips the SMS node and advances. Reset to 0 on success.';

-- Clean up the historical infinite-retry error rows so the dashboard reflects accurate metrics.
-- These are SMS error rows that were never actually sent (sent_at IS NULL, phone IS NOT NULL, error IS NOT NULL).
-- Keep only 1 error row per (sequence_id, recipient_id, node_id) combo for audit trail, delete the rest.
DELETE FROM crm_campaign_sends
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY sequence_id, recipient_id, node_id
             ORDER BY id DESC  -- keep the latest by UUID ordering
           ) AS rn
    FROM crm_campaign_sends
    WHERE error IS NOT NULL
      AND sent_at IS NULL
      AND phone IS NOT NULL
  ) sub
  WHERE rn > 1  -- keep only the most recent error per enrollment+node
);
