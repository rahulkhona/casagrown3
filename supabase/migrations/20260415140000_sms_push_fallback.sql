-- ============================================================================
-- Push subscription freshness tracking
-- ============================================================================
--
-- The send-sms-notification edge function already correctly gates on:
--   1. ENABLE_PHONE_VERIFICATION feature flag (off until Twilio approved)
--   2. Existence of push_subscriptions row for the user
--
-- This migration adds updated_at to push_subscriptions so freshness can be
-- tracked (subscription not refreshed in 90+ days may be stale) and provides
-- a DB helper function for any future DB-layer checks.
--
-- The notify_market_event function is NOT rewritten here; the SMS fallback
-- logic already lives correctly in the send-sms-notification edge function.
-- ============================================================================

-- 1. Add updated_at to push_subscriptions for freshness tracking
ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Backfill existing rows to use created_at as baseline
UPDATE push_subscriptions SET updated_at = created_at WHERE updated_at = now();

-- Index for freshness queries
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_updated
  ON push_subscriptions (user_id, updated_at DESC);

-- 2. Helper: does this user have a fresh (≤90 days) push subscription?
--    Used by the send-sms-notification edge fn and any future DB-layer callers.
CREATE OR REPLACE FUNCTION user_has_active_push(p_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM push_subscriptions
    WHERE user_id = p_user_id
      AND updated_at > now() - INTERVAL '90 days'
  );
$$;
