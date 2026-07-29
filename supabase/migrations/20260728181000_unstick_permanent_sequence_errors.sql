-- ============================================================
-- Migration: Unstick Permanent Sequence Errors & Reset Evaluation
-- Resets next_evaluation_at and sms_retry_count for stuck active enrollments
-- ============================================================

SET search_path TO public, extensions;

-- Reset evaluation timestamp for stuck active sequence enrollments
UPDATE public.crm_sequence_enrollments
SET next_evaluation_at = NOW(),
    sms_retry_count = 0
WHERE status = 'active'
  AND (sms_retry_count > 0 OR next_evaluation_at > NOW());
