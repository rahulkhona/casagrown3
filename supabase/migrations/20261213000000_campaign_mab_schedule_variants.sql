-- Migration: Multi-Armed Bandit (MAB) Content & Schedule Experiment Engine for Campaigns
-- Purely additive schema additions, RPC functions, and reporting endpoints.

-- 1. Add MAB experiment flag and mode to crm_campaigns
ALTER TABLE public.crm_campaigns ADD COLUMN IF NOT EXISTS is_mab_experiment BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.crm_campaigns ADD COLUMN IF NOT EXISTS mab_experiment_mode TEXT DEFAULT 'off'; -- 'off' | 'content' | 'schedule' | 'matrix'

-- 2. Create crm_campaign_mab_variants table
CREATE TABLE IF NOT EXISTS public.crm_campaign_mab_variants (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id       UUID NOT NULL REFERENCES public.crm_campaigns(id) ON DELETE CASCADE,
  variant_name      TEXT NOT NULL DEFAULT 'Variant A',
  experiment_mode   TEXT NOT NULL DEFAULT 'content', -- 'content' | 'schedule' | 'matrix'
  push_title        TEXT,
  push_body         TEXT,
  push_target_url   TEXT DEFAULT '/market',
  subject           TEXT,
  html_body         TEXT,
  sms_body          TEXT,
  send_window_start TEXT DEFAULT '09:00:00',
  send_window_end   TEXT DEFAULT '11:00:00',
  send_days         JSONB DEFAULT '["mon","tue","wed","thu","fri","sat","sun"]'::jsonb,
  prior_alpha       INTEGER NOT NULL DEFAULT 1,
  prior_beta        INTEGER NOT NULL DEFAULT 9,
  sends_count       INTEGER NOT NULL DEFAULT 0,
  opens_count       INTEGER NOT NULL DEFAULT 0,
  clicks_count      INTEGER NOT NULL DEFAULT 0,
  conversions_count INTEGER NOT NULL DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Comments for query builder schema context
COMMENT ON TABLE public.crm_campaign_mab_variants IS 'Stores multi-armed bandit content and schedule variants for Thompson Sampling in broadcast campaigns.';
COMMENT ON COLUMN public.crm_campaign_mab_variants.campaign_id IS 'Associated broadcast campaign ID.';
COMMENT ON COLUMN public.crm_campaign_mab_variants.experiment_mode IS 'Experiment mode: content, schedule, or full journey matrix.';
COMMENT ON COLUMN public.crm_campaign_mab_variants.send_window_start IS 'Variant specific local-time send window start (HH:MM:SS).';
COMMENT ON COLUMN public.crm_campaign_mab_variants.send_window_end IS 'Variant specific local-time send window end (HH:MM:SS).';

CREATE INDEX IF NOT EXISTS idx_crm_campaign_mab_variants_campaign
  ON public.crm_campaign_mab_variants(campaign_id) WHERE is_active = true;

-- Add variant_id to crm_notification_window_logs
ALTER TABLE public.crm_notification_window_logs
  ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES public.crm_campaign_mab_variants(id) ON DELETE SET NULL;

-- 3. Thompson Sampling Selection RPC: get_campaign_mab_variant
CREATE OR REPLACE FUNCTION public.get_campaign_mab_variant(
  p_campaign_id UUID
)
RETURNS TABLE (
  variant_id UUID,
  variant_name TEXT,
  push_title TEXT,
  push_body TEXT,
  push_target_url TEXT,
  subject TEXT,
  html_body TEXT,
  sms_body TEXT,
  send_window_start TEXT,
  send_window_end TEXT,
  send_days JSONB
) AS $$
DECLARE
  v_rec RECORD;
BEGIN
  -- Draw winning variant using random_beta Thompson Sampling
  SELECT 
    v.id, v.variant_name, v.push_title, v.push_body, v.push_target_url,
    v.subject, v.html_body, v.sms_body, v.send_window_start, v.send_window_end, v.send_days
  INTO v_rec
  FROM (
    SELECT
      *,
      random_beta(
        prior_alpha + conversions_count,
        prior_beta + GREATEST(sends_count - conversions_count, 0)
      ) AS draw
    FROM public.crm_campaign_mab_variants
    WHERE campaign_id = p_campaign_id
      AND is_active = true
    ORDER BY draw DESC, random()
    LIMIT 1
  ) v;

  IF v_rec.id IS NOT NULL THEN
    -- Increment sends_count atomically
    UPDATE public.crm_campaign_mab_variants
    SET sends_count = sends_count + 1,
        updated_at = now()
    WHERE id = v_rec.id;

    RETURN QUERY SELECT
      v_rec.id, v_rec.variant_name, v_rec.push_title, v_rec.push_body, v_rec.push_target_url,
      v_rec.subject, v_rec.html_body, v_rec.sms_body, v_rec.send_window_start, v_rec.send_window_end, v_rec.send_days;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Conversion Attribution RPC: attribute_campaign_mab_conversion
CREATE OR REPLACE FUNCTION public.attribute_campaign_mab_conversion(
  p_variant_id UUID,
  p_event_type TEXT DEFAULT 'conversion' -- 'open' | 'click' | 'conversion'
)
RETURNS VOID AS $$
BEGIN
  IF p_variant_id IS NULL THEN
    RETURN;
  END IF;

  IF p_event_type = 'open' THEN
    UPDATE public.crm_campaign_mab_variants
    SET opens_count = opens_count + 1, updated_at = now()
    WHERE id = p_variant_id;
  ELSIF p_event_type = 'click' THEN
    UPDATE public.crm_campaign_mab_variants
    SET clicks_count = clicks_count + 1, updated_at = now()
    WHERE id = p_variant_id;
  ELSE
    UPDATE public.crm_campaign_mab_variants
    SET conversions_count = conversions_count + 1, updated_at = now()
    WHERE id = p_variant_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Reporting & Analytics RPC: get_mab_campaign_report
CREATE OR REPLACE FUNCTION public.get_mab_campaign_report(
  p_campaign_id UUID
)
RETURNS TABLE (
  variant_id UUID,
  variant_name TEXT,
  experiment_mode TEXT,
  send_window_start TEXT,
  send_window_end TEXT,
  sends_count INT,
  opens_count INT,
  clicks_count INT,
  conversions_count INT,
  ctr_pct NUMERIC,
  cvr_pct NUMERIC,
  win_probability_pct NUMERIC,
  traffic_share_pct NUMERIC,
  lift_vs_baseline_pct NUMERIC
) AS $$
DECLARE
  v_total_sends INT;
  v_baseline_cvr NUMERIC := 0;
BEGIN
  SELECT COALESCE(SUM(v.sends_count), 0) INTO v_total_sends
  FROM public.crm_campaign_mab_variants v
  WHERE v.campaign_id = p_campaign_id AND v.is_active = true;

  -- Baseline CVR from first variant (Variant A)
  SELECT CASE WHEN v.sends_count > 0 THEN ROUND((v.conversions_count::numeric / v.sends_count::numeric) * 100, 2) ELSE 0 END
  INTO v_baseline_cvr
  FROM public.crm_campaign_mab_variants v
  WHERE v.campaign_id = p_campaign_id AND v.is_active = true
  ORDER BY v.created_at ASC LIMIT 1;

  RETURN QUERY
  WITH variant_stats AS (
    SELECT
      v.id AS v_id,
      v.variant_name AS v_name,
      v.experiment_mode AS v_mode,
      v.send_window_start AS v_start,
      v.send_window_end AS v_end,
      v.sends_count AS v_sends,
      v.opens_count AS v_opens,
      v.clicks_count AS v_clicks,
      v.conversions_count AS v_convs,
      CASE WHEN v.sends_count > 0 THEN ROUND((v.clicks_count::numeric / v.sends_count::numeric) * 100, 2) ELSE 0 END AS v_ctr,
      CASE WHEN v.sends_count > 0 THEN ROUND((v.conversions_count::numeric / v.sends_count::numeric) * 100, 2) ELSE 0 END AS v_cvr,
      CASE WHEN v_total_sends > 0 THEN ROUND((v.sends_count::numeric / v_total_sends::numeric) * 100, 1) ELSE 0 END AS v_traffic_share
    FROM public.crm_campaign_mab_variants v
    WHERE v.campaign_id = p_campaign_id AND v.is_active = true
  )
  SELECT
    s.v_id,
    s.v_name,
    s.v_mode,
    s.v_start,
    s.v_end,
    s.v_sends,
    s.v_opens,
    s.v_clicks,
    s.v_convs,
    s.v_ctr,
    s.v_cvr,
    s.v_traffic_share AS win_probability_pct,
    s.v_traffic_share,
    CASE WHEN v_baseline_cvr > 0 THEN ROUND(((s.v_cvr - v_baseline_cvr) / v_baseline_cvr) * 100, 1) ELSE 0 END AS lift_vs_baseline_pct
  FROM variant_stats s
  ORDER BY s.v_cvr DESC, s.v_sends DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Global Summary RPC: get_all_mab_experiments_summary
CREATE OR REPLACE FUNCTION public.get_all_mab_experiments_summary()
RETURNS TABLE (
  experiment_id UUID,
  name TEXT,
  type TEXT, -- 'campaign' | 'sequence'
  mode TEXT,
  total_variants INT,
  total_sends INT,
  total_conversions INT,
  leading_variant_name TEXT,
  leading_cvr_pct NUMERIC,
  is_active BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id AS experiment_id,
    c.name,
    'campaign'::TEXT AS type,
    COALESCE(c.mab_experiment_mode, 'content') AS mode,
    COUNT(v.id)::INT AS total_variants,
    COALESCE(SUM(v.sends_count), 0)::INT AS total_sends,
    COALESCE(SUM(v.conversions_count), 0)::INT AS total_conversions,
    (
      SELECT v2.variant_name
      FROM public.crm_campaign_mab_variants v2
      WHERE v2.campaign_id = c.id AND v2.is_active = true
      ORDER BY (CASE WHEN v2.sends_count > 0 THEN v2.conversions_count::numeric / v2.sends_count::numeric ELSE 0 END) DESC
      LIMIT 1
    ) AS leading_variant_name,
    (
      SELECT CASE WHEN v2.sends_count > 0 THEN ROUND((v2.conversions_count::numeric / v2.sends_count::numeric) * 100, 2) ELSE 0 END
      FROM public.crm_campaign_mab_variants v2
      WHERE v2.campaign_id = c.id AND v2.is_active = true
      ORDER BY (CASE WHEN v2.sends_count > 0 THEN v2.conversions_count::numeric / v2.sends_count::numeric ELSE 0 END) DESC
      LIMIT 1
    ) AS leading_cvr_pct,
    c.is_mab_experiment AS is_active
  FROM public.crm_campaigns c
  LEFT JOIN public.crm_campaign_mab_variants v ON v.campaign_id = c.id AND v.is_active = true
  WHERE c.is_mab_experiment = true
  GROUP BY c.id, c.name, c.mab_experiment_mode, c.is_mab_experiment;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS Enablement
ALTER TABLE public.crm_campaign_mab_variants ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'crm_campaign_mab_variants_select_all' AND tablename = 'crm_campaign_mab_variants') THEN
    CREATE POLICY crm_campaign_mab_variants_select_all ON public.crm_campaign_mab_variants FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'crm_campaign_mab_variants_insert_all' AND tablename = 'crm_campaign_mab_variants') THEN
    CREATE POLICY crm_campaign_mab_variants_insert_all ON public.crm_campaign_mab_variants FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'crm_campaign_mab_variants_update_all' AND tablename = 'crm_campaign_mab_variants') THEN
    CREATE POLICY crm_campaign_mab_variants_update_all ON public.crm_campaign_mab_variants FOR UPDATE USING (true);
  END IF;
END $$;

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_campaign_mab_variants TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_campaign_mab_variant(UUID) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.attribute_campaign_mab_conversion(UUID, TEXT) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.get_mab_campaign_report(UUID) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.get_all_mab_experiments_summary() TO authenticated, service_role, anon;
