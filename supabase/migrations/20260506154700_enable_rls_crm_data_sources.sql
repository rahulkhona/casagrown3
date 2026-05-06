-- ============================================================
-- Enable RLS on crm_data_sources (flagged by Supabase Security Advisor)
-- This is an admin-only table — only staff can read/write.
-- ============================================================

ALTER TABLE crm_data_sources ENABLE ROW LEVEL SECURITY;

-- Staff can do everything
CREATE POLICY crm_data_sources_staff_all ON crm_data_sources
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()));

-- Grant usage to authenticated (policies control actual access)
GRANT SELECT ON public.crm_data_sources TO authenticated;
