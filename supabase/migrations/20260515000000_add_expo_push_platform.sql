-- Add 'expo' to the platform check constraint on push_subscriptions
-- Required for native Expo push token registrations (Android/iOS via Expo Push API)

ALTER TABLE push_subscriptions
  DROP CONSTRAINT IF EXISTS push_subscriptions_platform_check;

ALTER TABLE push_subscriptions
  ADD CONSTRAINT push_subscriptions_platform_check
  CHECK (platform IN ('web', 'ios', 'android', 'expo'));
