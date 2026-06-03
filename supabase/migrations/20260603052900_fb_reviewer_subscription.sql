-- Insert a virtual subscription for the pro_tester Facebook reviewer account
-- This allows all edge functions to work without modifying each one's subscription check
INSERT INTO public.seller_subscriptions (user_id, plan, status, current_period_start, current_period_end)
VALUES (
  'a0000000-0000-0000-0000-00000000000c',
  'elite',
  'active',
  NOW(),
  NOW() + INTERVAL '1 year'
)
ON CONFLICT (user_id) DO UPDATE SET plan = 'elite', status = 'active', current_period_end = NOW() + INTERVAL '1 year';
