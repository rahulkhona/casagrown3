DROP FUNCTION IF EXISTS metrics_active_wizards(TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS metrics_wizard_dropoffs(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS metrics_page_analytics(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT);

CREATE OR REPLACE FUNCTION metrics_active_wizards(
  p_start DATE,
  p_end DATE
)
RETURNS TABLE (
  wizard_slug TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT page_slug
  FROM crm_page_events
  WHERE event_type = 'wizard_step'
    AND occurred_at::date >= p_start
    AND occurred_at::date <= p_end;
END;
$$;

CREATE OR REPLACE FUNCTION metrics_wizard_dropoffs(
  p_start DATE,
  p_end DATE,
  p_wizard TEXT,
  p_state TEXT DEFAULT NULL,
  p_zip TEXT DEFAULT NULL
)
RETURNS TABLE (
  step_index INT,
  step_name TEXT,
  count BIGINT,
  pct_of_top NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH funnel AS (
    SELECT 
      (e.event_data->>'step_index')::INT AS step_idx,
      (e.event_data->>'step_name') AS step_nm,
      COUNT(DISTINCT e.session_id) AS visits
    FROM crm_page_events e
    JOIN crm_page_visits v ON v.session_id = e.session_id
    WHERE e.event_type = 'wizard_step'
      AND e.page_slug = p_wizard
      AND e.occurred_at::date >= p_start
      AND e.occurred_at::date <= p_end
      AND (p_state IS NULL OR v.region = p_state)
      AND (p_zip IS NULL OR v.zip_code = p_zip)
    GROUP BY 1, 2
  ),
  top_count AS (
    SELECT MAX(visits) AS max_v FROM funnel
  )
  SELECT 
    f.step_idx,
    f.step_nm,
    f.visits,
    CASE WHEN tc.max_v > 0 THEN ROUND((f.visits::NUMERIC / tc.max_v) * 100, 1) ELSE 0 END AS pct_of_top
  FROM funnel f
  CROSS JOIN top_count tc
  ORDER BY f.step_idx ASC;
END;
$$;
