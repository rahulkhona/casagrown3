-- ============================================================================
-- BUG-35: Allow 'canceling' status on seller_subscriptions
--
-- The cancel flow now sets status='canceling' to indicate the subscription
-- will remain active until the current billing period ends. The webhook
-- handler for customer.subscription.deleted then sets status='canceled'.
-- ============================================================================

-- Drop old CHECK and add updated one that includes 'canceling'
ALTER TABLE seller_subscriptions
  DROP CONSTRAINT IF EXISTS seller_subscriptions_status_check;

ALTER TABLE seller_subscriptions
  ADD CONSTRAINT seller_subscriptions_status_check
  CHECK (status IN ('active', 'trialing', 'past_due', 'canceled', 'canceling', 'inactive'));
