-- ============================================================
-- CRM & Marketing Platform Schema
-- Tables: crm_leads, crm_assets, crm_landing_pages,
--         crm_page_visits, crm_page_events,
--         crm_audiences, crm_campaigns, crm_campaign_sends,
--         crm_short_links
-- Storage: marketing-assets bucket
-- ============================================================

-- ─── 1. crm_landing_pages ────────────────────────────────────────────
-- Registry of marketing landing pages. Referenced by crm_leads + crm_page_visits.
CREATE TABLE IF NOT EXISTS crm_landing_pages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL UNIQUE,   -- 'sellers', 'earnings-calculator', 'buyers'
  title       TEXT NOT NULL,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_landing_pages_slug ON crm_landing_pages (slug);
CREATE INDEX IF NOT EXISTS idx_crm_landing_pages_active ON crm_landing_pages (is_active);

ALTER TABLE crm_landing_pages ENABLE ROW LEVEL SECURITY;

-- Anon can read active pages (landing page beaconing needs to read the slug)
DO $$ BEGIN
  CREATE POLICY crm_landing_pages_read ON crm_landing_pages
    FOR SELECT TO anon, authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Only staff/service role can write
DO $$ BEGIN
  CREATE POLICY crm_landing_pages_write ON crm_landing_pages
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 2. crm_leads ────────────────────────────────────────────────────
-- Contacts captured from landing pages or Facebook Lead Ads webhooks.
CREATE TABLE IF NOT EXISTS crm_leads (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  email             TEXT,
  phone             TEXT,
  source_platform   TEXT,             -- facebook, instagram, google, direct
  source_url        TEXT,             -- full URL they came from (landing page leads)
  source_ad_id      TEXT,             -- platform's ad ID (from FB Lead API or manual)
  utm_campaign      TEXT,             -- e.g. "spring-2026"
  utm_content       TEXT,             -- e.g. "farmer-hero-v1" (A/B variant identifier)
  utm_medium        TEXT,             -- e.g. "paid_social"
  form_version      TEXT,             -- e.g. "v2-seller-focus"
  landing_page_id   UUID REFERENCES crm_landing_pages (id) ON DELETE SET NULL,
  referring_user_id UUID REFERENCES profiles (id) ON DELETE SET NULL,
  accepts_email     BOOLEAN NOT NULL DEFAULT false,
  accepts_sms       BOOLEAN NOT NULL DEFAULT false,
  status            TEXT NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new', 'contacted', 'converted', 'archived')),
  converted_user_id UUID REFERENCES profiles (id) ON DELETE SET NULL,
  metadata          JSONB NOT NULL DEFAULT '{}',  -- calculator inputs, page context
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_leads_status ON crm_leads (status);
CREATE INDEX IF NOT EXISTS idx_crm_leads_email ON crm_leads (email);
CREATE INDEX IF NOT EXISTS idx_crm_leads_source_platform ON crm_leads (source_platform);
CREATE INDEX IF NOT EXISTS idx_crm_leads_utm_content ON crm_leads (utm_content);
CREATE INDEX IF NOT EXISTS idx_crm_leads_utm_campaign ON crm_leads (utm_campaign);
CREATE INDEX IF NOT EXISTS idx_crm_leads_landing_page ON crm_leads (landing_page_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_created_at ON crm_leads (created_at);
CREATE INDEX IF NOT EXISTS idx_crm_leads_converted ON crm_leads (converted_user_id) WHERE converted_user_id IS NOT NULL;

ALTER TABLE crm_leads ENABLE ROW LEVEL SECURITY;

-- Anon can INSERT (landing page form submission without auth)
DO $$ BEGIN
  CREATE POLICY crm_leads_insert_anon ON crm_leads
    FOR INSERT TO anon, authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Only staff can SELECT/UPDATE (CRM admin UI)
DO $$ BEGIN
  CREATE POLICY crm_leads_staff_select ON crm_leads
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY crm_leads_staff_update ON crm_leads
    FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 3. crm_assets ───────────────────────────────────────────────────
-- Marketing files stored in the marketing-assets Supabase storage bucket.
CREATE TABLE IF NOT EXISTS crm_assets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path TEXT NOT NULL,         -- path in marketing-assets bucket
  type         TEXT NOT NULL CHECK (type IN ('image', 'video', 'audio', 'document')),
  tags         TEXT[] NOT NULL DEFAULT '{}',
  description  TEXT,
  uploaded_by  UUID REFERENCES profiles (id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_assets_type ON crm_assets (type);
CREATE INDEX IF NOT EXISTS idx_crm_assets_tags ON crm_assets USING gin (tags);

ALTER TABLE crm_assets ENABLE ROW LEVEL SECURITY;

-- Staff can read all assets
DO $$ BEGIN
  CREATE POLICY crm_assets_staff_all ON crm_assets
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 4. crm_page_visits ──────────────────────────────────────────────
-- First-party landing page analytics. One row per page load.
CREATE TABLE IF NOT EXISTS crm_page_visits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    TEXT NOT NULL,        -- random ID from sessionStorage (anonymous)
  page_slug     TEXT NOT NULL,        -- '/earnings-calculator', '/sellers', '/join'
  referrer      TEXT,                 -- document.referrer or /r/[token] for campaign clicks
  utm_source    TEXT,
  utm_campaign  TEXT,
  utm_content   TEXT,                 -- A/B variant identifier
  utm_medium    TEXT,
  country       TEXT,                 -- from CF-IPCountry or X-Vercel-IP-Country header
  region        TEXT,                 -- state/region
  duration_secs INT,                  -- time on page, sent on unload
  converted     BOOLEAN NOT NULL DEFAULT false,
  lead_id       UUID REFERENCES crm_leads (id) ON DELETE SET NULL,
  user_id       UUID REFERENCES profiles (id) ON DELETE SET NULL, -- Phase 2: app page tracking
  visited_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_page_visits_session ON crm_page_visits (session_id);
CREATE INDEX IF NOT EXISTS idx_crm_page_visits_slug ON crm_page_visits (page_slug);
CREATE INDEX IF NOT EXISTS idx_crm_page_visits_utm_content ON crm_page_visits (utm_content);
CREATE INDEX IF NOT EXISTS idx_crm_page_visits_utm_campaign ON crm_page_visits (utm_campaign);
CREATE INDEX IF NOT EXISTS idx_crm_page_visits_visited_at ON crm_page_visits (visited_at);
CREATE INDEX IF NOT EXISTS idx_crm_page_visits_converted ON crm_page_visits (converted) WHERE converted = true;

ALTER TABLE crm_page_visits ENABLE ROW LEVEL SECURITY;

-- Anon can INSERT (beacon fires without auth on landing pages)
DO $$ BEGIN
  CREATE POLICY crm_page_visits_insert ON crm_page_visits
    FOR INSERT TO anon, authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Anon can UPDATE own session (to set duration + converted on unload)
DO $$ BEGIN
  CREATE POLICY crm_page_visits_update_own ON crm_page_visits
    FOR UPDATE TO anon, authenticated
    USING (true)  -- checked by session_id match in edge function
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Staff can SELECT all
DO $$ BEGIN
  CREATE POLICY crm_page_visits_staff_select ON crm_page_visits
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 5. crm_page_events ──────────────────────────────────────────────
-- Granular interaction events per page session (calculator used, CTA clicked, etc.)
CREATE TABLE IF NOT EXISTS crm_page_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  TEXT NOT NULL,          -- links to crm_page_visits.session_id
  page_slug   TEXT NOT NULL,
  event_type  TEXT NOT NULL           -- button_click | calculator_used | form_start |
              CHECK (event_type IN (  --   form_abandon | cta_clicked | scroll_50 | scroll_90
                'button_click', 'calculator_used', 'form_start',
                'form_abandon', 'cta_clicked', 'scroll_50', 'scroll_90'
              )),
  target_element TEXT,                -- 'Join Now Button', 'Seller Survey'
  value_text     TEXT,                -- Logbed strings
  value_int      INT,                 -- Calculated numeric output natively
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_page_events_session ON crm_page_events (session_id);
CREATE INDEX IF NOT EXISTS idx_crm_page_events_type ON crm_page_events (event_type);
CREATE INDEX IF NOT EXISTS idx_crm_page_events_slug ON crm_page_events (page_slug);
CREATE INDEX IF NOT EXISTS idx_crm_page_events_occurred ON crm_page_events (occurred_at);

ALTER TABLE crm_page_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY crm_page_events_insert ON crm_page_events
    FOR INSERT TO anon, authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY crm_page_events_staff_select ON crm_page_events
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 6. crm_audiences ────────────────────────────────────────────────
-- Reusable audience definitions. Combines optional behavioral RPC + JSONB filters.
CREATE TABLE IF NOT EXISTS crm_audiences (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  description       TEXT,
  recipient_type    TEXT NOT NULL CHECK (recipient_type IN ('leads', 'users', 'both')),
  audience_rpc_name TEXT,              -- optional: name of Postgres RPC for behavioral filter
  estimated_count   INT,               
  last_estimated_at TIMESTAMPTZ,
  created_by        UUID REFERENCES profiles (id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_audiences_recipient_type ON crm_audiences (recipient_type);

ALTER TABLE crm_audiences ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY crm_audiences_staff_all ON crm_audiences
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 7. crm_data_sources ─────────────────────────────────────────────
-- Registry of backend RPCs mapped to specific JSON output schemas for template designers
CREATE TABLE IF NOT EXISTS crm_data_sources (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  description       TEXT,
  rpc_name          TEXT NOT NULL,
  return_schema     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 8. crm_campaigns ────────────────────────────────────────────────
-- Email or SMS campaign: content, audience reference, and schedule.
CREATE TABLE IF NOT EXISTS crm_campaigns (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  system_alias TEXT UNIQUE,            -- e.g. 'sys-day3-welcome', used for programmatic automated dispatch
  name         TEXT NOT NULL,
  channel      TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  subject      TEXT,                   -- email only
  content_html TEXT,                   -- email HTML body (AI-generated, pasted in)
  content_text TEXT,                   -- SMS text or email plain-text fallback
  postmark_template_alias TEXT,        -- If populated, bypasses custom HTML in favor of Postmark template API
  audience_id  UUID REFERENCES crm_audiences (id) ON DELETE SET NULL,
  data_source_id UUID REFERENCES crm_data_sources (id) ON DELETE SET NULL,

  -- Geographic Multiple Targeting
  target_states   TEXT[] NOT NULL DEFAULT '{}',
  target_cities   TEXT[] NOT NULL DEFAULT '{}',
  target_counties TEXT[] NOT NULL DEFAULT '{}',
  target_zips     TEXT[] NOT NULL DEFAULT '{}',
  target_h3s      TEXT[] NOT NULL DEFAULT '{}',

  scheduled_at TIMESTAMPTZ,            -- NULL = draft
  sent_at      TIMESTAMPTZ,
  status       TEXT NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'cancelled', 'active')),
  stats        JSONB NOT NULL DEFAULT '{}', -- { total_sent, opened, clicked, bounced, unsubscribed }
  created_by   UUID REFERENCES profiles (id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_campaigns_status ON crm_campaigns (status);
CREATE INDEX IF NOT EXISTS idx_crm_campaigns_channel ON crm_campaigns (channel);
CREATE INDEX IF NOT EXISTS idx_crm_campaigns_scheduled ON crm_campaigns (scheduled_at) WHERE scheduled_at IS NOT NULL;

ALTER TABLE crm_campaigns ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY crm_campaigns_staff_all ON crm_campaigns
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 8. crm_campaign_sends ───────────────────────────────────────────
-- One row per recipient per campaign. The tracking layer.
CREATE TABLE IF NOT EXISTS crm_campaign_sends (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id      UUID NOT NULL REFERENCES crm_campaigns (id) ON DELETE CASCADE,
  recipient_type   TEXT NOT NULL CHECK (recipient_type IN ('lead', 'user')),
  recipient_id     UUID NOT NULL,      -- crm_leads.id or profiles.id
  email            TEXT,
  phone            TEXT,
  sent_at          TIMESTAMPTZ,
  opened_at        TIMESTAMPTZ,        -- set by Postmark open webhook
  clicked_at       TIMESTAMPTZ,        -- set by /r/[token] branded redirect
  bounced_at       TIMESTAMPTZ,        -- set by Postmark/Twilio bounce webhook
  unsubscribed_at  TIMESTAMPTZ,
  error            TEXT
);

CREATE INDEX IF NOT EXISTS idx_crm_sends_campaign ON crm_campaign_sends (campaign_id);
CREATE INDEX IF NOT EXISTS idx_crm_sends_recipient ON crm_campaign_sends (recipient_id);
CREATE INDEX IF NOT EXISTS idx_crm_sends_recipient_type ON crm_campaign_sends (recipient_type);
CREATE INDEX IF NOT EXISTS idx_crm_sends_sent_at ON crm_campaign_sends (sent_at);

ALTER TABLE crm_campaign_sends ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY crm_campaign_sends_staff_all ON crm_campaign_sends
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 9. crm_short_links ──────────────────────────────────────────────
-- Branded link tracking. casagrown.com/r/[token] → destination.
CREATE TABLE IF NOT EXISTS crm_short_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token           TEXT NOT NULL UNIQUE,  -- 8-char random, e.g. "a3f7k2p1"
  destination_url TEXT NOT NULL,
  campaign_id     UUID REFERENCES crm_campaigns (id) ON DELETE SET NULL,
  recipient_id    UUID,                   -- lead or user ID
  recipient_type  TEXT CHECK (recipient_type IN ('lead', 'user')),
  clicked_at      TIMESTAMPTZ,            -- timestamp of first click
  click_count     INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_short_links_token ON crm_short_links (token);
CREATE INDEX IF NOT EXISTS idx_crm_short_links_campaign ON crm_short_links (campaign_id);

ALTER TABLE crm_short_links ENABLE ROW LEVEL SECURITY;

-- Anon can SELECT for redirect lookup (public redirect endpoint needs it)
DO $$ BEGIN
  CREATE POLICY crm_short_links_read_anon ON crm_short_links
    FOR SELECT TO anon, authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Anon can UPDATE click tracking (redirect route updates click_count)
DO $$ BEGIN
  CREATE POLICY crm_short_links_update_click ON crm_short_links
    FOR UPDATE TO anon, authenticated
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Staff can INSERT and manage
DO $$ BEGIN
  CREATE POLICY crm_short_links_staff_insert ON crm_short_links
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Storage Bucket ───────────────────────────────────────────────────
-- marketing-assets: public bucket for campaign images/videos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'marketing-assets',
  'marketing-assets',
  true,
  52428800,   -- 50MB limit
  ARRAY['image/jpeg','image/png','image/gif','image/webp','image/svg+xml',
        'video/mp4','video/webm','audio/mpeg','audio/wav','application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: anyone can read public assets
DO $$ BEGIN
  CREATE POLICY marketing_assets_public_read ON storage.objects
    FOR SELECT TO anon, authenticated
    USING (bucket_id = 'marketing-assets');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Only staff can upload/delete
DO $$ BEGIN
  CREATE POLICY marketing_assets_staff_write ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'marketing-assets'
      AND EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY marketing_assets_staff_delete ON storage.objects
    FOR DELETE TO authenticated
    USING (
      bucket_id = 'marketing-assets'
      AND EXISTS (SELECT 1 FROM staff_members WHERE user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Audience RPCs ────────────────────────────────────────────────────
-- All RPCs return the same standard schema so the campaign sender
-- can apply filter_criteria uniformly regardless of which RPC ran.

-- Default: all leads + users
CREATE OR REPLACE FUNCTION crm_audience_all()
RETURNS TABLE(
  id             UUID,
  recipient_type TEXT,
  email          TEXT,
  phone          TEXT,
  name           TEXT,
  state_code     TEXT,
  city           TEXT,
  zip_code       TEXT,
  community_h3   TEXT,
  joined_at      TIMESTAMPTZ,
  accepts_email  BOOLEAN,
  accepts_sms    BOOLEAN
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    l.id,
    'lead'::TEXT  AS recipient_type,
    l.email,
    l.phone,
    l.name,
    NULL::TEXT    AS state_code,
    NULL::TEXT    AS city,
    NULL::TEXT    AS zip_code,
    NULL::TEXT    AS community_h3,
    l.created_at  AS joined_at,
    l.accepts_email,
    l.accepts_sms
  FROM crm_leads l
  WHERE l.status != 'archived'

  UNION ALL

  SELECT
    p.id,
    'user'::TEXT  AS recipient_type,
    p.email,
    p.phone_number AS phone,
    p.full_name    AS name,
    p.state_code,
    NULL::TEXT     AS city,
    p.zip_code,
    NULL::TEXT     AS community_h3,
    p.created_at   AS joined_at,
    TRUE           AS accepts_email,
    (p.phone_number IS NOT NULL) AS accepts_sms
  FROM profiles p;
$$;

-- Users who completed at least one order (buyers who have purchased)
CREATE OR REPLACE FUNCTION crm_audience_has_bought_before()
RETURNS TABLE(
  id UUID, recipient_type TEXT, email TEXT, phone TEXT, name TEXT,
  state_code TEXT, city TEXT, zip_code TEXT, community_h3 TEXT,
  joined_at TIMESTAMPTZ, accepts_email BOOLEAN, accepts_sms BOOLEAN
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    p.id, 'user'::TEXT, p.email, p.phone_number, p.full_name,
    p.state_code, NULL::TEXT, p.zip_code, NULL::TEXT, p.created_at,
    TRUE, (p.phone_number IS NOT NULL)
  FROM profiles p
  WHERE EXISTS (
    SELECT 1 FROM market_orders o
    WHERE o.buyer_id = p.id AND o.status = 'completed'
  );
$$;

-- Users who have made at least one completed sale
CREATE OR REPLACE FUNCTION crm_audience_has_sold_before()
RETURNS TABLE(
  id UUID, recipient_type TEXT, email TEXT, phone TEXT, name TEXT,
  state_code TEXT, city TEXT, zip_code TEXT, community_h3 TEXT,
  joined_at TIMESTAMPTZ, accepts_email BOOLEAN, accepts_sms BOOLEAN
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    p.id, 'user'::TEXT, p.email, p.phone_number, p.full_name,
    p.state_code, NULL::TEXT, p.zip_code, NULL::TEXT, p.created_at,
    TRUE, (p.phone_number IS NOT NULL)
  FROM profiles p
  WHERE EXISTS (
    SELECT 1 FROM market_orders o
    WHERE o.seller_id = p.id AND o.status = 'completed'
  );
$$;

-- Users who have expressed buying intent via product watches
CREATE OR REPLACE FUNCTION crm_audience_expressed_buying_interest()
RETURNS TABLE(
  id UUID, recipient_type TEXT, email TEXT, phone TEXT, name TEXT,
  state_code TEXT, city TEXT, zip_code TEXT, community_h3 TEXT,
  joined_at TIMESTAMPTZ, accepts_email BOOLEAN, accepts_sms BOOLEAN
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT DISTINCT
    p.id, 'user'::TEXT, p.email, p.phone_number, p.full_name,
    p.state_code, NULL::TEXT, p.zip_code, NULL::TEXT, p.created_at,
    TRUE, (p.phone_number IS NOT NULL)
  FROM profiles p
  JOIN product_watches pw ON pw.user_id = p.id;
$$;

-- ─── Metrics RPCs ─────────────────────────────────────────────────────
-- New marketing analytics RPCs for the metrics app.

-- Landing page traffic stats aggregated by page_slug
CREATE OR REPLACE FUNCTION metrics_crm_landing_pages(
  p_start TEXT,
  p_end   TEXT,
  p_state TEXT DEFAULT NULL,
  p_city  TEXT DEFAULT NULL,
  p_zip   TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER AS $$
  SELECT jsonb_build_object(
    'pages', COALESCE((
      SELECT jsonb_agg(row_to_json(t)) FROM (
        SELECT
          page_slug,
          COUNT(*)                                             AS visits,
          COUNT(DISTINCT session_id)                          AS unique_sessions,
          SUM(CASE WHEN converted THEN 1 ELSE 0 END)          AS conversions,
          ROUND(
            100.0 * SUM(CASE WHEN converted THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1
          )                                                    AS conversion_rate,
          ROUND(AVG(duration_secs))                            AS avg_duration_secs,
          ROUND(
            100.0 * SUM(CASE WHEN duration_secs < 10 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1
          )                                                    AS bounce_rate
        FROM crm_page_visits
        WHERE visited_at BETWEEN p_start::TIMESTAMPTZ AND p_end::TIMESTAMPTZ
          AND (p_state IS NULL OR region = p_state)
          AND (p_city  IS NULL OR page_slug LIKE '%' || p_city || '%')
          AND (p_zip   IS NULL OR page_slug LIKE '%' || p_zip || '%')
        GROUP BY page_slug
        ORDER BY visits DESC
      ) t
    ), '[]'),
    'total_visits', (
      SELECT COUNT(*) FROM crm_page_visits
      WHERE visited_at BETWEEN p_start::TIMESTAMPTZ AND p_end::TIMESTAMPTZ
    ),
    'total_conversions', (
      SELECT COUNT(*) FROM crm_page_visits
      WHERE visited_at BETWEEN p_start::TIMESTAMPTZ AND p_end::TIMESTAMPTZ
        AND converted = true
    )
  );
$$;

-- Traffic source / UTM breakdown
CREATE OR REPLACE FUNCTION metrics_crm_traffic_sources(
  p_start TEXT,
  p_end   TEXT
)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER AS $$
  SELECT jsonb_build_object(
    'by_source', COALESCE((
      SELECT jsonb_agg(row_to_json(t)) FROM (
        SELECT
          COALESCE(utm_source, 'direct') AS source,
          COUNT(*)                        AS visits,
          SUM(CASE WHEN converted THEN 1 ELSE 0 END) AS conversions
        FROM crm_page_visits
        WHERE visited_at BETWEEN p_start::TIMESTAMPTZ AND p_end::TIMESTAMPTZ
        GROUP BY utm_source ORDER BY visits DESC
      ) t
    ), '[]'),
    'by_campaign', COALESCE((
      SELECT jsonb_agg(row_to_json(t)) FROM (
        SELECT
          COALESCE(utm_campaign, 'none') AS campaign,
          COUNT(*)                        AS visits,
          SUM(CASE WHEN converted THEN 1 ELSE 0 END) AS conversions
        FROM crm_page_visits
        WHERE visited_at BETWEEN p_start::TIMESTAMPTZ AND p_end::TIMESTAMPTZ
        GROUP BY utm_campaign ORDER BY visits DESC
      ) t
    ), '[]')
  );
$$;

-- A/B test results grouped by utm_content variant
CREATE OR REPLACE FUNCTION metrics_crm_ab_results(
  p_start    TEXT,
  p_end      TEXT,
  p_campaign TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER AS $$
  SELECT jsonb_build_object(
    'variants', COALESCE((
      SELECT jsonb_agg(row_to_json(t)) FROM (
        SELECT
          COALESCE(utm_content, 'none')          AS variant,
          COALESCE(utm_campaign, 'none')         AS campaign,
          COUNT(*)                               AS visits,
          SUM(CASE WHEN converted THEN 1 ELSE 0 END) AS conversions,
          ROUND(
            100.0 * SUM(CASE WHEN converted THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 2
          )                                      AS conversion_rate,
          ROUND(AVG(duration_secs))              AS avg_duration_secs
        FROM crm_page_visits
        WHERE visited_at BETWEEN p_start::TIMESTAMPTZ AND p_end::TIMESTAMPTZ
          AND (p_campaign IS NULL OR utm_campaign = p_campaign)
        GROUP BY utm_content, utm_campaign
        ORDER BY conversion_rate DESC NULLS LAST
      ) t
    ), '[]')
  );
$$;

-- Lead conversion funnel
CREATE OR REPLACE FUNCTION metrics_crm_lead_funnel(
  p_start TEXT,
  p_end   TEXT
)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER AS $$
  SELECT jsonb_build_object(
    'page_visits',    (SELECT COUNT(*) FROM crm_page_visits WHERE visited_at BETWEEN p_start::TIMESTAMPTZ AND p_end::TIMESTAMPTZ),
    'form_starts',    (SELECT COUNT(*) FROM crm_page_events WHERE event_type = 'form_start' AND occurred_at BETWEEN p_start::TIMESTAMPTZ AND p_end::TIMESTAMPTZ),
    'form_abandons',  (SELECT COUNT(*) FROM crm_page_events WHERE event_type = 'form_abandon' AND occurred_at BETWEEN p_start::TIMESTAMPTZ AND p_end::TIMESTAMPTZ),
    'leads_captured', (SELECT COUNT(*) FROM crm_leads WHERE created_at BETWEEN p_start::TIMESTAMPTZ AND p_end::TIMESTAMPTZ),
    'leads_converted',(SELECT COUNT(*) FROM crm_leads WHERE created_at BETWEEN p_start::TIMESTAMPTZ AND p_end::TIMESTAMPTZ AND converted_user_id IS NOT NULL),
    'by_source', COALESCE((
      SELECT jsonb_agg(row_to_json(t)) FROM (
        SELECT
          COALESCE(source_platform, 'direct') AS source,
          COUNT(*)                             AS leads,
          SUM(CASE WHEN converted_user_id IS NOT NULL THEN 1 ELSE 0 END) AS converted
        FROM crm_leads
        WHERE created_at BETWEEN p_start::TIMESTAMPTZ AND p_end::TIMESTAMPTZ
        GROUP BY source_platform ORDER BY leads DESC
      ) t
    ), '[]')
  );
$$;

-- Campaign performance (email/SMS open, click, bounce rates)
CREATE OR REPLACE FUNCTION metrics_crm_campaigns(
  p_start TEXT,
  p_end   TEXT
)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER AS $$
  SELECT jsonb_build_object(
    'campaigns', COALESCE((
      SELECT jsonb_agg(row_to_json(t)) FROM (
        SELECT
          c.id,
          c.name,
          c.channel,
          c.status,
          c.sent_at,
          COUNT(s.id)                                                    AS total_sent,
          SUM(CASE WHEN s.opened_at IS NOT NULL THEN 1 ELSE 0 END)       AS opened,
          SUM(CASE WHEN s.clicked_at IS NOT NULL THEN 1 ELSE 0 END)      AS clicked,
          SUM(CASE WHEN s.bounced_at IS NOT NULL THEN 1 ELSE 0 END)      AS bounced,
          SUM(CASE WHEN s.unsubscribed_at IS NOT NULL THEN 1 ELSE 0 END) AS unsubscribed,
          ROUND(
            100.0 * SUM(CASE WHEN s.opened_at IS NOT NULL THEN 1 ELSE 0 END) / NULLIF(COUNT(s.id), 0), 1
          ) AS open_rate,
          ROUND(
            100.0 * SUM(CASE WHEN s.clicked_at IS NOT NULL THEN 1 ELSE 0 END) / NULLIF(COUNT(s.id), 0), 1
          ) AS click_rate
        FROM crm_campaigns c
        LEFT JOIN crm_campaign_sends s ON s.campaign_id = c.id
        WHERE c.created_at BETWEEN p_start::TIMESTAMPTZ AND p_end::TIMESTAMPTZ
        GROUP BY c.id, c.name, c.channel, c.status, c.sent_at
        ORDER BY c.sent_at DESC NULLS LAST
      ) t
    ), '[]')
  );
$$;

-- ─── Table-Level Grants ───────────────────────────────────────────────────────
-- RLS policies alone are not sufficient — table privileges must also be granted
-- to the anon and authenticated roles for PostgREST to allow operations.

-- Public (anon) write paths: lead form submissions + page visit beaconing
GRANT INSERT ON public.crm_leads         TO anon, authenticated;
GRANT INSERT ON public.crm_page_visits   TO anon, authenticated;
GRANT UPDATE ON public.crm_page_visits   TO anon, authenticated;
GRANT INSERT ON public.crm_page_events   TO anon, authenticated;

-- Anon needs to read short links for redirect route + update click count
GRANT SELECT, UPDATE ON public.crm_short_links TO anon, authenticated;

-- Landing pages: anon can read (for page-slug lookup in beacon)
GRANT SELECT ON public.crm_landing_pages TO anon, authenticated;

-- Staff-only tables: authenticated only (RLS further restricts to staff)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_landing_pages  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_assets         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_audiences      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_campaigns      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_campaign_sends TO authenticated;
GRANT INSERT ON public.crm_short_links TO authenticated;
