-- Fix critical security advisory: crm_interest_match_candidates uses SECURITY DEFINER
-- which bypasses RLS for anon/authenticated users, exposing PII (emails, phones, names).
-- Switch to SECURITY INVOKER and revoke direct access from anon/authenticated.
-- service_role (used by Edge Functions) inherently bypasses RLS, so this is safe.

ALTER VIEW public.crm_interest_match_candidates SET (security_invoker = on);
REVOKE SELECT ON public.crm_interest_match_candidates FROM anon, authenticated;
