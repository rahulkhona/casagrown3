-- ============================================================
-- crm_audience_functions registry
-- ============================================================
-- Any Supabase edge function (or Postgres RPC) that returns an
-- array of { id, email, phone } audience records should be
-- registered here so the admin UI can discover and call it.
--
-- Convention: function names should be prefixed with crm_audience_
-- e.g. crm_audience_high_value_buyers, crm_audience_repeat_sellers
-- ============================================================

CREATE TABLE IF NOT EXISTS crm_audience_functions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,             -- edge function / RPC name
  label       text NOT NULL,                   -- human-readable name for dropdown
  description text,                            -- what this audience selects
  is_rpc      boolean NOT NULL DEFAULT false,  -- true = Postgres RPC, false = edge function
  is_active   boolean NOT NULL DEFAULT true,   -- hide without deleting
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE crm_audience_functions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin read audience functions"
  ON crm_audience_functions FOR SELECT
  USING (auth.role() = 'service_role' OR auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "admin manage audience functions"
  ON crm_audience_functions FOR ALL
  USING (auth.role() = 'service_role' OR auth.jwt() ->> 'role' = 'admin');

-- Grant PostgREST access
GRANT SELECT, INSERT, UPDATE, DELETE ON crm_audience_functions TO authenticated;
GRANT SELECT                          ON crm_audience_functions TO anon;

-- ── Seed built-in functions ───────────────────────────────────
INSERT INTO crm_audience_functions (name, label, description, is_rpc, is_active) VALUES
  ('crm_audience_all',
   'All (leads + users)',
   'Every contact in crm_leads and registered users. Geo/date filters still apply.',
   true, true),

  ('crm_audience_leads_only',
   'Leads only',
   'Only contacts from crm_leads (form submissions, FB Lead Ads). Does not include registered users.',
   true, true),

  ('crm_audience_users_only',
   'Registered users only',
   'Only contacts who have created a CasaGrown account. Does not include anonymous leads.',
   true, true)

ON CONFLICT (name) DO NOTHING;
