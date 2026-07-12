-- Add RLS policy to allow staff users to select from user_analytics
DROP POLICY IF EXISTS user_analytics_staff_select ON public.user_analytics;
CREATE POLICY user_analytics_staff_select ON public.user_analytics
  FOR SELECT TO authenticated USING (is_staff(auth.uid()));
