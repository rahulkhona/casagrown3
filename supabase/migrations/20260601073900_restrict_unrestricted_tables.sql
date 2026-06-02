-- ============================================================
-- Restrict 3 unrestricted tables/views
-- stripe_connect_audit_log, public_profiles, catalog_item_allocations
-- ============================================================

-- 1. stripe_connect_audit_log (TABLE)
--    Contains sensitive Stripe Connect audit data.
--    Writes come from service_role (edge functions, DB triggers) which bypasses RLS.
--    Clients should only read their own entries.
ALTER TABLE stripe_connect_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON stripe_connect_audit_log FROM anon, authenticated;
-- Re-grant SELECT so the RLS policy can filter rows (service_role bypasses RLS for writes)
GRANT SELECT ON stripe_connect_audit_log TO authenticated;

DROP POLICY IF EXISTS stripe_audit_own_read ON stripe_connect_audit_log;
CREATE POLICY stripe_audit_own_read ON stripe_connect_audit_log
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 2. public_profiles (VIEW)
--    Intentionally public read data (name, avatar, h3 index).
--    No writes should ever happen through this view.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public_profiles FROM anon, authenticated;

-- 3. catalog_item_allocations (VIEW)
--    Aggregated inventory allocation data.
--    Only authenticated sellers need to read it. No writes.
REVOKE ALL ON catalog_item_allocations FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON catalog_item_allocations FROM authenticated;
