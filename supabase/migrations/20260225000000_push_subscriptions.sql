-- Push Subscriptions — stores push tokens for Web Push, APNs, and FCM
--
-- Used by the notification system to deliver browser and native push
-- notifications when orders, offers, or chat messages are created.

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('web', 'ios', 'android')),
  endpoint text,  -- Web Push endpoint URL (null for native)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, token)
);

-- Index for looking up a user's subscriptions when sending notifications
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
  ON public.push_subscriptions(user_id);

-- RLS: users can only read/write their own subscriptions
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY push_subscriptions_select ON public.push_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY push_subscriptions_insert ON public.push_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY push_subscriptions_update ON public.push_subscriptions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY push_subscriptions_delete ON public.push_subscriptions
  FOR DELETE USING (auth.uid() = user_id);

-- Service-role bypass for sending notifications from edge functions
CREATE POLICY push_subscriptions_service_all ON public.push_subscriptions
  FOR ALL USING (auth.role() = 'service_role');
