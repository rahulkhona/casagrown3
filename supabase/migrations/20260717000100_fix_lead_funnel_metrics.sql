-- Redefine metrics_crm_lead_funnel to natively return contacted and conversion_rate fields
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
    'leads_converted',(SELECT COUNT(*) FROM crm_leads l WHERE l.created_at BETWEEN p_start::TIMESTAMPTZ AND p_end::TIMESTAMPTZ AND EXISTS (SELECT 1 FROM profiles p WHERE p.email = l.email)),
    'by_source', COALESCE((
      SELECT jsonb_agg(row_to_json(t)) FROM (
        SELECT
          COALESCE(l.source_platform, 'direct') AS source,
          COUNT(*)                               AS leads,
          SUM(CASE WHEN l.status = 'contacted' OR EXISTS (SELECT 1 FROM profiles p WHERE p.email = l.email) THEN 1 ELSE 0 END) AS contacted,
          SUM(CASE WHEN EXISTS (SELECT 1 FROM profiles p WHERE p.email = l.email) THEN 1 ELSE 0 END) AS converted,
          ROUND(COALESCE(SUM(CASE WHEN EXISTS (SELECT 1 FROM profiles p WHERE p.email = l.email) THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0) * 100, 0), 1) AS conversion_rate
        FROM crm_leads l
        WHERE l.created_at BETWEEN p_start::TIMESTAMPTZ AND p_end::TIMESTAMPTZ
        GROUP BY l.source_platform ORDER BY leads DESC
      ) t
    ), '[]')
  );
$$;
