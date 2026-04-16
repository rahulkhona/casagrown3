-- ─── Fix Supabase Security Gaps ──────────────────────────────────────────────
-- Context: The original CRM migration (20260415120000_crm_schema.sql) granted 
-- broadly permissive UPDATE privileges to anonymous users using `USING (true)` 
-- policies. These tables are safely written to by Edge Functions and Next.js 
-- API Routes utilizing the `service_role` key, rendering the anon privileges 
-- both dangerous and unnecessary.

BEGIN;

-- 1. Revoke the dangerous table-level UPDATE grants for anonymous users
REVOKE UPDATE ON public.crm_short_links FROM anon;
REVOKE UPDATE ON public.crm_page_visits FROM anon;

-- 2. Drop the overly permissive UPDATE policies
DROP POLICY IF EXISTS crm_short_links_update_click ON public.crm_short_links;
DROP POLICY IF EXISTS crm_page_visits_update_own ON public.crm_page_visits;

-- Note: The `service_role` bypasses RLS and permissions organically, 
-- ensuring that `send-crm-campaign` (short link click tracking) and 
-- `api/crm/track` (duration/conversion analytics tracking) continue 
-- to function correctly.

COMMIT;
